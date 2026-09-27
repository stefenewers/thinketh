import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentScreenContext, KnowledgeItem } from "@thinketh/contracts";
import { clearWinner, createAgentTools, matchConcepts, SOURCES_TAB, type ToolDeps } from "../tools";
import { describeScreen, getScreen, publishScreen, waitForScreen } from "../screenStore";

const concept = (id: string, name: string, description = "") =>
  ({ concept: { id, name, description, domain: "ai", importance: 0.5 }, level: "developing", state: { evidenceCount: 3 } }) as unknown as KnowledgeItem;
const ITEMS = [
  concept("agent-memory", "Agent Memory", "How an AI decides what should persist across sessions"),
  concept("memory-consolidation", "Memory Consolidation", "Merging and pruning what an agent remembers"),
  concept("retrieval", "Retrieval", "Finding the right context"),
  concept("mcp", "Model Context Protocol (MCP)", "A standard for connecting tools"),
];

/** A fake app: navigation "lands" by publishing the destination screen, like a real screen would. */
function setup(over: Partial<ToolDeps> = {}) {
  let epoch = 1;
  const pushes: string[] = [];
  const land = (href: string) => {
    const url = new URL(href, "https://x");
    const [, first, second] = url.pathname.split("/");
    let ctx: AgentScreenContext;
    if (first === "mind") {
      const id = url.searchParams.get("concept");
      const item = ITEMS.find((i) => i.concept.id === id);
      ctx = { screen: "mind", route: "/mind", ...(item ? { focus: { kind: "concept", id: item.concept.id, label: item.concept.name } } : {}), visible: url.searchParams.get("tab") === "sources" ? [SOURCES_TAB] : [] };
    } else if (first === "development") ctx = { screen: "development", route: "/development", focus: { kind: "development", id: second!, label: "Dev" } };
    else if (first === "visualize") ctx = { screen: "visualize", route: "/visualize", focus: { kind: "development", id: second!, label: "Viz" } };
    else if (first === "library") ctx = { screen: "learn", route: "/library" };
    else ctx = { screen: "today", route: "/" };
    publishScreen(ctx);
  };
  const deps: ToolDeps = {
    api: {
      getKnowledge: vi.fn(async () => ({ userId: "u", items: ITEMS, edges: [] })),
      getTodayBrief: vi.fn(async () => ({
        brief: { heroDevelopmentId: "dev-persistent-agent-memory" },
        developments: [{ id: "dev-persistent-agent-memory", title: "Persistent agent memory", conceptIds: ["agent-memory"], significance: 0.9 }],
      })) as never,
      getDevelopment: vi.fn(async (id: string) => {
        if (id !== "dev-persistent-agent-memory") throw new Error("404");
        return {
          development: { id, title: "Persistent agent memory" },
          delta: { whatHappened: ["a"], whatChanged: ["b"], alreadyKnew: ["c"], whyItMattersToYou: "d", mentalModelChange: "e" },
          concepts: [{ id: "agent-memory", name: "Agent Memory" }],
          sources: [{ title: "Paper" }],
        };
      }) as never,
      getResource: vi.fn(async () => {
        throw new Error("404");
      }),
      ask: vi.fn(async () => ({ answer: "Because.", citations: [{ sourceId: "s", title: "Paper" }], relatedConceptIds: [], memoryUsed: [] })),
    },
    nav: {
      push: vi.fn((href: string) => {
        pushes.push(href);
        setTimeout(() => land(href), 5);
      }),
      canGoBack: () => false,
      back: vi.fn(),
    },
    screen: getScreen,
    waitForScreen,
    session: { epoch: () => epoch, setActivity: vi.fn(), mute: vi.fn(), briefScript: () => "First: Persistent agent memory." },
    playgroundAvailable: false,
    ...over,
  };
  return { deps, tools: createAgentTools(deps), pushes, endConversation: () => (epoch += 1) };
}

const call = async (p: Promise<string>) => JSON.parse(await p) as Record<string, unknown>;

beforeEach(() => {
  publishScreen({ screen: "today", route: "/" });
});

describe("concept search", () => {
  it("finds the book about agent memory, and asks when words fit several books", () => {
    expect(clearWinner(matchConcepts("the book about agent memory", ITEMS))?.id).toBe("agent-memory");
    const memory = matchConcepts("memory", ITEMS);
    expect(memory.map((m) => m.id)).toEqual(expect.arrayContaining(["agent-memory", "memory-consolidation"]));
    expect(clearWinner(memory)).toBeNull();
    expect(matchConcepts("quantum gardening", ITEMS)).toEqual([]);
  });
});

describe("agent tools", () => {
  it("opens a book only after the Mind screen shows it", async () => {
    const { tools, pushes } = setup();
    const r = await call(tools.open_concept({ concept_id: "agent-memory" }));
    expect(r).toMatchObject({ ok: true, opened: "the Agent Memory book" });
    expect(pushes).toEqual(["/mind?concept=agent-memory&from=voice"]);
    expect(getScreen()?.focus?.id).toBe("agent-memory");
  });

  it("refuses ids that aren't the user's, without navigating", async () => {
    const { tools, pushes } = setup();
    expect(await call(tools.open_concept({ concept_id: "made-up" }))).toMatchObject({ ok: false });
    expect(await call(tools.open_concept({ concept_id: "../../etc" }))).toMatchObject({ ok: false });
    expect(await call(tools.open_development({ development_id: "dev-nope" }))).toMatchObject({ ok: false });
    expect(pushes).toEqual([]);
  });

  it("never claims success when the destination doesn't appear", async () => {
    const { deps } = setup();
    deps.nav.push = vi.fn(); // navigation that goes nowhere
    const quiet = createAgentTools({ ...deps, waitForScreen: (pred) => waitForScreen(pred, 30) });
    expect(await call(quiet.open_concept({ concept_id: "agent-memory" }))).toMatchObject({ ok: false });
  });

  it("drops a late result after the conversation ends", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup();
    s.deps.api.getKnowledge = vi.fn(async () => {
      await gate;
      return { userId: "u", items: ITEMS, edges: [] };
    });
    const tools = createAgentTools(s.deps);
    const pending = call(tools.open_concept({ concept_id: "agent-memory" }));
    s.endConversation();
    release();
    expect(await pending).toMatchObject({ ok: false });
    expect(s.deps.nav.push).not.toHaveBeenCalled();
  });

  it("deduplicates a repeated call and doesn't navigate to where the user already is", async () => {
    const { tools, pushes } = setup();
    const [a, b] = await Promise.all([call(tools.open_concept({ concept_id: "agent-memory" })), call(tools.open_concept({ concept_id: "agent-memory" }))]);
    expect(a).toEqual(b);
    expect(pushes).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 2100)); // past the dedupe window
    expect(await call(tools.open_concept({ concept_id: "agent-memory" }))).toMatchObject({ ok: true, already_open: true });
    expect(pushes).toHaveLength(1);
  });

  it("explains 'this' from the screen, and opens its sources and visualization", async () => {
    const { tools, pushes } = setup();
    publishScreen({ screen: "mind", route: "/mind", focus: { kind: "concept", id: "agent-memory", label: "Agent Memory" } });
    const e = await call(tools.explain_focus({}));
    expect(e).toMatchObject({ ok: true, kind: "concept", id: "agent-memory", todays_development: { id: "dev-persistent-agent-memory" } });
    expect(JSON.stringify(e)).not.toMatch(/mastery|0\.\d/); // a level word, never invented numbers
    expect(await call(tools.open_sources({}))).toMatchObject({ ok: true });
    expect(pushes.at(-1)).toBe("/mind?concept=agent-memory&tab=sources&from=voice");
    expect(await call(tools.open_visualization({}))).toMatchObject({ ok: true });
    expect(pushes.at(-1)).toBe("/visualize/dev-persistent-agent-memory");
  });

  it("only navigates to allowlisted destinations", async () => {
    const { tools, pushes } = setup();
    expect(await call(tools.navigate({ destination: "https://evil.example" }))).toMatchObject({ ok: false });
    expect(await call(tools.navigate({ destination: "playground" }))).toMatchObject({ ok: false }); // unavailable in this build
    expect(await call(tools.navigate({ destination: "learn" }))).toMatchObject({ ok: true, opened: "learn" });
    expect(pushes).toEqual(["/library"]);
  });

  it("reports what it can't do instead of pretending", async () => {
    const { tools } = setup();
    expect(await call(tools.go_back({}))).toMatchObject({ ok: false });
    expect(await call(tools.read_takeaway({ about: "Nadani" }))).toMatchObject({ ok: false });
    expect(await call(tools.challenge_takeaway({ takeaway_id: "t1" }))).toMatchObject({ ok: false });
  });

  it("turns backend failures into results, never thrown errors", async () => {
    const s = setup();
    s.deps.api.ask = vi.fn(async () => {
      throw new Error("offline");
    });
    const r = await call(createAgentTools(s.deps).ask_thinketh({ question: "why?" }));
    expect(r).toMatchObject({ ok: false });
  });

  it("starts Catch Me Up as an activity of the same conversation", async () => {
    const s = setup();
    const r = await call(s.tools.start_catch_up({}));
    expect(r).toMatchObject({ ok: true, activity: "catch_up", briefing: "First: Persistent agent memory." });
    expect(s.deps.session.setActivity).toHaveBeenCalledWith("catch_up");
  });
});

describe("screen context for the agent", () => {
  it("names what 'this' is and replaces earlier context", () => {
    const text = describeScreen({ screen: "mind", route: "/mind", focus: { kind: "concept", id: "agent-memory", label: "Agent Memory" } });
    expect(text).toMatch(/replaces any earlier screen context/);
    expect(text).toMatch(/"Agent Memory" \(id agent-memory\)/);
  });

  it("during an assessment, allows navigation help but no coaching", () => {
    const text = describeScreen({ screen: "playground", route: "/playground", room: { id: "r", scene: "transfer", assessing: true, participants: 2 } });
    expect(text).toMatch(/do not hint at, coach or evaluate the answer/);
  });
});
