import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { Concept, DiagnosticAnswerResponse, DiagnosticQuestion, DiagnosticSelectResponse } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { KnowledgeStateTransitionView } from "@/components/KnowledgeStateTransitionView";
import { T } from "@/components/Text";
import { Button, ErrorState, Gutter, LoadingState, Screen } from "@/components/ui";
import { recordCheck } from "@/lib/lastCheck";
import { useApi } from "@/lib/hooks";
import { fmt2 } from "@/lib/knowledge";
import { color, font, radius, space } from "@/theme/tokens";

export default function DiagnosticScreen() {
  const { developmentId, conceptId } = useLocalSearchParams<{ developmentId?: string; conceptId?: string }>();
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useApi(
    async () => {
      const [picked, knowledge] = await Promise.all([
        api.selectDiagnostic({ developmentId, conceptId }),
        api.getKnowledge(),
      ]);
      return { picked, concepts: knowledge.items.map((i) => i.concept) };
    },
    [developmentId, conceptId],
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.ground, paddingTop: insets.top }}>
      <View style={styles.header}>
        <T variant="meta">Check my understanding</T>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.close}>
          <Icon name="close" size={20} color={color.ink} />
        </Pressable>
      </View>
      {loading && !data ? (
        <LoadingState message="Choosing the question that will tell Thinketh the most…" />
      ) : error || !data ? (
        <ErrorState onRetry={reload} />
      ) : (
        <Diagnostic question={data.picked.question} selection={data.picked.selection} concepts={data.concepts} developmentId={developmentId} />
      )}
    </View>
  );
}

function Diagnostic({
  question,
  selection,
  concepts,
  developmentId,
}: {
  developmentId?: string;
  question: DiagnosticQuestion;
  selection: DiagnosticSelectResponse["selection"];
  concepts: Concept[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [whyOpen, setWhyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DiagnosticAnswerResponse | null>(null);
  const [submitError, setSubmitError] = useState(false);
  const [settled, setSettled] = useState(false);
  const concept = concepts.find((c) => c.id === question.conceptId);
  const answer = question.type === "multiple_choice" ? selected : text.trim() || null;

  const submit = async () => {
    if (!answer) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const res = await api.answerDiagnostic(question.id, answer);
      Haptics.notificationAsync(
        res.answer.correctness >= 0.99 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      ).catch(() => {});
      setResult(res);
      // So the development page can point at the change when you come back.
      if (developmentId) recordCheck(developmentId, question.conceptId, res);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const [verdict, explanation] = result ? splitFeedback(result.answer.correctness, result.answer.feedback) : [null, null];

  return (
    <Screen topInset={false}>
      <Gutter>
        <T variant="label">{concept?.name ?? "Your understanding"}</T>
        <T variant="section" style={{ marginTop: space.m, fontSize: 20, lineHeight: 28 }} accessibilityRole="header">
          {question.prompt}
        </T>

        {!result ? (
          <Pressable
            onPress={() => setWhyOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: whyOpen }}
            style={styles.why}
          >
            <Icon name="info" size={15} color={color.ink2} />
            <T variant="meta" style={{ flex: 1 }}>
              Why this question?
            </T>
          </Pressable>
        ) : null}
        {whyOpen && !result ? <WhyThisQuestion question={question} selection={selection} /> : null}

        <View style={{ marginTop: space.xl, gap: space.m }}>
          {question.type === "multiple_choice" ? (
            (question.choices ?? []).map((choice) => {
              const isSel = selected === choice;
              const locked = !!result;
              return (
                <Pressable
                  key={choice}
                  disabled={locked}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelected(choice);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSel, disabled: locked }}
                  style={[
                    styles.choice,
                    isSel && styles.choiceSelected,
                    locked && !isSel && { opacity: 0.45 },
                  ]}
                >
                  <View style={[styles.radio, isSel && styles.radioOn]}>{isSel ? <View style={styles.radioDot} /> : null}</View>
                  <T variant="body" style={{ flex: 1 }}>
                    {choice}
                  </T>
                </Pressable>
              );
            })
          ) : (
            <TextInput
              value={text}
              onChangeText={setText}
              editable={!result}
              multiline
              placeholder="Explain it in your own words"
              placeholderTextColor={color.ink3}
              style={styles.input}
            />
          )}
        </View>

        {!result ? (
          <View style={{ marginTop: space.xxl }}>
            <Button label="Submit" onPress={submit} disabled={!answer} loading={submitting} />
            {submitError ? (
              <T variant="support" style={{ marginTop: space.m, textAlign: "center" }}>
                Couldn&apos;t submit. Your answer is kept; try again.
              </T>
            ) : null}
          </View>
        ) : null}
      </Gutter>

      {result ? (
        <>
          <Gutter style={{ marginTop: space.xxl }}>
            <View style={styles.feedback} accessibilityLiveRegion="polite">
              <T variant="section">{verdict}</T>
              {explanation ? (
                <T variant="body" style={{ marginTop: space.s, color: color.ink2 }}>
                  {explanation}
                </T>
              ) : null}
            </View>
          </Gutter>
          <Gutter style={{ marginTop: space.xl }}>
            <KnowledgeStateTransitionView transition={result.transition} concepts={concepts} onDone={() => setSettled(true)} />
          </Gutter>
          <Gutter style={{ marginTop: space.xxl, gap: space.m, opacity: settled ? 1 : 0.6 }}>
            <Button
              label="See what changed in my Mind"
              icon="arrow"
              onPress={() => router.replace({ pathname: "/mind", params: { concept: question.conceptId } })}
            />
            <Button
              kind="quiet"
              label="Back to today"
              style={{ alignSelf: "center" }}
              onPress={() => (router.canDismiss() ? router.dismissAll() : router.replace("/"))}
            />
          </Gutter>
        </>
      ) : null}
    </Screen>
  );
}

// Feedback may lead with its own verdict ("Right. …"); use it as the heading
// instead of stacking a second one above it.
function splitFeedback(correctness: number, feedback: string): [string, string] {
  const m = feedback.match(/^(Right|Correct|Not quite|Partly|Almost)[^.!]{0,20}[.!]\s*/i);
  if (m) return [m[0].trim(), feedback.slice(m[0].length)];
  const verdict = correctness >= 0.99 ? "Right." : correctness > 0 ? "Partly there." : "One connection needs clarification.";
  return [verdict, feedback];
}

function WhyThisQuestion({
  question,
  selection,
}: {
  question: DiagnosticQuestion;
  selection: DiagnosticSelectResponse["selection"];
}) {
  const d = question.selectionDebug;
  const rows: [string, number][] = d
    ? [
        ["Uncertainty", d.uncertainty],
        ["Importance", d.importance],
        ["Your interest", d.interest],
        ["Freshness", d.freshness],
        ["Prerequisite centrality", d.prerequisiteCentrality],
      ]
    : [];
  const top = Math.max(...selection.candidates.map((c) => c.priority), 0.0001);
  return (
    <View style={styles.whyPanel}>
      <T variant="support" style={{ color: color.ink }}>
        {selection.explanation}
      </T>
      {question.rationale && question.rationale !== selection.explanation ? (
        <T variant="support" style={{ marginTop: space.s }}>
          {question.rationale}
        </T>
      ) : null}

      {d ? (
        <View style={{ marginTop: space.l, gap: 6 }}>
          {rows.map(([label, v]) => (
            <View key={label} style={styles.debugRow}>
              <T variant="meta" style={{ flex: 1 }}>
                {label}
              </T>
              <View style={styles.debugTrack}>
                <View style={[styles.debugFill, { width: `${Math.min(1, v) * 100}%` }]} />
              </View>
              <T variant="meta" style={styles.debugNum}>
                {fmt2(v)}
              </T>
            </View>
          ))}
        </View>
      ) : null}

      {selection.candidates.length > 1 ? (
        <View style={{ marginTop: space.l }}>
          <T variant="label" style={{ marginBottom: space.s }}>
            Concepts Thinketh weighed
          </T>
          {selection.candidates.map((c, i) => (
            <View key={c.conceptId} style={styles.debugRow}>
              <T
                variant="meta"
                numberOfLines={1}
                style={[{ flex: 1 }, i === 0 && { color: color.ink, fontFamily: font.sansSemibold }]}
              >
                {c.conceptName}
              </T>
              <View style={styles.debugTrack}>
                <View style={[styles.debugFill, { width: `${(c.priority / top) * 100}%` }, i === 0 && { backgroundColor: color.ink }]} />
              </View>
              <T variant="meta" style={[styles.debugNum, i === 0 && { color: color.ink, fontFamily: font.sansSemibold }]}>
                {fmt2(c.priority)}
              </T>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: space.xl,
    paddingRight: space.s,
    minHeight: 52,
  },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  why: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginTop: space.m, alignSelf: "flex-start" },
  whyPanel: { backgroundColor: color.fog, borderRadius: radius.surface, padding: space.l },
  debugRow: { flexDirection: "row", alignItems: "center", gap: space.m },
  debugTrack: { width: 72, height: 4, borderRadius: 2, backgroundColor: color.edge, overflow: "hidden" },
  debugFill: { height: 4, backgroundColor: color.ink2 },
  debugNum: { width: 36, textAlign: "right", fontVariant: ["tabular-nums"] },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 56,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: color.edge,
    backgroundColor: color.canvas,
  },
  choiceSelected: { borderColor: color.ink, borderWidth: 1.5 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: color.ink3, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: color.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.ink },
  input: {
    minHeight: 120,
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: color.edge,
    backgroundColor: color.canvas,
    padding: space.l,
    fontFamily: font.sans,
    fontSize: 16,
    lineHeight: 24,
    color: color.ink,
    textAlignVertical: "top",
  },
  feedback: { paddingLeft: space.l, borderLeftWidth: 2, borderLeftColor: color.ink },
});
