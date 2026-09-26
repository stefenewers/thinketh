import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Circle, Polyline } from "react-native-svg";
import type { Concept, KnowledgeLevel, KnowledgeResponse, KnowledgeState, KnowledgeStateTransition } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { MasteryBar } from "@/components/MindGraph";
import { layoutMind } from "@thinketh/mindprint";
import { MindCanvas } from "@/mindprint/MindCanvas";
import { Mindprint } from "@/mindprint/Mindprint";
import { layoutEdges, nodesFromKnowledge } from "@/mindprint/model";
import { T } from "@/components/Text";
import { BackBar, Button, Divider, ErrorState, Gutter, LoadingState, SectionLabel } from "@/components/ui";
import { agentMemoryStoryline } from "@/content/demo";
import { useApi } from "@/lib/hooks";
import { evidenceLabel, fmt2, improved, improvedTodayIds, levelLabel, misconceptionLabel, observationLabel, relativeTime, shortDate, todaysTransitions } from "@/lib/knowledge";
import { color, font, gutter, layout, radius, shadow, space } from "@/theme/tokens";

export default function MindScreen() {
  const { concept } = useLocalSearchParams<{ concept?: string }>();
  const { data, error, loading, reload } = useApi(() => api.getKnowledge(), [], { refetchOnFocus: true });

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <BackBar onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      {loading && !data ? (
        <LoadingState message="Loading your knowledge state…" />
      ) : error || !data ? (
        <ErrorState onRetry={reload} />
      ) : (
        <Mind data={data} initialConceptId={concept} />
      )}
    </View>
  );
}

const BANDS: KnowledgeLevel[] = ["strong", "intermediate", "developing", "weak"];

function Mind({ data, initialConceptId }: { data: KnowledgeResponse; initialConceptId?: string }) {
  const { items } = data;
  const concepts = items.map((i) => i.concept);
  const states = items.map((i) => i.state);
  const levelOfConcept = new Map(items.map((i) => [i.concept.id, i.level]));
  const updatedIds = improvedTodayIds(items);
  const changedToday = todaysTransitions(items).find(improved);
  // Resting (Figma 1:6) until a concept is tapped (1:34); a deep link opens selected.
  const [selectedId, setSelectedId] = useState<string | null>(initialConceptId ?? null);
  const [detailY, setDetailY] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const stateOf = new Map(states.map((s) => [s.conceptId, s]));
  const selected = concepts.find((c) => c.id === selectedId);
  const selectedState = selectedId ? stateOf.get(selectedId) : undefined;
  const panelId = selectedId ?? changedToday?.conceptId ?? concepts[0]?.id;
  const panelConcept = concepts.find((c) => c.id === panelId);
  const panelState = panelId ? stateOf.get(panelId) : undefined;

  const select = (id: string | null, scroll = false) => {
    setSelectedId(id);
    if (scroll) scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: space.x4 }} showsVerticalScrollIndicator={false}>
      <Gutter>
        <T variant="editorial" accessibilityRole="header">
          Your Mind
        </T>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xs }}>
          <T variant="support">A living map of what you understand.</T>
          <Pressable onPress={() => router.push("/playground")} accessibilityRole="button" accessibilityLabel="Learn together in the Playground" hitSlop={10} style={{ minHeight: 44, justifyContent: "center" }}>
            <T variant="meta" style={{ color: color.ink }}>
              Learn together
            </T>
          </Pressable>
        </View>
      </Gutter>

      <MindMap items={items} edges={data.edges} changedIds={updatedIds} selectedId={selectedId} onSelect={(id) => select(id)} />

      <Gutter>
        {selected && selectedState ? (
          <SelectedSheet
            concept={selected}
            state={selectedState}
            level={levelOfConcept.get(selected.id) ?? "weak"}
            transition={todaysTransitions(items).find((t) => t.conceptId === selected.id)}
            onMore={() => scrollRef.current?.scrollTo({ y: detailY, animated: true })}
          />
        ) : changedToday ? (
          <ChangedCard transition={changedToday} name={concepts.find((c) => c.id === changedToday.conceptId)?.name ?? ""} onPress={() => select(changedToday.conceptId)} />
        ) : (
          <T variant="meta" style={styles.hint}>
            Pinch to explore · tap a concept
          </T>
        )}
      </Gutter>

      {panelConcept && panelState ? (
        <Gutter style={{ marginTop: layout.sectionGap }}>
          <View onLayout={(e) => setDetailY(e.nativeEvent.layout.y)}>
            <ConceptPanel
              concept={panelConcept}
              state={panelState}
              level={levelOfConcept.get(panelConcept.id) ?? "weak"}
              justImproved={updatedIds.has(panelConcept.id)}
            />
          </View>
        </Gutter>
      ) : null}

      <View style={{ marginTop: layout.sectionGap }}>
        {BANDS.map((band) => {
          const inBand = concepts
            .map((c) => ({ c, s: stateOf.get(c.id) }))
            .filter((x): x is { c: Concept; s: KnowledgeState } => !!x.s && levelOfConcept.get(x.c.id) === band)
            .sort((a, b) => b.s.mastery - a.s.mastery);
          if (!inBand.length) return null;
          return (
            <View key={band} style={{ marginBottom: space.l }}>
              <Gutter>
                <SectionLabel>{levelLabel[band]}</SectionLabel>
              </Gutter>
              <Divider />
              {inBand.map(({ c, s }) => (
                <Pressable
                  key={c.id}
                  onPress={() => select(c.id, true)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}. ${levelLabel[band]}, ${evidenceLabel(s.uncertainty)}.${updatedIds.has(c.id) ? " Just improved." : ""}`}
                  style={({ pressed }) => [styles.conceptRow, (pressed || c.id === selectedId) && { backgroundColor: color.fog }]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
                    <T variant="body" style={{ fontFamily: font.sansMedium, flex: 1 }}>
                      {c.name}
                    </T>
                    {updatedIds.has(c.id) ? (
                      <T variant="meta" tone="coral">
                        Just improved
                      </T>
                    ) : (
                      <T variant="meta">{evidenceLabel(s.uncertainty)}</T>
                    )}
                  </View>
                  <View style={{ marginTop: 6 }}>
                    <MasteryBar mastery={s.mastery} uncertainty={s.uncertainty} highlight={updatedIds.has(c.id)} />
                  </View>
                </Pressable>
              ))}
            </View>
          );
        })}
      </View>

      <Gutter>
        <T variant="support" style={{ fontSize: 13, lineHeight: 19 }}>
          This is an estimate built from evidence: what you read, what you tell Thinketh, and how you answer checks. Checks count
          far more than reading. Filled concepts have strong evidence, hollow ones are still developing, and coral marks what changed.
        </T>
      </Gutter>
    </ScrollView>
  );
}

/** The Mindprint: semantic layout, pan and pinch, tap a concept. */
function MindMap({
  items,
  edges,
  changedIds,
  selectedId,
  onSelect,
}: {
  items: KnowledgeResponse["items"];
  edges: KnowledgeResponse["edges"];
  changedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { width } = useWindowDimensions();
  const height = Math.min(380, Math.round(width * 0.88));
  const [lod, setLod] = useState<"overview" | "normal">("normal");
  const nodes = useMemo(() => nodesFromKnowledge(items, changedIds), [items, changedIds]);
  const layout = useMemo(
    () =>
      layoutMind(nodes, layoutEdges(edges), { x: 14, y: 0, w: width - 28, h: height }, {
        focusId: selectedId,
        lod: selectedId ? "focus" : lod,
        changedIds: [...changedIds],
      }),
    [nodes, edges, width, height, selectedId, lod, changedIds],
  );
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  return (
    <View style={{ marginTop: space.s }} accessible accessibilityLabel={`Map of ${nodes.length} concepts. Filled: strong evidence. Hollow: developing.`}>
      <MindCanvas
        width={width}
        height={height}
        hits={layout.nodes}
        onTapNode={(id) => onSelect(id === selectedId ? null : id)}
        onTapEmpty={() => onSelect(null)}
        onZoomSettled={(sc) => setLod(sc < 0.95 ? "overview" : "normal")}
      >
        <Mindprint width={width} height={height} regions={[{ layout, nodes: byId, focusId: selectedId, dim: !!selectedId, stubs: true }]} />
      </MindCanvas>
    </View>
  );
}

/** Figma 1:6: what changed today, in a sentence you can check. */
function ChangedCard({ transition, name, onPress }: { transition: KnowledgeStateTransition; name: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Opens this concept" style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <T variant="meta" tone="coral">
        {name} changed today
      </T>
      <T variant="body" style={{ marginTop: space.xs, fontFamily: font.sansMedium, fontSize: 16 }}>
        {changeSentence(transition)}
      </T>
      <View style={styles.pill}>
        <T variant="meta" style={{ color: color.onInk }}>
          Explore this concept
        </T>
      </View>
    </Pressable>
  );
}

/** Figma 1:34: the selected concept, what changed, one clear next step. */
function SelectedSheet({
  concept,
  state,
  level,
  transition,
  onMore,
}: {
  concept: Concept;
  state: KnowledgeState;
  level: KnowledgeLevel;
  transition: KnowledgeStateTransition | undefined;
  onMore: () => void;
}) {
  return (
    <View style={styles.card}>
      <T variant="title">{concept.name}</T>
      <T variant="meta" tone={transition ? "coral" : undefined} style={{ marginTop: space.xs }}>
        {levelLabel[level]} · {transition ? "evidence strengthened today" : evidenceLabel(state.uncertainty).toLowerCase()}
      </T>
      <Divider style={{ marginVertical: space.m }} />
      <T variant="label">{transition ? "What changed" : "What it is"}</T>
      <T variant="body" style={{ marginTop: space.xs }}>
        {transition ? changeSentence(transition) : concept.description}
      </T>
      <Button
        label="Ask Thinketh"
        style={{ marginTop: space.l, alignSelf: "flex-start" }}
        onPress={() => router.push({ pathname: "/ask", params: { q: `Explain ${concept.name} based on what I already know.` } })}
      />
      <Pressable onPress={onMore} accessibilityRole="button" hitSlop={8} style={{ marginTop: space.xs, alignSelf: "flex-start", minHeight: 44, justifyContent: "center" }}>
        <T variant="meta">History · sources · related concepts</T>
      </Pressable>
    </View>
  );
}

/** The engine's own reason, told as what changed (no invented claims). */
function changeSentence(t: KnowledgeStateTransition): string {
  const first = t.reason.split(/(?<=\.)\s/)[0] ?? t.reason;
  return first.replace(/^Updated because you /, "You ").replace(/^Updated because /, "");
}

function ConceptPanel({
  concept,
  state,
  level,
  justImproved,
}: {
  concept: Concept;
  state: KnowledgeState;
  level: KnowledgeLevel;
  justImproved: boolean;
}) {
  const { data, loading } = useApi(() => api.getConceptHistory(concept.id), [concept.id, state.evidenceCount]);
  const history = data?.transitions;
  const [numbersOpen, setNumbersOpen] = useState(false);

  return (
    <View style={styles.panel}>
      <T variant="label" tone={justImproved ? "coral" : undefined}>
        {justImproved ? "Just improved" : concept.domain}
      </T>
      <T variant="title" style={{ marginTop: space.xs }}>
        {concept.name}
      </T>
      <T variant="support" style={{ marginTop: space.xs }}>
        {levelLabel[level]} · {evidenceLabel(state.uncertainty).toLowerCase()}
      </T>
      <View style={{ marginTop: space.m }}>
        <MasteryBar mastery={state.mastery} uncertainty={state.uncertainty} highlight={justImproved} />
      </View>
      <View style={styles.stats}>
        <Stat label="Level" value={levelLabel[level]} />
        <Stat label="Evidence" value={`${state.evidenceCount} ${state.evidenceCount === 1 ? "signal" : "signals"}`} />
        <Stat label="Last seen" value={relativeTime(state.lastObservedAt)} />
      </View>
      <Pressable onPress={() => setNumbersOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: numbersOpen }} hitSlop={8} style={{ marginTop: space.s, alignSelf: "flex-start" }}>
        <T variant="meta">
          {numbersOpen ? `Mastery ${fmt2(state.mastery)} · uncertainty ${fmt2(state.uncertainty)} · confidence ${fmt2(state.confidence)}` : "See the numbers"}
        </T>
      </Pressable>
      <T variant="body" style={{ marginTop: space.m, color: color.ink2 }}>
        {concept.description}
      </T>
      {state.misconceptionFlags.length ? (
        <View style={styles.flag}>
          <T variant="label" style={{ marginBottom: space.xs }}>
            Open confusion
          </T>
          {state.misconceptionFlags.map((f) => (
            <T key={f} variant="support">
              {misconceptionLabel(f)}
            </T>
          ))}
        </View>
      ) : null}

      <T variant="label" style={{ marginTop: space.l, marginBottom: space.s }}>
        How it changed
      </T>
      {loading && !history ? (
        <T variant="support">Loading history…</T>
      ) : history && history.length ? (
        <History transitions={history} />
      ) : (
        <T variant="support">No recorded changes yet.</T>
      )}

      <Pressable
        onPress={() => router.push({ pathname: "/ask", params: { q: `Explain ${concept.name} based on what I already know.` } })}
        accessibilityRole="button"
        style={styles.askLink}
      >
        <T variant="meta" style={{ color: color.ink }}>
          Ask Thinketh about this
        </T>
        <Icon name="arrow" size={14} color={color.ink} />
      </Pressable>
      {concept.id === agentMemoryStoryline.conceptId ? (
        <Pressable
          onPress={() => router.push({ pathname: "/storyline/[id]", params: { id: agentMemoryStoryline.id } })}
          accessibilityRole="button"
          style={styles.askLink}
        >
          <T variant="meta" style={{ color: color.ink }}>
            See how this idea changed in the world
          </T>
          <Icon name="arrow" size={14} color={color.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

function History({ transitions }: { transitions: KnowledgeStateTransition[] }) {
  const points = [transitions[0].before.mastery, ...transitions.map((t) => t.after.mastery)];
  const [w, setW] = useState(0);
  const h = 44;
  const pad = 4;
  const xy = points.map((m, i) => [
    pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2),
    pad + (1 - m) * (h - pad * 2),
  ]);
  const latest = [...transitions].reverse();

  return (
    <View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: h }} accessible accessibilityLabel={`Mastery over time: ${points.map(fmt2).join(", ")}`}>
        {w > 0 ? (
          <Svg width={w} height={h}>
            <Polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" stroke={color.ink2} strokeWidth={1.5} />
            {xy.map(([x, y], i) => (
              <Circle key={i} cx={x} cy={y} r={i === xy.length - 1 ? 3.5 : 2} fill={i === xy.length - 1 ? color.coral : color.ink2} />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={{ marginTop: space.s }}>
        {latest.slice(0, 4).map((t) => (
          <View key={t.id} style={styles.historyRow}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.m }}>
              <T variant="meta" style={{ color: color.ink }}>
                {observationLabel[t.observation.kind]}
              </T>
              <T variant="meta" style={{ fontVariant: ["tabular-nums"] }}>
                {shortDate(t.createdAt)} · {direction(t)}
              </T>
            </View>
            <T variant="support" style={{ marginTop: 2 }}>
              {t.reason}
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: "22%" }}>
      <T variant="meta" style={{ color: color.ink3 }}>
        {label}
      </T>
      <T variant="body" style={{ fontFamily: font.sansSemibold, fontVariant: ["tabular-nums"], marginTop: 2 }}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.surface,
    padding: layout.cardPad,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
    ...shadow.raised,
  },
  hint: { textAlign: "center", color: color.ink3, marginTop: -space.xs },
  pill: { alignSelf: "flex-start", marginTop: space.m, backgroundColor: color.ink, borderRadius: radius.pill, paddingHorizontal: space.l, paddingVertical: space.s + 2 },
  panel: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.surface,
    padding: layout.cardPad,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
    ...shadow.raised,
  },
  stats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.s, marginTop: space.m },
  flag: { marginTop: space.m, padding: space.m, backgroundColor: color.surfaceMuted, borderRadius: radius.control },
  historyRow: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.lineSoft },
  askLink: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginTop: space.xs },
  conceptRow: {
    paddingHorizontal: gutter,
    paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.edge,
  },
});


/** A change in words; the engine's reason below it carries the numbers. */
function direction(t: KnowledgeStateTransition): string {
  const d = t.after.mastery - t.before.mastery;
  if (d > 0.005) return "Stronger";
  if (d < -0.005) return "Weaker";
  return t.after.uncertainty < t.before.uncertainty - 0.005 ? "More certain" : "Unchanged";
}
