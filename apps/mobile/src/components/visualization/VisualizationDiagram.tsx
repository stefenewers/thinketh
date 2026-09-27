import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Path } from "react-native-svg";
import type { VisualCallout, VisualizationSpec, VisualNode, VisualSection } from "@thinketh/contracts";
import { T } from "@/components/Text";
import { useReducedMotion } from "@/lib/hooks";
import { color, font } from "@/theme/tokens";
import { layoutVisualization, measureKeys, type LaidEdge, type Layout, type Measured } from "./layout";
import { PixelIcon } from "./PixelIcon";

// On web, Animated adds `collapsable`, which react-native-svg would write onto the DOM element.
function withoutCollapsable<P extends object>(C: ComponentType<P>) {
  const Stripped = (props: P & { collapsable?: boolean }) => {
    const { collapsable: _drop, ...rest } = props;
    return <C {...(rest as P)} />;
  };
  return Stripped;
}
const AnimatedPath = Animated.createAnimatedComponent(Platform.OS === "web" ? withoutCollapsable(Path) : Path);
const AnimatedCircle = Animated.createAnimatedComponent(Platform.OS === "web" ? withoutCollapsable(Circle) : Circle);

export const VIS = {
  line: "#BDB7B0",
  lineStrong: color.coral,
  beforeBg: "#F4F1EE",
  nowBg: "#FAEFEA",
  nowEdge: "rgba(192,85,58,0.16)",
  primaryEdge: "rgba(192,85,58,0.38)",
};

/**
 * One diagram, drawn by Thinketh: nodes are measured, then placed by the layout engine, then the
 * connectors play through once in the order the idea runs (a stroke reveal carrying a small
 * signal, the destination answering), and everything settles. Reduced motion: final state at once.
 */
export function VisualizationDiagram({ spec }: { spec: VisualizationSpec }) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [measured, setMeasured] = useState<Measured>({});
  const keys = useMemo(() => measureKeys(spec), [spec]);
  const ready = width > 0 && keys.every((k) => measured[k] !== undefined);
  const layout = useMemo(() => (width ? layoutVisualization(spec, width, measured) : null), [spec, width, measured]);

  const measure = useCallback(
    (key: string) => (e: LayoutChangeEvent) => {
      const hgt = Math.ceil(e.nativeEvent.layout.height);
      setMeasured((m) => (m[key] === hgt ? m : { ...m, [key]: hgt }));
    },
    [],
  );

  const motion = useDiagramMotion(ready ? layout : null, spec, reduced);
  const nodeById = useMemo(() => new Map(spec.nodes.map((n) => [n.id, n])), [spec]);

  return (
    <View
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      style={{ height: layout?.height ?? 240, opacity: ready ? 1 : 0 }}
      accessible
      accessibilityLabel={describe(spec)}
    >
      {layout ? (
        <>
          {layout.frames.map((f) => (
            <Frame key={f.section.id} frame={f} onHeader={measure(`section:${f.section.id}`)} />
          ))}

          <Svg width={layout.width} height={layout.height} style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
            {layout.markers.length ? <Line x1={12} y1={layout.markers[0]!.y} x2={12} y2={layout.markers[layout.markers.length - 1]!.y} stroke={color.edge} strokeWidth={2} /> : null}
            {layout.edges.map((e) => (
              <Connector key={e.key} edge={e} progress={motion.edge(e.key)} reduced={reduced} />
            ))}
            {layout.markers.map((m, i) => (
              <Circle key={i} cx={m.x} cy={m.y} r={5} fill={m.primary ? color.coral : color.panel} stroke={m.primary ? color.coral : VIS.line} strokeWidth={2} />
            ))}
          </Svg>

          {Object.values(layout.nodes).map((n) => {
            const node = nodeById.get(n.id);
            if (!node) return null;
            return (
              <Animated.View
                key={n.id}
                style={[styles.nodeBox, { left: n.x, top: n.y, width: n.w, height: n.h, transform: [{ scale: motion.node(n.id) }] }]}
              >
                <NodeCard node={node} iconSize={n.iconSize} compact={n.compact} onMeasure={measure(n.id)} arrived={motion.glow(n.id)} />
              </Animated.View>
            );
          })}

          {layout.edges.map((e) =>
            e.label ? (
              <View key={`l-${e.key}`} style={[styles.edgeLabel, { left: e.label.at.x, top: e.label.at.y - 8 }]}>
                <T style={styles.edgeLabelText} numberOfLines={1}>
                  {e.label.text}
                </T>
              </View>
            ) : null,
          )}

          {layout.callouts.map((c) => (
            <View key={`c-${c.index}`} style={{ position: "absolute", left: c.x, top: c.y, width: c.w }}>
              <Callout callout={spec.callouts[c.index]!} onMeasure={measure(`callout:${c.index}`)} />
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

function Frame({ frame, onHeader }: { frame: Layout["frames"][number]; onHeader: (e: LayoutChangeEvent) => void }) {
  const { section } = frame;
  const tinted = section.tone === "now";
  return (
    <View
      style={[
        styles.frame,
        { left: frame.x, top: frame.y, width: frame.w, height: frame.h },
        section.tone === "before" ? { backgroundColor: VIS.beforeBg } : tinted ? { backgroundColor: VIS.nowBg, borderColor: VIS.nowEdge } : null,
      ]}
    >
      <View onLayout={onHeader} style={{ position: "absolute", left: frame.header.x - frame.x, top: frame.header.y - frame.y, width: frame.header.w }}>
        <SectionHeader section={section} />
      </View>
    </View>
  );
}

export function SectionHeader({ section }: { section: VisualSection }) {
  const marked = section.tone !== "neutral";
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        {marked ? <View style={styles.dot} /> : null}
        <T style={[styles.sectionLabel, marked && { color: color.coral }]} numberOfLines={1}>
          {section.label}
        </T>
      </View>
      {section.caption ? (
        <T style={styles.sectionCaption} numberOfLines={2}>
          {section.caption}
        </T>
      ) : null}
    </View>
  );
}

function NodeCard({ node, iconSize, compact, onMeasure, arrived }: { node: VisualNode; iconSize: number; compact: boolean; onMeasure: (e: LayoutChangeEvent) => void; arrived: Animated.Value }) {
  const primary = node.emphasis === "primary";
  const muted = node.emphasis === "muted";
  return (
    <View style={[styles.card, primary && { borderColor: VIS.primaryEdge }, muted && styles.cardMuted]}>
      {/* The destination answering the signal: a brief coral edge, then rest. */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.glow, { opacity: arrived }]} />
      <View onLayout={onMeasure} style={[styles.cardInner, compact && styles.cardInnerCompact]}>
        {node.icon ? <PixelIcon name={node.icon} size={iconSize} /> : null}
        <T style={[styles.nodeLabel, compact && styles.nodeLabelCompact, node.icon ? { marginTop: 8 } : null]} numberOfLines={3}>
          {node.label}
        </T>
        {node.description ? (
          <T style={[styles.nodeDescription, compact && styles.nodeDescriptionCompact]} numberOfLines={3}>
            {node.description}
          </T>
        ) : null}
      </View>
    </View>
  );
}

export function Callout({ callout, onMeasure }: { callout: VisualCallout; onMeasure?: (e: LayoutChangeEvent) => void }) {
  return (
    <View onLayout={onMeasure} style={styles.callout}>
      <PixelIcon name="answer" size={24} />
      <T style={styles.calloutText}>{callout.text}</T>
    </View>
  );
}

function Connector({ edge, progress, reduced }: { edge: LaidEdge; progress: Animated.Value; reduced: boolean }) {
  const stroke = edge.primary ? VIS.lineStrong : VIS.line;
  const len = Math.max(1, edge.length);
  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [len, 0] });
  const headOpacity = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0, 0, 1] });
  const n = edge.samples.length;
  const input = edge.samples.map((_, i) => i / (n - 1));
  const cx = progress.interpolate({ inputRange: input, outputRange: edge.samples.map((p) => p.x) });
  const cy = progress.interpolate({ inputRange: input, outputRange: edge.samples.map((p) => p.y) });
  const dotOpacity = progress.interpolate({ inputRange: [0, 0.04, 0.9, 1], outputRange: [0, 1, 1, 0] });
  return (
    <G>
      <AnimatedPath
        d={edge.d}
        stroke={stroke}
        strokeWidth={edge.primary ? 1.8 : 1.4}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={edge.dashed ? "4 5" : `${len} ${len}`}
        strokeDashoffset={edge.dashed ? 0 : dashOffset}
        opacity={edge.dashed ? progress : 1}
      />
      {edge.head ? <AnimatedPath d={edge.head} stroke={stroke} strokeWidth={edge.primary ? 1.8 : 1.4} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={headOpacity} /> : null}
      {reduced ? null : <AnimatedCircle cx={cx} cy={cy} r={edge.primary ? 3.6 : 3} fill={stroke} opacity={dotOpacity} />}
    </G>
  );
}

/** A plain-language reading of the diagram for VoiceOver. */
function describe(spec: VisualizationSpec): string {
  const name = new Map(spec.nodes.map((n) => [n.id, n.label]));
  const links = spec.edges.map((e) => `${name.get(e.from)} ${e.label ?? "to"} ${name.get(e.to)}`);
  return `${spec.title}. ${spec.sections.map((s) => `${s.label}: ${s.nodeIds.map((id) => name.get(id)).join(", ")}.`).join(" ")} ${links.join("; ")}.`;
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * Plays the idea through once: each wave of connectors draws with a travelling signal, then the
 * nodes it reaches answer. ~1.5-3 s in total, then static. Stopped on unmount.
 */
function useDiagramMotion(layout: Layout | null, spec: VisualizationSpec, reduced: boolean) {
  // Animated values are created on first use and live as long as the diagram.
  const [values] = useState(() => ({ edges: new Map<string, Animated.Value>(), nodes: new Map<string, Animated.Value>(), glows: new Map<string, Animated.Value>() }));
  const played = useRef<VisualizationSpec | null>(null);
  const get = (map: Map<string, Animated.Value>, key: string, initial: number) => {
    let v = map.get(key);
    if (!v) {
      v = new Animated.Value(initial);
      map.set(key, v);
    }
    return v;
  };
  const start = reduced ? 1 : 0;

  useEffect(() => {
    if (!layout || played.current === spec) return;
    played.current = spec;
    const { edges, nodes, glows } = values;
    if (reduced) {
      for (const e of layout.edges) get(edges, e.key, 1).setValue(1);
      return;
    }
    const waveCount = Math.max(1, layout.waves);
    const perWave = Math.max(260, Math.min(520, 2300 / waveCount));
    const ease = Easing.bezier(0.3, 0.1, 0.25, 1);
    const steps: Animated.CompositeAnimation[] = [Animated.delay(220)];
    for (let w = 0; w < waveCount; w++) {
      const inWave = layout.edges.filter((e) => e.wave === w);
      if (!inWave.length) continue;
      const targets = [...new Set(inWave.flatMap((e) => e.targets))];
      steps.push(
        Animated.parallel(inWave.map((e) => Animated.timing(get(edges, e.key, 0), { toValue: 1, duration: perWave, easing: ease, useNativeDriver: false }))),
        Animated.parallel(
          targets.flatMap((id) => [
            Animated.sequence([
              Animated.timing(get(nodes, id, 1), { toValue: 1.035, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: false }),
              Animated.timing(get(nodes, id, 1), { toValue: 1, duration: 200, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
            ]),
            Animated.sequence([
              Animated.timing(get(glows, id, 0), { toValue: 1, duration: 110, useNativeDriver: false }),
              Animated.timing(get(glows, id, 0), { toValue: 0, duration: 420, useNativeDriver: false }),
            ]),
          ]),
        ),
      );
    }
    const anim = Animated.sequence(steps);
    anim.start();
    return () => anim.stop();
  }, [layout, spec, reduced, values]);

  return {
    edge: (key: string) => get(values.edges, key, start),
    node: (id: string) => get(values.nodes, id, 1),
    glow: (id: string) => get(values.glows, id, 0),
  };
}

const styles = StyleSheet.create({
  frame: { position: "absolute", borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, backgroundColor: color.surfaceMuted },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.coral },
  sectionLabel: { fontFamily: font.sansSemibold, fontSize: 11.5, lineHeight: 15, letterSpacing: 1.8, textTransform: "uppercase", color: color.ink3 },
  sectionCaption: { fontFamily: font.sans, fontSize: 14, lineHeight: 19, color: color.ink2, marginTop: 4 },
  nodeBox: { position: "absolute" },
  card: { flex: 1, borderRadius: 16, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, justifyContent: "center", overflow: "hidden" },
  cardMuted: { opacity: 0.6, borderStyle: "dashed", borderColor: color.ink3 },
  glow: { pointerEvents: "none", borderRadius: 16, borderWidth: 1.5, borderColor: color.coral },
  cardInner: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 12 },
  // Three across on a phone: a touch smaller, so words wrap between words, never inside them.
  cardInnerCompact: { paddingHorizontal: 6 },
  nodeLabelCompact: { fontSize: 12.5, lineHeight: 16, letterSpacing: -0.3 },
  nodeDescriptionCompact: { fontSize: 11, lineHeight: 14 },
  nodeLabel: { fontFamily: font.sansSemibold, fontSize: 14, lineHeight: 18, letterSpacing: -0.2, color: color.ink, textAlign: "center" },
  nodeDescription: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: color.ink3, textAlign: "center", marginTop: 3 },
  edgeLabel: { position: "absolute", width: 140, pointerEvents: "none" },
  edgeLabelText: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 15, color: color.ink3 },
  callout: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  calloutText: { flex: 1, fontFamily: font.sans, fontSize: 14, lineHeight: 19, color: color.ink },
});
