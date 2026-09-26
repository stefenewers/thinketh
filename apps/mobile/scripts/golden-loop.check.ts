// Golden demo loop, end to end, through the same ThinkethApi the app uses.
//
//   npm run check:golden                                   # against the in-app mock
//   API_URL=http://localhost:8787 npm run check:golden     # against the real backend, NO mock fallback
//
// Every HTTP response is validated against packages/contracts, so a contract
// mismatch fails here instead of on a phone.
import type { ThinkethApi } from "../src/api/client";
import { createHttpApi } from "../src/api/http";
import { mockApi } from "../src/api/mock";
import { improvedTodayIds, understoodDevelopmentIds } from "../src/lib/knowledge";

const url = process.env.API_URL;
const api: ThinkethApi = url ? createHttpApi(url, null) : mockApi;
const round2 = (n: number) => Math.round(n * 100) / 100;

let failures = 0;
const check = (ok: unknown, label: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} - ${label}`);
  if (!ok) failures++;
};

// Correct choices for the hero question in each dataset (the API never reveals them).
const CORRECT: Record<string, (choices: string[]) => string | undefined> = {
  "dq-agent-memory": (c) => c.find((x) => x.startsWith("Memory that persists")),
  "dq-agent-memory-persistence": (c) => c.find((x) => x.startsWith("Distilled facts")),
};

async function main() {
  console.log(`target: ${url ?? "mock"}`);
  await api.resetDemo();

  // Today
  const today = await api.getTodayBrief();
  const { brief } = today;
  check(brief.meaningfulCount === 6 && brief.majorCount === 3 && brief.estimatedMinutes === 11, "Today: 6 developments / 3 major / 11 min");
  check((brief.skippedCount ?? 0) > 0 && brief.skippedBreakdown, `Today: ${brief.skippedCount} filtered, with breakdown`);
  const hero = today.developments.find((d) => d.id === brief.heroDevelopmentId);
  check(hero, `Today: hero "${hero?.title}"`);
  if (!hero) return;

  // Development
  const detail = await api.getDevelopment(hero.id);
  check(detail.delta.alreadyKnew.length && detail.delta.whatChanged.length && detail.delta.mentalModelChange, "Development: knowledge delta present");

  // Diagnostic select
  const picked = await api.selectDiagnostic({ developmentId: hero.id });
  check(picked.question.conceptId === "agent-memory", `Diagnostic: backend chose ${picked.question.conceptId}`);
  check(picked.selection.explanation.startsWith("Chosen because"), `Diagnostic: explanation "${picked.selection.explanation.slice(0, 60)}…"`);
  check(picked.selection.candidates.length > 1, `Diagnostic: ${picked.selection.candidates.length} candidates weighed`);

  // Answer
  const correct = CORRECT[picked.question.id]?.(picked.question.choices ?? []);
  check(correct, `Diagnostic: know the correct choice for ${picked.question.id}`);
  if (!correct) return;
  const { answer, transition: t } = await api.answerDiagnostic(picked.question.id, correct);
  check(answer.correctness === 1, "Answer: graded correct");
  check(
    round2(t.before.mastery) === 0.42 && round2(t.after.mastery) === 0.51,
    `Transition: mastery ${t.before.mastery} -> ${t.after.mastery} (runbook 0.42 -> 0.51)`,
  );
  check(
    round2(t.before.uncertainty) === 0.44 && round2(t.after.uncertainty) === 0.29,
    `Transition: uncertainty ${t.before.uncertainty} -> ${t.after.uncertainty} (runbook 0.44 -> 0.29)`,
  );
  check(t.reason.length > 20, `Transition: reason "${t.reason.slice(0, 70)}…"`);

  // Mind
  const k = await api.getKnowledge();
  const item = k.items.find((i) => i.concept.id === "agent-memory");
  check(item && item.state.mastery === t.after.mastery, "Mind: Agent Memory shows the new mastery");
  const improvedIds = improvedTodayIds(k.items);
  check(improvedIds.has("agent-memory"), "Mind: Agent Memory marked as just improved");
  check(improvedIds.size === 1, `Mind: only the answered concept is "just improved" (got ${[...improvedIds].join(", ")})`);

  // History
  const h = await api.getConceptHistory("agent-memory");
  check(h.transitions.at(-1)?.id === t.id, `History: ${h.transitions.length} transitions, newest is this answer`);

  // Today progress
  const today2 = await api.getTodayBrief();
  check(understoodDevelopmentIds(today2.developments, k.items).has(hero.id), "Today: hero counts as understood (derived)");
  if (today2.understoodDevelopmentIds) {
    check(today2.understoodDevelopmentIds.includes(hero.id), "Today: server agrees the hero is understood");
  }

  // Secondary endpoints validate
  for (const d of today.developments) {
    await api.getDevelopment(d.id);
    await api.visualize({ developmentId: d.id });
    await api.makeItStick({ developmentId: d.id, conceptId: d.conceptIds[0] });
  }
  check(true, "Every development: detail / visualize / make-it-stick validate");
  for (const q of ["What changed in agent memory this week?", "What am I weakest on?", "Explain MCP based on what I already know."]) {
    await api.ask({ question: q });
  }
  check(true, "Ask: suggested questions validate");
  const voice = await api.createVoiceSession();
  check(voice.fallbackTranscript.length > 0, `Voice: ${voice.mode}, ${voice.fallbackTranscript.length} transcript lines`);
  const other = today.developments.find((d) => d.id !== hero.id)!;
  const fb = await api.sendFeedback(other.id, "got_it");
  check(fb.transitions.length > 0, "Feedback: got_it recorded");

  // Wrong answer path
  await api.resetDemo();
  const again = await api.selectDiagnostic({ developmentId: hero.id });
  const wrongChoice = (again.question.choices ?? []).find((c) => c !== correct)!;
  const wrong = await api.answerDiagnostic(again.question.id, wrongChoice);
  check(wrong.answer.correctness < 1 && wrong.transition.after.mastery <= wrong.transition.before.mastery, "Wrong answer: mastery does not rise");

  await api.resetDemo();
}

main()
  .catch((e) => {
    console.error("FAIL -", e instanceof Error ? e.message : e);
    failures++;
  })
  .finally(() => {
    console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
    process.exit(failures ? 1 : 0);
  });
