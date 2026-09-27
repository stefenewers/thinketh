import { useCallback, useState } from "react";
import { useAgentScreen } from "@/agent/screenContext";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { goBack } from "@/lib/nav";
import type { Development, DevelopmentDetailResponse, FeedbackKind, Source } from "@thinketh/contracts";
import { api } from "@/api";
import { BriefRow, BriefSection, DotLine } from "@/components/brief/Brief";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Button, ErrorState, Gutter, LoadingState, Screen } from "@/components/ui";
import { AppTopBar, ConceptChip, ListCard, SectionHeader, SignalPill } from "@/components/system";
import { storylineFor } from "@/content/demo";
import { useApi } from "@/lib/hooks";
import { shortDate, significanceLabel } from "@/lib/knowledge";
import { firstSentence, nuanceOf } from "@/lib/briefText";
import { lastCheckFor } from "@/lib/lastCheck";
import { openExternal } from "@/lib/links";
import { color, depth, font, space, warm } from "@/theme/tokens";

export default function DevelopmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi(() => api.getDevelopment(id), [id]);
  useAgentScreen({
    screen: "development",
    route: "/development",
    title: data?.development.title ?? "Development",
    focus: { kind: "development", id, label: data?.development.title ?? id },
    ...(data ? { visible: [...data.delta.whatChanged.slice(0, 2).map((w) => `What changed: ${w}`), `Sources: ${data.sources.length}`] } : {}),
  });

  return (
    <View style={{ flex: 1, backgroundColor: warm.ground }}>
      <AppTopBar title="Development" onBack={() => goBack()} />
      {loading && !data ? (
        <LoadingState message="Comparing this with what you already know…" />
      ) : error || !data ? (
        <ErrorState onRetry={reload} />
      ) : (
        <DevelopmentContent data={data} />
      )}
    </View>
  );
}

function DevelopmentContent({ data }: { data: DevelopmentDetailResponse }) {
  const { development: d, delta, sources, concepts } = data;
  const [briefOpen, setBriefOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: FeedbackKind; reason: string; ok: boolean } | null>(null);
  const [sending, setSending] = useState<FeedbackKind | null>(null);
  // The check you just completed, as the API returned it (re-read whenever you come back here).
  const [check, setCheck] = useState(() => lastCheckFor(d.id));
  useFocusEffect(useCallback(() => setCheck(lastCheckFor(d.id)), [d.id]));
  const primaryConceptId = delta.affectedConcepts[0]?.conceptId ?? d.conceptIds[0];
  const primaryConcept = concepts.find((c) => c.id === primaryConceptId);
  const conceptName = (cid: string) => concepts.find((c) => c.id === cid)?.name ?? cid;
  const significance = significanceLabel(d);
  // "No new information = no card": if nothing changes what you know, say so instead of pushing a lesson.
  const nothingNew = delta.whatChanged.length === 0;
  // The caveat that keeps the short version accurate: only a line the data explicitly marks as one
  // ("Nuance: …", "Caveat: …"), never a generic warning.
  const catchLine = nuanceOf(delta.whatChanged.slice(1));
  const publishers = [...new Set(sources.map((x) => x.publisher).filter((x): x is string => !!x))];

  const send = async (kind: FeedbackKind) => {
    setSending(kind);
    try {
      const res = await api.sendFeedback(d.id, kind);
      // No transition: this signal was already counted for this development.
      setFeedback({ kind, ok: true, reason: res.transitions[0]?.reason ?? "Already recorded. Thinketh counts this once per development." });
    } catch {
      setFeedback({ kind, ok: false, reason: "Couldn't record that right now. Try again in a moment." });
    } finally {
      setSending(null);
    }
  };

  const ways = [
    { key: "visualize", title: "Visualize this", subtitle: "See the old and new model side by side.", onPress: () => router.push({ pathname: "/visualize/[id]", params: { id: d.id } }) },
    {
      key: "stick",
      title: "Make it stick",
      subtitle: "An analogy, a hook, and a three-step model.",
      onPress: () => router.push({ pathname: "/make-it-stick/[id]", params: { id: d.id, conceptId: primaryConceptId } }),
    },
    {
      key: "deeper",
      title: "Explain deeper",
      subtitle: "Ask Thinketh, grounded in what you know.",
      onPress: () =>
        router.push({
          pathname: "/ask",
          params: {
            q: `Explain what changed in ${(primaryConcept?.name ?? d.title).toLowerCase()}, based on what I already know.`,
            dev: d.id,
            mode: "teach",
          },
        }),
    },
    ...(storylineFor(d.storylineIds[0])
      ? [
          {
            key: "storyline",
            title: "See how this idea changed",
            subtitle: "The storyline behind this development, and where you are in it.",
            onPress: () => router.push({ pathname: "/storyline/[id]", params: { id: d.storylineIds[0] } }),
          },
        ]
      : []),
  ];

  const checkUnderstanding = () => router.push({ pathname: "/diagnostic", params: { developmentId: d.id, conceptId: primaryConceptId } });

  return (
    <Screen topInset={false} background={warm.ground} contentStyle={{ paddingTop: space.s }}>
      <Gutter>
        {/* 1. What this is, when, and where it comes from. */}
        <SignalPill label={significance} muted={d.significance < 0.75} />
        <T style={styles.title} accessibilityRole="header">
          {d.title}
        </T>
        <T variant="meta" style={{ marginTop: space.s, color: color.ink3 }}>
          {shortDate(d.happenedAt)} · {sources.length} {sources.length === 1 ? "source" : "sources"}
          {publishers.length ? ` · ${publishers.slice(0, 2).join(", ")}${publishers.length > 2 ? ` +${publishers.length - 2}` : ""}` : ""}
        </T>

        {/* 2. The change in a minute: the new idea first, then how it relates to what you knew. */}
        {nothingNew ? (
          <View style={[styles.card, { marginTop: space.xl }]}>
            <T style={styles.kicker}>Nothing new for you</T>
            <T variant="body" style={{ marginTop: space.s }}>
              Thinketh compared this with your Mind and didn&apos;t find anything that changes what you already know.
            </T>
            {delta.alreadyKnew.length ? (
              <View style={{ marginTop: space.m }}>
                {delta.alreadyKnew.map((line) => (
                  <DotLine key={line} tone="muted">
                    {line}
                  </DotLine>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.card, { marginTop: space.xl }]}>
            {/* Compact on purpose: the new idea, one link to what you knew, one line of why. The rest is in the full brief. */}
            <T style={styles.kicker}>The change in a minute</T>
            <T style={styles.lead}>{delta.whatChanged[0]}</T>
            {catchLine ? (
              <T variant="support" style={{ marginTop: space.s, color: color.ink }}>
                <T variant="support" style={{ fontFamily: font.sansSemibold, color: color.ink }}>
                  The catch:{" "}
                </T>
                {catchLine}
              </T>
            ) : null}
            {delta.alreadyKnew[0] ? (
              <T variant="support" style={{ marginTop: space.s }}>
                <T variant="support" style={{ fontFamily: font.sansSemibold, color: color.ink2 }}>
                  Builds on what you knew:{" "}
                </T>
                {delta.alreadyKnew[0]}
              </T>
            ) : null}
            <View style={styles.rule} />
            <T variant="support" style={{ color: color.ink }}>
              <T variant="support" style={{ fontFamily: font.sansSemibold, color: color.ink }}>
                Why it matters to you:{" "}
              </T>
              {firstSentence(delta.whyItMattersToYou)}
            </T>
          </View>
        )}

        {/* 3. One primary action: show you understand it. After a check, the next step is your Mind. */}
        {!nothingNew ? (
          check ? (
            <CheckResult check={check} conceptName={conceptName(check.conceptId)} onAgain={checkUnderstanding} onExplain={ways.find((w) => w.key === "deeper")!.onPress} />
          ) : (
            <View style={{ marginTop: space.xl }}>
              <Button label="Check my understanding" icon="arrow" onPress={checkUnderstanding} accessibilityHint="One question about this development" />
              <T variant="support" style={{ marginTop: space.s, textAlign: "center" }}>
                One question. It tests the idea, not the wording.
              </T>
            </View>
          )
        ) : null}

        {/* 4. Other ways to understand it. */}
        {!nothingNew ? (
          <>
            <SectionHeader title="Other ways in" />
            <ListCard style={styles.panel}>
              {ways.map((w, i) => (
                <BriefRow key={w.key} title={w.title} subtitle={w.subtitle} last={i === ways.length - 1} onPress={w.onPress} />
              ))}
            </ListCard>
          </>
        ) : null}

        {/* Explicit feedback: a signal, visibly secondary to showing you understand. */}
        <View style={styles.feedbackBox}>
          <T variant="meta" style={{ color: color.ink2 }}>
            {nothingNew ? "Tell Thinketh" : "Or just tell Thinketh"}
          </T>
          <View style={{ flexDirection: "row", gap: space.s, marginTop: space.s }}>
            <Button kind="quiet" label="Got it" style={styles.feedbackButton} disabled={!!feedback?.ok} loading={sending === "got_it"} onPress={() => send("got_it")} />
            <Button
              kind="quiet"
              label="I already knew this"
              style={styles.feedbackButton}
              disabled={!!feedback?.ok}
              loading={sending === "already_knew"}
              onPress={() => send("already_knew")}
            />
          </View>
          <T variant="meta" style={{ marginTop: space.xs, color: color.ink3 }}>
            Thinketh distinguishes what you report from what you demonstrate: this counts a little, within a cap. A check provides stronger evidence.
          </T>
          {feedback ? (
            <View style={styles.feedbackNote} accessibilityLiveRegion="polite">
              {feedback.ok ? <Icon name="check" size={16} color={color.ink} /> : null}
              <T variant="support" style={{ flex: 1 }}>
                {feedback.reason}
              </T>
            </View>
          ) : null}
        </View>

        {/* 5. The full brief: every detail, sources included, one tap away. */}
        <Pressable
          onPress={() => setBriefOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: briefOpen }}
          accessibilityLabel={briefOpen ? "Hide the full brief" : "Read the full brief, including sources"}
          style={styles.briefToggle}
        >
          <View style={{ flex: 1 }}>
            <T style={styles.briefTitle}>{briefOpen ? "Hide the full brief" : "Read the full brief"}</T>
            <T variant="meta" style={{ color: color.ink3, marginTop: 2 }}>
              {nothingNew ? "What happened" : "Everything that changed, what happened"}, related concepts, why it ranks, and {sources.length === 1 ? "the source" : `all ${sources.length} sources`}
            </T>
          </View>
          <View style={{ transform: [{ rotate: briefOpen ? "90deg" : "0deg" }] }}>
            <Icon name="chevron" size={15} color={color.ink2} />
          </View>
        </Pressable>

        {briefOpen ? (
          <>
            {!nothingNew ? (
              <BriefSection title="Everything that changed">
                {delta.whatChanged.map((line) => (
                  <DotLine key={line} tone="cool">
                    {line}
                  </DotLine>
                ))}
                {delta.alreadyKnew.length ? (
                  <>
                    <T style={[styles.smallCaps, { marginTop: space.l }]}>What you already knew</T>
                    <View style={{ marginTop: space.s }}>
                      {delta.alreadyKnew.map((line) => (
                        <DotLine key={line} tone="muted">
                          {line}
                        </DotLine>
                      ))}
                    </View>
                  </>
                ) : null}
                <T style={[styles.smallCaps, { marginTop: space.l }]}>Why it matters to you</T>
                <T variant="support" style={{ marginTop: space.s, color: color.ink }}>
                  {delta.whyItMattersToYou}
                </T>
              </BriefSection>
            ) : null}
            <BriefSection title="Why this changes your mental model">
              <T variant="statement" style={{ fontSize: 19, lineHeight: 27 }}>
                {delta.mentalModelChange}
              </T>
            </BriefSection>

            <BriefSection title="What happened">
              {delta.whatHappened.map((line) => (
                <DotLine key={line} tone="muted">
                  {line}
                </DotLine>
              ))}
            </BriefSection>

            {delta.affectedConcepts.length ? (
              <BriefSection title="Related concepts">
                <View style={styles.chips}>
                  {delta.affectedConcepts.map((c) => (
                    <ConceptChip
                      key={c.conceptId}
                      label={conceptName(c.conceptId)}
                      active={c.conceptId === primaryConceptId}
                      book
                      onPress={() => router.push({ pathname: "/mind", params: { concept: c.conceptId } })}
                    />
                  ))}
                </View>
                {delta.affectedConcepts[0]?.reason ? (
                  <T variant="support" style={{ marginTop: space.m }}>
                    {delta.affectedConcepts[0].reason}
                  </T>
                ) : null}
              </BriefSection>
            ) : null}

            <BriefSection title={`Why Thinketh considers this ${significance.toLowerCase().replace(" development", "")}`}>
              <WhyMajor d={d} sourceCount={sources.length} storyline={d.storylineIds.length > 0} />
            </BriefSection>

            <BriefSection title="Sources">
              <ListCard style={styles.panel}>
                {sources.map((x, i) => (
                  <BriefRow
                    key={x.id}
                    icon={x.url ? "external" : undefined}
                    kicker={sourceClass(x)}
                    title={x.title}
                    meta={[x.publisher, x.publishedAt && !x.publisher?.includes("(demo)") ? shortDate(x.publishedAt) : undefined].filter(Boolean).join(" · ") || undefined}
                    last={i === sources.length - 1}
                    accessibilityRole="link"
                    accessibilityLabel={`${sourceClass(x)}, ${x.publisher ?? ""}: ${x.title}${x.url ? ", opens in browser" : ""}`}
                    onPress={x.url ? () => openExternal(x.url) : undefined}
                  />
                ))}
              </ListCard>
            </BriefSection>
          </>
        ) : null}
      </Gutter>
    </Screen>
  );
}

/** Your completed check, straight from the API response, in proportion to the evidence, and the next step. */
function CheckResult({ check, conceptName, onAgain, onExplain }: { check: NonNullable<ReturnType<typeof lastCheckFor>>; conceptName: string; onAgain: () => void; onExplain: () => void }) {
  const { transition } = check.result;
  const kind = transition.observation.kind;
  const rose = transition.after.mastery > transition.before.mastery;
  const heading =
    kind === "diagnostic_correct" ? "Your answer supports this understanding." : kind === "diagnostic_partial" ? "Part of it came through." : "Not yet.";
  const body =
    kind === "diagnostic_correct"
      ? `Your Mind has stronger evidence for ${conceptName}. One answer is a signal, not proof.`
      : kind === "diagnostic_partial"
        ? `Thinketh recorded partial evidence for ${conceptName}.`
        : `Nothing was marked as learned. Thinketh recorded what your answer showed about ${conceptName}.`;
  const openMind = () => router.push({ pathname: "/mind", params: { concept: check.conceptId, from: "check" } });
  return (
    <View style={[styles.card, { marginTop: space.xl }]} accessibilityLiveRegion="polite">
      <T style={styles.kicker}>Your check</T>
      <T variant="section" style={{ marginTop: space.s }}>
        {heading}
      </T>
      <T variant="support" style={{ marginTop: space.xs }}>
        {body}
      </T>
      {/* The real transition, as recorded: numbers and the update's own reason. */}
      <T variant="meta" style={{ marginTop: space.s, color: color.ink3, fontVariant: ["tabular-nums"] }}>
        Mastery {transition.before.mastery.toFixed(2)} → {transition.after.mastery.toFixed(2)}
        {rose ? "" : " · no increase"}
      </T>
      <T variant="meta" style={{ marginTop: 2, color: color.ink3 }} numberOfLines={3}>
        {transition.reason}
      </T>
      {kind === "diagnostic_correct" ? (
        <Button label="See what changed in my Mind" icon="arrow" style={{ marginTop: space.l }} onPress={openMind} />
      ) : (
        <>
          <Button label="Explain it another way" icon="arrow" style={{ marginTop: space.l }} onPress={onExplain} />
          <Button kind="secondary" label="See my Mind" style={{ marginTop: space.s }} onPress={openMind} />
        </>
      )}
      <Button kind="quiet" label="Check again" style={{ alignSelf: "center", marginTop: space.xs }} onPress={onAgain} />
    </View>
  );
}

function WhyMajor({ d, sourceCount, storyline }: { d: Development; sourceCount: number; storyline: boolean }) {
  const lines = [
    d.credibility >= 0.85 ? "High source credibility: primary announcement and documentation." : "Moderate source credibility.",
    d.novelty >= 0.7 ? "A material capability change, not an incremental update." : "Extends an existing pattern.",
    "Connected to topics you follow.",
    storyline ? "Part of an ongoing storyline you're tracking." : null,
    `${sourceCount} ${sourceCount === 1 ? "source" : "independent sources"}.`,
  ].filter(Boolean) as string[];
  return (
    <View style={{ marginTop: space.s, gap: space.xs }}>
      {lines.map((l) => (
        <DotLine key={l} tone="muted">
          {l}
        </DotLine>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.sansBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.8, color: color.ink, marginTop: space.m },
  card: { padding: space.l, borderRadius: 20, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(22,22,22,0.05)", ...depth.card },
  panel: { borderColor: "rgba(22,22,22,0.05)", ...depth.card },
  kicker: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.6, textTransform: "uppercase", color: color.coral },
  lead: { fontFamily: font.sansSemibold, fontSize: 18, lineHeight: 25, letterSpacing: -0.3, color: color.ink, marginTop: space.s },
  smallCaps: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.1, textTransform: "uppercase", color: color.ink3 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginVertical: space.m },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  feedbackBox: { marginTop: space.xl },
  feedbackButton: { flex: 1, paddingHorizontal: space.s, minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, borderRadius: 999 },
  feedbackNote: { flexDirection: "row", gap: space.s, marginTop: space.m, alignItems: "flex-start" },
  briefToggle: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 56, marginTop: space.xl, paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  briefTitle: { fontFamily: font.sansSemibold, fontSize: 16, lineHeight: 21, color: color.ink },
});

/** Source class from what the source is, never a claim about peer review or quality. */
function sourceClass(s: Source): string {
  switch (s.sourceType) {
    case "announcement":
      return "Primary source";
    case "docs":
      return "Documentation";
    case "paper":
      return /arxiv|preprint/i.test(`${s.publisher ?? ""} ${s.url ?? ""}`) ? "Preprint" : "Research";
    case "github":
      return "Repository";
    case "video":
      return "Video";
    default:
      return "Article";
  }
}
