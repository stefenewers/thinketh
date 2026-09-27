import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Concept, Development, KnowledgeLevel, KnowledgeResponse, KnowledgeState, KnowledgeStateTransition, Source } from "@thinketh/contracts";
import { api } from "@/api";
import { PLAYGROUND_AVAILABLE } from "@/api/playground";
import { takeawaysApi } from "@/api/takeaways";
import { Icon } from "@/components/Icon";
import { MasteryBar } from "@/components/MindGraph";
import { useDockSpace } from "@/agent/dockLayout";
import { useAgentScreen } from "@/agent/screenContext";
import { SOURCES_TAB } from "@/agent/tools";
import { ConceptInspector, changeSentence, direction, type InspectorTab } from "@/components/mind/ConceptInspector";
import { AppTopBar, IconButton, InsightRow, ListCard, MetricStrip, SectionHeader, SegmentedTabs } from "@/components/system";
import { FocusLabel, LibraryLegend, MindLibrary, playedHighlights } from "@/components/mind/world/MindLibrary";
import { BookGlyph } from "@/components/mind/world/Book";
import { EVIDENCE_OF, projectMindWorld } from "@/components/mind/world/mindWorld";
import { T } from "@/components/Text";
import { ErrorState, Gutter, LoadingState } from "@/components/ui";
import { useApi, useReducedMotion } from "@/lib/hooks";
import { evidenceLabel, improvedTodayIds, isToday, levelLabel, relativeTime, todaysTransitions } from "@/lib/knowledge";
import { color, depth, font, space, warm } from "@/theme/tokens";

export default function MindScreen() {
  const { concept, from, tab } = useLocalSearchParams<{ concept?: string; from?: string; tab?: string }>();
  const { data, error, loading, reload } = useApi(() => api.getKnowledge(), [], { refetchOnFocus: true });
  // Developments and sources for "What's changed for you" and the Sources tab. Optional: Mind never waits on it.
  const brief = useApi(() => api.getTodayBrief(), []);

  if ((loading && !data) || error || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: warm.ground }}>
        <AppTopBar title="Your Mind" />
        {loading && !data ? <LoadingState message="Loading your knowledge state…" /> : <ErrorState onRetry={reload} />}
      </View>
    );
  }
  // Mind is a tab now: a new deep link (?concept=) remounts it with that concept selected.
  return <Mind key={`${concept ?? "mind"}:${tab ?? ""}`} data={data} initialConceptId={concept} initialTab={tab === "sources" ? "sources" : undefined} from={from} developments={brief.data?.developments ?? []} sources={brief.data?.sources ?? []} />;
}

const BANDS: KnowledgeLevel[] = ["strong", "intermediate", "developing", "weak"];
type ViewTab = "map" | "concepts" | "changes";

/** Recent direct changes, newest first: the server's list, else each concept's last direct transition. */
function recentTransitions(data: KnowledgeResponse): KnowledgeStateTransition[] {
  if (data.recentTransitions) return data.recentTransitions;
  const seen = new Set<string>();
  return data.items
    .map((i) => i.lastTransition)
    .filter((t): t is KnowledgeStateTransition => !!t && !(t.observation.sourceRef?.startsWith("propagated:") ?? false))
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function Mind({
  data,
  initialConceptId,
  initialTab,
  from,
  developments,
  sources,
}: {
  data: KnowledgeResponse;
  initialConceptId?: string;
  initialTab?: InspectorTab;
  from?: string;
  developments: Development[];
  sources: Source[];
}) {
  const { items } = data;
  const concepts = items.map((i) => i.concept);
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const stateOf = new Map(items.map((i) => [i.concept.id, i.state]));
  const levelOfConcept = new Map(items.map((i) => [i.concept.id, i.level]));
  const updatedIds = improvedTodayIds(items);
  const today = todaysTransitions(items);
  const recent = recentTransitions(data).filter((t) => conceptById.has(t.conceptId));

  // Resting until a concept is tapped; a deep link (?concept=) opens selected.
  const [selectedId, setSelectedId] = useState<string | null>(initialConceptId ?? null);
  const [tab, setTab] = useState<ViewTab>("map");
  const scrollRef = useRef<ScrollView>(null);
  const dock = useDockSpace();
  const scrolledToInspector = useRef(false);
  const selected = selectedId ? conceptById.get(selectedId) : undefined;
  const selectedState = selectedId ? stateOf.get(selectedId) : undefined;

  // For the voice agent: the open book is what "this" means here.
  useAgentScreen({
    screen: "mind",
    route: "/mind",
    title: selected ? selected.name : "Your Mind",
    ...(selected ? { focus: { kind: "concept" as const, id: selected.id, label: selected.name } } : {}),
    visible: selected
      ? [`Level: ${levelOfConcept.get(selected.id) ?? "unknown"}`, ...(selected.id === initialConceptId && initialTab === "sources" ? [SOURCES_TAB] : [])]
      : [`${items.length} books in the library`, `View: ${tab}`],
  });

  const select = (id: string | null) => setSelectedId(id);
  /** From a list: back to the map with the concept open. */
  const openOnMap = (id: string) => {
    setSelectedId(id);
    setTab("map");
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const related = (id: string): Concept[] => {
    const ids = new Set<string>();
    for (const e of data.edges) {
      if (e.fromConceptId === id) ids.add(e.toConceptId);
      else if (e.toConceptId === id) ids.add(e.fromConceptId);
    }
    return [...ids].map((x) => conceptById.get(x)).filter((c): c is Concept => !!c).slice(0, 6);
  };

  const totalSignals = items.reduce((n, i) => n + i.state.evidenceCount, 0);
  const sourceById = new Map(sources.map((x) => [x.id, x]));
  const touching = (id: string) => developments.filter((d) => d.conceptIds.includes(id));
  const sourcesFor = (id: string) => [...new Set(touching(id).flatMap((d) => d.sourceIds))].map((x) => sourceById.get(x)).filter((x): x is Source => !!x);
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  // The library: a pure projection of this response. Sources are counted per book, never shelved as books.
  const sourceCounts = new Map(concepts.map((c) => [c.id, sourcesFor(c.id).length]));
  // Concepts your agent retained a takeaway on (agent material; it never changes a book's evidence).
  const takeaways = useApi(() => (PLAYGROUND_AVAILABLE ? takeawaysApi.list().catch(() => []) : Promise.resolve([])), [], { refetchOnFocus: true });
  const agentMaterial = new Set((takeaways.data ?? []).map((t) => t.conceptId));
  const world = projectMindWorld(data, { selectedId, played: playedHighlights, sourceCounts, agentMaterial });

  return (
    <View style={{ flex: 1, backgroundColor: warm.ground }}>
      <AppTopBar
        title={selected ? selected.name : "Your Mind"}
        // A selected concept is an object you can put back; the tab itself has no back.
        onBack={selected ? () => select(null) : undefined}
        right={
          <>
            {PLAYGROUND_AVAILABLE ? <IconButton icon="people" accessibilityLabel="Learn together in the Playground" onPress={() => router.push("/playground")} /> : null}
            <IconButton icon="search" accessibilityLabel="Ask about your Mind" onPress={() => router.push("/ask")} />
          </>
        }
      />
    <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: space.x5 + dock }} showsVerticalScrollIndicator={false}>
      <Gutter>
        <SegmentedTabs
          variant="pill"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "map", label: "Library" },
            { key: "concepts", label: "Concepts" },
            { key: "changes", label: "Changes" },
          ]}
        />
      </Gutter>

      {tab === "map" ? (
        <>
          <View style={{ marginTop: space.m }}>
            <MindLibrary world={world} width={width} reduced={reduced} onSelect={select} />
          </View>
          <Gutter>
            <View style={{ marginTop: space.m, gap: space.s }}>
              {!selected ? <FocusLabel book={null} /> : null}
              {!selected ? <LibraryLegend /> : null}
              {selected && from ? <ArrivalNote from={from} /> : null}
            </View>
          </Gutter>
          {!selected ? (
            <Gutter>
              <MindOrientation recent={recent[0]} items={items} conceptById={conceptById} inBrief={new Set(developments.flatMap((d) => d.conceptIds))} onOpen={select} />
            </Gutter>
          ) : null}

          {/* Opened on a tab (e.g. "show me its sources"): bring the inspector into view once. */}
          <View
            onLayout={(e) => {
              if (!initialTab || scrolledToInspector.current) return;
              scrolledToInspector.current = true;
              scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: !reduced });
            }}
          >
          <Gutter>
            {selected && selectedState ? (
              <ConceptInspector
                key={selected.id}
                concept={selected}
                state={selectedState}
                level={levelOfConcept.get(selected.id) ?? "weak"}
                justImproved={updatedIds.has(selected.id)}
                transition={today.find((t) => t.conceptId === selected.id)}
                related={related(selected.id)}
                developments={touching(selected.id)}
                sources={sourcesFor(selected.id)}
                onSelectConcept={(id) => select(id)}
                onClose={() => select(null)}
                onExploreChanges={() => setTab("changes")}
                initialTab={selected.id === initialConceptId ? initialTab : undefined}
              />
            ) : (
              <>
                <MetricStrip
                  style={{ marginTop: space.xl }}
                  metrics={[
                    { value: String(concepts.length), label: "Concepts", sub: "in your Mind", onPress: () => setTab("concepts"), accessibilityLabel: `${concepts.length} concepts. See all.` },
                    {
                      value: String(recent.length),
                      label: "Changes",
                      sub: updatedIds.size ? `${updatedIds.size} today` : "recent",
                      accent: updatedIds.size > 0,
                      onPress: () => setTab("changes"),
                      accessibilityLabel: `${recent.length} recent changes. See them.`,
                    },
                    { value: String(totalSignals), label: "Signals", sub: "of evidence" },
                  ]}
                />
                {recent.length ? (
                  <>
                    <SectionHeader title="Recently changed" action={recent.length > 3 ? { label: "All", onPress: () => setTab("changes") } : undefined} />
                    <ChangeList transitions={recent.slice(0, 3)} conceptById={conceptById} updatedIds={updatedIds} onOpen={openOnMap} />
                  </>
                ) : null}
                <Footnote />
              </>
            )}
          </Gutter>
          </View>
        </>
      ) : null}

      {tab === "concepts" ? (
        <Gutter>
          {BANDS.map((band) => {
            const inBand = concepts
              .map((c) => ({ c, s: stateOf.get(c.id) }))
              .filter((x): x is { c: Concept; s: KnowledgeState } => !!x.s && levelOfConcept.get(x.c.id) === band)
              .sort((a, b) => b.s.mastery - a.s.mastery);
            if (!inBand.length) return null;
            return (
              <View key={band}>
                <SectionHeader title={levelLabel[band]} style={{ marginTop: space.xl }} />
                <ListCard>
                  {inBand.map(({ c, s }, i) => (
                    <Pressable
                      key={c.id}
                      onPress={() => openOnMap(c.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.name}. ${levelLabel[band]}, ${evidenceLabel(s.uncertainty)}.${updatedIds.has(c.id) ? " Stronger evidence today." : ""}`}
                      style={({ pressed }) => [
                        styles.conceptRow,
                        i < inBand.length - 1 && styles.rowDivided,
                        (pressed || c.id === selectedId) && { backgroundColor: color.surfaceMuted },
                      ]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
                        <T style={styles.conceptName} numberOfLines={1}>
                          {c.name}
                        </T>
                        {updatedIds.has(c.id) ? (
                          <View style={styles.signal}>
                            <View style={styles.dot} />
                            <T variant="meta" tone="coral">
                              Stronger evidence
                            </T>
                          </View>
                        ) : (
                          <T variant="meta" style={{ color: color.ink3 }}>
                            {evidenceLabel(s.uncertainty)}
                          </T>
                        )}
                        <Icon name="chevron" size={14} color={color.ink3} />
                      </View>
                      <View style={{ marginTop: space.s }}>
                        <MasteryBar mastery={s.mastery} uncertainty={s.uncertainty} highlight={updatedIds.has(c.id)} />
                      </View>
                    </Pressable>
                  ))}
                </ListCard>
              </View>
            );
          })}
          <Footnote />
        </Gutter>
      ) : null}

      {tab === "changes" ? (
        <Gutter>
          <SectionHeader title="Recently changed" style={{ marginTop: space.xl }} />
          {recent.length ? (
            <ChangeList transitions={recent} conceptById={conceptById} updatedIds={updatedIds} onOpen={openOnMap} />
          ) : (
            <T variant="support">Nothing has changed yet. Read a development or take a check, and it shows here.</T>
          )}
          <T variant="support" style={styles.footnote}>
            Each change is the engine&apos;s own reason for updating your model. Open one to see the full history.
          </T>
        </Gutter>
      ) : null}
    </ScrollView>
    </View>
  );
}

/**
 * The Mind at rest, before you tap anything: what changed recently, the one concept Thinketh is
 * least sure about (a stated rule, not a judgement), and how to read the map.
 */
function MindOrientation({
  recent,
  items,
  conceptById,
  inBrief,
  onOpen,
}: {
  recent: KnowledgeStateTransition | undefined;
  items: KnowledgeResponse["items"];
  conceptById: Map<string, Concept>;
  /** Concepts that today's developments touch: the relevant ones right now. */
  inBrief: Set<string>;
  onOpen: (conceptId: string) => void;
}) {
  // Worth strengthening, deterministic: among developing or weak concepts (not the one that just
  // changed), prefer those today's brief touches (relevant now), then the highest uncertainty,
  // then importance. The row says which rule picked it.
  const shaky = items
    .filter((i) => (i.level === "developing" || i.level === "weak") && i.concept.id !== recent?.conceptId)
    .sort(
      (a, b) =>
        Number(inBrief.has(b.concept.id)) - Number(inBrief.has(a.concept.id)) ||
        b.state.uncertainty - a.state.uncertainty ||
        b.concept.importance - a.concept.importance,
    )[0];
  const shakyWhy = shaky
    ? `${inBrief.has(shaky.concept.id) ? "In today's brief, and " : ""}Thinketh has only ${shaky.state.evidenceCount} ${shaky.state.evidenceCount === 1 ? "signal" : "signals"} for it (${evidenceLabel(shaky.state.uncertainty).toLowerCase()}). Tap to add evidence.`
    : "";
  const recentName = recent ? (conceptById.get(recent.conceptId)?.name ?? recent.conceptId) : undefined;
  return (
    <View style={styles.orient}>
      {recent && recentName ? (
        <Pressable onPress={() => onOpen(recent.conceptId)} accessibilityRole="button" accessibilityLabel={`Recently changed: ${recentName}. ${changeSentence(recent)} Open it.`} style={styles.orientRow}>
          <View style={[styles.legendDot, { backgroundColor: color.coral, borderColor: color.coral }]} />
          <View style={{ flex: 1 }}>
            <T variant="meta" style={{ color: color.ink3 }}>
              Recently changed · {relativeTime(recent.createdAt)}
            </T>
            <T style={styles.orientTitle} numberOfLines={1}>
              {recentName}
            </T>
            <T variant="support" numberOfLines={2}>
              {changeSentence(recent)}
            </T>
          </View>
          <Icon name="chevron" size={13} color={color.ink3} />
        </Pressable>
      ) : (
        <View style={styles.orientRow}>
          <T variant="support">Nothing has changed recently. Answer a check on Today to update your Mind.</T>
        </View>
      )}
      {shaky ? (
        <Pressable
          onPress={() => onOpen(shaky.concept.id)}
          accessibilityRole="button"
          accessibilityLabel={`Worth strengthening: ${shaky.concept.name}. ${shakyWhy}`}
          style={[styles.orientRow, styles.orientDivided]}
        >
          <BookGlyph evidence={EVIDENCE_OF[shaky.level]} uncertain={shaky.state.uncertainty > 0.35} size={16} />
          <View style={{ flex: 1 }}>
            <T variant="meta" style={{ color: color.ink3 }}>
              Worth strengthening
            </T>
            <T style={styles.orientTitle} numberOfLines={1}>
              {shaky.concept.name}
            </T>
            <T variant="support" numberOfLines={2}>
              {shakyWhy}
            </T>
          </View>
          <Icon name="chevron" size={13} color={color.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
}


function ChangeList({
  transitions,
  conceptById,
  updatedIds,
  onOpen,
}: {
  transitions: KnowledgeStateTransition[];
  conceptById: Map<string, Concept>;
  updatedIds: Set<string>;
  onOpen: (conceptId: string) => void;
}) {
  return (
    <ListCard>
      {transitions.map((t, i) => {
        const c = conceptById.get(t.conceptId);
        const name = c?.name ?? t.conceptId;
        const signal = isToday(t.createdAt) && updatedIds.has(t.conceptId);
        return (
          <InsightRow
            key={t.id}
            topic={{ conceptIds: [t.conceptId] }}
            category={signal ? "Stronger evidence" : direction(t)}
            signal={signal}
            title={name}
            summary={changeSentence(t)}
            meta={relativeTime(t.createdAt)}
            last={i === transitions.length - 1}
            onPress={() => onOpen(t.conceptId)}
            accessibilityLabel={`${name}. ${signal ? "Stronger evidence" : direction(t)}, ${relativeTime(t.createdAt)}. ${changeSentence(t)}`}
          />
        );
      })}
    </ListCard>
  );
}

function Footnote() {
  return (
    <T variant="support" style={styles.footnote}>
      This is an estimate built from evidence: what you read, what you tell Thinketh, and how you answer checks. Checks count far
      more than reading. Darker covers have more evidence, a dotted edge means few signals so far, and a coral bookmark marks
      what changed. Where you stand in the library only shows what you&apos;re looking at.
    </T>
  );
}

const styles = StyleSheet.create({
  arrival: { paddingVertical: space.s, paddingHorizontal: space.m, borderRadius: 12, backgroundColor: color.surfaceMuted },
  hint: { textAlign: "center", color: color.ink3, marginTop: -space.xs },
  orient: { marginTop: space.l, borderRadius: 20, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(22,22,22,0.05)", ...depth.card },
  orientRow: { flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, minHeight: 56 },
  orientDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  orientTitle: { fontFamily: font.sansSemibold, fontSize: 15.5, lineHeight: 20, letterSpacing: -0.2, color: color.ink, marginTop: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.l, paddingHorizontal: space.l, paddingVertical: space.m },
  legendDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: color.surfaceMuted },
  previewName: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, color: color.ink },
  previewFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.m,
    paddingTop: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  signal: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.coral },
  conceptRow: { paddingHorizontal: space.l, paddingVertical: space.m },
  rowDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  conceptName: { flex: 1, fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink },
  footnote: { marginTop: space.xxl, fontSize: 12.5, lineHeight: 18, color: color.ink3 },
});

/**
 * Where you came from, said plainly: why this book is open, and what can change it. Only claims what
 * the source screen actually did (a source adds information; only demonstrated understanding changes a book).
 */
function ArrivalNote({ from }: { from: string }) {
  const text: Record<string, string> = {
    ask: "Opened from Ask: Thinketh used this concept in its answer. Asking adds context; a check is what changes the book.",
    source: "Opened from a source: reading adds context, not evidence. Saying you got it counts a little, within a cap; a check provides stronger evidence.",
    check: "Opened from your check: the change and its reason are recorded below.",
    playground: "Opened from the Playground: your transfer answer was graded, and the recorded result is below.",
    today: "Opened from Today: the latest recorded change is below.",
    voice: "Opened from your conversation with Thinketh: talking adds context; a check is what changes this book.",
  };
  const t = text[from];
  if (!t) return null;
  return (
    <View style={styles.arrival}>
      <T variant="meta" style={{ color: color.ink2 }}>
        {t}
      </T>
    </View>
  );
}
