import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { profileApi } from "@/api/profile";
import { currentMode, currentUserId, ensureSession } from "./session";

// The learner profile set during onboarding: what you follow, why, and how you like to
// learn. It frames what Thinketh shows and how it explains; it is never evidence of what
// you know (that is measured separately, in your Mind).
//
// Demo mode keeps it on the device, as before (the demo persona's server profile is fixed).
// With your own Mind it lives on the server under your verified identity, so it follows you
// across sessions and devices; the device keeps a per-identity copy for instant display.

export type LearnerProfile = {
  interests: string[];
  goals: string[];
  teaching: string[];
  completedAt: string | null;
  /** Personal mode: what Thinketh calls you. */
  displayName?: string;
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

const KEY = "thinketh.profile.v1"; // demo mode, and profiles saved before server profiles existed
const cacheKey = (userId: string) => `thinketh.profile.v2.${userId}`;
let current: LearnerProfile | null | undefined; // undefined = not loaded yet
let loadedFor: string | null | undefined;
const listeners = new Set<(p: LearnerProfile | null) => void>();

function publish(p: LearnerProfile | null) {
  current = p;
  for (const l of listeners) l(p);
}

async function readJson(key: string): Promise<LearnerProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as LearnerProfile) : null;
  } catch {
    return null;
  }
}

async function load(): Promise<LearnerProfile | null> {
  if (currentMode() === "personal") await ensureSession();
  const who = currentMode() === "demo" ? "demo" : currentUserId();
  if (current !== undefined && loadedFor === who) return current;
  loadedFor = who;
  if (currentMode() === "demo" || !who) {
    publish(currentMode() === "demo" ? await readJson(KEY) : null);
    return current ?? null;
  }
  // Show this identity's cached copy at once, then take the server's answer.
  const cached = await readJson(cacheKey(who));
  if (cached) publish(cached);
  try {
    const { profile } = await profileApi.get();
    publish(profile);
    if (profile) await AsyncStorage.setItem(cacheKey(who), JSON.stringify(profile)).catch(() => {});
  } catch {
    // Offline: keep the cached copy (or first-run onboarding) rather than blocking the app.
    if (!cached) publish(null);
  }
  return current ?? null;
}

/**
 * Answers saved on this device before profiles moved to the server. Offered to prefill onboarding,
 * never uploaded on their own: they may belong to whoever used the phone before this sign-in.
 */
export async function legacyProfile(): Promise<LearnerProfile | null> {
  if (currentMode() !== "personal") return null;
  return readJson(KEY);
}

export async function saveProfile(p: LearnerProfile): Promise<void> {
  if (currentMode() === "demo") {
    publish(p);
    await AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
    return;
  }
  const who = currentUserId();
  if (!who) throw new Error("Sign in to save your profile.");
  const { profile } = await profileApi.save({
    displayName: p.displayName?.trim() || "You",
    interests: p.interests,
    goals: p.goals,
    teaching: p.teaching,
    completedAt: p.completedAt,
  });
  publish(profile);
  await AsyncStorage.setItem(cacheKey(who), JSON.stringify(profile)).catch(() => {});
  // The person explicitly saved these answers to their account; the unscoped device copy is done.
  await AsyncStorage.removeItem(KEY).catch(() => {});
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

/** Forget the loaded profile (after signing in or out, or switching modes). */
export function resetProfileCache(): void {
  current = undefined;
  loadedFor = undefined;
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
