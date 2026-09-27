import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Wordmark } from "@/components/Logo";
import { Redirect, router } from "expo-router";
import { narrativeLabel, type BriefResponse, type Concept, type Development, type KnowledgeResponse } from "@thinketh/contracts";
import { api } from "@/api";
import { PLAYGROUND_AVAILABLE } from "@/api/playground";
import { Icon } from "@/components/Icon";
import { ActionTile, Avatar, ListCard, SectionHeader } from "@/components/system";
import { InsightItem, LeadStory, TodayMetrics } from "@/components/today/TodayParts";
import { BookGlyph } from "@/components/mind/world/Book";
import { playedHighlights } from "@/components/mind/world/MindLibrary";
import { projectMindWorld, shelfNeighbours } from "@/components/mind/world/mindWorld";
import { ShelfVignette, SpriteStill } from "@/components/mind/world/Vignette";
import { AGENT_SPRITES } from "@/components/playground/world/assets";
import { DEMO_LEARNER_NAME } from "@/content/demo";
import { Sheet } from "@/components/Sheet";
import { T } from "@/components/Text";
import { ErrorState, Gutter, LoadingState, Screen } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useProfile } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { DEMO_CONTROLS } from "@/lib/devFlags";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { improved, isToday, relativeTime, significanceLabel, skipLabel, todaysTransitions, understoodDevelopmentIds } from "@/lib/knowledge";
import { color, depth, DEPTH_INK, font, glow, lift, radius, space } from "@/theme/tokens";


const SKIP_DEFINITIONS: Record<string, string> = {
  duplicate: "The same item seen again, or several sources covering the same event. You see it once.",
  low_signal: "Items that don't add enough about the topics Thinketh follows.",
  outdated: "Published before the discovery window, even if Thinketh only found it now.",
  undated: "No publication date, so Thinketh won't guess when it happened.",
  over_budget: "Relevant, but past this run's limit. It's eligible in the next run.",
  already_understood: "Developments that fall within what your knowledge state already covers well.",
  minor_update: "Incremental changes that extend a known pattern without changing your mental model.",
  low_confidence: "Reports without enough corroboration or primary sources yet.",
};

const VISIBLE_ROWS = 3;

export default function Today() {
  const session = useSession();
  const profile = useProfile();
  const { data, error, loading, reload } = useApi(
    async () => {
      const [today, knowledge] = await Promise.all([api.getTodayBrief(), api.getKnowledge()]);
      return { today, knowledge };
    },
    [session.mode, session.session?.userId],
    { refetchOnFocus: true },
  );

  // Your own Mind needs a verified session before anything else.
  if (session.mode === "personal" && session.status === "signed_out" && !session.anonymousAvailable) return <Redirect href="/account" />;
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
  return <TodayContent today={data.today} knowledge={data.knowledge} name={session.mode === "personal" ? (profile?.displayName ?? "You") : DEMO_LEARNER_NAME} />;
}

/** "Last run 3h ago" style freshness for the discovery run behind a live brief. */
function runAge(iso: string | undefined): string {
  if (!iso) return "";
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  return h < 1 ? "less than an hour ago" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

function TodayContent({ today, knowledge, name }: { today: BriefResponse; knowledge: KnowledgeResponse; name: string }) {
  const { brief, developments, pipeline } = today;
  // Items and developments are different units: a live brief counts the source items its run read.
  const live = pipeline && pipeline.mode !== "demo_fixture" ? pipeline : null;
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
  // The lead story's way into your Mind: its first linked concept that is actually in your Mind, else none.
  const leadConceptId = hero?.conceptIds.find((id) => inMind.has(id)) ?? null;
  const world = projectMindWorld(knowledge, { selectedId: leadConceptId, played: playedHighlights });
  const shelf = shelfNeighbours(world, leadConceptId);
  const mindBook = latest ? world.books.find((b) => b.conceptId === latest.conceptId) : undefined;

  if (!hero) {
    return (
      <Screen background={color.ground}>
        <Gutter style={{ paddingTop: space.xl }}>
          <T variant="display">Nothing changed enough to interrupt you.</T>
          <T variant="support" style={{ marginTop: space.l }}>
            {live?.mode === "none"
              ? "Thinketh hasn't finished a discovery run yet, so there's nothing to compare against your Mind."
              : live
                ? `Thinketh's last run read ${live.itemsInspected} items (${runAge(live.finishedAt)}). Nothing in it changed what you know enough to show you.`
                : `Thinketh reviewed ${brief.skippedCount ?? 0} items. Your knowledge is current.`}
          </T>
        </Gutter>
      </Screen>
    );
  }

  const shown = showAll ? rest : rest.slice(0, VISIBLE_ROWS);
  return (
    <Screen background={color.ground} contentStyle={{ paddingTop: 0 }} topInset={false}>
      <HomeTopBar name={name} />
      <Gutter>
        <IntelligenceHero count={brief.meaningfulCount} />
        <TodayMetrics
          style={{ marginTop: space.xl + space.xs }}
          metrics={[
            { value: String(live ? live.itemsInspected : (brief.skippedCount ?? 0) + brief.meaningfulCount), label: "Items", sub: "scanned" },
            understood.size > 0
              ? { value: `${understood.size}/${brief.meaningfulCount}`, label: "Understood", sub: "so far" }
              : { value: String(brief.meaningfulCount), label: "New", sub: "for you" },
            { value: String(connected.size), label: "Connected", sub: "to your Mind" },
            { value: String(brief.skippedCount ?? 0), label: "Filtered", sub: "why? ⓘ", accessibilityLabel: `${brief.skippedCount ?? 0} items filtered. See why.`, onPress: brief.skippedCount ? () => setFilterOpen(true) : undefined },
          ]}
        />
        <View style={styles.ctaRow}>
          <Pressable
            onPress={() => router.push({ pathname: "/development/[id]", params: { id: next.id } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <T style={styles.ctaLabel}>{understood.size > 0 ? "Continue catch-up" : "Catch me up"}</T>
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

        <LeadStory
          development={hero}
          concepts={hero.conceptIds.map((id) => conceptById.get(id)).filter((c): c is Concept => !!c)}
          artHeight={176}
          art={(w, h) => <ShelfVignette width={w} height={h} books={shelf.books} featuredId={shelf.featured?.conceptId ?? null} stefen="left" />}
          onPress={() => router.push({ pathname: "/development/[id]", params: { id: hero.id } })}
        />

        <SectionHeader title="Continue where you left off" />
        <View style={styles.tiles}>
          <ActionTile
            icon="mind"
            art={<BookGlyph evidence={mindBook?.evidence ?? "developing"} changed={mindBook?.changed ?? null} size={34} />}
            tint={glow.tileNeutral}
            ink={glow.tileNeutralInk}
            title="Your Mind"
            // What changed today is the reason to open it.
            // The changed book (coral bookmark) and its name; a11y says it changed.
            subtitle={latest ? (conceptById.get(latest.conceptId)?.name ?? "A concept") : "Your library"}
            accent={!!latest}
            onPress={() => router.push(latest ? { pathname: "/mind", params: { concept: latest.conceptId, from: "today" } } : "/mind")}
          />
          <ActionTile icon="ask" tint={color.surfaceMuted} ink={color.ink} title="Ask Thinketh" subtitle="Ask a question" onPress={() => router.push("/ask")} />
          {/* The Playground needs the Thinketh server: offline it isn't offered at all. */}
          {PLAYGROUND_AVAILABLE ? (
            <ActionTile
            icon="people"
            art={
              <View style={{ flexDirection: "row" }}>
                <SpriteStill size={36} />
                <View style={{ marginLeft: -8 }}>
                  <SpriteStill sprite={AGENT_SPRITES.blue} size={36} facing="left" />
                </View>
              </View>
            }
            tint={glow.tileNeutral}
            ink={glow.tileNeutralInk}
            title="Playground"
            subtitle="Learn together"
            onPress={() => router.push("/playground")}
            />
          ) : null}
        </View>

        {rest.length ? (
          <>
            <SectionHeader
              title="Recent new insights"
              action={rest.length > VISIBLE_ROWS ? { label: showAll ? "Show fewer" : "See all", onPress: () => setShowAll((v) => !v) } : undefined}
            />
            <ListCard style={styles.panel}>
              {shown.map((d, i) => (
                <InsightItem
                  key={d.id}
                  development={d}
                  // Plain-language category; the canonical concept name stays on the detail view.
                  category={d.conceptIds[0] && conceptById.get(d.conceptIds[0]) ? narrativeLabel(d.conceptIds[0], conceptById.get(d.conceptIds[0])!.name) : significanceLabel(d)}
                  meta={relativeTime(d.happenedAt)}
                  understood={understood.has(d.id)}
                  last={i === shown.length - 1}
                  onPress={() => router.push({ pathname: "/development/[id]", params: { id: d.id } })}
                />
              ))}
            </ListCard>
          </>
        ) : null}
      </Gutter>

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title={`${brief.skippedCount} ${live ? "source items" : "items"} filtered`}>
        <T variant="support" style={{ marginBottom: space.l }}>
          Thinketh read more than it shows you. These were left out so your catch-up only contains what changes your understanding.
        </T>
        {live ? (
          <T variant="support" style={{ marginBottom: space.l }}>
            {`Last run ${runAge(live.finishedAt)}: ${live.itemsInspected} items from ${live.sourcesChecked} sources${live.sourcesFailed ? ` (${live.sourcesFailed} unavailable)` : ""}, grouped into ${live.developmentsProduced} ${live.developmentsProduced === 1 ? "development" : "developments"}. ${live.developmentsSelected} ${live.developmentsSelected === 1 ? "is" : "are"} new for you${live.developmentsAlreadyUnderstood ? `; ${live.developmentsAlreadyUnderstood} left out because your knowledge already covers ${live.developmentsAlreadyUnderstood === 1 ? "it" : "them"}` : ""}.`}
          </T>
        ) : pipeline?.mode === "demo_fixture" ? (
          <T variant="meta" style={{ marginBottom: space.l, color: color.ink3 }}>
            Illustrative counts for the demo learner, not a live discovery run.
          </T>
        ) : null}
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

function HomeTopBar({ name }: { name: string }) {
  const { top } = useSafeTop();
  return (
    <Gutter style={[styles.topBar, { paddingTop: top }]}>
      {/* Long-press opens dev-only demo controls (reset, adapter health). */}
      <Pressable onLongPress={DEMO_CONTROLS ? () => router.push("/demo") : undefined} delayLongPress={600} hitSlop={12} accessible={false} style={styles.brand}>
        <Wordmark height={22} />
      </Pressable>
      <View style={{ flexDirection: "row", gap: space.s }}>
        <Pressable onPress={() => router.push("/ask")} accessibilityRole="button" accessibilityLabel="Search and ask" style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Icon name="search" size={19} color={color.ink} />
        </Pressable>
        <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Your learning profile" style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
          <Avatar name={name} size={44} />
        </Pressable>
      </View>
    </Gutter>
  );
}

function IntelligenceHero({ count }: { count: number }) {
  return (
    <View style={styles.hero}>
      <T style={styles.kicker}>Your intelligence today</T>
      <T style={styles.headline} accessibilityRole="header">
        {count} new {count === 1 ? "thing" : "things"} worth knowing
      </T>
      <T style={styles.heroCopy}>We read the world, compared it to your Mind, and found what matters.</T>
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
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(22,22,22,0.05)",
    ...depth.control,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceMuted, ...depth.control },
  hero: { paddingTop: space.xl },
  kicker: { fontFamily: font.sansMedium, fontSize: 11.5, lineHeight: 14, letterSpacing: 3, textTransform: "uppercase", color: color.ink2 },
  headline: { fontFamily: font.sansBold, fontSize: 41, lineHeight: 44, letterSpacing: -1.6, color: color.ink, marginTop: space.m, maxWidth: 318 },
  heroCopy: { fontFamily: font.sans, fontSize: 14.5, lineHeight: 21, color: color.ink2, marginTop: space.s, maxWidth: "78%" },
  // A curated panel: gently lifted off the warm ground.
  panel: { borderColor: "rgba(22,22,22,0.05)", ...depth.card },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: space.xl + space.xs },
  cta: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, height: 56, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: color.ink, ...lift(DEPTH_INK, 0.16, 18, 5, 5) },
  ctaLabel: { fontFamily: font.sansSemibold, fontSize: 16.5, lineHeight: 21, letterSpacing: -0.2, color: color.onInk, flex: 1 },
  ctaMeta: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 18, color: color.onInk, opacity: 0.55, fontVariant: ["tabular-nums"] },
  listen: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(22,22,22,0.05)", ...depth.control },
  tiles: { flexDirection: "row", gap: 10 },
  skipRow: { paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
});
