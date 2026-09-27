/**
 * Durable application state: saved resources and their analyses, generated
 * lessons and questions, Playground rooms, learner profiles, operation records
 * and the discovered corpus. Process Maps elsewhere are caches in front of this.
 *
 *   MongoDocStore   MongoDB Atlas (the semantic store), one `app_<collection>` per collection
 *   FileDocStore    JSON files on the API host: survives a restart with no credentials
 *   MemoryDocStore  tests
 *
 * ResilientDocStore writes to the local file mirror and to Atlas, and reads the
 * newer of the two, so an Atlas outage never loses a write and a fresh host
 * still sees Atlas's copy. `create` is the one atomic primitive (insert only if
 * absent): operation ids and leases are built on it.
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { guarded } from "../adapters/guard.ts";

export type StoredRecord<T = unknown> = { id: string; ownerId?: string; updatedAt: string; doc: T };

export type ListQuery = {
  ownerId?: string;
  /** Equality on top-level fields of the stored document. */
  where?: Record<string, string | number | boolean>;
};

export interface DocStore {
  readonly name: "mongo" | "file" | "memory" | "resilient";
  get<T>(collection: string, id: string): Promise<T | undefined>;
  /** Upsert. */
  put<T extends object>(collection: string, id: string, doc: T, ownerId?: string): Promise<void>;
  /** Insert only if absent. False when a record with this id already exists. */
  create<T extends object>(collection: string, id: string, doc: T, ownerId?: string): Promise<boolean>;
  /** Newest first. */
  list<T>(collection: string, query?: ListQuery, limit?: number): Promise<T[]>;
  remove(collection: string, id: string): Promise<void>;
  /** Removes every record owned by `ownerId` in this collection only. */
  removeOwned(collection: string, ownerId: string): Promise<number>;
  /** Raw records (with updatedAt), for merging mirrors. */
  records(collection: string, query?: ListQuery, limit?: number): Promise<StoredRecord[]>;
  record(collection: string, id: string): Promise<StoredRecord | undefined>;
}

const matches = (r: StoredRecord, q: ListQuery | undefined): boolean => {
  if (!q) return true;
  if (q.ownerId !== undefined && r.ownerId !== q.ownerId) return false;
  for (const [k, v] of Object.entries(q.where ?? {})) if ((r.doc as Record<string, unknown>)?.[k] !== v) return false;
  return true;
};

const newestFirst = (a: StoredRecord, b: StoredRecord) => b.updatedAt.localeCompare(a.updatedAt);

/** A clock that never repeats, so "newer" is well defined even within one millisecond. */
let lastStamp = 0;
function stamp(): string {
  const t = Math.max(Date.now(), lastStamp + 1);
  lastStamp = t;
  return new Date(t).toISOString();
}

abstract class MapBackedStore implements DocStore {
  abstract readonly name: "file" | "memory";
  protected abstract table(collection: string): Promise<Map<string, StoredRecord>>;
  protected abstract flush(collection: string): Promise<void>;

  async record(collection: string, id: string): Promise<StoredRecord | undefined> {
    const r = (await this.table(collection)).get(id);
    return r ? structuredClone(r) : undefined;
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    return (await this.record(collection, id))?.doc as T | undefined;
  }

  /** Stores a record as given (used by the resilient mirror to keep timestamps aligned). */
  async putRecord(collection: string, r: StoredRecord): Promise<void> {
    (await this.table(collection)).set(r.id, structuredClone(r));
    await this.flush(collection);
  }

  async put<T extends object>(collection: string, id: string, doc: T, ownerId?: string): Promise<void> {
    await this.putRecord(collection, { id, ...(ownerId ? { ownerId } : {}), updatedAt: stamp(), doc });
  }

  async create<T extends object>(collection: string, id: string, doc: T, ownerId?: string): Promise<boolean> {
    const t = await this.table(collection);
    if (t.has(id)) return false;
    t.set(id, structuredClone({ id, ...(ownerId ? { ownerId } : {}), updatedAt: stamp(), doc }));
    await this.flush(collection);
    return true;
  }

  async records(collection: string, query?: ListQuery, limit = 500): Promise<StoredRecord[]> {
    return [...(await this.table(collection)).values()].filter((r) => matches(r, query)).sort(newestFirst).slice(0, limit).map((r) => structuredClone(r));
  }

  async list<T>(collection: string, query?: ListQuery, limit = 500): Promise<T[]> {
    return (await this.records(collection, query, limit)).map((r) => r.doc as T);
  }

  async remove(collection: string, id: string): Promise<void> {
    if ((await this.table(collection)).delete(id)) await this.flush(collection);
  }

  async removeOwned(collection: string, ownerId: string): Promise<number> {
    const t = await this.table(collection);
    let n = 0;
    for (const [id, r] of t) if (r.ownerId === ownerId && t.delete(id)) n++;
    if (n) await this.flush(collection);
    return n;
  }
}

export class MemoryDocStore extends MapBackedStore {
  readonly name = "memory" as const;
  private readonly tables = new Map<string, Map<string, StoredRecord>>();
  protected async table(collection: string) {
    let t = this.tables.get(collection);
    if (!t) this.tables.set(collection, (t = new Map()));
    return t;
  }
  protected async flush(): Promise<void> {}
}

const SAFE_NAME = /^[a-z0-9_]+$/;

/** One JSON file per collection, written atomically (temp file + rename), writes serialized per collection. */
export class FileDocStore extends MapBackedStore {
  readonly name = "file" as const;
  private readonly dir: string;
  private readonly tables = new Map<string, Promise<Map<string, StoredRecord>>>();
  private readonly writes = new Map<string, Promise<void>>();

  constructor(dir: string) {
    super();
    this.dir = dir;
  }

  private file(collection: string): string {
    if (!SAFE_NAME.test(collection)) throw new Error(`Invalid collection name: ${collection}`);
    return join(this.dir, `${collection}.json`);
  }

  private readonly loadedAt = new Map<string, number>();

  /**
   * The collection, re-read when another process (the discovery CLI) changed the file since we
   * last loaded or wrote it. Single-writer per record in practice; this keeps the two from clobbering.
   */
  protected async table(collection: string): Promise<Map<string, StoredRecord>> {
    const mtime = await stat(this.file(collection)).then((st) => st.mtimeMs, () => 0);
    let t = this.tables.get(collection);
    if (!t || (mtime && mtime !== this.loadedAt.get(collection) && !this.writes.has(collection))) {
      t = readFile(this.file(collection), "utf8").then(
        (raw) => new Map((JSON.parse(raw) as StoredRecord[]).map((r) => [r.id, r])),
        () => new Map<string, StoredRecord>(),
      );
      this.tables.set(collection, t);
      this.loadedAt.set(collection, mtime);
    }
    return t;
  }

  protected flush(collection: string): Promise<void> {
    const prev = this.writes.get(collection) ?? Promise.resolve();
    const next = prev.then(async () => {
      const rows = [...(await this.table(collection)).values()];
      await mkdir(this.dir, { recursive: true });
      const tmp = `${this.file(collection)}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(rows));
      await rename(tmp, this.file(collection));
      this.loadedAt.set(collection, (await stat(this.file(collection))).mtimeMs);
    });
    const settled = next.catch(() => undefined).finally(() => {
      if (this.writes.get(collection) === settled) this.writes.delete(collection);
    });
    this.writes.set(collection, settled);
    return next;
  }
}

type MongoDb = import("mongodb").Db;
type MongoRow = { _id: string; ownerId?: string; updatedAt: string; doc: unknown };

export class MongoDocStore implements DocStore {
  readonly name = "mongo" as const;
  private readonly db: () => Promise<MongoDb>;
  private readonly indexed = new Set<string>();

  constructor(db: () => Promise<MongoDb>) {
    this.db = db;
  }

  private async coll(collection: string) {
    if (!SAFE_NAME.test(collection)) throw new Error(`Invalid collection name: ${collection}`);
    const c = (await this.db()).collection<MongoRow>(`app_${collection}`);
    if (!this.indexed.has(collection)) {
      this.indexed.add(collection);
      await c.createIndex({ ownerId: 1, updatedAt: -1 }).catch(() => undefined);
    }
    return c;
  }

  private static toRecord(r: MongoRow): StoredRecord {
    return { id: r._id, ...(r.ownerId ? { ownerId: r.ownerId } : {}), updatedAt: r.updatedAt, doc: r.doc };
  }

  private static filter(q: ListQuery | undefined): Record<string, unknown> {
    const f: Record<string, unknown> = {};
    if (q?.ownerId !== undefined) f.ownerId = q.ownerId;
    for (const [k, v] of Object.entries(q?.where ?? {})) f[`doc.${k}`] = v;
    return f;
  }

  async record(collection: string, id: string): Promise<StoredRecord | undefined> {
    const r = await (await this.coll(collection)).findOne({ _id: id });
    return r ? MongoDocStore.toRecord(r) : undefined;
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    return (await this.record(collection, id))?.doc as T | undefined;
  }

  async putRecord(collection: string, r: StoredRecord): Promise<void> {
    await (await this.coll(collection)).replaceOne(
      { _id: r.id },
      { ...(r.ownerId ? { ownerId: r.ownerId } : {}), updatedAt: r.updatedAt, doc: r.doc } as MongoRow,
      { upsert: true },
    );
  }

  async put<T extends object>(collection: string, id: string, doc: T, ownerId?: string): Promise<void> {
    await this.putRecord(collection, { id, ...(ownerId ? { ownerId } : {}), updatedAt: stamp(), doc });
  }

  async create<T extends object>(collection: string, id: string, doc: T, ownerId?: string): Promise<boolean> {
    try {
      await (await this.coll(collection)).insertOne({ _id: id, ...(ownerId ? { ownerId } : {}), updatedAt: stamp(), doc });
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  }

  async records(collection: string, query?: ListQuery, limit = 500): Promise<StoredRecord[]> {
    const rows = await (await this.coll(collection)).find(MongoDocStore.filter(query)).sort({ updatedAt: -1 }).limit(limit).toArray();
    return rows.map(MongoDocStore.toRecord);
  }

  async list<T>(collection: string, query?: ListQuery, limit = 500): Promise<T[]> {
    return (await this.records(collection, query, limit)).map((r) => r.doc as T);
  }

  async remove(collection: string, id: string): Promise<void> {
    await (await this.coll(collection)).deleteOne({ _id: id });
  }

  async removeOwned(collection: string, ownerId: string): Promise<number> {
    return (await (await this.coll(collection)).deleteMany({ ownerId })).deletedCount;
  }
}

const REMOTE_TIMEOUT_MS = 3000;

/**
 * Local mirror (always written) + Atlas (written when reachable). Reads take the
 * newer record of the two. `create` asks Atlas first, because an idempotency claim
 * must be decided by one authority; if Atlas is unreachable the local mirror decides
 * (single API host, so that is still exactly-once for this process).
 */
export class ResilientDocStore implements DocStore {
  readonly name = "resilient" as const;
  private readonly local: FileDocStore | MemoryDocStore;
  private readonly remote: MongoDocStore;

  constructor(local: FileDocStore | MemoryDocStore, remote: MongoDocStore) {
    this.local = local;
    this.remote = remote;
  }

  private async remoteTry<T>(op: string, fn: () => Promise<T>, fallback: T): Promise<{ value: T; ok: boolean }> {
    const r = await guarded("mongo", `store.${op}`, fn, () => fallback, REMOTE_TIMEOUT_MS);
    return { value: r.value, ok: r.source === "live" };
  }

  async record(collection: string, id: string): Promise<StoredRecord | undefined> {
    const [local, remote] = await Promise.all([this.local.record(collection, id), this.remoteTry("get", () => this.remote.record(collection, id), undefined)]);
    const r = remote.value;
    if (r && (!local || r.updatedAt > local.updatedAt)) {
      await this.local.putRecord(collection, r); // warm the mirror
      return r;
    }
    return local;
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    return (await this.record(collection, id))?.doc as T | undefined;
  }

  async put<T extends object>(collection: string, id: string, doc: T, ownerId?: string): Promise<void> {
    const r: StoredRecord = { id, ...(ownerId ? { ownerId } : {}), updatedAt: stamp(), doc };
    await this.local.putRecord(collection, r);
    await this.remoteTry("put", () => this.remote.putRecord(collection, r), undefined);
  }

  async create<T extends object>(collection: string, id: string, doc: T, ownerId?: string): Promise<boolean> {
    const remote = await this.remoteTry("create", () => this.remote.create(collection, id, doc, ownerId), false);
    if (remote.ok) {
      if (remote.value) await this.local.put(collection, id, doc, ownerId);
      return remote.value;
    }
    return this.local.create(collection, id, doc, ownerId);
  }

  async records(collection: string, query?: ListQuery, limit = 500): Promise<StoredRecord[]> {
    const [local, remote] = await Promise.all([
      this.local.records(collection, query, limit),
      this.remoteTry("list", () => this.remote.records(collection, query, limit), [] as StoredRecord[]),
    ]);
    const byId = new Map<string, StoredRecord>();
    for (const r of [...local, ...remote.value]) {
      const cur = byId.get(r.id);
      if (!cur || r.updatedAt > cur.updatedAt) byId.set(r.id, r);
    }
    return [...byId.values()].sort(newestFirst).slice(0, limit);
  }

  async list<T>(collection: string, query?: ListQuery, limit = 500): Promise<T[]> {
    return (await this.records(collection, query, limit)).map((r) => r.doc as T);
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.local.remove(collection, id);
    await this.remoteTry("remove", () => this.remote.remove(collection, id), undefined);
  }

  async removeOwned(collection: string, ownerId: string): Promise<number> {
    const n = await this.local.removeOwned(collection, ownerId);
    const r = await this.remoteTry("removeOwned", () => this.remote.removeOwned(collection, ownerId), 0);
    return Math.max(n, r.value);
  }
}
