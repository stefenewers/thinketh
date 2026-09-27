/**
 * Grokbot takeaway challenge: a real exchange saves a takeaway, then a challenge runs through the same
 * room machinery. Muse and Grok are scripted stand-ins here (this file never calls a provider); the
 * live xAI path is verified separately by scripts/verify-grokbot.ts.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTakeaway, PlaygroundRoom, TakeawayChallenge } from "@thinketh/contracts";
import { resetCircuits } from "../src/adapters/guard.ts";
import { createThinketh } from "../src/index.ts";
import { settleOutcome } from "../src/playground/exchange/challenge.ts";
import { ChallengerTimeoutError, ChallengerUnavailableError, GrokChallenger, toResponsesInput, type ChallengerModel } from "../src/playground/exchange/grok.ts";
import type { ChatMessage, ExchangeModel, ToolDef } from "../src/playground/exchange/muse.ts";
import { NOW, offlineConfig } from "./helpers.ts";

type Call = { name: string; args: Record<string, unknown> };
type Script = (purpose: string, messages: ChatMessage[], tools: string[]) => Promise<Call[]> | Call[];

class Fake implements ChallengerModel {
  readonly provider = "xai" as const;
  readonly configuredModel: string;
  readonly label: string;
  readonly calls: Array<{ purpose: string; messages: ChatMessage[]; tools: string[] }> = [];
  script: Script;
  constructor(label: string, script: Script) {
    this.label = label;
    this.configuredModel = label;
    this.script = script;
  }
  async complete(messages: ChatMessage[], tools: ToolDef[], opts: { purpose: string }) {
    const names = tools.map((t) => t.name);
    this.calls.push({ purpose: opts.purpose, messages: structuredClone(messages), tools: names });
    const out = await this.script(opts.purpose, messages, names);
    const n = this.calls.length;
    return {
      message: { role: "assistant" as const, content: null, tool_calls: out.map((c, i) => ({ id: `${this.label}_${n}_${i}`, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
      ms: 5,
      model: `${this.label}-reported`,
    };
  }
}

/** The parsed result of the latest call to `name` in this context. */
function resultOf(messages: ChatMessage[], name: string): Record<string, unknown> | undefined {
  const ids = messages.flatMap((m) => (m.role === "assistant" ? (m.tool_calls ?? []).filter((c) => c.function.name === name).map((c) => c.id) : []));
  const id = ids.at(-1);
  const tool = id ? messages.find((m) => m.role === "tool" && m.tool_call_id === id) : undefined;
  return tool && tool.role === "tool" ? JSON.parse(tool.content) : undefined;
}
const lastUser = (messages: ChatMessage[]) => [...messages].reverse().find((m) => m.role === "user")!.content as string;
const called = (messages: ChatMessage[], name: string) => messages.some((m) => m.role === "assistant" && (m.tool_calls ?? []).some((c) => c.function.name === name));

// ---------------------------------------------------------------------------
// The exchange that produces the takeaway (Muse): the learner retains `shape(passage)`.

let takeawayShape: (passage: string) => string = (p) => p;
let defenderScript: Script = () => [];

const museScript: Script = (purpose, messages) => {
  if (purpose.startsWith("challenge:defender")) return defenderScript(purpose, messages, []);
  if (purpose === "coordinator") {
    const v = Object.keys(JSON.parse(lastUser(messages).replace(/^Exchange view \(data\):\n/, "")).validActions);
    const pick = ["save_takeaway", "check_takeaway", "teacher_explain", "learner_takeaway", "finish"].find((a) => v.includes(a))!;
    return [{ name: "choose_next", args: { action: pick, note: pick } }];
  }
  const got = resultOf(messages, "retrieve_sources") as { passages: Array<{ ref: string; kind: string; text: string }> } | undefined;
  if (!got) return [{ name: "retrieve_sources", args: { query: "why" } }];
  const p = got.passages.find((x) => x.kind === "claim")!;
  if (purpose.startsWith("teacher")) return [{ name: "send_explanation", args: { text: `The key point: ${p.text}`, sourceRefs: [p.ref] } }];
  return [{ name: "propose_takeaway", args: { text: takeawayShape(p.text), sourceRefs: [p.ref] } }];
};

// ---------------------------------------------------------------------------
// Grokbot scripts: read, inspect what the takeaway cites, then deliver.

type Deliver = (ctx: { refs: string[]; passage: string; takeaway: string }) => Call;
function grokScript(deliver: Deliver, assess: Call["args"] = { stance: "satisfied", text: "That answers it.", sourceRefs: [] }): Script {
  return (purpose, messages) => {
    if (purpose.endsWith(":assessing")) return [{ name: "return_assessment", args: assess }];
    const read = resultOf(messages, "read_takeaway") as { text: string; citedRefs: Array<{ ref: string }> } | undefined;
    if (!read) return [{ name: "read_takeaway", args: {} }];
    const insp = resultOf(messages, "inspect_material") as { passages: Array<{ ref: string; text: string }> } | undefined;
    if (!insp) return [{ name: "inspect_material", args: { refs: read.citedRefs.map((r) => r.ref) } }];
    return [deliver({ refs: insp.passages.map((p) => p.ref), passage: insp.passages[0]!.text, takeaway: read.text })];
  };
}

// ---------------------------------------------------------------------------

const tmp = () => mkdtempSync(join(tmpdir(), "thinketh-challenge-"));
function boot(opts: { grok?: Fake | null; dataDir?: string } = {}) {
  const t = createThinketh({ config: { ...offlineConfig(), dataDir: opts.dataDir ?? tmp() }, now: () => NOW });
  const muse = new Fake("muse", museScript);
  (t.playground.exchange as unknown as { model: ExchangeModel }).model = muse;
  if (opts.grok !== null) (t.playground.challenge as unknown as { grok: ChallengerModel | undefined }).grok = opts.grok ?? new Fake("grok", grokScript(noIssue));
  return { t, muse };
}
type T = ReturnType<typeof boot>["t"];
const req = async (t: T, method: string, path: string, body?: unknown, user = "demo-user") => {
  const res = await t.app.request(path, { method, headers: { "content-type": "application/json", "x-thinketh-user": user }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, room: (await res.json()) as PlaygroundRoom };
};
async function savedTakeawayRoom(t: T): Promise<PlaygroundRoom> {
  let r = (await req(t, "POST", "/playground/rooms", { displayName: "Stefen" })).room;
  r = (await req(t, "POST", `/playground/rooms/${r.id}/demo-guest`)).room;
  r = (await req(t, "POST", `/playground/rooms/${r.id}/compare`)).room;
  r = (await req(t, "POST", `/playground/rooms/${r.id}/exchange`, {})).room;
  for (let i = 0; i < 40 && r.exchange?.status === "running"; i++) r = (await req(t, "POST", `/playground/rooms/${r.id}/exchange/advance`, { step: r.exchange.step })).room;
  expect(r.exchange).toMatchObject({ status: "completed" });
  expect(r.exchange!.savedTakeawayId).toBeTruthy();
  return r;
}
async function runChallenge(t: T, roomId: string, user = "demo-user"): Promise<PlaygroundRoom> {
  let r = (await req(t, "POST", `/playground/rooms/${roomId}/challenge`, {}, user)).room;
  for (let i = 0; i < 20 && r.challenge?.status === "running"; i++) r = (await req(t, "POST", `/playground/rooms/${roomId}/challenge/advance`, { step: r.challenge.step }, user)).room;
  return r;
}
const takeaway = async (t: T, id: string, user = "demo-user") => (await (await t.app.request(`/takeaways/${id}`, { headers: { "x-thinketh-user": user } })).json()) as AgentTakeaway;

const noIssue: Deliver = ({ refs }) => ({ name: "report_no_issue", args: { say: "Checked it against S-refs. Holds up.", detail: "Every statement matches the cited passage.", sourceRefs: refs } });

beforeEach(() => {
  resetCircuits();
  takeawayShape = (p) => p;
  defenderScript = () => [{ name: "defend_takeaway", args: { text: "It's the passage itself.", sourceRefs: ["S1"] } }];
});

// ---------------------------------------------------------------------------

describe("settleOutcome (the deterministic rule)", () => {
  it("never lets an unsupported challenge overwrite a supported takeaway, and never treats agreement as support", () => {
    expect(settleOutcome({ finding: "no_issue" }).state).toBe("no_issue");
    expect(settleOutcome({ finding: "objection", challengeVerdict: "unsupported", response: "revision", revisionVerdict: "supported", takeawayVerdict: "supported" })).toMatchObject({ state: "supported", apply: false });
    expect(settleOutcome({ finding: "qualification", challengeVerdict: "supported", response: "revision", revisionVerdict: "supported", takeawayVerdict: "supported" })).toMatchObject({ state: "revised", apply: true });
    expect(settleOutcome({ finding: "qualification", challengeVerdict: "supported", response: "revision", revisionVerdict: "partial" })).toMatchObject({ state: "unresolved", apply: false });
    expect(settleOutcome({ finding: "objection", challengeVerdict: "supported", response: "defense", takeawayVerdict: "supported", stance: "maintains" }).state).toBe("unresolved");
    expect(settleOutcome({ finding: "objection", challengeVerdict: "unsupported", response: "defense", takeawayVerdict: "supported", stance: "maintains" }).state).toBe("supported");
    // Grokbot being satisfied doesn't rescue a takeaway its material doesn't support.
    expect(settleOutcome({ finding: "objection", challengeVerdict: "supported", response: "defense", takeawayVerdict: "partial", stance: "satisfied" }).state).toBe("unresolved");
    expect(settleOutcome({ finding: "insufficient_evidence", response: "concession" }).state).toBe("unresolved");
    expect(settleOutcome({ finding: "insufficient_evidence", response: "defense", takeawayVerdict: "supported", stance: "cannot_tell" }).state).toBe("unresolved");
  });
});

describe("Grokbot takeaway challenge", () => {
  it("well-supported takeaway: no clear issue found, nothing to defend, nothing changed (and it says that's not proof)", async () => {
    const grok = new Fake("grok", grokScript(noIssue));
    const { t, muse } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    expect(room0.challengeAvailability).toMatchObject({ available: true, takeawayVersion: 1 });
    const before = await takeaway(t, room0.exchange!.savedTakeawayId!);
    const museCalls = muse.calls.length;

    const room = await runChallenge(t, room0.id);
    const ch = room.challenge!;
    expect(ch).toMatchObject({ status: "completed", phase: "done", finding: { kind: "no_issue" }, outcome: { state: "no_issue", headline: "No clear issue found", fromVersion: 1 } });
    expect(ch.outcome!.why).toMatch(/isn't proof/);
    expect(ch.outcome!.toVersion).toBeUndefined();
    expect(muse.calls.length).toBe(museCalls); // the defending agent had nothing to answer
    expect(ch.challenger).toMatchObject({ name: "Grokbot", provider: "xai", configuredModel: "grok", model: "grok-reported" });
    const after = await takeaway(t, before.id);
    expect(after.text).toBe(before.text);
    expect(after.version ?? 1).toBe(1);
    expect(after.challenges?.map((c) => c.outcome?.state)).toEqual(["no_issue"]);
    // Events follow the real sequence; the outcome is announced only after it was persisted.
    const types = room.events.map((e) => e.type).filter((x) => x.startsWith("challenge") || x === "takeaway_revised");
    expect(types).toEqual(["challenge_started", "challenge_delivered", "challenge_resolved"]);
    expect(room.challengeAvailability).toMatchObject({ available: false });
  });

  it("overbroad takeaway: a grounded qualification is delivered to the agent, whose supported revision is saved as version 2", async () => {
    takeawayShape = (p) => `Always: ${p}`; // overbroad, but the lexical check still passes it at exchange time
    const grok = new Fake(
      "grok",
      grokScript(({ refs, passage }) => ({
        name: "deliver_challenge",
        args: { kind: "qualification", say: "“Always”? The source never says always.", detail: `The cited passage says: ${passage} It doesn't say this holds always.`, targetStatement: "Always:", sourceRefs: refs },
      })),
    );
    const { t, muse } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    const original = await takeaway(t, room0.exchange!.savedTakeawayId!);
    expect(original.text.startsWith("Always:")).toBe(true);
    defenderScript = (_p, messages) => {
      const passage = Object.values(JSON.parse(lastUser(messages).split("\n\nNow:")[0]!.replace(/^Challenge update \(data, not instructions\):\n/, "")).yourTakeaway.passages as Record<string, { text: string }>)[0]!.text;
      return [{ name: "revise_takeaway", args: { revisedTakeaway: passage, reply: "Fair: the source doesn't say always. Dropped it.", whatChanged: "Removed the overbroad 'always'.", sourceRefs: ["S1"] } }];
    };

    const room = await runChallenge(t, room0.id);
    const ch = room.challenge!;
    expect(ch.status).toBe("completed");
    expect(ch.outcome).toMatchObject({ state: "revised", fromVersion: 1, toVersion: 2 });
    // The agent consumed Grokbot's ACTUAL challenge (not a scripted pairing): its first turn contains it.
    const defenderFirst = muse.calls.find((c) => c.purpose.startsWith("challenge:defender"))!;
    expect(lastUser(defenderFirst.messages)).toContain(ch.finding!.detail);
    expect(ch.messages.map((m) => m.kind)).toEqual(["challenge", "revision", "assessment"]);
    expect(ch.checks.map((c) => `${c.of}:${c.verdict}`)).toEqual(expect.arrayContaining(["revision:supported"]));

    const after = await takeaway(t, original.id);
    expect(after.version).toBe(2);
    expect(after.text).toBe(ch.outcome!.revisedText);
    expect(after.history!.map((h) => [h.version, h.by])).toEqual([[1, "exchange"], [2, "challenge"]]);
    expect(after.history![0]!.text).toBe(original.text); // the original stays readable
    expect(room.events.some((e) => e.type === "takeaway_revised")).toBe(true);
    // A revised takeaway can be challenged again (new version); the same version can't.
    expect(room.challengeAvailability).toMatchObject({ available: true, takeawayVersion: 2 });
  });

  it("unsupported objection: the agent's capitulating revision is NOT applied; the supported original stands", async () => {
    const grok = new Fake("grok", grokScript(() => ({ name: "deliver_challenge", args: { kind: "objection", say: "Hot take: this is obsolete.", detail: "Quantum annealing hardware makes spreadsheet compilers obsolete here.", sourceRefs: [] } })));
    const { t } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    const original = await takeaway(t, room0.exchange!.savedTakeawayId!);
    defenderScript = () => [{ name: "revise_takeaway", args: { revisedTakeaway: `In short, ${original.text}`, reply: "You may be right, revising.", whatChanged: "Hedged.", sourceRefs: ["S1"] } }];

    const room = await runChallenge(t, room0.id);
    const ch = room.challenge!;
    expect(ch.checks.find((c) => c.of === "challenge")).toMatchObject({ verdict: "unsupported" });
    expect(ch.outcome).toMatchObject({ state: "supported", headline: "Supported by the cited material" });
    expect(ch.outcome!.declinedRevision?.text).toContain("In short,");
    const after = await takeaway(t, original.id);
    expect(after.text).toBe(original.text);
    expect(after.version ?? 1).toBe(1);
    expect(after.history).toBeUndefined();
  });

  it("insufficient evidence: the challenge stays open as 'unresolved', recorded on the takeaway, text unchanged", async () => {
    const grok = new Fake(
      "grok",
      grokScript(({ refs }) => ({ name: "report_insufficient_evidence", args: { say: "One extracted claim? Thin ice.", detail: "A single extracted claim can't show how general this is.", sourceRefs: refs } }), { stance: "cannot_tell", text: "Still one claim.", sourceRefs: [] }),
    );
    const { t } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    const original = await takeaway(t, room0.exchange!.savedTakeawayId!);
    defenderScript = () => [{ name: "concede_unresolved", args: { text: "My permitted material is that one claim; I can't settle it." } }];

    const room = await runChallenge(t, room0.id);
    expect(room.challenge!.outcome).toMatchObject({ state: "unresolved", headline: "Unresolved" });
    const after = await takeaway(t, original.id);
    expect(after.text).toBe(original.text);
    expect(after.unresolved.some((u) => u.startsWith("Open challenge from Grokbot"))).toBe(true);
  });

  it("an unsupported revision gets exactly one repair, then stays unresolved", async () => {
    const grok = new Fake("grok", grokScript(({ refs, passage }) => ({ name: "deliver_challenge", args: { kind: "counterexample", say: "Counterexample incoming.", detail: `Consider: ${passage}`, sourceRefs: refs } }), { stance: "maintains", text: "Still stands.", sourceRefs: [] }));
    const { t, muse } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    defenderScript = () => [{ name: "revise_takeaway", args: { revisedTakeaway: "Blockchains replace evaluators entirely in all cases.", reply: "Revised.", whatChanged: "Everything.", sourceRefs: ["S1"] } }];
    const room = await runChallenge(t, room0.id);
    expect(muse.calls.filter((c) => c.purpose.startsWith("challenge:defender")).map((c) => c.purpose)).toEqual(["challenge:defender:defending", "challenge:defender:repairing"]);
    expect(room.challenge!.used.repairs).toBe(1);
    expect(room.challenge!.outcome).toMatchObject({ state: "unresolved" });
    expect(room.challenge!.outcome!.declinedRevision).toBeTruthy();
  });

  it("permission boundaries: Grokbot gets only the takeaway, its permitted material and transcript excerpts; refs are validated server-side", async () => {
    let tried = false;
    const grok = new Fake("grok", (purpose, messages) => {
      if (purpose.endsWith(":assessing")) return [{ name: "return_assessment", args: { stance: "satisfied", text: "ok", sourceRefs: [] } }];
      if (!resultOf(messages, "read_takeaway")) return [{ name: "read_takeaway", args: {} }, { name: "read_transcript", args: {} }];
      if (!resultOf(messages, "inspect_material")) return [{ name: "inspect_material", args: { refs: ["S1", "S9", "C1"] } }];
      if (!tried) {
        tried = true;
        return [{ name: "deliver_challenge", args: { kind: "objection", say: "x", detail: "y", sourceRefs: ["S9"] } }]; // not inspectable
      }
      return [{ name: "report_no_issue", args: { say: "Fine.", detail: "Checked S1.", sourceRefs: ["S1"] } }];
    });
    const { t } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    // A saved-source summary the owner doesn't share is never passed to the challenger.
    const tk = await takeaway(t, room0.exchange!.savedTakeawayId!);
    await t.adapters.store.put("agent_takeaways", tk.id, { ...tk, sources: [...tk.sources, { ref: "S9", sourceId: "resource:private", title: "Private notes", via: "shared_resource", kind: "summary", text: "PRIVATE-SUMMARY-TEXT" }] }, tk.ownerId);

    const room = await runChallenge(t, room0.id);
    expect(room.challenge!.status).toBe("completed");
    expect(room.challenge!.sources.map((s) => s.ref)).not.toContain("S9");
    const inspected = resultOf(grok.calls.at(-1)!.messages, "inspect_material") as { passages: Array<{ ref: string }>; notAvailable: string[] };
    expect(inspected.passages.map((p) => p.ref)).toEqual(["S1"]);
    expect(inspected.notAvailable).toEqual(["S9", "C1"]);
    // Everything sent to Grokbot as data (the system prompt is our own instructions).
    const all = JSON.stringify(grok.calls.map((c) => c.messages.filter((m) => m.role !== "system")));
    expect(all).toContain("isn't available to you"); // the invalid citation was rejected, not acted on
    expect(all).not.toContain("PRIVATE-SUMMARY-TEXT");
    for (const secret of ["mastery", "uncertainty", "misconception", "answerKey", "rubric", "correctOption", "memor", "evidenceCount", "verified"]) expect(all).not.toContain(secret);
    // Grokbot's tool surface is exactly the bounded one.
    expect(new Set(grok.calls.flatMap((c) => c.tools))).toEqual(new Set(["read_takeaway", "read_transcript", "inspect_material", "request_clarification", "deliver_challenge", "report_insufficient_evidence", "report_no_issue"]));
    // Not a participant: no challenge. Not the owner: can't open the library entry.
    expect((await req(t, "POST", `/playground/rooms/${room0.id}/challenge`, {}, "stranger")).status).toBe(404);
    expect((await t.app.request(`/takeaways/${tk.id}`, { headers: { "x-thinketh-user": "nadani" } })).status).toBe(404);
  });

  it("one clarification round: the question reaches the agent and its answer reaches Grokbot", async () => {
    const grok = new Fake("grok", (purpose, messages) => {
      if (purpose.endsWith(":assessing")) return [{ name: "return_assessment", args: { stance: "satisfied", text: "ok", sourceRefs: [] } }];
      if (!called(messages, "request_clarification")) return [{ name: "request_clarification", args: { question: "Which kind of evaluator do you mean?" } }];
      expect(lastUser(messages)).toContain("A separate model grading outputs.");
      return [{ name: "report_no_issue", args: { say: "Clear now.", detail: "The answer resolves the ambiguity.", sourceRefs: [] } }];
    });
    const { t, muse } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    defenderScript = (purpose, messages) => {
      expect(lastUser(messages)).toContain("Which kind of evaluator do you mean?");
      return [{ name: "answer_clarification", args: { text: "A separate model grading outputs.", sourceRefs: ["S1"] } }];
    };
    const room = await runChallenge(t, room0.id);
    expect(room.challenge!.messages.map((m) => m.kind)).toEqual(["clarification", "clarification_answer", "no_issue"]);
    expect(muse.calls.filter((c) => c.purpose === "challenge:defender:clarifying")).toHaveLength(1);
    // Only one clarification is offered.
    expect(grok.calls.at(-1)!.tools).not.toContain("request_clarification");
  });

  it("duplicate protection: double taps, concurrent starts and concurrent advances run one challenge, one step once", async () => {
    let examineCalls = 0;
    const grok = new Fake("grok", async (purpose, messages) => {
      if (purpose.endsWith(":examining") && !resultOf(messages, "read_takeaway")) {
        examineCalls++;
        await new Promise((r) => setTimeout(r, 30));
      }
      return grokScript(noIssue)(purpose, messages, []);
    });
    const { t } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    const starts = await Promise.all([1, 2, 3].map(() => req(t, "POST", `/playground/rooms/${room0.id}/challenge`, {})));
    const ids = new Set(starts.map((s) => s.room.challenge!.id));
    expect(ids.size).toBe(1);
    await Promise.all([req(t, "POST", `/playground/rooms/${room0.id}/challenge/advance`, { step: 0 }), req(t, "POST", `/playground/rooms/${room0.id}/challenge/advance`, { step: 0 }, "nadani")]);
    expect(examineCalls).toBe(1);
    let r = (await req(t, "GET", `/playground/rooms/${room0.id}`)).room;
    for (let i = 0; i < 10 && r.challenge?.status === "running"; i++) r = (await req(t, "POST", `/playground/rooms/${room0.id}/challenge/advance`, { step: r.challenge.step })).room;
    expect(r.challenge!.status).toBe("completed");
    // Re-requesting after completion returns the same result instead of a new challenge.
    const again = await req(t, "POST", `/playground/rooms/${room0.id}/challenge`, {});
    expect(again.room.challenge!.id).toBe([...ids][0]);
    expect((await takeaway(t, room0.exchange!.savedTakeawayId!)).challenges).toHaveLength(1);
  });

  it("Stop wins over a late Grok response: nothing is applied and the takeaway is untouched", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const grok = new Fake("grok", async (purpose, messages) => {
      await gate;
      return grokScript(noIssue)(purpose, messages, []);
    });
    const { t } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    const before = await takeaway(t, room0.exchange!.savedTakeawayId!);
    await req(t, "POST", `/playground/rooms/${room0.id}/challenge`, {});
    const inflight = req(t, "POST", `/playground/rooms/${room0.id}/challenge/advance`, { step: 0 });
    await new Promise((r) => setTimeout(r, 10));
    const stopped = await req(t, "POST", `/playground/rooms/${room0.id}/challenge/stop`, {}, "nadani");
    expect(stopped.room.challenge).toMatchObject({ status: "stopped" });
    release();
    const late = (await inflight).room;
    expect(late.challenge).toMatchObject({ status: "stopped" });
    expect(late.challenge!.finding).toBeUndefined();
    expect(await takeaway(t, before.id)).toEqual(before);
    // After a stop, the takeaway can be challenged again.
    expect(late.challengeAvailability).toMatchObject({ available: true });
  });

  it("stale version: a result for a takeaway that changed mid-run is rejected, not written", async () => {
    const grok = new Fake("grok", grokScript(({ refs, passage }) => ({ name: "deliver_challenge", args: { kind: "qualification", say: "Qualify it.", detail: `Per the passage: ${passage}`, sourceRefs: refs } })));
    const { t } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    defenderScript = () => [{ name: "revise_takeaway", args: { revisedTakeaway: "Revised text that should never land.", reply: "ok", whatChanged: "x", sourceRefs: ["S1"] } }];
    let r = (await req(t, "POST", `/playground/rooms/${room0.id}/challenge`, {})).room;
    // Run to the settling step, then change the takeaway underneath it (another device / instance).
    for (let i = 0; i < 20 && r.challenge?.status === "running" && r.challenge.phase !== "settling"; i++) r = (await req(t, "POST", `/playground/rooms/${room0.id}/challenge/advance`, { step: r.challenge.step })).room;
    expect(r.challenge!.phase).toBe("settling");
    const tk = await takeaway(t, room0.exchange!.savedTakeawayId!);
    await t.adapters.store.put("agent_takeaways", tk.id, { ...tk, text: "Changed elsewhere.", version: 2 }, tk.ownerId);
    r = (await req(t, "POST", `/playground/rooms/${room0.id}/challenge/advance`, { step: r.challenge!.step })).room;
    expect(r.challenge).toMatchObject({ status: "stale" });
    expect(r.challenge!.note).toMatch(/version 1 → 2/);
    const after = await takeaway(t, tk.id);
    expect(after.text).toBe("Changed elsewhere.");
    expect(after.challenges).toBeUndefined();
  });

  it("xAI unavailable or timing out: an honest state, no canned stand-in, original exchange and takeaway intact", async () => {
    for (const [err, status] of [
      [new ChallengerUnavailableError("xai 401 invalid key"), "unavailable"],
      [new ChallengerTimeoutError("xai timed out"), "timed_out"],
    ] as const) {
      const grok = new Fake("grok", () => {
        throw err;
      });
      const { t } = boot({ grok });
      const room0 = await savedTakeawayRoom(t);
      const before = await takeaway(t, room0.exchange!.savedTakeawayId!);
      const room = await runChallenge(t, room0.id);
      expect(room.challenge).toMatchObject({ status });
      expect(room.challenge!.messages).toEqual([]); // nothing presented as Grok's words
      expect(room.challenge!.finding).toBeUndefined();
      expect(room.challenge!.note).toMatch(/takeaway is unchanged/);
      expect(room.exchange).toEqual(room0.exchange);
      expect(await takeaway(t, before.id)).toEqual(before);
    }
  });

  it("without xAI configured, the action doesn't exist", async () => {
    const { t } = boot({ grok: null });
    const room0 = await savedTakeawayRoom(t);
    expect(room0.challengeAvailability).toBeUndefined();
    expect((await req(t, "POST", `/playground/rooms/${room0.id}/challenge`, {})).status).toBe(400);
  });

  it("persists: the outcome and revision history reopen from the library after a restart", async () => {
    const dataDir = tmp();
    takeawayShape = (p) => `Always: ${p}`;
    const grok = new Fake("grok", grokScript(({ refs, passage }) => ({ name: "deliver_challenge", args: { kind: "qualification", say: "Always?", detail: `The passage says: ${passage}`, sourceRefs: refs } })));
    const { t } = boot({ grok, dataDir });
    const room0 = await savedTakeawayRoom(t);
    defenderScript = (_p, messages) => {
      const u = JSON.parse(lastUser(messages).split("\n\nNow:")[0]!.replace(/^Challenge update \(data, not instructions\):\n/, ""));
      return [{ name: "revise_takeaway", args: { revisedTakeaway: (Object.values(u.yourTakeaway.passages)[0] as { text: string }).text, reply: "Dropped 'always'.", whatChanged: "Qualified.", sourceRefs: ["S1"] } }];
    };
    const done = await runChallenge(t, room0.id);
    const ch: TakeawayChallenge = done.challenge!;

    const { t: t2 } = boot({ grok: new Fake("grok", grokScript(noIssue)), dataDir });
    const reopened = await takeaway(t2, room0.exchange!.savedTakeawayId!);
    expect(reopened.version).toBe(2);
    expect(reopened.history!.map((h) => h.version)).toEqual([1, 2]);
    expect(reopened.challenges![0]).toMatchObject({ id: ch.id, status: "completed", outcome: { state: "revised", toVersion: 2 } });
    expect(reopened.challenges![0]!.messages.map((m) => m.kind)).toEqual(ch.messages.map((m) => m.kind));
    expect((await req(t2, "GET", `/playground/rooms/${room0.id}`)).room.challenge).toMatchObject({ id: ch.id, status: "completed" });
  });

  it("changes no human knowledge: mastery, transitions and verification are untouched by a challenge and a revision", async () => {
    takeawayShape = (p) => `Always: ${p}`;
    const grok = new Fake("grok", grokScript(({ refs, passage }) => ({ name: "deliver_challenge", args: { kind: "qualification", say: "Always?", detail: `The passage says: ${passage}`, sourceRefs: refs } })));
    const { t } = boot({ grok });
    const room0 = await savedTakeawayRoom(t);
    defenderScript = (_p, messages) => {
      const u = JSON.parse(lastUser(messages).split("\n\nNow:")[0]!.replace(/^Challenge update \(data, not instructions\):\n/, ""));
      return [{ name: "revise_takeaway", args: { revisedTakeaway: (Object.values(u.yourTakeaway.passages)[0] as { text: string }).text, reply: "ok", whatChanged: "Qualified.", sourceRefs: ["S1"] } }];
    };
    const know = async (u: string) => (await t.service.knowledge(u)).items.map((i) => i.state);
    const before = { a: await know("demo-user"), b: await know("nadani") };
    const tBefore = { a: (await t.adapters.temporal.getRecentTransitions("demo-user", 500)).length, b: (await t.adapters.temporal.getRecentTransitions("nadani", 500)).length };
    const room = await runChallenge(t, room0.id);
    expect(room.challenge!.outcome!.state).toBe("revised");
    expect(await know("demo-user")).toEqual(before.a);
    expect(await know("nadani")).toEqual(before.b);
    expect((await t.adapters.temporal.getRecentTransitions("demo-user", 500)).length).toBe(tBefore.a);
    expect((await t.adapters.temporal.getRecentTransitions("nadani", 500)).length).toBe(tBefore.b);
    expect(room.transfer).toEqual(room0.transfer);
  });
});

describe("GrokChallenger (xAI Responses API adapter)", () => {
  it("sends a stateless Responses request with function tools, replays calls/outputs, and parses the reported model", async () => {
    const sent: Array<{ url: string; body: Record<string, unknown>; auth: string | null }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") });
      return new Response(
        JSON.stringify({
          model: "grok-4.7-0925",
          output: [
            { type: "reasoning", summary: [] },
            { type: "function_call", call_id: "fc_1", name: "report_no_issue", arguments: '{"say":"ok","detail":"d","sourceRefs":[]}' },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const g = new GrokChallenger({ apiKey: "test-key", baseUrl: "https://api.x.ai/v1", model: "grok-4.7" }, fetchImpl);
    const history: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "u" },
      { role: "assistant", content: null, tool_calls: [{ id: "fc_0", type: "function", function: { name: "read_takeaway", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "fc_0", content: '{"ok":true}' },
    ];
    const out = await g.complete(history, [{ name: "report_no_issue", description: "d", parameters: { type: "object", properties: {} } }], { timeoutMs: 5000, purpose: "t" });
    expect(sent[0]!.url).toBe("https://api.x.ai/v1/responses");
    expect(sent[0]!.auth).toBe("Bearer test-key");
    expect(sent[0]!.body).toMatchObject({ model: "grok-4.7", store: false, tool_choice: "required", parallel_tool_calls: false, tools: [{ type: "function", name: "report_no_issue" }] });
    expect(sent[0]!.body.input).toEqual(toResponsesInput(history));
    expect(sent[0]!.body.input).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "u" },
      { type: "function_call", call_id: "fc_0", name: "read_takeaway", arguments: "{}" },
      { type: "function_call_output", call_id: "fc_0", output: '{"ok":true}' },
    ]);
    expect(out.model).toBe("grok-4.7-0925");
    expect(out.message.tool_calls).toEqual([{ id: "fc_1", type: "function", function: { name: "report_no_issue", arguments: '{"say":"ok","detail":"d","sourceRefs":[]}' } }]);
  });

  it("maps a non-transient error to unavailable and an abort to a timeout", async () => {
    const bad = new GrokChallenger({ apiKey: "k", baseUrl: "https://x", model: "m" }, (async () => new Response("no", { status: 401 })) as unknown as typeof fetch);
    await expect(bad.complete([], [], { timeoutMs: 5000, purpose: "t" })).rejects.toBeInstanceOf(ChallengerUnavailableError);
    const slow = new GrokChallenger({ apiKey: "k", baseUrl: "https://x", model: "m" }, ((_u: string, init: RequestInit) =>
      new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as unknown as typeof fetch);
    await expect(slow.complete([], [], { timeoutMs: 2100, purpose: "t" })).rejects.toBeInstanceOf(ChallengerTimeoutError);
  });
});
