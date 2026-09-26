import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line } from "react-native-svg";
import type { MindSnapshot } from "@thinketh/contracts";
import { T } from "@/components/Text";
import { color, font } from "@/theme/tokens";

// Storyboard 09-11: two Minds as two overlapping circles, each holding a small Mindprint.
// You are coral, the other Mind is partner blue; the concept in play sits at the inner edge of
// each circle so knowledge visibly crosses the overlap. Static and deterministic.

export type VennTrace = { conceptId: string; fromUserId: string; mode: "teaching" | "moved" };

const MAX_NODES = 9;

export function MindVenn({
  left,
  right,
  me,
  width,
  height = 230,
  focusConceptId,
  trace,
  muse,
}: {
  left: MindSnapshot;
  right: MindSnapshot;
  me: string;
  width: number;
  height?: number;
  focusConceptId?: string | null;
  trace?: VennTrace | null;
  muse?: boolean;
}) {
  const head = 30;
  const h = height - head;
  const r = Math.min(h / 2 - 6, width * 0.3);
  const cy = head + h / 2;
  const off = r * 0.6;
  const sides = [
    { snap: left, cx: width / 2 - off, inward: 1 },
    { snap: right, cx: width / 2 + off, inward: -1 },
  ] as const;
  const focus = trace?.conceptId ?? focusConceptId ?? null;
  const tone = (userId: string) => (userId === me ? { ink: color.coral, tint: color.coralTint } : { ink: color.partner, tint: color.partnerTint });

  const placed = sides.map(({ snap, cx, inward }) => {
    const concepts = [...snap.concepts].sort((a, b) => b.importance - a.importance || a.conceptId.localeCompare(b.conceptId));
    const focusConcept = focus ? concepts.find((c) => c.conceptId === focus) : undefined;
    const rest = concepts.filter((c) => c !== focusConcept).slice(0, MAX_NODES - (focusConcept ? 1 : 0));
    // The focus concept sits toward the overlap; the rest spiral out on the far side.
    const fx = cx + inward * r * 0.42;
    const pts = new Map<string, { x: number; y: number }>();
    if (focusConcept) pts.set(focusConcept.conceptId, { x: fx, y: cy });
    // Even sunflower spread over the disc, skipping spots too close to the focus concept.
    let k = 0;
    rest.forEach((c) => {
      for (;;) {
        const t = (k + 0.5) / (rest.length + 3);
        const ang = k * 2.399963 + (inward === 1 ? Math.PI * 0.9 : -Math.PI * 0.1);
        const d = r * (0.18 + 0.62 * Math.sqrt(t));
        const x = cx + Math.cos(ang) * d;
        const y = cy + Math.sin(ang) * d;
        k += 1;
        if (!focusConcept || Math.hypot(x - fx, y - cy) > r * 0.3 || k > 40) {
          pts.set(c.conceptId, { x, y });
          break;
        }
      }
    });
    const shown = new Set(pts.keys());
    const edges = snap.edges.filter((e) => shown.has(e.fromConceptId) && shown.has(e.toConceptId)).slice(0, 12);
    return { snap, cx, pts, edges, concepts: [focusConcept, ...rest].filter((c): c is NonNullable<typeof c> => !!c), tone: tone(snap.userId) };
  });

  const from = trace ? placed.find((p) => p.snap.userId === trace.fromUserId) : undefined;
  const to = trace ? placed.find((p) => p.snap.userId !== trace.fromUserId) : undefined;
  const a = from && trace ? from.pts.get(trace.conceptId) : undefined;
  const b = to && trace ? to.pts.get(trace.conceptId) : undefined;
  const names = placed.map((p) => (p.snap.userId === me ? "You" : p.snap.displayName));

  return (
    <View style={{ width, height }} accessible accessibilityLabel={`${names[0]} and ${names[1]}: two Minds, overlapping where they share knowledge.`}>
      <Svg width={width} height={height}>
        {placed.map((p) => (
          <Circle key={`c-${p.snap.userId}`} cx={p.cx} cy={cy} r={r} fill={p.tone.tint} fillOpacity={0.55} stroke={p.tone.ink} strokeOpacity={0.14} strokeWidth={1} />
        ))}
        {placed.map((p) => (
          <G key={`e-${p.snap.userId}`}>
            {p.edges.map((e) => {
              const s = p.pts.get(e.fromConceptId)!;
              const t = p.pts.get(e.toConceptId)!;
              return <Line key={`${e.fromConceptId}-${e.toConceptId}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={color.ink} strokeOpacity={0.12} strokeWidth={0.8} />;
            })}
          </G>
        ))}
        {a && b ? <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color.coral} strokeWidth={1.6} strokeLinecap="round" /> : null}
        {placed.map((p) => (
          <G key={`n-${p.snap.userId}`}>
            {p.concepts.map((c) => {
              const { x, y } = p.pts.get(c.conceptId)!;
              const isFocus = c.conceptId === focus;
              const strong = c.level === "strong" || c.level === "intermediate";
              const moved = trace?.mode === "moved" && isFocus && p === to;
              return (
                <G key={c.conceptId}>
                  {isFocus ? <Circle cx={x} cy={y} r={moved ? 10 : 8} fill="none" stroke={p.tone.ink} strokeOpacity={moved ? 0.55 : 0.3} strokeWidth={1} /> : null}
                  {strong || isFocus ? (
                    <Circle cx={x} cy={y} r={isFocus ? 4.6 : 3.2} fill={isFocus ? p.tone.ink : color.ink} fillOpacity={isFocus ? 1 : 0.78} />
                  ) : (
                    <Circle cx={x} cy={y} r={3} fill={color.canvas} stroke={p.tone.ink} strokeOpacity={0.6} strokeWidth={1.1} />
                  )}
                </G>
              );
            })}
          </G>
        ))}
      </Svg>
      {placed.map((p, i) => (
        <View key={`h-${p.snap.userId}`} style={[styles.head, { left: p.cx - 60 }]}>
          <View style={[styles.headDot, { backgroundColor: p.tone.ink }]} />
          <T style={styles.headName} numberOfLines={1}>
            {names[i]}
          </T>
        </View>
      ))}
      {muse ? (
        <View style={[styles.muse, { left: width / 2 - 12, top: head + 2 }]} accessibilityLabel="Muse is conducting">
          <T style={styles.museText}>M</T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { position: "absolute", top: 0, width: 120, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  headDot: { width: 6, height: 6, borderRadius: 3 },
  headName: { fontFamily: font.sansSemibold, fontSize: 14, lineHeight: 18, letterSpacing: -0.2, color: color.ink },
  muse: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  museText: { fontFamily: font.sansSemibold, fontSize: 11, lineHeight: 13, color: color.onInk },
});
