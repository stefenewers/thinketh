import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type AskResponse } from "@/api";
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

export default function Ask() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Titles for cited developments and concepts.
  const lookup = useApi(async () => {
    const [today, knowledge] = await Promise.all([api.getTodayBrief(), api.getKnowledge()]);
    return { developments: today.developments, concepts: knowledge.concepts };
  }, []);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || asking) return;
    setInput("");
    setAsking(true);
    setFailed(null);
    setAnswer(null);
    try {
      setAnswer(await api.ask({ question: text }));
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- responding to a navigation param, once
      ask(q);
      router.setParams({ q: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const devTitle = (id: string) => lookup.data?.developments.find((d) => d.id === id)?.title;
  const conceptName = (id: string) => lookup.data?.concepts.find((c) => c.id === id)?.name;

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
        </Gutter>

        {asking ? (
          <LoadingState message="Checking your sources and your knowledge state…" />
        ) : answer ? (
          <View style={{ marginTop: space.xxl }}>
            <Gutter>
              <T variant="section">{answer.question}</T>
            </Gutter>
            <AnswerBlock label="What the sources say" lines={answer.sourcesSay} rule={color.ink} />
            <AnswerBlock label="What Thinketh infers" lines={answer.thinkethInfers} rule={color.ink3} />
            <AnswerBlock label="What you already understand" lines={answer.youAlreadyUnderstand} rule={color.edge} />
            <AnswerBlock label="Still uncertain" lines={answer.stillUncertain} rule={color.edge} muted />

            {answer.citedDevelopmentIds.length || answer.citedConceptIds.length ? (
              <View style={{ marginTop: space.x3 }}>
                <Gutter>
                  <SectionLabel>Supported by</SectionLabel>
                </Gutter>
                <Divider />
                {answer.citedDevelopmentIds.map((id) => (
                  <Row key={id} onPress={() => router.push({ pathname: "/development/[id]", params: { id } })}>
                    <T variant="meta">Development</T>
                    <T variant="body" style={{ marginTop: 2 }}>
                      {devTitle(id) ?? id}
                    </T>
                  </Row>
                ))}
                {answer.citedConceptIds.map((id) => (
                  <Row key={id} onPress={() => router.push({ pathname: "/mind", params: { concept: id } })}>
                    <T variant="meta">Concept in your Mind</T>
                    <T variant="body" style={{ marginTop: 2 }}>
                      {conceptName(id) ?? id}
                    </T>
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
