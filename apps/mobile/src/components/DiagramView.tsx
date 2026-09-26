import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Marker, Path } from "react-native-svg";
import type { DiagramSpec } from "@thinketh/contracts";
import { color, font, radius, space } from "@/theme/tokens";
import { T } from "./Text";

const NODE_H = 56;
const GAP = 40;
const HEADER = 28;

type Box = { x: number; y: number; w: number; h: number; col: "before" | "after" | "shared" };

// Deterministic before-vs-after layout for a DiagramSpec. Shared nodes sit on
// top; the old mental model on the left, the new one on the right.
export function DiagramView({ spec }: { spec: DiagramSpec }) {
  const [width, setWidth] = useState(0);
  const shared = spec.nodes.filter((n) => n.group === "shared");
  const before = spec.nodes.filter((n) => n.group === "before" || !n.group);
  const after = spec.nodes.filter((n) => n.group === "after");

  const boxes = new Map<string, Box>();
  const colW = (width - space.l) / 2;
  const sharedH = shared.length ? NODE_H + GAP : 0;
  if (width > 0) {
    const sw = Math.min(colW, (width - space.m * (shared.length - 1)) / Math.max(shared.length, 1));
    const sx0 = (width - (sw * shared.length + space.m * (shared.length - 1))) / 2;
    shared.forEach((n, i) => boxes.set(n.id, { x: sx0 + i * (sw + space.m), y: 0, w: sw, h: NODE_H, col: "shared" }));
    const top = sharedH + HEADER;
    before.forEach((n, i) => boxes.set(n.id, { x: 0, y: top + i * (NODE_H + GAP), w: colW, h: NODE_H, col: "before" }));
    after.forEach((n, i) => boxes.set(n.id, { x: colW + space.l, y: top + i * (NODE_H + GAP), w: colW, h: NODE_H, col: "after" }));
  }
  const height = sharedH + HEADER + Math.max(before.length, after.length) * (NODE_H + GAP) - GAP;

  const offCanvasLabels: string[] = [];
  const edgeEls = spec.edges.map((e, i) => {
    const a = boxes.get(e.from);
    const b = boxes.get(e.to);
    if (!a || !b) return null;
    const ax = a.x + a.w / 2;
    const bx = b.x + b.w / 2;
    let d: string;
    let labelPos: { x: number; y: number } | null = null;
    if (b.y > a.y) {
      const y1 = a.y + a.h;
      const y2 = b.y;
      const my = (y1 + y2) / 2;
      d = Math.abs(ax - bx) < 1 ? `M${ax} ${y1} L${bx} ${y2}` : `M${ax} ${y1} C${ax} ${my} ${bx} ${my} ${bx} ${y2}`;
      if (Math.abs(ax - bx) < 1 && e.label) labelPos = { x: ax + 8, y: my - 9 };
    } else {
      // Loops back up (e.g. "retry"): arc around the right edge of the column.
      const x = Math.max(a.x + a.w, b.x + b.w) - 6;
      d = `M${x} ${a.y + a.h / 2} C${x + 22} ${a.y + a.h / 2} ${x + 22} ${b.y + b.h / 2} ${x} ${b.y + b.h / 2}`;
    }
    const stroke = a.col === "after" || b.col === "after" ? color.coral : color.ink3;
    if (e.label && !labelPos) offCanvasLabels.push(`${labelOf(spec, e.from)} → ${labelOf(spec, e.to)}: ${e.label}`);
    return { key: `${e.from}-${e.to}-${i}`, d, stroke, label: e.label, labelPos };
  });

  return (
    <View>
      <View
        onLayout={(ev) => setWidth(ev.nativeEvent.layout.width)}
        style={{ height: width ? height : 240 }}
        accessible
        accessibilityLabel={`${spec.title}. Before: ${before.map((n) => n.label).join(", ")}. After: ${after
          .map((n) => n.label)
          .join(", ")}.`}
      >
        {width > 0 ? (
          <>
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
              <Defs>
                <Marker id="arrow-ink" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto">
                  <Path d="M0 0 L10 5 L0 10 z" fill={color.ink3} />
                </Marker>
                <Marker id="arrow-coral" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto">
                  <Path d="M0 0 L10 5 L0 10 z" fill={color.coral} />
                </Marker>
              </Defs>
              {edgeEls.map((e) =>
                e ? (
                  <Path
                    key={e.key}
                    d={e.d}
                    stroke={e.stroke}
                    strokeWidth={1.25}
                    fill="none"
                    markerEnd={`url(#${e.stroke === color.coral ? "arrow-coral" : "arrow-ink"})`}
                  />
                ) : null,
              )}
            </Svg>
            {before.length ? (
              <T variant="label" style={[styles.colHeader, { top: sharedH, left: 0 }]}>
                Before
              </T>
            ) : null}
            {after.length ? (
              <T variant="label" tone="coral" style={[styles.colHeader, { top: sharedH, left: colW + space.l }]}>
                Now
              </T>
            ) : null}
            {spec.nodes.map((n) => {
              const b = boxes.get(n.id);
              if (!b) return null;
              return (
                <View
                  key={n.id}
                  style={[
                    styles.node,
                    { left: b.x, top: b.y, width: b.w, height: b.h },
                    b.col === "after" && styles.nodeAfter,
                    b.col === "shared" && styles.nodeShared,
                  ]}
                >
                  <T
                    numberOfLines={2}
                    style={[styles.nodeText, b.col === "before" && { color: color.ink2 }]}
                    maxFontSizeMultiplier={1.2}
                  >
                    {n.label}
                  </T>
                </View>
              );
            })}
            {edgeEls.map((e) =>
              e?.labelPos && e.label ? (
                <T key={`l-${e.key}`} variant="meta" style={[styles.edgeLabel, { left: e.labelPos.x, top: e.labelPos.y }]}>
                  {e.label}
                </T>
              ) : null,
            )}
          </>
        ) : null}
      </View>
      {offCanvasLabels.length ? (
        <View style={{ marginTop: space.l, gap: space.xs }}>
          {offCanvasLabels.map((l) => (
            <T key={l} variant="meta">
              {l}
            </T>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const labelOf = (spec: DiagramSpec, id: string) => spec.nodes.find((n) => n.id === id)?.label ?? id;

const styles = StyleSheet.create({
  colHeader: { position: "absolute" },
  node: {
    position: "absolute",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.edge,
    backgroundColor: color.panel,
    paddingHorizontal: space.m,
    justifyContent: "center",
  },
  nodeAfter: { borderColor: color.coral, backgroundColor: color.coralTint },
  nodeShared: { backgroundColor: color.fog, borderColor: color.fog },
  nodeText: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 17, color: color.ink },
  edgeLabel: { position: "absolute", fontSize: 12, color: color.ink3 },
});
