import { Component, useEffect, useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import type { ConceptEdge, KnowledgeItem } from "@thinketh/contracts";
import { layoutMind } from "@thinketh/mindprint";
import { Mindprint } from "@/mindprint/Mindprint";
import { layoutEdges, nodesFromKnowledge } from "@/mindprint/model";
import { color, warm } from "@/theme/tokens";
import { neighbourhood } from "./voiceVisualState";

/**
 * A curated view of the Mind for Catch Me Up: the active concept, its direct links sharpened,
 * a few second-degree neighbours quiet, everything else left out. With no confident focus it
 * shows the calm overview. Layout reruns only when the focus changes, never per audio frame.
 */
export function VoiceMindprint({
  items,
  edges,
  changedIds,
  focusId,
  width,
  height,
  level,
  reduceMotion,
  warmth = "quiet",
}: {
  items: KnowledgeItem[];
  edges: ConceptEdge[];
  changedIds: Set<string>;
  focusId: string | null;
  width: number;
  height: number;
  /** 0-1 output level (a shared value, animated off the React render loop). */
  level: SharedValue<number>;
  reduceMotion: boolean;
  /** The light behind the Mind: warm while Thinketh speaks, quiet while you talk or it listens. */
  warmth?: "speaking" | "quiet";
}) {
  const view = useMemo(() => {
    const all = nodesFromKnowledge(items, changedIds);
    const allEdges = layoutEdges(edges);
    const keep = focusId && all.some((n) => n.id === focusId) ? new Set(neighbourhood(focusId, allEdges)) : null;
    const nodes = keep ? all.filter((n) => keep.has(n.id)) : all;
    const kept = keep ? allEdges.filter((e) => keep.has(e.from) && keep.has(e.to)) : allEdges;
    const layout = layoutMind(nodes, kept, { x: 16, y: 8, w: width - 32, h: height - 16 }, {
      focusId: keep ? focusId : null,
      lod: keep ? "focus" : "overview",
      changedIds: [...changedIds],
      requiredLabels: keep ? [...keep] : undefined,
      fontSize: 12,
    });
    return { layout, byId: new Map(nodes.map((n) => [n.id, n])), active: keep ? layout.nodes.find((n) => n.id === focusId) : undefined };
  }, [items, edges, changedIds, focusId, width, height]);

  // Light entering the canvas, centred on the active concept. It eases between conversation states
  // (never per audio frame) and simply switches under Reduce Motion.
  const glow = useSharedValue(warmth === "speaking" ? 1 : 0.35);
  useEffect(() => {
    const to = warmth === "speaking" ? 1 : 0.35;
    glow.set(reduceMotion ? to : withTiming(to, { duration: 900, easing: Easing.inOut(Easing.quad) }));
  }, [warmth, reduceMotion, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const cx = view.active ? `${Math.round((view.active.x / width) * 100)}%` : "50%";
  const cy = view.active ? `${Math.round((view.active.y / height) * 100)}%` : "50%";

  // The one audio-reactive element: a hairline ring on the active concept, at most 2.5% larger.
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 1 + Math.min(1, level.get()) * 0.025 }] }));

  return (
    <View style={{ width, height }} accessible accessibilityLabel={view.active ? `Your Mind, focused on ${view.byId.get(view.active.id)?.label ?? "a concept"}.` : "Your Mind, overview."}>
      <Animated.View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }, glowStyle]}>
        <Svg width={width} height={height}>
          <Defs>
            <RadialGradient id="voiceLight" cx={cx} cy={cy} rx="62%" ry="68%">
              <Stop offset="0" stopColor={warm.wash} stopOpacity={0.38} />
              <Stop offset="0.5" stopColor={warm.wash} stopOpacity={0.14} />
              <Stop offset="1" stopColor={warm.wash} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="url(#voiceLight)" />
        </Svg>
      </Animated.View>
      <Animated.View
        key={focusId ?? "overview"}
        style={StyleSheet.absoluteFill}
        entering={reduceMotion ? undefined : FadeIn.duration(480)}
        exiting={reduceMotion ? undefined : FadeOut.duration(260)}
      >
        <Mindprint width={width} height={height} regions={[{ layout: view.layout, nodes: view.byId, focusId: view.active ? focusId : null, dim: !!view.active, fontSize: 12 }]} />
        {view.active && !reduceMotion ? (
          <Animated.View
            style={[styles.ring, { pointerEvents: "none", left: view.active.x - view.active.r - 7, top: view.active.y - view.active.r - 7, width: (view.active.r + 7) * 2, height: (view.active.r + 7) * 2, borderRadius: view.active.r + 7 }, ring]}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

/** The visualization must never be able to end the voice conversation: on any render error it quietly disappears. */
export class VisualBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const styles = StyleSheet.create({
  ring: { position: "absolute", borderWidth: StyleSheet.hairlineWidth * 2, borderColor: color.ink, opacity: 0.35 },
});
