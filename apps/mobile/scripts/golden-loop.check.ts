import { mockApi as api } from "../src/api/mock";
import * as T from "../src/api/types";
import { ConceptHistoryResponseSchema, DiagnosticSelectResponseSchema, MakeItStickResponseSchema, VisualizeResponseSchema } from "../src/api/types";
import { developments } from "../src/api/fixtures";

const assert = (c: unknown, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } console.log("ok -", m); };

(async () => {
  const today = T.TodayResponseSchema.parse(await api.getTodayBrief());
  assert(today.brief.meaningfulCount === 6 && today.brief.majorCount === 3 && today.brief.estimatedMinutes === 11, "brief 6 / 3 major / 11 min");
  assert(today.brief.skippedCount === 143, "143 filtered");
  const hero = today.brief.heroDevelopmentId;
  const detail = T.DevelopmentDetailResponseSchema.parse(await api.getDevelopment(hero));
  assert(detail.delta.alreadyKnew.length > 0 && detail.delta.whatChanged.length > 0, "delta has knew/changed");
  const q = DiagnosticSelectResponseSchema.parse(await api.selectDiagnostic({ developmentId: hero }));
  assert(q.rationale.includes("high-uncertainty"), "rationale present");
  const res = T.DiagnosticAnswerResponseSchema.parse(await api.answerDiagnostic(q.id, { answer: "Memory that persists across sessions" }));
  const t = res.transition;
  assert(t.before.mastery === 0.42 && t.after.mastery === 0.51, `mastery 0.42 -> 0.51 (${t.before.mastery} -> ${t.after.mastery})`);
  assert(t.before.uncertainty === 0.44 && t.after.uncertainty === 0.29, `uncertainty 0.44 -> 0.29 (${t.before.uncertainty} -> ${t.after.uncertainty})`);
  const k = T.KnowledgeResponseSchema.parse(await api.getKnowledge());
  assert(k.states.find((s) => s.conceptId === "agent-memory")?.mastery === 0.51, "Mind reflects update");
  assert(k.recentTransitions[0]?.id === t.id, "recent transition recorded");
  const h = ConceptHistoryResponseSchema.parse(await api.getConceptHistory("agent-memory"));
  assert(h.length === 4 && h.at(-1)?.id === t.id, "history has 4 entries ending in new transition");
  const today2 = await api.getTodayBrief();
  assert(today2.understoodDevelopmentIds.includes(hero), "Today shows 1 understood");
  for (const d of developments) {
    T.DevelopmentDetailResponseSchema.parse(await api.getDevelopment(d.id));
    DiagnosticSelectResponseSchema.parse(await api.selectDiagnostic({ developmentId: d.id }));
    VisualizeResponseSchema.parse(await api.visualize({ developmentId: d.id }));
    MakeItStickResponseSchema.parse(await api.makeItStick({ conceptId: d.conceptIds[0], developmentId: d.id }));
  }
  assert(true, "every development: detail/diagnostic/visualize/make-it-stick validate");
  for (const s of ["What changed in agent memory this week?", "What am I weakest on?", "Explain MCP based on what I already know.", "random"])
    T.AskResponseSchema.parse(await api.ask({ question: s }));
  T.FeedbackResponseSchema.parse(await api.sendFeedback("dev-mcp", "got_it"));
  T.VoiceSessionSchema.parse(await api.createVoiceSession({ briefDate: today.brief.date }));
  assert(true, "ask/feedback/voice validate");
  api.reset();
  const wrong = await api.answerDiagnostic(q.id, { answer: "A larger context window" });
  assert(wrong.answer.correctness === 0 && wrong.transition.after.misconceptionFlags.length === 1, "incorrect answer flags misconception");
})();
