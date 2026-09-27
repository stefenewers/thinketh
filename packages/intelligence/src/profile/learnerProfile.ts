/**
 * The learner profile a person sets in onboarding, and how the engine reads it.
 *
 * Preference is not evidence: interests weight what Thinketh shows first and
 * teaching choices shape how it explains. Neither ever sets mastery; the
 * knowledge state only moves on observations (engine/knowledgeState.ts).
 */
import type { Concept, LearnerProfile, PersonaProfile } from "../contracts.ts";

/**
 * Onboarding interests -> the seeded concept graph. Discovered concepts are matched by
 * keyword (below), so an interest keeps working as the corpus grows. "Robotics" has no
 * concepts in the current AI-agents coverage, and the app is told so (coverage: []).
 */
const INTEREST_CONCEPTS: Record<string, string[]> = {
  "Agentic AI": ["agent-tool-use", "agent-memory", "long-running-agents", "mcp", "evaluator-architectures"],
  "LLM systems": ["context-windows", "retrieval", "context-compaction", "memory-consolidation", "agent-memory"],
  "Machine learning": ["evaluator-architectures", "retrieval", "memory-consolidation"],
  "AI research": ["evaluator-architectures", "memory-consolidation", "long-running-agents"],
  "Developer tools": ["mcp", "agent-tool-use", "evaluator-architectures"],
  Robotics: [],
};

const INTEREST_KEYWORDS: Record<string, RegExp> = {
  "Agentic AI": /\bagent|tool use|planning|autonomous|multi-agent/i,
  "LLM systems": /\bcontext|retrieval|\brag\b|inference|serving|token|memory/i,
  "Machine learning": /\btraining|model|learning|benchmark|evaluation|fine-tun/i,
  "AI research": /\bresearch|benchmark|paper|evaluation|alignment|interpretab/i,
  "Developer tools": /\bsdk|api|protocol|developer|coding|tooling|\bmcp\b/i,
  Robotics: /\brobot|embodied|manipulation|locomotion/i,
};

/** Onboarding teaching choices -> explanation preferences the model prompts already follow. */
const TEACHING_PREFERENCES: Record<string, string> = {
  "Concise explanations": "concise: the point first, detail only on request",
  "Systems analogies": "systems analogies (caches, databases, operating systems) over math",
  "Visual explanations": "before/after comparisons of the mental model",
  "Ask me questions": "check understanding with a question instead of assuming it",
  "Go deep when needed": "mechanisms and trade-offs when they matter",
};

const GOAL_SENTENCES: Record<string, string> = {
  "Building better systems": "Build better AI systems",
  "Staying current": "Stay current on what changes in AI",
  Research: "Do research in AI",
  "Interview preparation": "Prepare for technical interviews",
  Coursework: "Keep up with coursework",
  "Exploring the field": "Explore the field",
};

/** The seeded demo persona's frame, in the onboarding vocabulary (for GET /profile). */
export const DEMO_LEARNER_PROFILE: Omit<LearnerProfile, "displayName"> = {
  interests: ["Agentic AI", "LLM systems", "Machine learning"],
  goals: ["Building better systems"],
  teaching: ["Systems analogies", "Ask me questions"],
  completedAt: null,
};

export type Depth = "concise" | "standard" | "deep";

/** How much to say. Presentation only: never changes a number. */
export function depthOf(prefs: string[]): Depth {
  const p = prefs.join(" | ").toLowerCase();
  if (p.includes("mechanisms and trade-offs")) return "deep";
  if (p.includes("concise")) return "concise";
  return "standard";
}

/** Concepts the static mapping already places; anything else (discovered concepts) is matched by keyword. */
const MAPPED = new Set(Object.values(INTEREST_CONCEPTS).flat());

export function conceptsForInterest(interest: string, concepts: Iterable<Concept>): string[] {
  const listed = new Set(INTEREST_CONCEPTS[interest] ?? []);
  const kw = INTEREST_KEYWORDS[interest];
  // Free-text interests (not in the onboarding list): match on their own words.
  const words = kw ? [] : interest.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const out: string[] = [];
  for (const c of concepts) {
    const text = `${c.name} ${c.description}`;
    if (listed.has(c.id)) out.push(c.id);
    else if (!MAPPED.has(c.id) && (kw ? kw.test(text) : words.some((w) => text.toLowerCase().includes(w)))) out.push(c.id);
  }
  return out;
}

/** What the engine uses: interests with the concepts they cover, goals as sentences, explanation preferences. */
export function toPersonaProfile(userId: string, p: LearnerProfile | null, concepts: Iterable<Concept>): PersonaProfile {
  const list = [...concepts];
  return {
    id: userId,
    displayName: p?.displayName ?? "You",
    // Every chosen interest weighs the same: onboarding asks what you follow, not a ranking.
    interests: (p?.interests ?? []).map((topic) => ({ topic, weight: 1, conceptIds: conceptsForInterest(topic, list) })),
    goals: (p?.goals ?? []).map((g) => GOAL_SENTENCES[g] ?? g),
    explanationPreferences: (p?.teaching ?? []).map((t) => TEACHING_PREFERENCES[t] ?? t),
  };
}
