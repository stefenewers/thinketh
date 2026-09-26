import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Circle, Polyline } from "react-native-svg";
import type { Concept, KnowledgeLevel, KnowledgeResponse, KnowledgeState, KnowledgeStateTransition } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { MasteryBar, MindGraph } from "@/components/MindGraph";
import { T } from "@/components/Text";
import { BackBar, Divider, ErrorState, Gutter, LoadingState, SectionLabel } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import {
  evidenceLabel,
  fmt2,
  improved,
  improvedTodayIds,
  levelLabel,
  observationLabel,
  relativeTime,
  shortDate,
  todaysTransitions,
} from "@/lib/knowledge";
import { color, font, radius, space } from "@/theme/tokens";

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
  const { items, edges } = data;
  const concepts = items.map((i) => i.concept);
  const states = items.map((i) => i.state);
  const levelOfConcept = new Map(items.map((i) => [i.concept.id, i.level]));
  const updatedIds = improvedTodayIds(items);
  const [selectedId, setSelectedId] = useState<string>(
    initialConceptId ?? todaysTransitions(items).find(improved)?.conceptId ?? concepts[0]?.id,
  );
  const scrollRef = useRef<ScrollView>(null);
  const stateOf = new Map(states.map((s) => [s.conceptId, s]));
  const selected = concepts.find((c) => c.id === selectedId);
  const selectedState = selectedId ? stateOf.get(selectedId) : undefined;

  const select = (id: string, scroll = false) => {
    setSelectedId(id);
    if (scroll) scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: space.x5 }} showsVerticalScrollIndicator={false}>
      <Gutter>
        <T variant="display" accessibilityRole="header">
          Your Mind
        </T>
        <T variant="support" style={{ marginTop: space.s }}>
          Thinketh&apos;s current model of what you understand, and how it&apos;s changing.
        </T>
        <View style={{ marginTop: space.xl }}>
          <MindGraph
            concepts={concepts}
            states={states}
            edges={edges}
            selectedId={selectedId}
            updatedIds={updatedIds}
            onSelect={(id) => select(id)}
          />
        </View>
      </Gutter>

      {selected && selectedState ? (
        <Gutter style={{ marginTop: space.xl }}>
          <ConceptPanel
            concept={selected}
            state={selectedState}
            level={levelOfConcept.get(selected.id) ?? "weak"}
            justImproved={updatedIds.has(selected.id)}
          />
        </Gutter>
      ) : null}

      <View style={{ marginTop: space.x3 }}>
        {BANDS.map((band) => {
          const inBand = concepts
            .map((c) => ({ c, s: stateOf.get(c.id) }))
            .filter((x): x is { c: Concept; s: KnowledgeState } => !!x.s && levelOfConcept.get(x.c.id) === band)
            .sort((a, b) => b.s.mastery - a.s.mastery);
          if (!inBand.length) return null;
          return (
            <View key={band} style={{ marginBottom: space.xl }}>
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
                  <View style={{ marginTop: space.s }}>
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
          far more than reading. The bar shows mastery; the soft band around it shows how unsure Thinketh still is.
        </T>
      </Gutter>
    </ScrollView>
  );
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

  return (
    <View style={styles.panel}>
      <T variant="label" tone={justImproved ? "coral" : undefined}>
        {justImproved ? "Just improved" : concept.domain}
      </T>
      <T variant="title" style={{ marginTop: space.s }}>
        {concept.name}
      </T>
      <T variant="support" style={{ marginTop: space.xs }}>
        {levelLabel[level]} · {evidenceLabel(state.uncertainty).toLowerCase()}
      </T>
      <View style={{ marginTop: space.l }}>
        <MasteryBar mastery={state.mastery} uncertainty={state.uncertainty} highlight={justImproved} />
      </View>
      <View style={styles.stats}>
        <Stat label="Mastery" value={fmt2(state.mastery)} />
        <Stat label="Uncertainty" value={fmt2(state.uncertainty)} />
        <Stat label="Evidence" value={String(state.evidenceCount)} />
        <Stat label="Last seen" value={relativeTime(state.lastObservedAt)} />
      </View>
      <T variant="body" style={{ marginTop: space.l, color: color.ink2 }}>
        {concept.description}
      </T>
      {state.misconceptionFlags.length ? (
        <View style={styles.flag}>
          <T variant="label" style={{ marginBottom: space.xs }}>
            Open confusion
          </T>
          {state.misconceptionFlags.map((f) => (
            <T key={f} variant="support">
              {f}
            </T>
          ))}
        </View>
      ) : null}

      <T variant="label" style={{ marginTop: space.xl, marginBottom: space.m }}>
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
      <View style={{ marginTop: space.m }}>
        {latest.slice(0, 4).map((t) => (
          <View key={t.id} style={styles.historyRow}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.m }}>
              <T variant="meta" style={{ color: color.ink }}>
                {observationLabel[t.observation.kind]}
              </T>
              <T variant="meta" style={{ fontVariant: ["tabular-nums"] }}>
                {shortDate(t.createdAt)} · {fmt2(t.before.mastery)} → {fmt2(t.after.mastery)}
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
      <T variant="meta" style={{ fontSize: 12 }}>
        {label}
      </T>
      <T variant="body" style={{ fontFamily: font.sansSemibold, fontVariant: ["tabular-nums"], marginTop: 2 }}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.panel,
    borderRadius: radius.surface,
    padding: space.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
  },
  stats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.m, marginTop: space.l },
  flag: { marginTop: space.l, padding: space.m, backgroundColor: color.fog, borderRadius: radius.control },
  historyRow: { paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
  askLink: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginTop: space.m },
  conceptRow: {
    paddingHorizontal: space.xl,
    paddingVertical: space.l,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.edge,
  },
});

