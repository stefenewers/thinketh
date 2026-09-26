import { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Redirect, router } from "expo-router";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import type { BriefResponse, Concept, Development, KnowledgeResponse } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon, type IconName } from "@/components/Icon";
import { Mark } from "@/components/Logo";
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
            tint={glow.tileCoral}
            ink={color.coral}
            title="Your Mind"
            // What changed today is the reason to open it.
            subtitle={latest ? `${conceptById.get(latest.conceptId)?.name ?? "A concept"} changed today` : "Explore your thinking"}
            accent={!!latest}
            onPress={() => router.push(latest ? { pathname: "/mind", params: { concept: latest.conceptId } } : "/mind")}
          />
          <ContinueTile icon="ask" tint={glow.tileCool} ink={glow.tileCoolInk} title="Ask Thinketh" subtitle="Get a quick answer" onPress={() => router.push("/ask")} />
          <ContinueTile icon="people" tint={glow.tilePeach} ink={glow.tilePeachInk} title="Playground" subtitle="Learn together with Muse" onPress={() => router.push("/playground")} />
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
                  index={i}
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

// Fixed slots keep the drawing calm and identical on every launch.
const SLOTS: [number, number][] = [
  [96, 88],
  [48, 50],
  [138, 36],
  [164, 100],
  [128, 150],
  [58, 140],
  [20, 94],
  [94, 18],
  [104, 124],
];

/** A small Mindprint of your actual Mind: filled = strong, hollow = developing, coral = changing today. */
function HeroMindprint({ knowledge, active }: { knowledge: KnowledgeResponse; active: Set<string> }) {
  const picked = [...knowledge.items].sort((a, b) => Number(active.has(b.concept.id)) - Number(active.has(a.concept.id))).slice(0, SLOTS.length);
  const slot = new Map(picked.map((it, i) => [it.concept.id, i]));
  const links = knowledge.edges
    .map((e) => [slot.get(e.fromConceptId), slot.get(e.toConceptId)] as const)
    .filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined && l[0] !== l[1]);
  // Sparse data still reads as a graph: tie any unlinked node to the centre.
  const linked = new Set(links.flat());
  const all = [...links, ...picked.map((_, i) => i).filter((i) => i > 0 && !linked.has(i)).map((i) => [0, i] as const)];
  return (
    <Svg width={128} height={118} viewBox="0 0 184 170">
      <Ellipse cx={96} cy={88} rx={84} ry={62} stroke={color.edge} strokeWidth={0.8} strokeDasharray="1 5" fill="none" />
      {all.map(([a, b]) => (
        <Path key={`${a}-${b}`} d={`M${SLOTS[a][0]} ${SLOTS[a][1]} L${SLOTS[b][0]} ${SLOTS[b][1]}`} stroke={color.edge} strokeWidth={0.9} />
      ))}
      {picked.map((it, i) => {
        const [x, y] = SLOTS[i];
        if (active.has(it.concept.id)) {
          return (
            <G key={it.concept.id}>
              <Circle cx={x} cy={y} r={8.5} fill="none" stroke={color.coral} strokeOpacity={0.28} strokeWidth={1} />
              <Circle cx={x} cy={y} r={4.2} fill={color.coral} />
            </G>
          );
        }
        return it.level === "strong" || it.level === "intermediate" ? (
          <Circle key={it.concept.id} cx={x} cy={y} r={3.6} fill={color.ink} />
        ) : (
          <Circle key={it.concept.id} cx={x} cy={y} r={3.4} fill={color.canvas} stroke={color.ink2} strokeWidth={1.2} />
        );
      })}
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
  const w = width - space.xl * 2;
  const h = 340;
  const sources = development.sourceIds.length;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/development/[id]", params: { id: development.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Lead development. ${development.title}. ${significanceLabel(development)}.`}
      style={({ pressed }) => [styles.lead, { height: h }, pressed && { transform: [{ scale: 0.99 }] }]}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <DuskArt width={w} height={h} />
      </View>
      <View style={styles.leadPill}>
        <Icon name="sparkle" size={13} color={glow.sun} />
        <T style={styles.leadPillText}>Lead development</T>
        {understood ? <Icon name="check" size={13} color={color.onInk} /> : null}
      </View>
      <View style={{ flex: 1 }} />
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
              <View key={c.id} style={[styles.conceptDot, i > 0 && { marginLeft: -8 }]}>
                <T style={styles.conceptInitial}>{c.name.slice(0, 1)}</T>
              </View>
            ))}
          </View>
          <T style={styles.leadMeta} numberOfLines={1}>
            {concepts.length} connected {concepts.length === 1 ? "concept" : "concepts"} · {sources} {sources === 1 ? "source" : "sources"}
          </T>
        </View>
        <View style={styles.leadArrow}>
          <Icon name="arrow" size={20} color={color.onInk} />
        </View>
      </View>
    </Pressable>
  );
}

/** A dusk landscape in layered haze: cinematic, and dark enough to read white type over. */
function DuskArt({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 350 340" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={glow.duskTop} />
          <Stop offset="0.55" stopColor={glow.duskMid} />
          <Stop offset="1" stopColor={glow.duskLow} />
        </LinearGradient>
        <LinearGradient id="read" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity={0.42} />
          <Stop offset="0.75" stopColor="#000" stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.45" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.4} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={350} height={340} fill="url(#sky)" />
      <Circle cx={292} cy={88} r={6} fill={glow.sun} />
      <Path d="M0 150 C 90 118, 180 108, 350 52 L350 340 L0 340 Z" fill={glow.ridgeFar} fillOpacity={0.55} />
      <Path d="M0 214 C 100 176, 210 150, 350 112 L350 340 L0 340 Z" fill={glow.ridgeMid} fillOpacity={0.7} />
      <Path d="M110 340 C 180 262, 250 226, 350 206 L350 340 Z" fill={glow.ridgeNear} fillOpacity={0.9} />
      <Ellipse cx={120} cy={196} rx={170} ry={26} fill="#FFFFFF" fillOpacity={0.07} />
      <Rect x={0} y={0} width={350} height={340} fill="url(#read)" />
      <Rect x={0} y={0} width={350} height={340} fill="url(#floor)" />
    </Svg>
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

function RecentInsightRow({ development: d, index, last, category, understood }: { development: Development; index: number; last: boolean; category?: string; understood: boolean }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/development/[id]", params: { id: d.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${d.title}. ${significanceLabel(d)}.${understood ? " Understood." : ""}`}
      style={({ pressed }) => [styles.insight, pressed && { backgroundColor: color.surfaceMuted }]}
    >
      <InsightThumb variant={index % 3} />
      <View style={[styles.insightBody, !last && styles.insightDivided]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {understood ? <Icon name="check" size={12} color={color.ink} /> : <View style={styles.dot} />}
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


/** Neutral thumbnails: a tiny graph, drawn differently per row. No color, no stock imagery. */
function InsightThumb({ variant }: { variant: number }) {
  const shapes: [number, number, boolean][][] = [
    [[14, 36, true], [28, 18, false], [42, 32, true], [30, 44, false]],
    [[16, 20, false], [36, 16, true], [40, 38, true], [18, 40, false], [28, 28, true]],
    [[12, 28, true], [28, 14, false], [44, 28, true], [28, 42, false]],
  ];
  const pts = shapes[variant % shapes.length];
  return (
    <View style={styles.thumb}>
      <Svg width={56} height={56} viewBox="0 0 56 56">
        {pts.slice(1).map(([x, y], i) => (
          <Path key={i} d={`M${pts[0][0]} ${pts[0][1]} L${x} ${y}`} stroke={color.ink3} strokeOpacity={0.45} strokeWidth={0.9} />
        ))}
        {pts.map(([x, y, filled], i) =>
          filled ? <Circle key={i} cx={x} cy={y} r={3} fill={color.ink} /> : <Circle key={i} cx={x} cy={y} r={2.8} fill={color.surfaceMuted} stroke={color.ink2} strokeWidth={1.1} />,
        )}
      </Svg>
    </View>
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
    borderColor: color.edge,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceMuted },
  hero: { paddingTop: space.l },
  heroGraph: { position: "absolute", right: -space.s, top: -space.m },
  kicker: { fontFamily: font.sansMedium, fontSize: 11.5, lineHeight: 14, letterSpacing: 2.4, textTransform: "uppercase", color: color.ink3 },
  headline: { fontFamily: font.sansSemibold, fontSize: 36, lineHeight: 41, letterSpacing: -1.2, color: color.ink, marginTop: space.m, maxWidth: "68%" },
  heroCopy: { fontFamily: font.sans, fontSize: 15.5, lineHeight: 22, color: color.ink2, marginTop: space.m, maxWidth: "88%" },
  metrics: { flexDirection: "row", marginTop: space.xl },
  metric: { paddingHorizontal: space.s },
  metricFirst: { paddingLeft: 0 },
  metricDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.edge },
  metricLabel: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 0.9, textTransform: "uppercase", color: color.ink2, marginTop: space.xs },
  metricSub: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: color.ink3 },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.xl },
  cta: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.pill, backgroundColor: color.ink },
  ctaLabel: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, color: color.onInk, flex: 1 },
  ctaMeta: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 18, color: color.onInk, opacity: 0.6, fontVariant: ["tabular-nums"] },
  listen: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.edge, ...shadow.raised },
  lead: { marginTop: space.xl, borderRadius: 22, overflow: "hidden", padding: space.xl, backgroundColor: glow.duskMid, ...shadow.raised, shadowOpacity: 0.16, shadowRadius: 20 },
  leadPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: space.m,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
  },
  leadPillText: { fontFamily: font.sansMedium, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: "uppercase", color: color.onInk },
  leadTitle: { fontFamily: font.sansSemibold, fontSize: 26, lineHeight: 31, letterSpacing: -0.7, color: color.onInk },
  leadSummary: { fontFamily: font.sans, fontSize: 15, lineHeight: 21, color: "rgba(255,255,255,0.8)", marginTop: space.s },
  leadFooter: { flexDirection: "row", alignItems: "center", marginTop: space.l, gap: space.m },
  leadMeta: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.88)", flexShrink: 1 },
  leadArrow: { width: 52, height: 52, borderRadius: 26, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  conceptDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: glow.orbLight, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  conceptInitial: { fontFamily: font.sansSemibold, fontSize: 11, lineHeight: 13, color: glow.orbDeep },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xxl, marginBottom: space.s },
  sectionTitle: { fontFamily: font.sansSemibold, fontSize: 18, lineHeight: 23, letterSpacing: -0.3, color: color.ink },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, padding: space.m, paddingBottom: space.s, borderRadius: 18, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineSoft, ...shadow.raised },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tileTitle: { fontFamily: font.sansSemibold, fontSize: 14.5, lineHeight: 19, letterSpacing: -0.2, color: color.ink, marginTop: space.m },
  tileSub: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: color.ink2, marginTop: 2, minHeight: 32 },
  tileArrow: { alignSelf: "flex-end", marginTop: space.xs },
  insights: { borderRadius: 18, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineSoft, overflow: "hidden", ...shadow.raised },
  insight: { flexDirection: "row", alignItems: "stretch", paddingLeft: space.m },
  insightBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.m, paddingRight: space.m, marginLeft: space.m },
  insightDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineSoft },
  thumb: { width: 56, height: 56, borderRadius: 12, overflow: "hidden", alignSelf: "center", backgroundColor: color.surfaceMuted },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.coral },
  insightCategory: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 1.1, textTransform: "uppercase", color: color.ink2, flexShrink: 1 },
  insightTitle: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink, marginTop: 3 },
  insightSummary: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.ink2, marginTop: 2 },
  skipRow: { paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
});
