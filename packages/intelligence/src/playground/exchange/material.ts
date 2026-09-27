/**
 * Permitted material on one concept, for any agent in the Playground (exchange participants, the
 * agent defending a takeaway, and the visiting challenger). One place owns the permission rules:
 *
 *   corpus claims      always (extracted claims from Thinketh's source corpus for this concept)
 *   shared resources   only the owner's, and only while the owner shares saved sources
 *   agent takeaways    only the owner's own earlier ones, labeled as agent material (not evidence)
 *
 * Returned text is source data, never instructions.
 */
import type { AgentTakeaway, ExchangeSource } from "../../contracts.ts";
import { lexicalScore } from "../../adapters/model/deterministic.ts";
import type { ThinkethService } from "../../service.ts";
import type { DocStore } from "../../store/docStore.ts";

export type Material = Omit<ExchangeSource, "ref" | "retrievedBy">;

export async function permittedMaterial(
  svc: ThinkethService,
  store: DocStore,
  o: {
    conceptId: string;
    conceptName: string;
    query: string;
    scope: "demo" | "live";
    /** Whose saved resources and earlier takeaways may be included; omit for the public corpus only. */
    owner?: { userId: string; sharesSavedSources: boolean };
  },
): Promise<Material[]> {
  const q = `${o.conceptName} ${o.query}`.trim();
  const out: Material[] = [];
  const claims = svc
    .claimsFor(o.scope)
    .filter((c) => c.conceptIds.includes(o.conceptId))
    .map((c) => ({ c, score: lexicalScore(q, c.text) + c.confidence * 0.2 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  for (const { c } of claims) {
    const src = c.sourceIds.map((id) => svc.sourceById(id)).find(Boolean);
    if (!src) continue;
    out.push({ sourceId: src.id, title: src.title, ...(src.url ? { url: src.url } : {}), ...(src.publisher ? { publisher: src.publisher } : {}), ...(src.publishedAt ? { publishedAt: src.publishedAt } : {}), via: "corpus", kind: "claim", text: c.text });
  }
  if (!o.owner) return out;
  // Saved sources: only when their owner shared them.
  if (o.owner.sharesSavedSources) {
    for (const r of (await svc.listResources(o.owner.userId)).filter((x) => (x.status === "ready" || x.status === "learned") && x.summary && x.matchedConceptIds.includes(o.conceptId)).slice(0, 2)) {
      out.push({ sourceId: `resource:${r.id}`, title: r.title, url: r.canonicalUrl ?? r.url, ...(r.publisher ? { publisher: r.publisher } : {}), via: "shared_resource", kind: "summary", text: r.summary! });
    }
  }
  // The owner's own earlier takeaways: agent material, labeled as such.
  for (const t of (await store.list<AgentTakeaway>("agent_takeaways", { ownerId: o.owner.userId }, 50)).filter((x) => x.conceptId === o.conceptId).slice(0, 2)) {
    out.push({ sourceId: `takeaway:${t.id}`, title: `Earlier takeaway from ${t.fromName}'s agent`, via: "agent_takeaway", kind: "takeaway", text: t.text });
  }
  return out;
}
