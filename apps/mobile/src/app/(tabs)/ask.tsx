import { useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { AskResponse } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { AppTopBar, ConceptChip, IconButton, InsightRow, ListCard, RaisedCard, ReasoningStep, SectionHeader, SegmentedTabs, SignalPill, SourceCard } from "@/components/system";
import { T } from "@/components/Text";
import { Gutter, LoadingState } from "@/components/ui";
import { imageFor } from "@/content/imagery";
import { useApi } from "@/lib/hooks";
import { color, font, layout, radius, space } from "@/theme/tokens";

const SUGGESTED = [
  "What changed in agent memory this week?",
  "What am I weakest on?",
  "Explain MCP based on what I already know.",
];

type AskMode = "quick" | "teach" | "deep";
const MODES: { key: AskMode; label: string; loading: string }[] = [
  { key: "quick", label: "Quick answer", loading: "Grounding this in your sources…" },
  { key: "teach", label: "Teach me", loading: "Finding the actual delta for you…" },
  { key: "deep", label: "Go deep", loading: "Comparing sources and what's still uncertain…" },
];

type Answer = AskResponse & { question: string; developmentId?: string; mode?: AskMode };

export default function Ask() {
  const { q, dev, mode: modeParam } = useLocalSearchParams<{ q?: string; dev?: string; mode?: AskMode }>();
  const [mode, setMode] = useState<AskMode>("quick");
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Storyboard 05: "Why this answer?" is its own view (not a route); null = the answer view.
  const [why, setWhy] = useState<null | { allSources: boolean }>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Names for related concepts.
  const lookup = useApi(async () => (await api.getKnowledge()).items.map((i) => i.concept), []);

  const ask = async (question: string, developmentId?: string, asMode: AskMode = mode) => {
    const text = question.trim();
    if (!text || asking) return;
    setInput("");
    setAsking(true);
    setPending(text);
    setFailed(null);
    setAnswer(null);
    setWhy(null);
    try {
      setAnswer({ ...(await api.ask({ question: text, ...(developmentId ? { developmentId } : {}), mode: asMode })), question: text, developmentId, mode: asMode });
    } catch {
      setFailed(text);
    } finally {
      setAsking(false);
      setPending(null);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };

  // A question handed over from another screen (e.g. "Explain deeper").
  useEffect(() => {
    if (q) {
      const m = modeParam && MODES.some((x) => x.key === modeParam) ? modeParam : mode;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- responding to a navigation param, once
      setMode(m);
      ask(q, dev, m);
      router.setParams({ q: undefined, dev: undefined, mode: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const conceptName = (id: string) => lookup.data?.find((c) => c.id === id)?.name;

  const changeMode = (k: AskMode) => {
    if (k === mode) return;
    setMode(k);
    if (answer && !asking) ask(answer.question, answer.developmentId, k);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.canvas }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {why && answer ? (
        <AppTopBar title="Why this answer?" onBack={() => setWhy(null)} />
      ) : (
        <AppTopBar
          title="Ask Thinketh"
          right={answer && !asking ? <IconButton icon="close" accessibilityLabel="Ask something else" onPress={() => setAnswer(null)} /> : null}
        />
      )}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: layout.pageTop, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {why && answer ? (
          <ReasoningView answer={answer} conceptName={conceptName} initialAllSources={why.allSources} />
        ) : (
        <>
        <Gutter>
          {!answer && !asking ? (
            <T variant="support" style={{ marginBottom: space.m }}>
              Answers grounded in your sources and in what you already understand.
            </T>
          ) : null}
          <SegmentedTabs tabs={MODES} value={mode} onChange={changeMode} />
        </Gutter>

        {asking ? (
          <Gutter style={{ marginTop: space.xl }}>
            {pending ? <QuestionBubble text={pending} /> : null}
            <LoadingState message={MODES.find((m) => m.key === mode)!.loading} />
          </Gutter>
        ) : answer ? (
          <AnswerView
            answer={answer}
            onWhy={(allSources) => {
              setWhy({ allSources });
              scrollRef.current?.scrollTo({ y: 0, animated: false });
            }}
            onAskElse={() => setAnswer(null)}
          />
        ) : (
          <Gutter style={{ marginTop: space.xl }}>
            {failed ? (
              <RaisedCard style={{ marginBottom: space.s }}>
                <SignalPill label="No answer yet" muted />
                <T variant="body" style={{ marginTop: space.m }}>
                  Couldn&apos;t get an answer just now.
                </T>
                <Pressable onPress={() => ask(failed)} accessibilityRole="button" style={styles.inlineLink}>
                  <T variant="meta" style={{ color: color.ink }}>
                    Try again
                  </T>
                </Pressable>
              </RaisedCard>
            ) : null}
            <SectionHeader title="Based on your knowledge" style={{ marginTop: failed ? space.xl : space.s }} />
            <ListCard>
              {SUGGESTED.map((s, i) => (
                <InsightRow key={s} title={s} last={i === SUGGESTED.length - 1} onPress={() => ask(s)} />
              ))}
            </ListCard>
          </Gutter>
        )}
        </>
        )}
      </ScrollView>

      {why && answer ? null : (
      <View style={styles.composer}>
        <View style={styles.inputWrap}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={answer ? "Ask a follow-up…" : "Ask about anything you follow"}
            placeholderTextColor={color.ink3}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={() => ask(input)}
            editable={!asking}
            accessibilityLabel="Question"
          />
          <Pressable
            onPress={() => ask(input)}
            disabled={!input.trim() || asking}
            accessibilityRole="button"
            accessibilityLabel="Send"
            hitSlop={6}
            style={[styles.send, (!input.trim() || asking) && { opacity: 0.3 }]}
          >
            <Icon name="send" size={16} color={color.onInk} />
          </Pressable>
        </View>
      </View>
      )}
    </KeyboardAvoidingView>
  );
}

function QuestionBubble({ text }: { text: string }) {
  return (
    <View style={styles.bubble} accessibilityLabel={`You asked: ${text}`}>
      <T variant="body" style={{ color: color.ink }}>
        {text}
      </T>
    </View>
  );
}

/** Storyboard 04: the answer first; the reasoning is one tap away (its own view, storyboard 05). */
function AnswerView({ answer, onWhy, onAskElse }: { answer: Answer; onWhy: (allSources: boolean) => void; onAskElse: () => void }) {
  const quick = answer.mode === "quick" || !answer.mode;
  const s = answer.sections;
  const modeLabel = MODES.find((m) => m.key === (answer.mode ?? "quick"))!.label;
  const short = s ? (s.thinkethInfers.length ? s.thinkethInfers.join(" ") : (s.sourcesSay[0] ?? s.stillUncertain[0] ?? "")) : answer.answer;
  const keyPoints = s && quick ? s.sourcesSay : [];
  const n = answer.citations.length;

  return (
    <View style={{ marginTop: space.xl }}>
      <Gutter>
        <QuestionBubble text={answer.question} />

        <RaisedCard style={{ marginTop: space.l }}>
          <SignalPill label={modeLabel} />
          {s && !quick ? (
            <View style={{ marginTop: space.m, gap: space.l }}>
              <AnswerBlock label="What the sources say" lines={s.sourcesSay} />
              <AnswerBlock label="What Thinketh infers" lines={s.thinkethInfers} />
              <AnswerBlock label="What you already understand" lines={s.youAlreadyUnderstand} />
              <AnswerBlock label="Still uncertain" lines={s.stillUncertain} muted />
            </View>
          ) : (
            <T variant="body" style={styles.answerText}>
              {short}
            </T>
          )}

          {n ? (
            <Pressable onPress={() => onWhy(true)} accessibilityRole="button" accessibilityLabel={`${n} ${n === 1 ? "source" : "sources"}. Show sources`} style={({ pressed }) => [styles.sourcesRow, pressed && { opacity: 0.6 }]}>
              <T variant="meta" style={[{ color: color.ink }, styles.tabular]}>
                {n} {n === 1 ? "source" : "sources"}
              </T>
              <View style={styles.badges}>
                {answer.citations.slice(0, 3).map((c, i) => (
                  <View key={c.sourceId} style={styles.badge}>
                    <T style={styles.badgeText}>{String.fromCharCode(65 + i)}</T>
                  </View>
                ))}
                {n > 3 ? <T style={[styles.badgeMore, styles.tabular]}>+{n - 3}</T> : null}
              </View>
              <View style={{ flex: 1 }} />
              <Icon name="chevron" size={14} color={color.ink3} />
            </Pressable>
          ) : null}

          {keyPoints.length ? (
            <View style={{ marginTop: space.l }}>
              <T style={styles.keyTitle}>Key points</T>
              {keyPoints.map((l) => (
                <View key={l} style={styles.point}>
                  <View style={styles.coralDot} />
                  <T variant="support" style={{ flex: 1, color: color.ink }}>
                    {l}
                  </T>
                </View>
              ))}
            </View>
          ) : null}
        </RaisedCard>

        <Pressable onPress={() => onWhy(false)} accessibilityRole="button" style={({ pressed }) => [styles.whyRow, pressed && { backgroundColor: color.surfaceMuted }]}>
          <View style={{ flex: 1 }}>
            <T style={styles.keyTitle}>Why this answer?</T>
            <T variant="meta" style={{ color: color.ink3, marginTop: 2 }}>
              How Thinketh got here: your question, the sources, your Mind, the synthesis.
            </T>
          </View>
          <Icon name="chevron" size={14} color={color.ink3} />
        </Pressable>

        <Pressable onPress={onAskElse} accessibilityRole="button" style={[styles.inlineLink, { marginTop: space.s }]}>
          <T variant="meta" style={{ color: color.ink2 }}>
            Ask something else
          </T>
        </Pressable>
      </Gutter>
    </View>
  );
}

/** Storyboard 05: how Thinketh arrived at the answer, as four inspectable steps. */
function ReasoningView({ answer, conceptName, initialAllSources }: { answer: Answer; conceptName: (id: string) => string | undefined; initialAllSources: boolean }) {
  const quick = answer.mode === "quick" || !answer.mode;
  const s = answer.sections;
  const n = answer.citations.length;
  const [allSources, setAllSources] = useState(initialAllSources);
  const shownSources = allSources ? answer.citations : answer.citations.slice(0, 3);
  const conceptIds = answer.relatedConceptIds;
  const thumbFor = (i: number) => imageFor(conceptIds.length ? [conceptIds[i % conceptIds.length]] : []);

  // Synthesis: key points, agreement, what's new for you, and what's still open.
  const synth: { label: string; lines: string[]; muted?: boolean }[] = s
    ? [
        ...(quick ? [] : [{ label: "What Thinketh infers", lines: s.thinkethInfers }]),
        { label: "What you already understand", lines: s.youAlreadyUnderstand },
        { label: "Still uncertain", lines: s.stillUncertain, muted: true },
      ].filter((b) => b.lines.length)
    : [];

  const steps: { title: string; body: ReactNode }[] = [];
  steps.push({
    title: "Understand your question",
    body: answer.memoryUsed.length ? (
      <View style={styles.memory}>
        <T variant="label" style={{ marginBottom: space.s }}>
          What Thinketh remembered about you
        </T>
        {answer.memoryUsed.map((m) => (
          <View key={m.id} style={styles.point}>
            <View style={styles.inkDot} />
            <T variant="support" style={{ flex: 1, color: color.ink }}>
              {m.content}
            </T>
          </View>
        ))}
      </View>
    ) : (
      <T variant="support">Interpreted as: {answer.question}</T>
    ),
  });
  if (n) {
    steps.push({
      title: "Find relevant information",
      body: (
        <View>
          <T variant="support" style={styles.tabular}>
            Searched across {n} {n === 1 ? "source" : "sources"}.
          </T>
          <View style={{ marginTop: space.xs }}>
            {shownSources.map((c, i) => (
              <SourceCard key={c.sourceId} title={c.title} thumb={thumbFor(i)} />
            ))}
          </View>
          {n > 3 ? (
            <Pressable onPress={() => setAllSources((a) => !a)} accessibilityRole="button" accessibilityState={{ expanded: allSources }} style={[styles.inlineLink, styles.disclosure]}>
              <T variant="meta" style={[{ color: color.ink2 }, styles.tabular]}>
                {allSources ? "Show fewer sources" : `+${n - 3} more sources`}
              </T>
              <Chevron open={allSources} />
            </Pressable>
          ) : null}
        </View>
      ),
    });
  }
  if (conceptIds.length) {
    steps.push({
      title: "Compare to your Mind",
      body: (
        <View>
          <T variant="support">Connected to your existing thinking:</T>
          <View style={styles.chips}>
            {conceptIds.map((id) => (
              <ConceptChip key={id} label={conceptName(id) ?? id} onPress={() => router.push({ pathname: "/mind", params: { concept: id } })} />
            ))}
          </View>
        </View>
      ),
    });
  }
  if (synth.length) {
    steps.push({
      title: "Synthesize",
      body: (
        <View style={{ gap: space.m }}>
          {synth.map((b) => (
            <View key={b.label} style={styles.synth}>
              <T variant="label" style={{ marginBottom: space.xs }}>
                {b.label}
              </T>
              {b.lines.map((l) => (
                <T key={l} variant="support" style={[{ color: b.muted ? color.ink2 : color.ink, marginBottom: 2 }]}>
                  {l}
                </T>
              ))}
            </View>
          ))}
        </View>
      ),
    });
  }

  return (
    <View style={{ paddingTop: space.m }}>
      <Gutter>
        <T variant="meta" style={{ color: color.ink3 }}>
          For your question
        </T>
        <T variant="body" style={{ marginTop: 2, fontFamily: font.sansMedium }}>
          {answer.question}
        </T>
      </Gutter>
      <View style={styles.reasoning}>
        {steps.map((st, i) => (
          <ReasoningStep key={st.title} n={i + 1} title={st.title} last={i === steps.length - 1}>
            {st.body}
          </ReasoningStep>
        ))}
      </View>
    </View>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <View style={{ transform: [{ rotate: open ? "-90deg" : "90deg" }] }}>
      <Icon name="chevron" size={12} color={color.ink2} />
    </View>
  );
}

function AnswerBlock({ label, lines, muted }: { label: string; lines: string[]; muted?: boolean }) {
  if (!lines.length) return null;
  return (
    <View>
      <T variant="label" style={{ marginBottom: space.xs }}>
        {label}
      </T>
      {lines.map((l) => (
        <View key={l} style={styles.point}>
          <View style={muted ? styles.mutedDot : styles.inkDot} />
          <T variant="body" style={{ flex: 1, color: muted ? color.ink2 : color.ink }}>
            {l}
          </T>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  whyRow: { flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.m, padding: space.m, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, backgroundColor: color.canvas },
  tabular: { fontVariant: ["tabular-nums"] },
  bubble: {
    alignSelf: "flex-end",
    maxWidth: "86%",
    backgroundColor: color.surfaceMuted,
    borderRadius: 18,
    borderBottomRightRadius: 6,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
  },
  answerText: { marginTop: space.m, fontSize: 16.5, lineHeight: 25, letterSpacing: -0.1 },
  sourcesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 48,
    marginTop: space.l,
    paddingHorizontal: space.m,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  badges: { flexDirection: "row", alignItems: "center", gap: 4 },
  badge: { width: 20, height: 20, borderRadius: 10, backgroundColor: color.surfaceMuted, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 12, color: color.ink2 },
  badgeMore: { fontFamily: font.sansMedium, fontSize: 11, lineHeight: 14, color: color.ink3, marginLeft: 2 },
  keyTitle: { fontFamily: font.sansSemibold, fontSize: 14, lineHeight: 19, color: color.ink, marginBottom: space.s },
  point: { flexDirection: "row", alignItems: "flex-start", gap: space.s, marginBottom: space.s },
  coralDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.coral, marginTop: 7 },
  inkDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: color.ink, marginTop: 8 },
  mutedDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: color.ink3, marginTop: 8 },
  memory: { padding: space.m, backgroundColor: color.surfaceMuted, borderRadius: radius.surface },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s, marginTop: space.s },
  synth: { paddingLeft: space.m, borderLeftWidth: 1.5, borderLeftColor: color.hairline },
  reasoning: { marginTop: space.xl, paddingHorizontal: layout.pageX },
  inlineLink: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  disclosure: { flexDirection: "row", alignItems: "center", gap: 6 },
  composer: { paddingHorizontal: layout.pageX, paddingTop: space.s, paddingBottom: space.s, backgroundColor: color.canvas },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    paddingLeft: space.l,
    paddingRight: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    backgroundColor: color.canvas,
    shadowColor: color.ink,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  input: { flex: 1, minHeight: 44, fontFamily: font.sans, fontSize: 15, color: color.ink },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
});
