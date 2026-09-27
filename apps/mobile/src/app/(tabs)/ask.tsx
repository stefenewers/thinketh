import { useEffect, useRef, useState, type ReactNode } from "react";
import { AgentComposerButton } from "@/agent/AgentDock";
import { useAgentControls } from "@/agent/agentContext";
import { useAgentScreen } from "@/agent/screenContext";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AskResponse } from "@thinketh/contracts";
import { api } from "@/api";
import { rejectedInputReason } from "@/api/http";
import { Icon } from "@/components/Icon";
import { AppTopBar, Avatar, ConceptChip, IconButton, RaisedCard, ReasoningStep, SignalPill, SourceCard } from "@/components/system";
import { T } from "@/components/Text";
import { Gutter, LoadingState } from "@/components/ui";
import { useApi, useKeyboardVisible } from "@/lib/hooks";
import { useTabBarInset } from "@/lib/tabBarInset";
import { AskScene } from "@/components/ask/AskScene";
import { TopicArt, type TopicArtKind } from "@/components/TopicArt";
import { DEMO_LEARNER_NAME } from "@/content/demo";
import { useProfile } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { color, depth, font, layout, lift, radius, space } from "@/theme/tokens";

// The same three questions, each with what it gets you and a pixel object from the topic art set.
const SUGGESTED: { q: string; hint: string; art: TopicArtKind }[] = [
  { q: "What changed in agent memory this week?", hint: "See what's new and why it matters.", art: "checklist" },
  { q: "What am I weakest on?", hint: "Find gaps in your understanding.", art: "drawer" },
  { q: "Explain MCP based on what I already know.", hint: "A personalized explanation from your Mind.", art: "connector" },
];

type AskMode = "quick" | "teach" | "deep";
// `hint` restates what each mode asks the model for (the answer shapes in the Ask prompt).
const MODES: { key: AskMode; label: string; hint: string; loading: string }[] = [
  { key: "quick", label: "Quick answer", hint: "A direct answer in a sentence or two.", loading: "Grounding this in your sources…" },
  { key: "teach", label: "Teach me", hint: "Starts from what you already understand.", loading: "Finding what's new for you…" },
  { key: "deep", label: "Go deep", hint: "Mechanisms, caveats and what's still uncertain.", loading: "Comparing sources and what's still uncertain…" },
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
  // The server's reason when it declined the question itself (e.g. too long); retrying won't help.
  const [rejected, setRejected] = useState<string | null>(null);
  // Storyboard 05: "Why this answer?" is its own view (not a route); null = the answer view.
  const [why, setWhy] = useState<null | { allSources: boolean }>(null);
  const [modeMenu, setModeMenu] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const tabBar = useTabBarInset();
  const keyboardUp = useKeyboardVisible();
  const session = useSession();
  const profile = useProfile();
  const name = session.mode === "personal" ? (profile?.displayName ?? "You") : DEMO_LEARNER_NAME;
  const voice = useAgentControls();
  // Names for related concepts.
  const lookup = useApi(async () => (await api.getKnowledge()).items.map((i) => i.concept), []);

  const ask = async (question: string, developmentId?: string, asMode: AskMode = mode, { keepInput = false } = {}) => {
    const text = question.trim();
    if (!text || asking) return;
    if (!keepInput) setInput("");
    setAsking(true);
    setPending(text);
    setFailed(null);
    setRejected(null);
    setAnswer(null);
    setWhy(null);
    try {
      setAnswer({ ...(await api.ask({ question: text, ...(developmentId ? { developmentId } : {}), mode: asMode })), question: text, developmentId, mode: asMode });
    } catch (e) {
      setFailed(text);
      setRejected(rejectedInputReason(e) ?? null);
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
      router.replace("/ask");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const conceptName = (id: string) => lookup.data?.find((c) => c.id === id)?.name;

  // For the voice agent: the question and answer on screen. Ask hosts its own voice entry.
  useAgentScreen(
    {
      screen: "ask",
      route: "/ask",
      title: "Ask",
      ...(answer?.developmentId ? { focus: { kind: "development" as const, id: answer.developmentId, label: answer.question } } : {}),
      ...(answer ? { visible: [`Question: ${answer.question.slice(0, 200)}`, `Answer: ${answer.answer.slice(0, 220)}`] } : {}),
    },
    "inline",
  );

  const changeMode = (k: AskMode) => {
    setModeMenu(false);
    if (k === mode) return;
    setMode(k);
    // As before: an answer on screen is re-asked in the new mode. Whatever is being typed stays.
    if (answer && !asking) ask(answer.question, answer.developmentId, k, { keepInput: true });
  };
  const current = MODES.find((m) => m.key === mode)!;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {why && answer ? (
        <AppTopBar title="Why this answer?" onBack={() => setWhy(null)} />
      ) : (
        answer && !asking ? (
          <AppTopBar right={<IconButton icon="plus" accessibilityLabel="Ask something new" onPress={() => setAnswer(null)} />} />
        ) : (
          // No page title: the scene says what Ask is. Search goes to the composer; the avatar to your profile.
          <Gutter style={[styles.restBar, { paddingTop: insets.top + space.s }]}>
            <Pressable onPress={() => inputRef.current?.focus()} accessibilityRole="button" accessibilityLabel="Search and ask" style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
              <Icon name="search" size={19} color={color.ink} />
            </Pressable>
            <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Your learning profile" style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
              <Avatar name={name} size={44} />
            </Pressable>
          </Gutter>
        )
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
        {!answer && !asking ? <AskScene line="Ask anything, and I'll use your sources and what you already understand." /> : null}

        {asking ? (
          <Gutter style={{ marginTop: space.xl }}>
            {pending ? <QuestionBubble text={pending} /> : null}
            <LoadingState message={current.loading} />
          </Gutter>
        ) : answer ? (
          <AnswerView
            conceptName={conceptName}
            answer={answer}
            onWhy={(allSources) => {
              setWhy({ allSources });
              scrollRef.current?.scrollTo({ y: 0, animated: false });
            }}
            onAskElse={() => setAnswer(null)}
          />
        ) : (
          <Gutter style={{ marginTop: space.l }}>
            {failed ? (
              <RaisedCard style={{ marginBottom: space.s }}>
                <SignalPill label="No answer yet" muted />
                <T variant="body" style={{ marginTop: space.m }}>
                  {rejected ? `Thinketh couldn't take that question: ${rejected}.` : "Couldn't get an answer just now."}
                </T>
                {rejected ? null : (
                  <Pressable onPress={() => ask(failed)} accessibilityRole="button" style={styles.inlineLink}>
                    <T variant="meta" style={{ color: color.ink }}>
                      Try again
                    </T>
                  </Pressable>
                )}
              </RaisedCard>
            ) : null}
            <T style={styles.promptsHeading} accessibilityRole="header">
              Based on your knowledge
            </T>
            <View style={{ gap: 14 }}>
              {SUGGESTED.map((s) => (
                <Pressable
                  key={s.q}
                  onPress={() => ask(s.q)}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.q} ${s.hint}`}
                  style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}
                >
                  <TopicArt kind={s.art} unit={2} style={styles.promptArt} />
                  <View style={{ flex: 1 }}>
                    <T style={styles.promptTitle}>{s.q}</T>
                    <T style={styles.promptHint}>{s.hint}</T>
                  </View>
                  <Icon name="chevron" size={14} color={color.ink3} />
                </Pressable>
              ))}
            </View>
          </Gutter>
        )}
        </>
        )}
      </ScrollView>

      {why && answer ? null : (
      <View style={styles.composer}>
        {modeMenu ? <ModeMenu value={mode} onChange={changeMode} /> : null}
        <View style={styles.inputWrap}>
          {/* The response mode, like a model picker: part of the composer, not a row of tabs. */}
          <Pressable
            onPress={() => setModeMenu((o) => !o)}
            accessibilityRole="button"
            accessibilityLabel={`Response mode: ${current.label}`}
            accessibilityHint="Choose how Thinketh answers"
            accessibilityState={{ expanded: modeMenu }}
            hitSlop={4}
            style={({ pressed }) => [styles.modeButton, pressed && { opacity: 0.7 }]}
          >
            <T style={styles.modeLabel} numberOfLines={1}>
              {current.label}
            </T>
            <View style={[styles.chevron, modeMenu && styles.chevronOpen]}>
              <Icon name="chevron" size={12} color={color.ink2} />
            </View>
          </Pressable>
          <View style={styles.divider} />
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder={answer ? "Ask a follow-up…" : "Ask anything"}
            placeholderTextColor={color.ink3}
            style={styles.input}
            returnKeyType="send"
            maxLength={500}
            onSubmitEditing={() => ask(input)}
            editable={!asking}
            accessibilityLabel="Question"
          />
          {/* Empty composer: talk instead (the same agent, with this answer as context). */}
          {!input.trim() && voice.supported ? (
            <AgentComposerButton />
          ) : (
            <Pressable
              onPress={() => ask(input)}
              disabled={!input.trim() || asking}
              accessibilityRole="button"
              accessibilityLabel="Send"
              hitSlop={6}
              style={[styles.send, (!input.trim() || asking) && { opacity: 0.3 }]}
            >
              <View style={{ transform: [{ rotate: "-90deg" }] }}>
                <Icon name="send" size={16} color={color.onInk} />
              </View>
            </Pressable>
          )}
        </View>
      </View>
      )}
      {/* Tapping anywhere else closes the mode menu (the keyboard stays where it was). */}
      {modeMenu ? <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={() => setModeMenu(false)} accessibilityLabel="Close response modes" /> : null}
      {/* Room for the floating tab bar under the composer; the bar steps aside while typing. */}
      <View style={{ height: keyboardUp ? 0 : tabBar }} />
    </KeyboardAvoidingView>
  );
}

/** The three response modes, anchored above the selector; the current one is checked. */
function ModeMenu({ value, onChange }: { value: AskMode; onChange: (k: AskMode) => void }) {
  return (
    <View style={styles.menu} accessibilityRole="menu">
      {MODES.map((m, i) => {
        const on = m.key === value;
        return (
          <Pressable
            key={m.key}
            onPress={() => onChange(m.key)}
            accessibilityRole="menuitem"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${m.label}. ${m.hint}`}
            style={({ pressed }) => [styles.menuItem, i > 0 && styles.menuDivided, pressed && { backgroundColor: color.surfaceMuted }]}
          >
            <View style={{ flex: 1 }}>
              <T style={[styles.menuLabel, on && { fontFamily: font.sansSemibold }]}>{m.label}</T>
              <T style={styles.menuHint}>{m.hint}</T>
            </View>
            {on ? <Icon name="check" size={16} color={color.ink} /> : null}
          </Pressable>
        );
      })}
    </View>
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
function AnswerView({ answer, conceptName, onWhy, onAskElse }: { answer: Answer; conceptName: (id: string) => string | undefined; onWhy: (allSources: boolean) => void; onAskElse: () => void }) {
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

          {/* The concepts Thinketh used for this answer, each one tap from its book in your Mind. */}
          {answer.relatedConceptIds.length ? (
            <View style={{ marginTop: space.l }}>
              <T style={styles.keyTitle}>In your Mind</T>
              <T variant="meta" style={{ color: color.ink3, marginTop: 2 }}>
                Thinketh used these concepts for this answer. Asking doesn&apos;t change them; a check does.
              </T>
              <View style={styles.chips}>
                {answer.relatedConceptIds.map((id) => (
                  <ConceptChip key={id} label={conceptName(id) ?? id} book onPress={() => router.push({ pathname: "/mind", params: { concept: id, from: "ask" } })} />
                ))}
              </View>
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
            {shownSources.map((c) => (
              <SourceCard key={c.sourceId} title={c.title} />
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
              <ConceptChip key={id} label={conceptName(id) ?? id} book onPress={() => router.push({ pathname: "/mind", params: { concept: id, from: "ask" } })} />
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
  // Ask's rest state (matches Today's round controls and the Learn card system).
  roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(22,22,22,0.05)", ...depth.control },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceMuted, ...depth.control },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  restBar: { flexDirection: "row", justifyContent: "flex-end", gap: space.s },
  promptsHeading: { fontFamily: font.sansSemibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: color.ink, marginTop: space.s, marginBottom: 14 },
  prompt: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14, paddingLeft: 14, paddingRight: 16, borderRadius: 20, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(22,22,22,0.06)" },
  promptArt: { width: 58, height: 58, borderRadius: 14, backgroundColor: color.surfaceMuted },
  promptTitle: { fontFamily: font.sansSemibold, fontSize: 16, lineHeight: 21, letterSpacing: -0.25, color: color.ink },
  promptHint: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: color.ink2, marginTop: 3 },
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
  composer: { paddingHorizontal: layout.pageX, paddingTop: space.s, paddingBottom: space.s, backgroundColor: color.canvas, zIndex: 2 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    paddingLeft: 5,
    paddingRight: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    backgroundColor: color.canvas,
    ...lift(color.ink, 0.05, 12, 2, 1),
  },
  // minWidth 0: the field gives way to the selector and send button instead of pushing them out.
  input: { flex: 1, minWidth: 0, minHeight: 44, fontFamily: font.sans, fontSize: 15, color: color.ink },
  // Quiet and compact: a neutral chip inside the field. Capped so "Quick answer" never crowds the input.
  modeButton: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 128, height: 36, paddingLeft: 12, paddingRight: 9, borderRadius: radius.pill, backgroundColor: color.surfaceMuted },
  modeLabel: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: 13.5, lineHeight: 18, color: color.ink },
  chevron: { transform: [{ rotate: "90deg" }] },
  chevronOpen: { transform: [{ rotate: "-90deg" }] },
  divider: { width: StyleSheet.hairlineWidth, height: 22, marginHorizontal: space.s, backgroundColor: color.edge },
  menu: {
    position: "absolute",
    left: layout.pageX,
    bottom: "100%",
    width: 304,
    maxWidth: "92%",
    marginBottom: -2,
    borderRadius: 16,
    backgroundColor: color.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    overflow: "hidden",
    zIndex: 3,
    ...lift(color.ink, 0.1, 24, 6, 8),
  },
  menuItem: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 56, paddingHorizontal: space.l, paddingVertical: 10 },
  menuDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  menuLabel: { fontFamily: font.sansMedium, fontSize: 15, lineHeight: 20, color: color.ink },
  menuHint: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 17, color: color.ink3, marginTop: 1 },
  scrim: { zIndex: 1 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
});
