import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AskResponse } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Divider, Gutter, LoadingState, Row, SectionLabel } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { color, font, radius, space } from "@/theme/tokens";

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

export default function Ask() {
  const { q, dev, mode: modeParam } = useLocalSearchParams<{ q?: string; dev?: string; mode?: AskMode }>();
  const [mode, setMode] = useState<AskMode>("quick");
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<(AskResponse & { question: string; developmentId?: string; mode?: AskMode }) | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Names for related concepts.
  const lookup = useApi(async () => (await api.getKnowledge()).items.map((i) => i.concept), []);

  const ask = async (question: string, developmentId?: string, asMode: AskMode = mode) => {
    const text = question.trim();
    if (!text || asking) return;
    setInput("");
    setAsking(true);
    setFailed(null);
    setAnswer(null);
    try {
      setAnswer({ ...(await api.ask({ question: text, ...(developmentId ? { developmentId } : {}), mode: asMode })), question: text, developmentId, mode: asMode });
    } catch {
      setFailed(text);
    } finally {
      setAsking(false);
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.ground }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Gutter>
          <T variant="display" accessibilityRole="header">
            Ask Thinketh
          </T>
          <T variant="support" style={{ marginTop: space.s }}>
            Answers grounded in your sources and in what you already understand.
          </T>
          <View style={styles.modes} accessibilityRole="radiogroup">
            {MODES.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => {
                  if (m.key === mode) return;
                  setMode(m.key);
                  if (answer && !asking) ask(answer.question, answer.developmentId, m.key);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: mode === m.key }}
                hitSlop={8}
                style={[styles.mode, mode === m.key && styles.modeOn]}
              >
                <T variant="meta" style={{ color: mode === m.key ? color.ink : color.ink3 }}>
                  {m.label}
                </T>
              </Pressable>
            ))}
          </View>
        </Gutter>

        {asking ? (
          <LoadingState message={MODES.find((m) => m.key === mode)!.loading} />
        ) : answer ? (
          <View style={{ marginTop: space.xxl }}>
            <Gutter>
              <T variant="section">{answer.question}</T>
            </Gutter>
            {answer.sections && answer.mode === "quick" ? (
              <QuickAnswer sections={answer.sections} />
            ) : answer.sections ? (
              <>
                <AnswerBlock label="What the sources say" lines={answer.sections.sourcesSay} rule={color.ink} />
                <AnswerBlock label="What Thinketh infers" lines={answer.sections.thinkethInfers} rule={color.ink3} />
                <AnswerBlock label="What you already understand" lines={answer.sections.youAlreadyUnderstand} rule={color.edge} />
                <AnswerBlock label="Still uncertain" lines={answer.sections.stillUncertain} rule={color.edge} muted />
              </>
            ) : (
              <Gutter style={{ marginTop: space.xl }}>
                <T variant="body">{answer.answer}</T>
              </Gutter>
            )}

            {answer.memoryUsed.length ? (
              <Gutter style={{ marginTop: space.xxl }}>
                <View style={styles.memory}>
                  <T variant="label" style={{ marginBottom: space.s }}>
                    What Thinketh remembered about you
                  </T>
                  {answer.memoryUsed.map((m) => (
                    <T key={m.id} variant="support" style={{ marginBottom: space.xs }}>
                      {m.content}
                    </T>
                  ))}
                </View>
              </Gutter>
            ) : null}

            {answer.citations.length ? (
              <View style={{ marginTop: space.x3 }}>
                <Gutter>
                  <SectionLabel>Sources</SectionLabel>
                </Gutter>
                <Divider />
                {answer.citations.map((c) => (
                  <Row key={c.sourceId}>
                    <T variant="body">{c.title}</T>
                  </Row>
                ))}
              </View>
            ) : null}

            {answer.relatedConceptIds.length ? (
              <View style={{ marginTop: space.x3 }}>
                <Gutter>
                  <SectionLabel>In your Mind</SectionLabel>
                </Gutter>
                <Divider />
                {answer.relatedConceptIds.map((id) => (
                  <Row key={id} onPress={() => router.push({ pathname: "/mind", params: { concept: id } })}>
                    <T variant="body">{conceptName(id) ?? id}</T>
                  </Row>
                ))}
              </View>
            ) : null}

            <Gutter style={{ marginTop: space.xl }}>
              <Pressable onPress={() => setAnswer(null)} accessibilityRole="button" style={styles.inlineLink}>
                <T variant="meta" style={{ color: color.ink }}>
                  Ask something else
                </T>
              </Pressable>
            </Gutter>
          </View>
        ) : (
          <View style={{ marginTop: space.xxl }}>
            {failed ? (
              <Gutter style={{ marginBottom: space.xl }}>
                <T variant="support">Couldn&apos;t get an answer just now.</T>
                <Pressable onPress={() => ask(failed)} accessibilityRole="button" style={styles.inlineLink}>
                  <T variant="meta" style={{ color: color.ink }}>
                    Try again
                  </T>
                </Pressable>
              </Gutter>
            ) : null}
            <Gutter>
              <SectionLabel>Based on your knowledge</SectionLabel>
            </Gutter>
            <Divider />
            {SUGGESTED.map((s) => (
              <Row key={s} onPress={() => ask(s)}>
                <T variant="body">{s}</T>
              </Row>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask about anything you follow"
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
          style={[styles.send, (!input.trim() || asking) && { opacity: 0.35 }]}
        >
          <Icon name="send" size={18} color={color.onInk} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Quick answer: the answer first; the trust layers behind "Why this answer?". */
function QuickAnswer({ sections }: { sections: NonNullable<AskResponse["sections"]> }) {
  const [open, setOpen] = useState(false);
  const short = sections.thinkethInfers.length ? sections.thinkethInfers.join(" ") : (sections.sourcesSay[0] ?? sections.stillUncertain[0] ?? "");
  return (
    <>
      <Gutter style={{ marginTop: space.xl }}>
        <T variant="body" style={{ fontSize: 18, lineHeight: 28 }}>
          {short}
        </T>
        <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.inlineLink}>
          <T variant="meta" style={{ color: color.ink }}>
            {open ? "Hide the reasoning" : "Why this answer?"}
          </T>
        </Pressable>
      </Gutter>
      {open ? (
        <>
          <AnswerBlock label="What the sources say" lines={sections.sourcesSay} rule={color.ink} />
          <AnswerBlock label="What you already understand" lines={sections.youAlreadyUnderstand} rule={color.edge} />
          <AnswerBlock label="Still uncertain" lines={sections.stillUncertain} rule={color.edge} muted />
        </>
      ) : null}
    </>
  );
}

function AnswerBlock({ label, lines, rule, muted }: { label: string; lines: string[]; rule: string; muted?: boolean }) {
  if (!lines.length) return null;
  return (
    <Gutter style={{ marginTop: space.xl }}>
      <View style={{ borderLeftWidth: 2, borderLeftColor: rule, paddingLeft: space.l }}>
        <T variant="label" style={{ marginBottom: space.s }}>
          {label}
        </T>
        {lines.map((l) => (
          <T key={l} variant="body" style={[{ marginBottom: space.s }, muted && { color: color.ink2 }]}>
            {l}
          </T>
        ))}
      </View>
    </Gutter>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: "row", gap: space.l, marginTop: space.l },
  mode: { minHeight: 32, justifyContent: "center", borderBottomWidth: 1.5, borderBottomColor: "transparent" },
  modeOn: { borderBottomColor: color.ink },
  memory: { padding: space.l, backgroundColor: color.fog, borderRadius: radius.surface },
  inlineLink: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.edge,
    backgroundColor: color.ground,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.edge,
    backgroundColor: color.panel,
    paddingHorizontal: space.l,
    fontFamily: font.sans,
    fontSize: 16,
    color: color.ink,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
});
