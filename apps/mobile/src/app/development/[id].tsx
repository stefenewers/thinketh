import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Development, DevelopmentDetailResponse, FeedbackKind } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { BackBar, Button, Divider, ErrorState, Gutter, LoadingState, Row, Screen, SectionLabel } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { shortDate, significanceLabel } from "@/lib/knowledge";
import { color, font, space } from "@/theme/tokens";

export default function DevelopmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi(() => api.getDevelopment(id), [id]);

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <BackBar onBack={() => router.back()} />
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
  const [whyOpen, setWhyOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: FeedbackKind; reason: string } | null>(null);
  const [sending, setSending] = useState<FeedbackKind | null>(null);
  const primaryConceptId = delta.affectedConcepts[0]?.conceptId ?? d.conceptIds[0];
  const primaryConcept = concepts.find((c) => c.id === primaryConceptId);
  const conceptName = (cid: string) => concepts.find((c) => c.id === cid)?.name ?? cid;

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

  return (
    <Screen topInset={false} contentStyle={{ paddingTop: space.s }}>
      <Gutter>
        <View style={styles.meta}>
          <T variant="meta" style={{ color: color.ink, fontFamily: font.sansSemibold }}>
            {sources[0]?.publisher ?? "Source"}
          </T>
          <T variant="meta">· {shortDate(d.happenedAt)}</T>
          <T variant="meta">· {significanceLabel(d)}</T>
        </View>
        <T variant="title" style={{ marginTop: space.m, fontSize: 30, lineHeight: 37 }} accessibilityRole="header">
          {d.title}
        </T>
        {d.summaryBullets[0] ? (
          <T variant="body" style={{ marginTop: space.l, color: color.ink2 }}>
            {d.summaryBullets[0]}
          </T>
        ) : null}

        <Pressable onPress={() => setWhyOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: whyOpen }} style={styles.why}>
          <T variant="meta">Why Thinketh considers this {significanceLabel(d).toLowerCase().replace(" development", "")}</T>
          <View style={{ transform: [{ rotate: whyOpen ? "90deg" : "0deg" }] }}>
            <Icon name="chevron" size={14} color={color.ink2} />
          </View>
        </Pressable>
        {whyOpen ? <WhyMajor d={d} sourceCount={sources.length} storyline={d.storylineIds.length > 0} /> : null}
      </Gutter>

      <Section label="What happened">
        {delta.whatHappened.map((line) => (
          <Bullet key={line}>{line}</Bullet>
        ))}
      </Section>

      <Section label="Why this matters to you">
        <T variant="body">{delta.whyItMattersToYou}</T>
      </Section>

      {/* The knowledge delta: what you had, what changed, what it means. */}
      <Gutter style={{ marginTop: space.x3 }}>
        <View style={[styles.rule, { borderLeftColor: color.edge }]}>
          <T variant="label" style={{ marginBottom: space.m }}>
            You already knew
          </T>
          {delta.alreadyKnew.map((line) => (
            <Bullet key={line} muted>
              {line}
            </Bullet>
          ))}
        </View>
        <View style={[styles.rule, { borderLeftColor: color.coral, marginTop: space.xl }]}>
          <T variant="label" tone="coral" style={{ marginBottom: space.m }}>
            What changed
          </T>
          {delta.whatChanged.map((line) => (
            <Bullet key={line} accent>
              {line}
            </Bullet>
          ))}
        </View>
      </Gutter>

      <Gutter style={{ marginTop: space.x4, marginBottom: space.x3 }}>
        <T variant="label" style={{ marginBottom: space.l }}>
          Why this changes your mental model
        </T>
        <T variant="statement" style={{ fontSize: 26, lineHeight: 36 }}>
          {delta.mentalModelChange}
        </T>
      </Gutter>

      <Gutter>
        <Button
          kind="decisive"
          label="Check my understanding"
          icon="arrow"
          onPress={() =>
            router.push({ pathname: "/diagnostic", params: { developmentId: d.id, conceptId: primaryConceptId } })
          }
        />
        <T variant="support" style={{ marginTop: space.m, textAlign: "center" }}>
          One question. It tests the idea, not the wording.
        </T>
      </Gutter>

      <View style={{ marginTop: space.x3 }}>
        <Gutter>
          <SectionLabel>Other ways in</SectionLabel>
        </Gutter>
        <Divider />
        <Row onPress={() => router.push({ pathname: "/visualize/[id]", params: { id: d.id } })}>
          <T variant="body" style={{ fontFamily: font.sansMedium }}>
            Visualize this
          </T>
          <T variant="support">See the old and new model side by side.</T>
        </Row>
        <Row
          onPress={() =>
            router.push({ pathname: "/make-it-stick/[id]", params: { id: d.id, conceptId: primaryConceptId } })
          }
        >
          <T variant="body" style={{ fontFamily: font.sansMedium }}>
            Make it stick
          </T>
          <T variant="support">An analogy, a hook, and a three-step model.</T>
        </Row>
        <Row
          onPress={() =>
            router.push({
              pathname: "/ask",
              params: {
                q: `Explain what changed in ${(primaryConcept?.name ?? d.title).toLowerCase()}, based on what I already know.`,
                dev: d.id,
              },
            })
          }
        >
          <T variant="body" style={{ fontFamily: font.sansMedium }}>
            Explain deeper
          </T>
          <T variant="support">Ask Thinketh, grounded in what you know.</T>
        </Row>
      </View>

      <Gutter style={{ marginTop: space.xl }}>
        <View style={{ flexDirection: "row", gap: space.m }}>
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
      </Gutter>

      <View style={{ marginTop: space.x4 }}>
        <Gutter>
          <SectionLabel>Go deeper</SectionLabel>
        </Gutter>
        <Divider />
        {sources.map((s) => (
          <Row
            key={s.id}
            onPress={s.url ? () => Linking.openURL(s.url!).catch(() => {}) : undefined}
            accessibilityLabel={`${s.sourceType}, ${s.publisher ?? ""}: ${s.title}`}
          >
            <T variant="meta" style={{ textTransform: "capitalize" }}>
              {s.sourceType} · {s.publisher ?? "Unknown"}
            </T>
            <T variant="body" style={{ marginTop: 2 }}>
              {s.title}
            </T>
          </Row>
        ))}
      </View>

      <View style={{ marginTop: space.x3 }}>
        <Gutter>
          <SectionLabel>Related concepts</SectionLabel>
        </Gutter>
        <Divider />
        {delta.affectedConcepts.map((c) => (
          <Row key={c.conceptId} onPress={() => router.push({ pathname: "/mind", params: { concept: c.conceptId } })}>
            <T variant="body" style={{ fontFamily: font.sansMedium }}>
              {conceptName(c.conceptId)}
            </T>
            <T variant="support">{c.reason}</T>
          </Row>
        ))}
      </View>
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
        <Bullet key={l} muted>
          {l}
        </Bullet>
      ))}
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Gutter style={{ marginTop: space.x3 }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </Gutter>
  );
}

function Bullet({ children, muted, accent }: { children: string; muted?: boolean; accent?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: space.m, marginBottom: space.s }}>
      <View style={[styles.dot, accent && { backgroundColor: color.coral }]} />
      <T variant="body" style={[{ flex: 1 }, muted && { color: color.ink2 }]}>
        {children}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  why: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginTop: space.m, alignSelf: "flex-start" },
  rule: { borderLeftWidth: 2, paddingLeft: space.l },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: color.ink3, marginTop: 10 },
  feedbackNote: { flexDirection: "row", gap: space.s, marginTop: space.l, alignItems: "flex-start" },
});
