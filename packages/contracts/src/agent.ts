// The personal voice agent: one Thinketh companion, reachable from every main screen.
// Shared by the mobile session controller (client tools, screen context) and the script that
// configures the hosted ElevenLabs agent (scripts/configure-voice-agent.ts), so the tool names
// and schemas the agent knows are exactly the ones the app handles.
import { z } from "zod";

/** What the agent is doing for the user. Same agent, same voice; only the job changes. */
export const AgentActivitySchema = z.enum(["assist", "catch_up"]);
export type AgentActivity = z.infer<typeof AgentActivitySchema>;

/** Body of POST /voice/session. Absent = catch_up, which is what older app builds expect. */
export const VoiceSessionRequestSchema = z.object({ activity: AgentActivitySchema.optional() });
export type VoiceSessionRequest = z.infer<typeof VoiceSessionRequestSchema>;

// ---------------------------------------------------------------------------
// Screen context: a reference to what the user is looking at, never authorization.
// Handlers re-fetch anything authoritative through the authenticated API.
// ---------------------------------------------------------------------------

export const AgentScreenSchema = z.enum([
  "today",
  "learn",
  "mind",
  "ask",
  "explore",
  "development",
  "resource",
  "storyline",
  "visualize",
  "playground",
  "catch_up",
  "other",
]);
export type AgentScreen = z.infer<typeof AgentScreenSchema>;

export const AgentFocusSchema = z.object({
  kind: z.enum(["concept", "development", "resource", "storyline", "room"]),
  id: z.string().min(1).max(120),
  label: z.string().max(160),
});
export type AgentFocus = z.infer<typeof AgentFocusSchema>;

export const AgentScreenContextSchema = z.object({
  screen: AgentScreenSchema,
  /** Pathname only (no query), for logs and loop checks. */
  route: z.string().max(200),
  title: z.string().max(160).optional(),
  /** The one thing "this" refers to: the open book, development, source or room. */
  focus: AgentFocusSchema.optional(),
  /** A few short lines of what is visible. Never whole libraries or private histories. */
  visible: z.array(z.string().max(240)).max(6).optional(),
  /**
   * Playground only. `assessing` (@deprecated, optional since the guided session's transfer question was
   * removed on 2026-09-27): a human answer was about to count as evidence; no coaching.
   */
  room: z.object({ id: z.string(), scene: z.string().max(40), assessing: z.boolean().optional(), participants: z.number().int() }).optional(),
});
export type AgentScreenContext = z.infer<typeof AgentScreenContextSchema>;

// ---------------------------------------------------------------------------
// Client tools. Every navigation and app action the agent can take is one of these; there is no
// generic "open this route" tool, and destinations are an allowlist.
// ---------------------------------------------------------------------------

export const AGENT_DESTINATIONS = ["today", "learn", "mind", "ask", "explore", "playground", "profile"] as const;
export type AgentDestination = (typeof AGENT_DESTINATIONS)[number];

/** JSON Schema subset the ElevenLabs tool API accepts for client tool parameters. */
type Param = { type: "string"; description: string; enum?: readonly string[] };
export type AgentToolSpec = {
  name: string;
  description: string;
  params: Record<string, Param & { required?: boolean }>;
  /** Takes seconds (server + Claude): the agent says a short line first, and speech can't abandon the call. */
  slow?: boolean;
};

const s = (description: string, extra: Partial<Param> & { required?: boolean } = {}) => ({ type: "string" as const, description, ...extra });

export const AGENT_TOOLS = [
  {
    name: "get_screen_context",
    description:
      "What the user is looking at right now: screen, the focused book/development/source, and what is visible. Call before answering 'this', 'here' or 'what am I looking at'.",
    params: {},
  },
  {
    name: "explain_focus",
    description:
      "Thinketh's own facts about the thing on screen (or a given concept/development/resource id): what it is, what changed, and what this user already knows. Use for 'explain this' instead of guessing.",
    params: {
      kind: s("Optional: concept, development or resource. Omit to use the current screen's focus.", { enum: ["concept", "development", "resource"] }),
      id: s("Optional id from a previous tool result or the Catch Me Up briefing. Omit to use the current screen's focus."),
    },
  },
  {
    name: "ask_thinketh",
    description:
      "Answer a question about AI developments and ideas from the user's Thinketh sources and memory (the same engine as the Ask tab). Returns the answer and its source titles. Not for questions about how the app works: answer those from the app map in your instructions.",
    params: { question: s("The user's question, in their words.", { required: true }) },
    slow: true,
  },
  {
    name: "find_concept",
    description: "Find books (concepts) in the user's Mind by name or description. Returns up to 4 matches with ids. Use before open_concept when you only have words.",
    params: { query: s("What the user called it, e.g. 'agent memory'.", { required: true }) },
  },
  {
    name: "open_concept",
    description: "Open a book (concept) in the user's Mind. Only use an id returned by find_concept, explain_focus or get_screen_context.",
    params: { concept_id: s("Concept id.", { required: true }) },
  },
  {
    name: "open_development",
    description: "Open a development's detail page. Only use an id returned by a previous tool.",
    params: { development_id: s("Development id.", { required: true }) },
  },
  {
    name: "open_resource",
    description: "Open one of the user's saved sources in Learn. Only use an id returned by a previous tool.",
    params: { resource_id: s("Resource id.", { required: true }) },
  },
  {
    name: "open_sources",
    description: "Show the sources behind the book or development on screen (or the given concept id).",
    params: { concept_id: s("Optional concept id. Omit for the current focus.") },
  },
  {
    name: "open_visualization",
    description: "Open the visual explanation for the development or book on screen (or the given concept id).",
    params: { concept_id: s("Optional concept id. Omit for the current focus.") },
  },
  {
    name: "navigate",
    description: "Go to a main part of the app.",
    params: { destination: s("Where to go.", { required: true, enum: AGENT_DESTINATIONS }) },
  },
  { name: "go_back", description: "Go back to the previous screen.", params: {} },
  {
    name: "start_catch_up",
    description: "Start the user's Catch Me Up: returns today's briefing script to deliver. Use when they ask to be caught up.",
    params: {},
  },
  { name: "mute_microphone", description: "Mute the user's microphone. They unmute from the screen; say so.", params: {} },
  {
    name: "read_takeaway",
    description: "Read a saved takeaway the user's agent brought back from a Playground exchange.",
    params: { about: s("Optional: who it was with or what it was about, e.g. 'Nadani' or 'agent memory'.") },
  },
  {
    name: "challenge_takeaway",
    description: "Ask Grokbot to challenge a saved takeaway. Only after the user explicitly asks for a challenge.",
    params: { takeaway_id: s("Takeaway id from read_takeaway.", { required: true }) },
  },
] as const satisfies readonly AgentToolSpec[];

export type AgentToolName = (typeof AGENT_TOOLS)[number]["name"];

/** Every tool result the app returns to the agent. `ok: false` always carries a reason it can say. */
export type AgentToolResult =
  | ({ ok: true } & Record<string, unknown>)
  | { ok: false; reason: string; ask?: string; options?: { id: string; label: string }[] };
