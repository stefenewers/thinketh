import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import type { BriefResponse, Development, KnowledgeResponse } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { Mark } from "@/components/Logo";
import { Sheet } from "@/components/Sheet";
import { T } from "@/components/Text";
import { Button, Divider, ErrorState, Gutter, LoadingState, Row, Screen, SectionLabel } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useProfile } from "@/lib/profile";
import {
  evidenceLabel,
  improved,
  isMajor,
  isToday,
  longDate,
  masteryLabel,
  relativeTime,
  significanceLabel,
  skipLabel,
  todaysTransitions,
  understoodDevelopmentIds,
} from "@/lib/knowledge";
import { color, font, radius, space } from "@/theme/tokens";

const SKIP_DEFINITIONS: Record<string, string> = {
  duplicate: "Several sources covering the same event. You see the strongest version once.",
  low_signal: "Commentary that reacts to events without adding new facts or evidence.",
  already_understood: "Developments that fall within what your knowledge state already covers well.",
  minor_update: "Incremental changes that extend a known pattern without changing your mental model.",
  low_confidence: "Reports without enough corroboration or primary sources yet.",
};

const VISIBLE_ROWS = 3;

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View>
      <T style={[styles.statValue, accent && { color: color.coral }]}>{value}</T>
      <T variant="label" style={{ marginTop: 2 }}>
        {label}
      </T>
    </View>
  );
}

export default function Today() {
  const profile = useProfile();
  const { data, error, loading, reload } = useApi(
    async () => {
      const [today, knowledge] = await Promise.all([api.getTodayBrief(), api.getKnowledge()]);
      return { today, knowledge };
    },
    [],
    { refetchOnFocus: true },
  );

  // First run: set up the learner profile before the first brief.
  if (profile === null) return <Redirect href="/onboarding" />;
  if ((loading && !data) || profile === undefined) {
    return (
      <Screen scroll={false}>
        <LoadingState message="Comparing today's developments against what you already understand…" />
      </Screen>
    );
  }
  if (error || !data) {
    return (
      <Screen scroll={false}>
        <ErrorState onRetry={reload} />
      </Screen>
    );
  }
  return <TodayContent today={data.today} knowledge={data.knowledge} following={profile.interests} />;
}

function TodayContent({ today, knowledge, following }: { today: BriefResponse; knowledge: KnowledgeResponse; following: string[] }) {
  const { brief, developments } = today;
  const concepts = today.concepts ?? knowledge.items.map((i) => i.concept);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const byId = new Map(developments.map((d) => [d.id, d]));
  const ordered = brief.developmentIds.map((id) => byId.get(id)).filter((d): d is Development => !!d);
  const hero = byId.get(brief.heroDevelopmentId) ?? ordered[0];
  const rest = ordered.filter((d) => d.id !== hero?.id);
  // Prefer the server's answer; derive the same rule locally if it isn't sent.
  const understood = today.understoodDevelopmentIds
    ? new Set(today.understoodDevelopmentIds)
    : understoodDevelopmentIds(developments, knowledge.items);
  const next = ordered.find((d) => !understood.has(d.id)) ?? hero;
  const remainingMinutes = Math.max(
    0,
    Math.round(brief.estimatedMinutes * (1 - understood.size / Math.max(brief.meaningfulCount, 1))),
  );
  // The time shown is when Thinketh surfaced the development, so it's paired with the source count, not a publisher.
  const sourceCount = (d: Development) => `${d.sourceIds.length} ${d.sourceIds.length === 1 ? "source" : "sources"}`;
  const latest = (today.recentTransitions ?? todaysTransitions(knowledge.items)).find((t) => isToday(t.createdAt) && improved(t));
  const latestConcept = latest ? concepts.find((c) => c.id === latest.conceptId) : undefined;

  if (!hero) {
    return (
      <Screen>
        <Gutter style={{ paddingTop: space.x4 }}>
          <T variant="display">Nothing changed enough to interrupt you.</T>
          <T variant="support" style={{ marginTop: space.l }}>
            Thinketh reviewed {brief.skippedCount ?? 0} items. Your knowledge is current.
          </T>
        </Gutter>
      </Screen>
    );
  }

  return (
    <Screen>
      <Gutter>
        <View style={styles.topBar}>
          {/* Long-press opens dev-only demo controls (reset, adapter health). */}
          <Pressable onLongPress={() => router.push("/demo")} delayLongPress={600} hitSlop={12} accessible={false}>
            <Mark size={22} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/mind")}
            accessibilityRole="button"
            accessibilityLabel="Open your Mind"
            style={styles.mindButton}
            hitSlop={6}
          >
            <Icon name="mind" size={18} color={color.ink} />
            <T variant="meta" style={{ color: color.ink }}>
              Mind
            </T>
          </Pressable>
        </View>

        <T variant="label" style={{ marginTop: space.xxl }}>
          {longDate(brief.date)}
        </T>
        {following.length ? (
          <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Learning profile" hitSlop={6}>
            <T variant="meta" style={{ marginTop: space.xs }} numberOfLines={1}>
              Following {following.join(" · ")}
            </T>
          </Pressable>
        ) : null}
        <T variant="display" style={{ marginTop: space.m }} accessibilityRole="header">
          You missed {brief.meaningfulCount} things worth knowing.
        </T>
        {/* The evidence of the work, in type: what survived, how long, and how much was filtered out. */}
        <View style={styles.stats} accessibilityRole="summary">
          {understood.size > 0 ? (
            <>
              <Stat value={`${understood.size}/${brief.meaningfulCount}`} label="Understood" accent />
              <Stat value={`~${remainingMinutes}`} label="Minutes left" />
            </>
          ) : (
            <>
              <Stat value={String(brief.majorCount)} label="Major" accent />
              <Stat value={`~${brief.estimatedMinutes}`} label="Minutes" />
            </>
          )}
          {brief.skippedCount ? (
            <Pressable
              onPress={() => setFilterOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${brief.skippedCount} items filtered. See why.`}
              hitSlop={6}
            >
              <Stat value={String(brief.skippedCount)} label="Filtered ⓘ" />
            </Pressable>
          ) : null}
        </View>
        {brief.skippedCount ? (
          <T variant="support" style={{ marginTop: space.m }}>
            Out of {brief.skippedCount + brief.meaningfulCount} items, only {brief.meaningfulCount} change what you understand.
          </T>
        ) : null}

        <View style={styles.ctaRow}>
          <Button
            label={understood.size > 0 ? "Continue my catch-up" : "Catch me up"}
            icon="arrow"
            onPress={() => router.push({ pathname: "/development/[id]", params: { id: next.id } })}
          />
          <Pressable
            onPress={() => router.push("/voice")}
            accessibilityRole="button"
            accessibilityLabel="Listen to your catch-up"
            style={styles.listen}
            hitSlop={6}
          >
            <Icon name="voice" size={18} color={color.ink2} />
            <T variant="meta">Listen</T>
          </Pressable>
        </View>

      </Gutter>

      {latest && latestConcept ? (
        <Gutter style={{ marginTop: space.xxl }}>
          <Pressable
            onPress={() => router.push({ pathname: "/mind", params: { concept: latest.conceptId } })}
            accessibilityRole="button"
            style={styles.changed}
          >
            <T variant="label" tone="coral">
              Your knowledge changed today
            </T>
            <T variant="section" style={{ marginTop: space.s }}>
              {latestConcept.name}
            </T>
            <T variant="support" style={{ marginTop: space.xs }}>
              {masteryLabel(latest.before.mastery) === masteryLabel(latest.after.mastery)
                ? `${masteryLabel(latest.after.mastery)}, on firmer ground`
                : `${masteryLabel(latest.before.mastery)} → ${masteryLabel(latest.after.mastery)}`}
              {` · ${evidenceLabel(latest.after.uncertainty).toLowerCase()}`}
            </T>
            <View style={styles.inlineLink}>
              <T variant="meta" style={{ color: color.ink }}>
                View in Mind
              </T>
              <Icon name="arrow" size={14} color={color.ink} />
            </View>
          </Pressable>
        </Gutter>
      ) : null}

      <Gutter style={{ marginTop: space.x3 }}>
        <SectionLabel>Lead development</SectionLabel>
        <Pressable
          onPress={() => router.push({ pathname: "/development/[id]", params: { id: hero.id } })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.hero, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.heroMeta}>
            <T variant="meta" style={{ color: color.ink, fontFamily: font.sansSemibold }}>
              {sourceCount(hero)} ·
            </T>
            <T variant="meta">surfaced {relativeTime(hero.happenedAt).toLowerCase()}</T>
            <View style={{ flex: 1 }} />
            {understood.has(hero.id) ? <UnderstoodTag /> : <T variant="meta">{significanceLabel(hero)}</T>}
          </View>
          <T variant="title" style={{ marginTop: space.m }}>
            {hero.title}
          </T>
          {hero.summaryBullets[0] ? (
            <T variant="support" style={{ marginTop: space.m, fontSize: 15, lineHeight: 23 }}>
              {hero.summaryBullets[0]}
            </T>
          ) : null}
          <View style={[styles.inlineLink, { marginTop: space.l }]}>
            <T variant="meta" style={{ color: color.ink }}>
              What changed for you
            </T>
            <Icon name="arrow" size={14} color={color.ink} />
          </View>
        </Pressable>
      </Gutter>

      <View style={{ marginTop: space.x3 }}>
        <Gutter>
          <SectionLabel>Also worth knowing</SectionLabel>
        </Gutter>
        <Divider />
        {(showAll ? rest : rest.slice(0, VISIBLE_ROWS)).map((d) => (
          <Row
            key={d.id}
            onPress={() => router.push({ pathname: "/development/[id]", params: { id: d.id } })}
            accessibilityLabel={`${d.title}. ${significanceLabel(d)}.`}
          >
            <View style={{ flexDirection: "row", gap: space.s, alignItems: "center" }}>
              <T variant="meta">
                {`${sourceCount(d)} · surfaced ${relativeTime(d.happenedAt).toLowerCase()}`}
              </T>
              {understood.has(d.id) ? <UnderstoodTag /> : isMajor(d) ? <T variant="meta" style={{ color: color.ink }}>· Major</T> : null}
            </View>
            <T variant="body" style={{ fontFamily: font.sansSemibold, marginTop: space.xs, lineHeight: 22 }}>
              {d.title}
            </T>
            {d.summaryBullets[0] ? (
              <T variant="support" numberOfLines={2} style={{ marginTop: space.xs }}>
                {d.summaryBullets[0]}
              </T>
            ) : null}
          </Row>
        ))}
        {rest.length > VISIBLE_ROWS ? (
          <Gutter>
            <Button
              kind="quiet"
              label={showAll ? "Show fewer" : `${rest.length - VISIBLE_ROWS} more, lower priority`}
              onPress={() => setShowAll((s) => !s)}
              style={{ alignSelf: "flex-start" }}
            />
          </Gutter>
        ) : null}
      </View>

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title={`${brief.skippedCount} items filtered`}>
        <T variant="support" style={{ marginBottom: space.l }}>
          Thinketh read more than it shows you. These were left out so your catch-up only contains what changes your understanding.
        </T>
        {Object.entries(brief.skippedBreakdown ?? {}).map(([label, count]) => (
          <View key={label} style={styles.skipRow}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T variant="body" style={{ fontFamily: font.sansMedium }}>
                {skipLabel(label)}
              </T>
              <T variant="body" style={{ fontVariant: ["tabular-nums"] }}>
                {count}
              </T>
            </View>
            {SKIP_DEFINITIONS[label] ? (
              <T variant="support" style={{ marginTop: space.xs }}>
                {SKIP_DEFINITIONS[label]}
              </T>
            ) : null}
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}

function UnderstoodTag() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon name="check" size={14} color={color.ink} />
      <T variant="meta" style={{ color: color.ink }}>
        Understood
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: space.x3, marginTop: space.xl },
  statValue: { fontFamily: font.serif, fontSize: 30, lineHeight: 36, color: color.ink, fontVariant: ["tabular-nums"] },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mindButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.edge,
  },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: space.xl, marginTop: space.xl },
  listen: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  changed: {
    paddingVertical: space.l,
    paddingLeft: space.l,
    borderLeftWidth: 2,
    borderLeftColor: color.coral,
  },
  inlineLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.m },
  hero: {
    backgroundColor: color.panel,
    borderRadius: radius.surface,
    padding: space.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
  },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  skipRow: { paddingVertical: space.l, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
});
