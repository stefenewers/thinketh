import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// The learner profile set during onboarding. Stored on the device only: it frames
// the experience (what you follow, why, how you like to learn). The knowledge
// state itself is never set here; Thinketh measures it from evidence.

export type LearnerProfile = {
  interests: string[];
  goals: string[];
  teaching: string[];
  completedAt: string | null;
};

export const INTERESTS = ["Agentic AI", "LLM systems", "Machine learning", "Robotics", "AI research", "Developer tools"];
export const GOALS = ["Building better systems", "Staying current", "Research", "Interview preparation", "Coursework", "Exploring the field"];
export const TEACHING = [
  { key: "Concise explanations", note: "The point first, detail on request." },
  { key: "Systems analogies", note: "Caches, databases, operating systems." },
  { key: "Visual explanations", note: "Before-and-after models you can see." },
  { key: "Ask me questions", note: "Check understanding instead of assuming it." },
  { key: "Go deep when needed", note: "Mechanisms and trade-offs when it matters." },
];

/** The demo persona: follows agentic AI, builds systems, learns through systems analogies. */
export const DEMO_PROFILE: LearnerProfile = {
  interests: ["Agentic AI", "LLM systems", "Machine learning"],
  goals: ["Building better systems"],
  teaching: ["Systems analogies", "Ask me questions"],
  completedAt: null,
};

const KEY = "thinketh.profile.v1";
let current: LearnerProfile | null | undefined; // undefined = not loaded yet
const listeners = new Set<(p: LearnerProfile | null) => void>();

function publish(p: LearnerProfile | null) {
  current = p;
  for (const l of listeners) l(p);
}

async function load(): Promise<LearnerProfile | null> {
  if (current !== undefined) return current;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    publish(raw ? (JSON.parse(raw) as LearnerProfile) : null);
  } catch {
    // Storage unavailable: behave as a first run, but never block the app.
    publish(null);
  }
  return current ?? null;
}

export async function saveProfile(p: LearnerProfile): Promise<void> {
  publish(p);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Kept in memory for this session.
  }
}

/** Demo control: show onboarding again on the next visit to Today. */
export async function clearProfile(): Promise<void> {
  publish(null);
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** `undefined` while loading, `null` before onboarding, else the saved profile. */
export function useProfile(): LearnerProfile | null | undefined {
  const [p, setP] = useState(current);
  useEffect(() => {
    listeners.add(setP);
    load().then(setP);
    return () => {
      listeners.delete(setP);
    };
  }, []);
  return p;
}
