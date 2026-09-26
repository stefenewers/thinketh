import { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Redirect, router } from "expo-router";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import type { BriefResponse, Concept, Development, KnowledgeResponse } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon, type IconName } from "@/components/Icon";
import { Mark } from "@/components/Logo";
import { Texture } from "@/components/Texture";
import { imageFor } from "@/content/imagery";
import { Sheet } from "@/components/Sheet";
import { T } from "@/components/Text";
import { ErrorState, Gutter, LoadingState, Screen } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useProfile } from "@/lib/profile";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { improved, isToday, relativeTime, significanceLabel, skipLabel, todaysTransitions, understoodDevelopmentIds } from "@/lib/knowledge";
import { color, font, glow, radius, shadow, space } from "@/theme/tokens";

const SKIP_DEFINITIONS: Record<string, string> = {
  duplicate: "Several sources covering the same event. You see the strongest version once.",
  low_signal: "Commentary that reacts to events without adding new facts or evidence.",
  already_understood: "Developments that fall within what your knowledge state already covers well.",
  minor_update: "Incremental changes that extend a known pattern without changing your mental model.",
  low_confidence: "Reports without enough corroboration or primary sources yet.",
};

const VISIBLE_ROWS = 3;
const LEAD_BAND_H = 84;

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
  return <TodayContent today={data.today} knowledge={data.knowledge} />;
}

function TodayContent({ today, knowledge }: { today: BriefResponse; knowledge: KnowledgeResponse }) {
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
  const latest = (today.recentTransitions ?? todaysTransitions(knowledge.items)).find((t) => isToday(t.createdAt) && improved(t));
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const inMind = new Set(knowledge.items.map((i) => i.concept.id));
  // Concepts today's developments touch that are already in your Mind.
  const connected = new Set(ordered.flatMap((d) => d.conceptIds).filter((id) => inMind.has(id)));
  // Coral is a signal: only what changed today, or the lead development's way into your Mind.
  const active = new Set([latest?.conceptId, hero?.conceptIds.find((id) => inMind.has(id))].filter((id): id is string => !!id));

  if (!hero) {
    return (
      <Screen background={color.canvas}>
        <Gutter style={{ paddingTop: space.xl }}>
          <T variant="display">Nothing changed enough to interrupt you.</T>
          <T variant="support" style={{ marginTop: space.l }}>
            Thinketh reviewed {brief.skippedCount ?? 0} items. Your knowledge is current.
          </T>
        </Gutter>
      </Screen>
    );
  }

  const shown = showAll ? rest : rest.slice(0, VISIBLE_ROWS);
  return (
    <Screen background={color.canvas} contentStyle={{ paddingTop: 0 }} topInset={false}>
      <HomeTopBar />
      <Gutter>
        <IntelligenceHero count={brief.meaningfulCount} knowledge={knowledge} active={active} />
        <MetricStrip
          metrics={[
            { value: String((brief.skippedCount ?? 0) + brief.meaningfulCount), label: "Items", sub: "scanned" },
            understood.size > 0
              ? { value: `${understood.size}/${brief.meaningfulCount}`, label: "Understood", sub: "so far", accent: true }
              : { value: String(brief.meaningfulCount), label: "New", sub: "for you", accent: true },
            { value: String(connected.size), label: "Connected", sub: "to your Mind" },
            { value: String(brief.skippedCount ?? 0), label: "Filtered", sub: "why? ⓘ", onPress: brief.skippedCount ? () => setFilterOpen(true) : undefined },
          ]}
        />
        <View style={styles.ctaRow}>
          <Pressable
            onPress={() => router.push({ pathname: "/development/[id]", params: { id: next.id } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <T style={styles.ctaLabel}>{understood.size > 0 ? "Continue my catch-up" : "Catch me up"}</T>
            <T style={styles.ctaMeta}>~{understood.size > 0 ? remainingMinutes : brief.estimatedMinutes} min</T>
            <Icon name="arrow" size={16} color={color.onInk} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/voice")}
            accessibilityRole="button"
            accessibilityLabel="Listen to your catch-up"
            style={({ pressed }) => [styles.listen, pressed && styles.pressed]}
          >
            <Icon name="voice" size={18} color={color.ink} />
          </Pressable>
        </View>

        <LeadDevelopmentCard development={hero} understood={understood.has(hero.id)} concepts={hero.conceptIds.map((id) => conceptById.get(id)).filter((c): c is Concept => !!c)} />

        <SectionHeader title="Continue where you left off" />
        <View style={styles.tiles}>
          <ContinueTile
            icon="mind"
            tint={glow.tileNeutral}
            ink={color.ink}
            title="Your Mind"
            // What changed today is the reason to open it.
            subtitle={latest ? `${conceptById.get(latest.conceptId)?.name ?? "A concept"} changed today` : "Explore your thinking"}
            accent={!!latest}
            onPress={() => router.push(latest ? { pathname: "/mind", params: { concept: latest.conceptId } } : "/mind")}
          />
          <ContinueTile icon="ask" tint={glow.tileCool} ink={glow.tileCoolInk} title="Ask Thinketh" subtitle="Get a quick answer" onPress={() => router.push("/ask")} />
          <ContinueTile icon="people" tint={glow.tileWarm} ink={glow.tileWarmInk} title="Playground" subtitle="Learn together with Muse" onPress={() => router.push("/playground")} />
        </View>

        {rest.length ? (
          <>
            <SectionHeader
              title="Recent new insights"
              action={rest.length > VISIBLE_ROWS ? { label: showAll ? "Show fewer" : "See all", onPress: () => setShowAll((v) => !v) } : undefined}
            />
            <View style={styles.insights}>
              {shown.map((d, i) => (
                <RecentInsightRow
                  key={d.id}
                  development={d}
                  last={i === shown.length - 1}
                  category={conceptById.get(d.conceptIds[0] ?? "")?.name}
                  understood={understood.has(d.id)}
                />
              ))}
            </View>
          </>
        ) : null}
      </Gutter>

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


function HomeTopBar() {
  const { top } = useSafeTop();
  return (
    <Gutter style={[styles.topBar, { paddingTop: top }]}>
      {/* Long-press opens dev-only demo controls (reset, adapter health). */}
      <Pressable onLongPress={() => router.push("/demo")} delayLongPress={600} hitSlop={12} accessible={false} style={styles.brand}>
        <Mark size={20} />
        <T style={styles.brandName}>Thinketh</T>
      </Pressable>
      <View style={{ flexDirection: "row", gap: space.s }}>
        <Pressable onPress={() => router.push("/ask")} accessibilityRole="button" accessibilityLabel="Search and ask" style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Icon name="search" size={19} color={color.ink} />
        </Pressable>
        <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Your learning profile" style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
          <Icon name="person" size={19} color={color.ink2} />
        </Pressable>
      </View>
    </Gutter>
  );
}

function IntelligenceHero({ count, knowledge, active }: { count: number; knowledge: KnowledgeResponse; active: Set<string> }) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroGraph} pointerEvents="none">
        <HeroMindprint knowledge={knowledge} active={active} />
      </View>
      <T style={styles.kicker}>Your intelligence today</T>
      <T style={styles.headline} accessibilityRole="header">
        {count} new {count === 1 ? "thing" : "things"} worth knowing
      </T>
      <T style={styles.heroCopy}>We read the world for you, filtered the noise, and found what changes your model.</T>
    </View>
  );
}

/**
 * A mini Mindprint, composed rather than scattered: what changed sits at the centre (coral),
 * your other concepts on two faint rings. Filled = strong, hollow = developing.
 */
function HeroMindprint({ knowledge, active }: { knowledge: KnowledgeResponse; active: Set<string> }) {
  const items = knowledge.items;
  const centre = items.find((it) => active.has(it.concept.id)) ?? items[0];
  const others = items.filter((it) => it !== centre).slice(0, 10);
  const inner = others.slice(0, 4);
  const outer = others.slice(4);
  const C = 64;
  const at = (i: number, n: number, radius: number, offset: number) => {
    const a = offset + (i / Math.max(n, 1)) * Math.PI * 2;
    return [C + Math.cos(a) * radius, C + Math.sin(a) * radius] as const;
  };
  const innerPts = inner.map((_, i) => at(i, inner.length, 28, -Math.PI / 3));
  const outerPts = outer.map((_, i) => at(i, outer.length, 52, -Math.PI / 5));
  const node = (it: (typeof items)[number], [x, y]: readonly [number, number]) =>
    it.level === "strong" || it.level === "intermediate" ? (
      <Circle key={it.concept.id} cx={x} cy={y} r={3.2} fill={color.ink} />
    ) : (
      <Circle key={it.concept.id} cx={x} cy={y} r={3} fill={color.canvas} stroke={color.ink2} strokeWidth={1.1} />
    );
  if (!centre) return null;
  return (
    <Svg width={128} height={128} viewBox="0 0 128 128">
      <Circle cx={C} cy={C} r={28} stroke={color.hairline} strokeWidth={1} fill="none" />
      <Circle cx={C} cy={C} r={52} stroke={color.hairline} strokeWidth={1} fill="none" />
      {innerPts.map(([x, y], i) => (
        <Path key={`c${i}`} d={`M${C} ${C} L${x} ${y}`} stroke={color.ink} strokeOpacity={0.16} strokeWidth={0.9} />
      ))}
      {outerPts.map(([x, y], j) => {
        const [px, py] = innerPts[Math.floor((j * innerPts.length) / Math.max(outerPts.length, 1))] ?? [C, C];
        return <Path key={`o${j}`} d={`M${px} ${py} L${x} ${y}`} stroke={color.ink} strokeOpacity={0.12} strokeWidth={0.8} />;
      })}
      {inner.map((it, i) => node(it, innerPts[i]))}
      {outer.map((it, i) => node(it, outerPts[i]))}
      {active.has(centre.concept.id) ? (
        <G>
          <Circle cx={C} cy={C} r={8} fill="none" stroke={color.coral} strokeOpacity={0.3} strokeWidth={1} />
          <Circle cx={C} cy={C} r={4} fill={color.coral} />
        </G>
      ) : (
        <Circle cx={C} cy={C} r={4} fill={color.ink} />
      )}
    </Svg>
  );
}



type Metric = { value: string; label: string; sub: string; accent?: boolean; onPress?: () => void };

function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <View style={styles.metrics} accessibilityRole="summary">
      {metrics.map((m, i) => {
        const cell = (
          <View style={[styles.metric, i === 0 ? styles.metricFirst : styles.metricDivided]}>
            <T variant="metric" style={[{ fontSize: 26, lineHeight: 30 }, m.accent && { color: color.coral }]}>
              {m.value}
            </T>
            <T style={styles.metricLabel} numberOfLines={1} adjustsFontSizeToFit>
              {m.label}
            </T>
            <T style={styles.metricSub}>{m.sub}</T>
          </View>
        );
        return m.onPress ? (
          <Pressable key={m.label} onPress={m.onPress} accessibilityRole="button" accessibilityLabel={`${m.value} items filtered. See why.`} style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}>
            {cell}
          </Pressable>
        ) : (
          <View key={m.label} style={{ flex: 1 }}>
            {cell}
          </View>
        );
      })}
    </View>
  );
}

function LeadDevelopmentCard({ development, understood, concepts }: { development: Development; understood: boolean; concepts: Concept[] }) {
  const { width } = useWindowDimensions();
  const sources = development.sourceIds.length;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/development/[id]", params: { id: development.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Lead development. ${development.title}. ${significanceLabel(development)}.`}
      style={({ pressed }) => [styles.lead, pressed && { transform: [{ scale: 0.99 }] }]}
    >
      {/* A photographic texture band: real depth at the top of an otherwise white product card. */}
      <View style={styles.leadBand}>
        <Texture source={imageFor(development.conceptIds)} style={[StyleSheet.absoluteFill, { opacity: 0.5 }]} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={width - space.xl * 2} height={LEAD_BAND_H}>
            <Defs>
              <LinearGradient id="bandFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color.canvas} stopOpacity={0.15} />
                <Stop offset="1" stopColor={color.canvas} stopOpacity={0.9} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={LEAD_BAND_H} fill="url(#bandFade)" />
            {/* A faint Mindprint line field: the material is knowledge, not scenery. */}
            {[14, 30, 46, 62].map((y, i) => (
              <Path key={y} d={`M${width * 0.38} ${y + 8} C ${width * 0.55} ${y - 6 + i * 2}, ${width * 0.7} ${y + 12 - i * 2}, ${width} ${y - 4}`} stroke={color.ink} strokeOpacity={0.08} strokeWidth={0.9} fill="none" />
            ))}
            <Circle cx={width * 0.62} cy={24} r={2.4} fill={color.ink} fillOpacity={0.35} />
            <Circle cx={width * 0.74} cy={50} r={2.4} fill="none" stroke={color.ink} strokeOpacity={0.4} strokeWidth={1} />
          </Svg>
        </View>
        <View style={styles.leadPill}>
          <View style={styles.dot} />
          <T style={styles.leadPillText}>Lead development</T>
        </View>
      </View>
      <View style={styles.leadBody}>
        {understood ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="check" size={13} color={color.ink} />
            <T variant="meta" style={{ color: color.ink }}>
              Understood
            </T>
          </View>
        ) : (
          <T variant="meta" style={{ color: color.ink3 }}>
            {significanceLabel(development)}
          </T>
        )}
        <T style={styles.leadTitle} numberOfLines={3}>
          {development.title}
        </T>
        {development.summaryBullets[0] ? (
          <T style={styles.leadSummary} numberOfLines={2}>
            {development.summaryBullets[0]}
          </T>
        ) : null}
        <View style={styles.leadFooter}>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <View style={{ flexDirection: "row", marginRight: space.s }}>
              {concepts.slice(0, 3).map((c, i) => (
                <View key={c.id} style={[styles.conceptDot, i > 0 && { marginLeft: -7 }]}>
                  <T style={styles.conceptInitial}>{c.name.slice(0, 1)}</T>
                </View>
              ))}
            </View>
            <T style={styles.leadMeta} numberOfLines={1}>
              {concepts.length} connected {concepts.length === 1 ? "concept" : "concepts"} · {sources} {sources === 1 ? "source" : "sources"}
            </T>
          </View>
          <View style={styles.leadArrow}>
            <Icon name="arrow" size={18} color={color.onInk} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}



function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.sectionHeader}>
      <T style={styles.sectionTitle}>{title}</T>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44 }}>
          <T variant="meta">{action.label}</T>
          <Icon name="chevron" size={14} color={color.ink2} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ContinueTile({ icon, tint, ink, title, subtitle, accent, onPress }: { icon: IconName; tint: string; ink: string; title: string; subtitle: string; accent?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}.`} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={[styles.tileIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={20} color={ink} />
      </View>
      <T style={styles.tileTitle} numberOfLines={1}>
        {title}
      </T>
      <T style={[styles.tileSub, accent && { color: color.coral }]} numberOfLines={2}>
        {subtitle}
      </T>
      <View style={styles.tileArrow}>
        <Icon name="arrow" size={15} color={color.ink2} />
      </View>
    </Pressable>
  );
}

function RecentInsightRow({ development: d, last, category, understood }: { development: Development; last: boolean; category?: string; understood: boolean }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/development/[id]", params: { id: d.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${d.title}. ${significanceLabel(d)}.${understood ? " Understood." : ""}`}
      style={({ pressed }) => [styles.insight, pressed && { backgroundColor: color.surfaceMuted }]}
    >
      <Texture source={imageFor(d.conceptIds)} style={styles.thumb} />
      <View style={[styles.insightBody, !last && styles.insightDivided]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {understood ? <Icon name="check" size={12} color={color.ink} /> : <View style={styles.metaDot} />}
            <T style={styles.insightCategory} numberOfLines={1}>
              {understood ? "Understood" : (category ?? significanceLabel(d))}
            </T>
          </View>
          <T style={styles.insightTitle} numberOfLines={2}>
            {d.title}
          </T>
          {d.summaryBullets[0] ? (
            <T style={styles.insightSummary} numberOfLines={1}>
              {d.summaryBullets[0]}
            </T>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: space.s }}>
          <T variant="meta" style={{ color: color.ink3, fontVariant: ["tabular-nums"] }}>
            {relativeTime(d.happenedAt)}
          </T>
          <Icon name="chevron" size={14} color={color.ink3} />
        </View>
      </View>
    </Pressable>
  );
}



function useSafeTop() {
  const insets = useSafeAreaInsets();
  return { top: insets.top + space.xs };
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: space.s },
  brand: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 44 },
  brandName: { fontFamily: font.sansMedium, fontSize: 21, lineHeight: 26, letterSpacing: -0.5, color: color.ink },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceMuted },
  hero: { paddingTop: space.l },
  heroGraph: { position: "absolute", right: -space.xs, top: space.xl },
  kicker: { fontFamily: font.sansMedium, fontSize: 11.5, lineHeight: 14, letterSpacing: 2.4, textTransform: "uppercase", color: color.ink3 },
  headline: { fontFamily: font.sansSemibold, fontSize: 36, lineHeight: 41, letterSpacing: -1.2, color: color.ink, marginTop: space.m, maxWidth: "68%" },
  heroCopy: { fontFamily: font.sans, fontSize: 15.5, lineHeight: 22, color: color.ink2, marginTop: space.m, maxWidth: "88%" },
  metrics: { flexDirection: "row", marginTop: space.xl },
  metric: { paddingHorizontal: space.s },
  metricFirst: { paddingLeft: 0 },
  metricDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.hairline },
  metricLabel: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 0.9, textTransform: "uppercase", color: color.ink2, marginTop: space.xs },
  metricSub: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: color.ink3 },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.xl },
  cta: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.pill, backgroundColor: color.ink },
  ctaLabel: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, color: color.onInk, flex: 1 },
  ctaMeta: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 18, color: color.onInk, opacity: 0.6, fontVariant: ["tabular-nums"] },
  listen: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, ...shadow.soft },
  lead: { marginTop: space.xl, borderRadius: 20, overflow: "hidden", backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, ...shadow.soft },
  leadBand: { height: LEAD_BAND_H, padding: space.l, backgroundColor: color.canvas },
  leadBody: { padding: space.xl, paddingTop: space.l },
  leadPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: space.m,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  leadPillText: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.1, textTransform: "uppercase", color: color.ink },
  leadTitle: { fontFamily: font.sansSemibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: color.ink, marginTop: space.xs },
  leadSummary: { fontFamily: font.sans, fontSize: 14.5, lineHeight: 21, color: color.ink2, marginTop: space.s },
  leadFooter: { flexDirection: "row", alignItems: "center", marginTop: space.l, gap: space.m },
  leadMeta: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 18, color: color.ink2, flexShrink: 1 },
  leadArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  conceptDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: color.surfaceMuted, borderWidth: 1.5, borderColor: color.canvas, alignItems: "center", justifyContent: "center" },
  conceptInitial: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, color: color.ink2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xxl, marginBottom: space.s },
  sectionTitle: { fontFamily: font.sansSemibold, fontSize: 18, lineHeight: 23, letterSpacing: -0.3, color: color.ink },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, padding: space.m, paddingBottom: space.s, borderRadius: 18, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, ...shadow.soft },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tileTitle: { fontFamily: font.sansSemibold, fontSize: 14.5, lineHeight: 19, letterSpacing: -0.2, color: color.ink, marginTop: space.m },
  tileSub: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: color.ink2, marginTop: 2, minHeight: 32 },
  tileArrow: { alignSelf: "flex-end", marginTop: space.xs },
  insights: { borderRadius: 18, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, overflow: "hidden", ...shadow.soft },
  insight: { flexDirection: "row", alignItems: "stretch", paddingLeft: space.m },
  insightBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.m, paddingRight: space.m, marginLeft: space.m },
  insightDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  thumb: { width: 56, height: 56, borderRadius: 12, alignSelf: "center", backgroundColor: color.surfaceMuted },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.coral },
  metaDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.ink3 },
  insightCategory: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 1.1, textTransform: "uppercase", color: color.ink2, flexShrink: 1 },
  insightTitle: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink, marginTop: 3 },
  insightSummary: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.ink2, marginTop: 2 },
  skipRow: { paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
});
