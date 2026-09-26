import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, Polyline } from "react-native-svg";
import type { Concept, Development, KnowledgeLevel, KnowledgeState, KnowledgeStateTransition, Source } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { MasteryBar } from "@/components/MindGraph";
import { ConceptChip, IconButton, InsightRow, Kicker, ListCard, SegmentedTabs, SignalPill, SourceCard } from "@/components/system";
import { imageFor } from "@/content/imagery";
import { T } from "@/components/Text";
import { agentMemoryStoryline } from "@/content/demo";
import { useApi } from "@/lib/hooks";
import { evidenceLabel, fmt2, levelLabel, misconceptionLabel, observationLabel, relativeTime, shortDate } from "@/lib/knowledge";
import { firstSentence } from "@/lib/briefText";
import { color, font, radius, space } from "@/theme/tokens";

// Storyboard 03 "Mind — Concept": the selected concept as an object inspector.
// Same data and actions as the old ConceptPanel/SelectedSheet, reorganised into tabs.

type InspectorTab = "overview" | "evidence" | "sources" | "related";

export function ConceptInspector({
  concept,
  state,
  level,
  justImproved,
  transition,
  related,
  developments = [],
  sources = [],
  onSelectConcept,
  onClose,
  onExploreChanges,
}: {
  concept: Concept;
  state: KnowledgeState;
  level: KnowledgeLevel;
  justImproved: boolean;
  /** Today's direct transition for this concept, if any. */
  transition: KnowledgeStateTransition | undefined;
  related: Concept[];
  /** Developments in today's brief that touch this concept (storyboard 03 "What's changed for you"). */
  developments?: Development[];
  /** The sources behind those developments. */
  sources?: Source[];
  onSelectConcept: (id: string) => void;
  onClose: () => void;
  onExploreChanges?: () => void;
}) {
  const [tab, setTab] = useState<InspectorTab>("overview");
  const { data, loading } = useApi(() => api.getConceptHistory(concept.id), [concept.id, state.evidenceCount]);
  const history = data?.transitions;
  const askQ = `Explain ${concept.name} based on what I already know.`;
  // Developing or weak: show a way to add evidence, not just a way to read about it.
  const thin = level === "developing" || level === "weak";

  return (
    <View>
      <View style={styles.headRow}>
        {justImproved ? <SignalPill label="Stronger evidence" /> : <Kicker>{concept.domain}</Kicker>}
        <IconButton icon="close" accessibilityLabel="Close concept" onPress={onClose} />
      </View>
      <T variant="display" accessibilityRole="header" style={{ marginTop: space.xs }}>
        {concept.name}
      </T>
      <T variant="support" style={{ marginTop: space.s, fontSize: 14, lineHeight: 20 }} numberOfLines={3}>
        {concept.description}
      </T>
      <View style={styles.levelLine}>
        {transition ? <View style={styles.dot} /> : null}
        <T variant="meta" tone={transition ? "coral" : undefined}>
          {levelLabel[level]} · {transition ? (justImproved ? "more evidence today" : "updated today") : evidenceLabel(state.uncertainty).toLowerCase()}
        </T>
      </View>

      <SegmentedTabs
        style={{ marginTop: space.l }}
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "evidence", label: "Evidence" },
          { key: "sources", label: "Sources" },
          { key: "related", label: "Related" },
        ]}
      />

      {tab === "overview" ? (
        <View style={{ marginTop: space.l }}>
          <T style={styles.h}>What&apos;s changed for you</T>
          {transition ? (
            <View style={styles.changeRow}>
              <View style={[styles.dot, { marginTop: 7 }]} />
              <View style={{ flex: 1 }}>
                <T variant="body" style={{ fontFamily: font.sansMedium }}>
                  {changeSentence(transition)}
                </T>
                <T variant="meta" style={{ color: color.ink3, marginTop: 2, fontVariant: ["tabular-nums"] }}>
                  {relativeTime(transition.createdAt)} · {direction(transition)}
                </T>
              </View>
            </View>
          ) : (
            <T variant="support" style={{ marginTop: space.xs }}>
              Nothing new today. {evidenceLabel(state.uncertainty)}, last seen {relativeTime(state.lastObservedAt).toLowerCase()}.
            </T>
          )}

          {developments.length ? (
            <>
              <T variant="support" style={{ marginTop: space.s }}>
                {developments.length} development{developments.length === 1 ? "" : "s"} {developments.length === 1 ? "touches" : "touch"} this in your brief.
              </T>
              <ListCard style={{ marginTop: space.m }}>
                {developments.slice(0, 3).map((d, i, arr) => (
                  <InsightRow
                    key={d.id}
                    thumb={imageFor(d.conceptIds)}
                    title={d.title}
                    meta={relativeTime(d.happenedAt)}
                    summary={`${d.sourceIds.length} source${d.sourceIds.length === 1 ? "" : "s"}`}
                    last={i === arr.length - 1}
                    onPress={() => router.push({ pathname: "/development/[id]", params: { id: d.id } })}
                  />
                ))}
              </ListCard>
            </>
          ) : null}
          {onExploreChanges ? (
            <Pressable onPress={onExploreChanges} accessibilityRole="button" style={({ pressed }) => [styles.softPill, pressed && { opacity: 0.7 }]}>
              <T variant="meta" style={{ color: color.ink }}>
                Explore all changes
              </T>
              <Icon name="arrow" size={13} color={color.ink} />
            </Pressable>
          ) : null}

          <View style={{ marginTop: space.l }}>
            <MasteryBar mastery={state.mastery} uncertainty={state.uncertainty} highlight={justImproved} />
          </View>

          <View style={{ marginTop: space.l }}>
            {thin ? (
              // Thin evidence: the next step is to add some. A check always exists for a concept; a
              // development in today's brief is offered first when one touches it (listed above).
              <View style={styles.strengthen}>
                <T style={styles.h}>Strengthen it</T>
                <T variant="support" style={{ marginTop: space.xs }}>
                  {developments.length
                    ? `Read the development above, then answer one question. Thinketh has ${state.evidenceCount} ${state.evidenceCount === 1 ? "signal" : "signals"} for this so far.`
                    : `Nothing in today's brief covers this, so Thinketh has only ${state.evidenceCount} ${state.evidenceCount === 1 ? "signal" : "signals"} from your reading and checks. One question adds evidence; Ask can explain it first.`}
                </T>
                <Pressable
                  onPress={() => router.push({ pathname: "/diagnostic", params: { conceptId: concept.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Check my understanding of ${concept.name}`}
                  style={({ pressed }) => [styles.primary, { marginTop: space.m }, pressed && { opacity: 0.85 }]}
                >
                  <T style={styles.primaryLabel}>Check my understanding</T>
                  <Icon name="arrow" size={15} color={color.onInk} />
                </Pressable>
              </View>
            ) : null}
            <Pressable
              onPress={() => router.push({ pathname: "/ask", params: { q: askQ } })}
              accessibilityRole="button"
              accessibilityLabel="Ask Thinketh"
              style={({ pressed }) => [thin ? styles.secondary : styles.primary, pressed && { opacity: 0.85 }]}
            >
              <T style={thin ? styles.secondaryLabel : styles.primaryLabel}>{thin ? "Ask Thinketh to explain it" : "Ask Thinketh"}</T>
              <Icon name="arrow" size={15} color={thin ? color.ink : color.onInk} />
            </Pressable>
            <LinkRow label="Why we think you know this · history" onPress={() => setTab("evidence")} />
            <StorylineLink conceptId={concept.id} />
          </View>
        </View>
      ) : null}

      {tab === "evidence" ? (
        <>
          <EvidenceTab state={state} level={level} justImproved={justImproved} />
        <View style={{ marginTop: space.xl }}>
          <T style={[styles.h, { marginBottom: space.s }]}>How it changed</T>
          {loading && !history ? (
            <T variant="support">Loading history…</T>
          ) : history && history.length ? (
            <History transitions={history} />
          ) : (
            <T variant="support">No recorded changes yet.</T>
          )}
          <LinkRow label="Ask Thinketh about this" onPress={() => router.push({ pathname: "/ask", params: { q: askQ } })} />
          <StorylineLink conceptId={concept.id} />
        </View>
        </>
      ) : null}

      {tab === "sources" ? (
        <View style={{ marginTop: space.l }}>
          <T style={[styles.h, { marginBottom: space.s }]}>Where the evidence comes from</T>
          {sources.length ? (
            <T variant="meta" style={{ color: color.ink3, marginBottom: space.s }}>
              {sources.length} {sources.length === 1 ? "source" : "sources"} from the {developments.length} {developments.length === 1 ? "development" : "developments"} in your brief that touch this concept.
            </T>
          ) : null}
          {sources.length ? (
            sources.map((src) => (
              <SourceCard
                key={src.id}
                title={src.title}
                meta={[src.publisher, src.sourceType, src.publishedAt ? shortDate(src.publishedAt) : undefined].filter(Boolean).join(" · ")}
                thumb={imageFor([concept.id])}
                onPress={src.url ? () => Linking.openURL(src.url!).catch(() => {}) : undefined}
              />
            ))
          ) : (
            <T variant="support">No sources in today&apos;s brief touch this concept yet. Its evidence comes from your reading and checks.</T>
          )}
        </View>
      ) : null}

      {tab === "related" ? (
        <View style={{ marginTop: space.l }}>
          <T style={[styles.h, { marginBottom: space.s }]}>Connected in your Mind</T>
          {related.length ? (
            <View style={styles.chips}>
              {related.map((c) => (
                <ConceptChip key={c.id} label={c.name} onPress={() => onSelectConcept(c.id)} />
              ))}
            </View>
          ) : (
            <T variant="support">No mapped connections yet.</T>
          )}
        </View>
      ) : null}
    </View>
  );
}

function EvidenceTab({ state, level, justImproved }: { state: KnowledgeState; level: KnowledgeLevel; justImproved: boolean }) {
  const [numbersOpen, setNumbersOpen] = useState(false);
  return (
    <View style={{ marginTop: space.l }}>
      <MasteryBar mastery={state.mastery} uncertainty={state.uncertainty} highlight={justImproved} />
      <View style={styles.stats}>
        <Stat label="Level" value={levelLabel[level]} />
        <Stat label="Evidence" value={`${state.evidenceCount} ${state.evidenceCount === 1 ? "signal" : "signals"}`} divided />
        <Stat label="Last seen" value={relativeTime(state.lastObservedAt)} divided />
      </View>
      <Pressable
        onPress={() => setNumbersOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: numbersOpen }}
        hitSlop={8}
        style={{ marginTop: space.m, alignSelf: "flex-start", minHeight: 32, justifyContent: "center" }}
      >
        <T variant="meta" style={{ fontVariant: ["tabular-nums"] }}>
          {numbersOpen ? `Mastery ${fmt2(state.mastery)} · uncertainty ${fmt2(state.uncertainty)} · confidence ${fmt2(state.confidence)}` : "See the numbers"}
        </T>
      </Pressable>
      {state.misconceptionFlags.length ? (
        <View style={styles.flag}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: space.xs }}>
            <View style={styles.dot} />
            <T variant="label" style={{ color: color.ink2 }}>
              Open confusion
            </T>
          </View>
          {state.misconceptionFlags.map((f) => (
            <T key={f} variant="support">
              {misconceptionLabel(f)}
            </T>
          ))}
        </View>
      ) : null}
      <T variant="support" style={{ marginTop: space.l, fontSize: 12.5, lineHeight: 18, color: color.ink3 }}>
        Built from what you read, what you tell Thinketh, and how you answer checks. Checks count far more than reading.
      </T>
    </View>
  );
}

function StorylineLink({ conceptId }: { conceptId: string }) {
  if (conceptId !== agentMemoryStoryline.conceptId) return null;
  return (
    <LinkRow
      label="See how this idea changed in the world"
      onPress={() => router.push({ pathname: "/storyline/[id]", params: { id: agentMemoryStoryline.id } })}
    />
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      <T variant="meta" style={{ color: color.ink, flex: 1 }}>
        {label}
      </T>
      <Icon name="chevron" size={14} color={color.ink3} />
    </Pressable>
  );
}

function History({ transitions }: { transitions: KnowledgeStateTransition[] }) {
  const points = [transitions[0].before.mastery, ...transitions.map((t) => t.after.mastery)];
  const [w, setW] = useState(0);
  const h = 52;
  const pad = 5;
  const xy = points.map((m, i) => [pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2), pad + (1 - m) * (h - pad * 2)]);
  const latest = [...transitions].reverse();

  return (
    <View>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{ height: h }}
        accessible
        accessibilityLabel={`Mastery over time: ${points.map(fmt2).join(", ")}`}
      >
        {w > 0 ? (
          <Svg width={w} height={h}>
            <Polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" stroke={color.ink2} strokeWidth={1.25} />
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
              <T variant="meta" style={{ color: color.ink, fontFamily: font.sansSemibold }}>
                {observationLabel[t.observation.kind]}
              </T>
              <T variant="meta" style={{ color: color.ink3, fontVariant: ["tabular-nums"] }}>
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

function Stat({ label, value, divided }: { label: string; value: string; divided?: boolean }) {
  return (
    <View style={[{ flex: 1 }, divided && styles.statDivided]}>
      <T variant="body" style={{ fontFamily: font.sansSemibold, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
        {value}
      </T>
      <T style={styles.statLabel}>{label}</T>
    </View>
  );
}

/** The engine's own reason, told as what changed (no invented claims). */
export function changeSentence(t: KnowledgeStateTransition): string {
  const first = firstSentence(t.reason);
  return first.replace(/^Updated because you /, "You ").replace(/^Updated because /, "");
}

/** A change in words; the engine's reason below it carries the numbers. */
export function direction(t: KnowledgeStateTransition): string {
  const d = t.after.mastery - t.before.mastery;
  if (d > 0.005) return "Stronger";
  if (d < -0.005) return "Weaker";
  return t.after.uncertainty < t.before.uncertainty - 0.005 ? "More certain" : "Unchanged";
}

const styles = StyleSheet.create({
  softPill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, marginTop: space.m, paddingHorizontal: space.m, minHeight: 36, borderRadius: radius.pill, backgroundColor: color.surfaceMuted },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginRight: -space.s, minHeight: 44 },
  levelLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.s },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.coral },
  h: { fontFamily: font.sansSemibold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, color: color.ink },
  changeRow: { flexDirection: "row", gap: space.s, marginTop: space.s },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s, marginTop: space.s },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s,
    minHeight: 48,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    marginBottom: space.xs,
  },
  primaryLabel: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, color: color.onInk },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s,
    minHeight: 48,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    backgroundColor: color.canvas,
    marginTop: space.s,
    marginBottom: space.xs,
  },
  secondaryLabel: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, color: color.ink },
  strengthen: { marginBottom: space.xs },
  link: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  stats: { flexDirection: "row", marginTop: space.l },
  statDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.hairline, paddingLeft: space.m },
  statLabel: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 0.9, textTransform: "uppercase", color: color.ink2, marginTop: 2 },
  flag: { marginTop: space.m, padding: space.m, backgroundColor: color.surfaceMuted, borderRadius: 12 },
  historyRow: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
});
