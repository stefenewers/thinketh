import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Development, DevelopmentDetailResponse, FeedbackKind, Source } from "@thinketh/contracts";
import { api } from "@/api";
import { BriefRow, BriefSection, DotLine } from "@/components/brief/Brief";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Button, ErrorState, Gutter, LoadingState, Screen } from "@/components/ui";
import { AppTopBar, ConceptChip, ListCard, SignalPill } from "@/components/system";
import { useApi } from "@/lib/hooks";
import { shortDate, significanceLabel } from "@/lib/knowledge";
import { openExternal } from "@/lib/links";
import { color, font, space } from "@/theme/tokens";

export default function DevelopmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi(() => api.getDevelopment(id), [id]);

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <AppTopBar title="Development" onBack={() => router.back()} />
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

/** Split a paragraph into sentences for a scannable list; the text itself is unchanged. */
function sentences(text: string): string[] {
  const parts = text.replace(/([.!?])\s+(?=[A-Z])/g, "$1\n").split("\n").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [text];
}

function DevelopmentContent({ data }: { data: DevelopmentDetailResponse }) {
  const { development: d, delta, sources, concepts } = data;
  const [whyOpen, setWhyOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: FeedbackKind; reason: string } | null>(null);
  const [sending, setSending] = useState<FeedbackKind | null>(null);
  const primaryConceptId = delta.affectedConcepts[0]?.conceptId ?? d.conceptIds[0];
  const primaryConcept = concepts.find((c) => c.id === primaryConceptId);
  const conceptName = (cid: string) => concepts.find((c) => c.id === cid)?.name ?? cid;
  const significance = significanceLabel(d);

  const send = async (kind: FeedbackKind) => {
    setSending(kind);
    try {
      const res = await api.sendFeedback(d.id, kind);
      setFeedback({ kind, reason: res.transitions[0]?.reason ?? "Recorded." });
    } catch {
      setFeedback({ kind, reason: "Couldn't record that right now. Try again in a moment." });
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
    ...(d.storylineIds.length > 0
      ? [
          {
            key: "storyline",
            title: "See how this idea changed",
            subtitle: "The storyline behind this development, and where you are in it.",
            onPress: () => router.push({ pathname: "/storyline/[id]", params: { id: "agent-memory" } }),
          },
        ]
      : []),
  ];

  return (
    <Screen topInset={false} contentStyle={{ paddingTop: space.s }}>
      <Gutter>
        <SignalPill label={significance} muted={d.significance < 0.75} />
        <T style={styles.title} accessibilityRole="header">
          {d.title}
        </T>
        <T variant="meta" style={{ marginTop: space.s, color: color.ink3 }}>
          {sources.length} {sources.length === 1 ? "source" : "sources"} · {shortDate(d.happenedAt)}
        </T>
        {d.summaryBullets[0] ? (
          <T variant="body" style={{ marginTop: space.l, color: color.ink2 }}>
            {d.summaryBullets[0]}
          </T>
        ) : null}

        <Pressable onPress={() => setWhyOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: whyOpen }} style={styles.why}>
          <T variant="meta">Why Thinketh considers this {significance.toLowerCase().replace(" development", "")}</T>
          <View style={{ transform: [{ rotate: whyOpen ? "90deg" : "0deg" }] }}>
            <Icon name="chevron" size={14} color={color.ink2} />
          </View>
        </Pressable>
        {whyOpen ? <WhyMajor d={d} sourceCount={sources.length} storyline={d.storylineIds.length > 0} /> : null}

        {/* The knowledge delta: what you had, what changed. */}
        <BriefSection title="What's the shift?" style={{ marginTop: space.xl }}>
          <View style={styles.shift}>
            <T style={styles.smallCaps}>You already knew</T>
            <View style={{ marginTop: space.s }}>
              {delta.alreadyKnew.map((line) => (
                <DotLine key={line} tone="muted">
                  {line}
                </DotLine>
              ))}
            </View>
            <View style={styles.shiftRule} />
            <T style={[styles.smallCaps, { color: color.ink }]}>What changed</T>
            <View style={{ marginTop: space.s }}>
              {delta.whatChanged.map((line) => (
                <DotLine key={line} tone="cool">
                  {line}
                </DotLine>
              ))}
            </View>
          </View>
        </BriefSection>

        <BriefSection title="Why this matters to you">
          {sentences(delta.whyItMattersToYou).map((line) => (
            <DotLine key={line} tone="signal">
              {line}
            </DotLine>
          ))}
        </BriefSection>

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

        <View style={{ marginTop: space.x3 }}>
          <Button
            label="Check my understanding"
            icon="arrow"
            onPress={() => router.push({ pathname: "/diagnostic", params: { developmentId: d.id, conceptId: primaryConceptId } })}
          />
          <T variant="support" style={{ marginTop: space.s, textAlign: "center" }}>
            One question. It tests the idea, not the wording.
          </T>
          <View style={{ flexDirection: "row", gap: space.s, marginTop: space.l }}>
            <Button
              kind="secondary"
              label="Got it"
              style={{ flex: 1, paddingHorizontal: space.m }}
              disabled={!!feedback}
              loading={sending === "got_it"}
              onPress={() => send("got_it")}
            />
            <Button
              kind="secondary"
              label="I already knew this"
              style={{ flex: 1.6, paddingHorizontal: space.m }}
              disabled={!!feedback}
              loading={sending === "already_knew"}
              onPress={() => send("already_knew")}
            />
          </View>
          {feedback ? (
            <View style={styles.feedbackNote} accessibilityLiveRegion="polite">
              <Icon name="check" size={16} color={color.ink} />
              <T variant="support" style={{ flex: 1 }}>
                {feedback.reason}
              </T>
            </View>
          ) : null}
        </View>

        <BriefSection title="Other ways in" style={{ marginTop: space.x3 }}>
          <ListCard>
            {ways.map((w, i) => (
              <BriefRow key={w.key} title={w.title} subtitle={w.subtitle} last={i === ways.length - 1} onPress={w.onPress} />
            ))}
          </ListCard>
        </BriefSection>

        <BriefSection title="Go deeper">
          <ListCard>
            {sources.map((s, i) => (
              <BriefRow
                key={s.id}
                icon={s.url ? "external" : undefined}
                kicker={sourceClass(s)}
                title={s.title}
                meta={[s.publisher, s.publishedAt && !s.publisher?.includes("(demo)") ? shortDate(s.publishedAt) : undefined].filter(Boolean).join(" · ") || undefined}
                last={i === sources.length - 1}
                accessibilityRole="link"
                accessibilityLabel={`${sourceClass(s)}, ${s.publisher ?? ""}: ${s.title}${s.url ? ", opens in browser" : ""}`}
                onPress={s.url ? () => openExternal(s.url) : undefined}
              />
            ))}
          </ListCard>
        </BriefSection>
      </Gutter>
    </Screen>
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
  title: { fontFamily: font.sansSemibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.7, color: color.ink, marginTop: space.m },
  why: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginTop: space.s, alignSelf: "flex-start" },
  smallCaps: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.1, textTransform: "uppercase", color: color.ink3 },
  shift: { paddingTop: space.xs },
  shiftRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginVertical: space.m },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  feedbackNote: { flexDirection: "row", gap: space.s, marginTop: space.l, alignItems: "flex-start" },
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
