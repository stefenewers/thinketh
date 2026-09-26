import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";
import type { Concept, ConceptEdge, KnowledgeState } from "@thinketh/contracts";
import { color, font, space } from "@/theme/tokens";
import { T } from "./Text";

const W = 100;
const H = 66;

// Curated fixed layout for the demo concepts (design spec: no force simulation).
const LAYOUT: Record<string, [number, number]> = {
  "agent-memory": [50, 31],
  "long-running-agents": [71, 21],
  "context-windows": [30, 16],
  retrieval: [26, 42],
  "agent-tool-use": [67, 44],
  mcp: [86, 54],
  "evaluator-architectures": [87, 9],
  "reasoning-models": [53, 8],
  "multimodal-reasoning": [16, 58],
  "computer-use": [45, 57],
};

function positionFor(id: string, index: number, total: number): [number, number] {
  if (LAYOUT[id]) return LAYOUT[id];
  const a = (index / Math.max(total, 1)) * Math.PI * 2;
  return [W / 2 + Math.cos(a) * 36, H / 2 + Math.sin(a) * 24];
}

export function nodeFill(mastery: number) {
  if (mastery >= 0.7) return color.ink;
  if (mastery >= 0.5) return "#6F6963";
  if (mastery >= 0.3) return "#B3ACA4";
  return color.panel;
}

type Props = {
  concepts: Concept[];
  states: KnowledgeState[];
  edges: ConceptEdge[];
  selectedId: string | null;
  updatedIds: Set<string>;
  onSelect: (id: string) => void;
};

export function MindGraph({ concepts, states, edges, selectedId, updatedIds, onSelect }: Props) {
  const pos = new Map(concepts.map((c, i) => [c.id, positionFor(c.id, i, concepts.length)]));
  const stateOf = new Map(states.map((s) => [s.conceptId, s]));
  const neighbors = new Set(
    edges.flatMap((e) =>
      e.fromConceptId === selectedId ? [e.toConceptId] : e.toConceptId === selectedId ? [e.fromConceptId] : [],
    ),
  );
  const labelled = (id: string) => id === selectedId || updatedIds.has(id) || neighbors.has(id);
  const evidenced = (id: string) => (stateOf.get(id)?.uncertainty ?? 1) < 0.35;

  return (
    <View>
      <View style={{ aspectRatio: W / H }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          {edges.map((e) => {
            const a = pos.get(e.fromConceptId);
            const b = pos.get(e.toConceptId);
            if (!a || !b) return null;
            const touchesSelected = e.fromConceptId === selectedId || e.toConceptId === selectedId;
            const touchesUpdated = updatedIds.has(e.fromConceptId) || updatedIds.has(e.toConceptId);
            const solid = evidenced(e.fromConceptId) && evidenced(e.toConceptId);
            return (
              <Line
                key={`${e.fromConceptId}-${e.toConceptId}`}
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke={touchesUpdated && touchesSelected ? color.coral : touchesSelected ? color.ink2 : color.edge}
                strokeWidth={0.25 + e.weight * 0.35}
                strokeDasharray={solid ? undefined : "1 1"}
              />
            );
          })}
          {concepts.map((c) => {
            const p = pos.get(c.id)!;
            const s = stateOf.get(c.id);
            const r = 1.6 + c.importance * 1.6;
            const selected = c.id === selectedId;
            const updated = updatedIds.has(c.id);
            const labelBelow = p[1] < 50;
            return (
              <G key={c.id} onPress={() => onSelect(c.id)}>
                {updated ? <Circle cx={p[0]} cy={p[1]} r={r + 1.6} fill="none" stroke={color.coral} strokeWidth={0.5} /> : null}
                {selected ? <Circle cx={p[0]} cy={p[1]} r={r + (updated ? 2.8 : 1.4)} fill="none" stroke={color.ink} strokeWidth={0.35} /> : null}
                <Circle
                  cx={p[0]}
                  cy={p[1]}
                  r={r}
                  fill={updated ? color.coral : nodeFill(s?.mastery ?? 0)}
                  stroke={color.ink3}
                  strokeWidth={(s?.mastery ?? 0) < 0.3 && !updated ? 0.35 : 0}
                />
                {/* Generous invisible hit target. */}
                <Circle cx={p[0]} cy={p[1]} r={6} fill="transparent" />
                {labelled(c.id) ? (
                  <SvgText
                    x={p[0]}
                    y={labelBelow ? p[1] + r + 4 : p[1] - r - 2}
                    fontSize={3}
                    fontFamily={selected ? font.sansSemibold : font.sansMedium}
                    fill={selected ? color.ink : color.ink2}
                    textAnchor="middle"
                  >
                    {c.name}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      </View>
      <View style={styles.legend}>
        <Legend swatch={color.ink} label="Strong" />
        <Legend swatch="#B3ACA4" label="Developing" />
        <Legend swatch={color.coral} label="Updated today" />
        <Legend dashed label="Little evidence" />
      </View>
    </View>
  );
}

function Legend({ swatch, label, dashed }: { swatch?: string; label: string; dashed?: boolean }) {
  return (
    <View style={styles.legendItem}>
      {dashed ? (
        <View style={styles.dash} />
      ) : (
        <View style={[styles.dot, { backgroundColor: swatch }]} />
      )}
      <T variant="meta" style={{ fontSize: 12 }}>
        {label}
      </T>
    </View>
  );
}

// Mastery as a filled bar, uncertainty as the soft band around its edge.
export function MasteryBar({ mastery, uncertainty, highlight }: { mastery: number; uncertainty: number; highlight?: boolean }) {
  const lo = Math.max(0, mastery - uncertainty / 2);
  const hi = Math.min(1, mastery + uncertainty / 2);
  return (
    <View style={styles.bar}>
      <View style={[styles.band, { left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }]} />
      <View style={[styles.barFill, { width: `${mastery * 100}%`, backgroundColor: highlight ? color.coral : color.ink }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.l, marginTop: space.m },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: color.ink3 },
  dash: { width: 14, borderTopWidth: 1, borderStyle: "dashed", borderColor: color.ink2 },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.fog, overflow: "hidden" },
  band: { position: "absolute", top: 0, bottom: 0, backgroundColor: color.edge },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 3 },
});
