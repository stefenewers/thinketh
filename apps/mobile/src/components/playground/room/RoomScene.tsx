import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { Avatar } from "@/components/system";
import { T } from "@/components/Text";
import { useReducedMotion } from "@/lib/hooks";
import type { VisualCue, World, WorldConcept } from "@/lib/roomWorld";
import { color, font, warm } from "@/theme/tokens";

// The Playground room, drawn from the projected World (lib/roomWorld). A slightly elevated view of
// a lit floor with two Mind platforms. Concept objects stand at their mastery, sized by importance.
// Everything here is presentation: it never changes knowledge, and every animation targets a value
// derived from the server room, starting AT that value on mount (no replay on refetch or remount).

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export type Selection =
  | { kind: "concept"; key: string }
  | { kind: "mind"; userId: string }
  | { kind: "path" }
  | { kind: "gap" }
  | { kind: "source" }
  | { kind: "muse" };

type Pt = { x: number; y: number };

/** World (x in [-1,1], z in [0,1] back to front, y = height) -> screen. Nearer is larger. */
function projector(W: number, H: number) {
  return (x: number, z: number, y = 0): Pt & { d: number } => {
    const d = 0.72 + 0.32 * z;
    const floorY = H * 0.3 + z * H * 0.56;
    return { x: W / 2 + x * W * 0.46 * d, y: floorY - y * H * 0.36 * d, d };
  };
}

const toneOf = (isMe: boolean) => (isMe ? { ink: color.coral, tint: color.coralTint, light: warm.orbLight } : { ink: color.partner, tint: color.partnerTint, light: "#F2F6FA" });

export function RoomScene({
  world,
  cue,
  live,
  width,
  height,
  following,
  onSelect,
  onReturnToLive,
}: {
  world: World;
  /** The action being shown right now (a newly observed event), if any. */
  cue: VisualCue | null;
  /** The cue was just observed (not a settled caption from a load): only then do one-off motions play. */
  live: boolean;
  width: number;
  height: number;
  following: boolean;
  onSelect: (s: Selection) => void;
  onReturnToLive: () => void;
}) {
  const reduced = useReducedMotion();
  const P = useMemo(() => projector(width, height), [width, height]);
  const person = (userId: string) => world.people.find((p) => p.userId === userId);
  const isMe = (userId: string) => !!person(userId)?.isMe;

  // Concept geometry: floor foot, lifted body, radius.
  const geo = useMemo(() => {
    const m = new Map<string, { c: WorldConcept; foot: Pt; top: Pt; r: number }>();
    for (const c of world.concepts) {
      const foot = P(c.x, c.z, 0);
      const top = P(c.x, c.z, 0.1 + c.height * 0.62);
      const r = (5 + c.size * 5.5) * foot.d * (c.role === "focus" ? 1.55 : 1);
      m.set(c.key, { c, foot, top, r });
    }
    return m;
  }, [world.concepts, P]);

  const platforms = (["left", "right"] as const).map((side) => {
    const who = world.people.find((p) => p.side === side);
    const center = P(side === "left" ? -0.5 : 0.5, 0.5, 0);
    const rx = width * 0.2 * center.d;
    return { side, who, center, rx, ry: rx * 0.4 };
  });

  // ---- Camera: Follow Muse frames the live action; Explore pans and pinches. Camera state only.
  const framePt = P(world.frame.x, world.frame.z, 0.25);
  const target = following ? { s: world.frame.zoom, tx: (width / 2 - framePt.x) * world.frame.zoom * 0.7, ty: (height * 0.5 - framePt.y) * world.frame.zoom * 0.35 } : null;
  const tx = useSharedValue(target?.tx ?? 0);
  const ty = useSharedValue(target?.ty ?? 0);
  const sc = useSharedValue(target?.s ?? 1);
  useEffect(() => {
    if (!target) return;
    const t = (v: number) => (reduced ? v : withTiming(v, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    tx.set(t(target.tx));
    ty.set(t(target.ty));
    sc.set(t(target.s));
  }, [target?.tx, target?.ty, target?.s, reduced, tx, ty, sc]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = useSharedValue({ x: 0, y: 0, s: 1 });
  const pan = usePanGesture({
    enabled: !following,
    minDistance: 8,
    onActivate: () => {
      "worklet";
      start.set({ x: tx.get(), y: ty.get(), s: sc.get() });
    },
    onUpdate: (e) => {
      "worklet";
      const lim = width * 0.45;
      tx.set(Math.max(-lim, Math.min(lim, start.get().x + e.translationX)));
      ty.set(Math.max(-lim, Math.min(lim, start.get().y + e.translationY)));
    },
  });
  const pinch = usePinchGesture({
    enabled: !following,
    onActivate: () => {
      "worklet";
      start.set({ x: tx.get(), y: ty.get(), s: sc.get() });
    },
    onUpdate: (e) => {
      "worklet";
      sc.set(Math.max(0.85, Math.min(2.4, start.get().s * e.scale)));
    },
  });
  const gesture = useSimultaneousGestures(pan, pinch);
  const camera = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: sc.get() }] }));

  // ---- Muse: moves to what it directs; rests at the back when Thinketh or a person is acting.
  // The shared gap floats above and behind both Minds, clear of their concepts.
  const gapPt = P(0, 0.34, 0.8);
  const mt = world.muse.target;
  const museAt: Pt =
    mt.kind === "concept" && geo.get(mt.key)
      ? { x: geo.get(mt.key)!.top.x + (geo.get(mt.key)!.c.side === "left" ? -30 : 30), y: geo.get(mt.key)!.top.y - 56 }
      : mt.kind === "gap"
        ? { x: gapPt.x + 46, y: gapPt.y + 6 }
        : mt.kind === "source"
          ? { x: width / 2 + 58, y: P(0, 0.2, 0.5).y }
          : P(0, 0.12, 0.62);
  const mx = useSharedValue(museAt.x);
  const my = useSharedValue(museAt.y);
  useEffect(() => {
    const t = (v: number) => (reduced ? v : withTiming(v, { duration: 950, easing: Easing.inOut(Easing.cubic) }));
    mx.set(t(museAt.x));
    my.set(t(museAt.y));
  }, [museAt.x, museAt.y, reduced, mx, my]);
  // Animated per shape (cx/cy and path d): reliable on iOS, Android and web, unlike group transforms.
  const museBodyProps = useAnimatedProps(() => ({ cx: mx.get(), cy: my.get() }));
  const museShineProps = useAnimatedProps(() => ({ cx: mx.get() - 4, cy: my.get() - 5 }));
  const museGlyphProps = useAnimatedProps(() => {
    const x = mx.get(), y = my.get();
    return { d: `M${x - 5},${y + 4} L${x - 5},${y - 4} L${x},${y + 1} L${x + 5},${y - 4} L${x + 5},${y + 4}` };
  });
  const museShadow = useAnimatedProps(() => ({ cx: mx.get() + 4, cy: my.get() + 46 }));
  const beamTarget: Pt | null = mt.kind === "concept" && geo.get(mt.key) ? geo.get(mt.key)!.top : mt.kind === "gap" ? gapPt : null;
  const beamProps = useAnimatedProps(() => {
    if (!beamTarget) return { d: "" };
    const x = mx.get(), y = my.get();
    return { d: `M${x - 3},${y + 8} L${beamTarget.x - 13},${beamTarget.y} L${beamTarget.x + 13},${beamTarget.y} L${x + 3},${y + 8} Z` };
  });

  // ---- The teaching path: an arc from the teacher's concept to the learner's.
  const path = world.path;
  const a = path ? geo.get(path.fromKey) : undefined;
  const b = path ? geo.get(path.toKey) : undefined;
  const arc = a && b ? arcBetween(a.top, b.top) : null;
  const progress = useSharedValue(path?.progress ?? 0);
  useEffect(() => {
    const p = path?.progress ?? 0;
    progress.set(reduced ? p : withTiming(p, { duration: path?.state === "verified" ? 1300 : 1000, easing: Easing.inOut(Easing.cubic) }));
  }, [path?.progress, path?.state, reduced, progress]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: arc ? arc.len * (1 - progress.get()) : 0 }));
  const pulse = useSharedValue(1);
  const breathing = path?.state === "traveling" || path?.state === "grading" || world.muse.waiting;
  useEffect(() => {
    if (reduced || !breathing) {
      pulse.set(1);
      return;
    }
    pulse.set(withRepeat(withSequence(withTiming(0.35, { duration: 650 }), withTiming(1, { duration: 650 })), -1, false));
  }, [breathing, reduced, pulse]);
  const headProps = useAnimatedProps(() => {
    if (!arc) return { cx: 0, cy: 0, opacity: 0 };
    const p = arc.at(progress.get());
    const moving = progress.get() > 0.02 && progress.get() < 0.99;
    return { cx: p.x, cy: p.y, opacity: moving ? pulse.get() : 0 };
  });
  const gate = arc && path ? arc.at(path.checkpointAt) : null;
  const gateProps = useAnimatedProps(() => ({ opacity: path?.state === "grading" ? 0.45 + pulse.get() * 0.55 : 1 }));

  // ---- Thinketh's comparison: one light sweep across the floor, only when the action is observed.
  const sweep = useSharedValue(-1);
  const comparing = world.system.comparing || (live && (cue?.kind === "compare" || cue?.kind === "difference"));
  useEffect(() => {
    if (!comparing || reduced) {
      sweep.set(-1);
      return;
    }
    sweep.set(0);
    sweep.set(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }));
  }, [comparing, cue?.seq, reduced, sweep]);
  const sweepProps = useAnimatedProps(() => {
    // Same projection as projector(), inlined: worklets can't call plain JS functions.
    const z = 0.18 + sweep.get() * 0.7;
    const d = 0.72 + 0.32 * z;
    return { cy: height * 0.3 + z * height * 0.56, rx: width * 0.46 * d, ry: 3 + 2 * d, opacity: sweep.get() < 0 || sweep.get() >= 1 ? 0 : 0.8 };
  });

  // ---- Verified: one halo on the learner's concept, only when observed live (cue), never on load.
  const halo = useSharedValue(0);
  useEffect(() => {
    if (!live || cue?.kind !== "verified" || reduced) return;
    halo.set(0);
    halo.set(withSequence(withTiming(0, { duration: 1100 }), withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) })));
  }, [live, cue?.kind, cue?.seq, reduced, halo]);
  const changed = world.concepts.find((c) => c.changed);
  const changedGeo = changed ? geo.get(changed.key) : undefined;
  const haloProps = useAnimatedProps(() => ({ r: (changedGeo?.r ?? 8) + halo.get() * 22, opacity: halo.get() > 0 && halo.get() < 1 ? 1 - halo.get() : 0 }));

  const ordered = [...world.concepts].sort((p, q) => p.z - q.z);
  const pathInk = path?.state === "not_yet" ? color.ink3 : color.coral;
  const gap = world.gap;
  const source = world.source;
  const slab = P(0, 0.2, 0.5);

  return (
    <View style={{ width, height, overflow: "hidden" }}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ width, height }, camera]}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="air" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#F4ECE6" />
                <Stop offset="1" stopColor={color.ground} />
              </LinearGradient>
              <RadialGradient id="floor" cx="38%" cy="30%" r="75%">
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="0.6" stopColor="#F6EFEA" />
                <Stop offset="1" stopColor="#EDE3DB" />
              </RadialGradient>
              <RadialGradient id="museBody" cx="35%" cy="30%" r="75%">
                <Stop offset="0" stopColor="#5A5A58" />
                <Stop offset="1" stopColor={color.ink} />
              </RadialGradient>
              {(["me", "other"] as const).map((k) => {
                const t = toneOf(k === "me");
                return (
                  <RadialGradient key={k} id={`sphere-${k}`} cx="36%" cy="30%" r="72%">
                    <Stop offset="0" stopColor={t.light} />
                    <Stop offset="0.55" stopColor={t.ink} stopOpacity={0.85} />
                    <Stop offset="1" stopColor={t.ink} />
                  </RadialGradient>
                );
              })}
              {(["me", "other"] as const).map((k) => {
                const t = toneOf(k === "me");
                return (
                  <RadialGradient key={`d-${k}`} id={`soft-${k}`} cx="36%" cy="30%" r="72%">
                    <Stop offset="0" stopColor="#FFFFFF" />
                    <Stop offset="1" stopColor={t.tint} />
                  </RadialGradient>
                );
              })}
            </Defs>

            {/* Air and ground plane. */}
            <Rect x={-width} y={-height} width={width * 3} height={height * 3} fill="url(#air)" />
            <Ellipse cx={width / 2} cy={P(0, 0.56, 0).y} rx={width * 0.62} ry={height * 0.36} fill="url(#floor)" />

            {/* Two Mind platforms: a slab with thickness, each person's own tone. */}
            {platforms.map((pl) => {
              const t = toneOf(!!pl.who?.isMe);
              return (
                <G key={pl.side}>
                  <Ellipse cx={pl.center.x} cy={pl.center.y + 7} rx={pl.rx} ry={pl.ry} fill={t.ink} opacity={0.14} />
                  <Ellipse cx={pl.center.x} cy={pl.center.y} rx={pl.rx} ry={pl.ry} fill={t.tint} stroke={t.ink} strokeOpacity={0.35} strokeWidth={1.2} />
                  <Ellipse cx={pl.center.x} cy={pl.center.y} rx={pl.rx * 0.72} ry={pl.ry * 0.72} fill="none" stroke={t.ink} strokeOpacity={0.12} strokeDasharray={[2, 5]} />
                </G>
              );
            })}

            {/* Thinketh's comparison sweep (system action). */}
            <AnimatedEllipse cx={width / 2} fill="#FFFFFF" stroke={color.ink} strokeOpacity={0.18} animatedProps={sweepProps} />

            {/* Connections inside each Mind, drawn on the floor. */}
            {world.edges.map((e) => {
              const p = geo.get(e.fromKey);
              const q = geo.get(e.toKey);
              if (!p || !q) return null;
              const t = toneOf(isMe(p.c.userId));
              return <Line key={`${e.fromKey}>${e.toKey}`} x1={p.foot.x} y1={p.foot.y} x2={q.foot.x} y2={q.foot.y} stroke={e.lit ? t.ink : color.ink} strokeOpacity={e.lit ? 0.7 : 0.1} strokeWidth={e.lit ? 2 : 1} />;
            })}

            {/* Shadows (light from the upper left), then stems. */}
            {ordered.map((c) => {
              const g = geo.get(c.key)!;
              return <Ellipse key={`s-${c.key}`} cx={g.foot.x + g.r * 0.35} cy={g.foot.y + 1} rx={g.r * 1.15} ry={g.r * 0.42} fill={color.ink} opacity={0.12 + c.height * 0.06} />;
            })}

            {/* The teaching path: a possible route (dashed), the perspective travelling, Thinketh's checkpoint. */}
            {arc && path ? (
              <G>
                <Path d={arc.d} stroke={color.ink} strokeOpacity={0.3} strokeWidth={1.2} strokeDasharray={[3, 5]} fill="none" />
                <AnimatedPath d={arc.d} stroke={pathInk} strokeOpacity={path.state === "not_yet" ? 0.7 : 1} strokeWidth={3.2} strokeLinecap="round" fill="none" strokeDasharray={[arc.len, arc.len]} animatedProps={arcProps} />
                <Path d={arrowHead(arc.at(0.92), arc.at(0.99))} stroke={color.ink} strokeOpacity={0.4} strokeWidth={1.4} fill="none" strokeLinecap="round" />
              </G>
            ) : null}

            {/* Concept objects, back to front. */}
            {ordered.map((c) => {
              const g = geo.get(c.key)!;
              const me = isMe(c.userId);
              const k = me ? "me" : "other";
              const t = toneOf(me);
              const solid = c.evidence === "strong";
              return (
                <G key={c.key} opacity={c.role === "quiet" && (path || gap) ? 0.55 : 1}>
                  <Line x1={g.foot.x} y1={g.foot.y} x2={g.top.x} y2={g.top.y + g.r} stroke={t.ink} strokeOpacity={0.3} strokeWidth={1.3} />
                  <Ellipse cx={g.foot.x} cy={g.foot.y} rx={2.5} ry={1} fill={t.ink} opacity={0.4} />
                  {c.role === "focus" ? <Circle cx={g.top.x} cy={g.top.y} r={g.r + 7} fill={t.tint} fillOpacity={0.75} stroke={t.ink} strokeOpacity={c.changed ? 0.9 : 0.4} strokeWidth={c.changed ? 2.2 : 1.2} /> : null}
                  <Circle
                    cx={g.top.x}
                    cy={g.top.y}
                    r={g.r}
                    fill={solid ? `url(#sphere-${k})` : c.evidence === "developing" ? `url(#soft-${k})` : "#FFFFFF"}
                    stroke={t.ink}
                    strokeOpacity={solid ? 0 : 0.75}
                    strokeWidth={1.3}
                    strokeDasharray={c.evidence === "weak" ? [2, 2] : undefined}
                  />
                  {c.verified ? <Circle cx={g.top.x} cy={g.top.y} r={g.r + 2.5} fill="none" stroke={t.ink} strokeOpacity={0.55} strokeWidth={1} /> : null}
                  {c.role === "focus" ? (
                    <SvgText x={g.top.x} y={g.foot.y + 16} fontSize={10.5} fontFamily={font.sansSemibold} fill={t.ink} textAnchor="middle">
                      {levelWord(c)}
                    </SvgText>
                  ) : null}
                </G>
              );
            })}

            {/* The shared gap: the concept neither Mind is strong on, brought to the centre. */}
            {gap ? (
              <G>
                {gap.keys.map((k) => {
                  const g = geo.get(k);
                  return g ? <Line key={`gl-${k}`} x1={g.top.x} y1={g.top.y} x2={gapPt.x} y2={gapPt.y} stroke={color.ink} strokeOpacity={0.3} strokeDasharray={[3, 4]} /> : null;
                })}
                <Ellipse cx={gapPt.x + 6} cy={P(0, 0.34, 0).y} rx={20} ry={7} fill={color.ink} opacity={0.12} />
                <Circle cx={gapPt.x} cy={gapPt.y} r={17} fill="#FFFFFF" stroke={color.ink2} strokeWidth={1.5} strokeDasharray={[3, 3]} />
                {(() => {
                  const label = gap.name.length > 30 ? `${gap.name.slice(0, 28)}…` : gap.name;
                  const w = label.length * 6.2 + 16;
                  return (
                    <G>
                      <Rect x={gapPt.x - w / 2} y={gapPt.y - 42} width={w} height={20} rx={10} fill="#FFFFFF" stroke={color.edge} strokeWidth={1} />
                      <SvgText x={gapPt.x} y={gapPt.y - 28} fontSize={11} fontFamily={font.sansSemibold} fill={color.ink} textAnchor="middle">
                        {label}
                      </SvgText>
                    </G>
                  );
                })()}
              </G>
            ) : null}

            {changedGeo ? <AnimatedCircle cx={changedGeo.top.x} cy={changedGeo.top.y} fill="none" stroke={color.coral} strokeWidth={1.6} animatedProps={haloProps} /> : null}
            {arc && path?.state !== "not_yet" ? <AnimatedCircle r={4.5} fill={color.coral} animatedProps={headProps} /> : null}

            {/* Thinketh's evidence checkpoint: an upright gate on the learner's side. */}
            {gate && path && path.state !== "possible" && path.state !== "traveling" ? (
              <G>
                <AnimatedEllipse cx={gate.x} cy={gate.y} rx={7} ry={13} fill="#FFFFFF" fillOpacity={0.92} stroke={path.state === "not_yet" ? color.ink3 : color.ink} strokeWidth={1.8} animatedProps={gateProps} />
                {path.state === "verified" ? <Path d={`M${gate.x - 3.5},${gate.y} L${gate.x - 1},${gate.y + 3} L${gate.x + 4},${gate.y - 3.5}`} stroke={color.ink} strokeWidth={1.8} fill="none" strokeLinecap="round" /> : null}
                <Rect x={gate.x - 30} y={gate.y + 16} width={60} height={16} rx={8} fill="#FFFFFF" fillOpacity={0.94} />
                <SvgText x={gate.x} y={gate.y + 27.5} fontSize={9.5} letterSpacing={0.8} fontFamily={font.sansSemibold} fill={path.state === "not_yet" ? color.ink3 : color.ink} textAnchor="middle">
                  {path.state === "grading" ? "GRADING" : path.state === "verified" ? "VERIFIED" : path.state === "not_yet" ? "NOT YET" : "CHECK"}
                </SvgText>
              </G>
            ) : null}

            {/* One source enters the room and resolves into two paths, one per Mind. */}
            {source ? (
              <G>
                {source.sides.map((s) => {
                  const pl = platforms.find((p) => p.side === s.side)!;
                  const me = !!person(s.userId)?.isMe;
                  const t = toneOf(me);
                  const end = { x: pl.center.x, y: pl.center.y - pl.ry - 4 };
                  const ink = source.claim === "similar" ? color.ink3 : t.ink;
                  return (
                    <Path
                      key={`sp-${s.userId}`}
                      d={`M${slab.x},${slab.y + 14} C${slab.x},${slab.y + 60} ${end.x},${end.y - 50} ${end.x},${end.y}`}
                      stroke={ink}
                      strokeWidth={2.2}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={source.claim === "reading" ? [4, 5] : undefined}
                    />
                  );
                })}
                <Ellipse cx={slab.x + 8} cy={slab.y + 40} rx={44} ry={8} fill={color.ink} opacity={0.1} />
                <Path d={`M${slab.x - 46},${slab.y - 8} L${slab.x + 38},${slab.y - 14} L${slab.x + 46},${slab.y + 10} L${slab.x - 38},${slab.y + 16} Z`} fill="#FFFFFF" stroke={color.ink} strokeOpacity={0.35} strokeWidth={1.2} />
                <Line x1={slab.x - 30} y1={slab.y - 2} x2={slab.x + 28} y2={slab.y - 6} stroke={color.ink} strokeOpacity={0.25} />
                <Line x1={slab.x - 28} y1={slab.y + 5} x2={slab.x + 20} y2={slab.y + 1} stroke={color.ink} strokeOpacity={0.18} />
              </G>
            ) : null}

            {/* Muse: small, dark, unmistakable; its attention beam points at what it directs. */}
            {world.muse.visible ? (
              <G>
                <AnimatedPath fill={color.ink} fillOpacity={0.07} animatedProps={beamProps} />
                <AnimatedEllipse rx={12} ry={4} fill={color.ink} opacity={0.12} animatedProps={museShadow} />
                <AnimatedCircle r={13} fill="url(#museBody)" animatedProps={museBodyProps} />
                <AnimatedEllipse rx={4} ry={2.6} fill="#FFFFFF" opacity={0.22} animatedProps={museShineProps} />
                <AnimatedPath stroke={color.onInk} strokeWidth={1.6} fill="none" strokeLinejoin="round" animatedProps={museGlyphProps} />
              </G>
            ) : null}
          </Svg>

          {/* People: who stands where. */}
          {platforms.map((pl) =>
            pl.who ? (
              <Pressable
                key={`p-${pl.side}`}
                onPress={() => onSelect({ kind: "mind", userId: pl.who!.userId })}
                accessibilityRole="button"
                accessibilityLabel={`${pl.who.label}'s Mind${pl.who.persona ? ", demo persona on this phone" : ""}. Show evidence.`}
                style={[styles.person, { left: pl.center.x - 52, top: pl.center.y + pl.ry + 6 }]}
              >
                <View style={[styles.personRing, { borderColor: toneOf(pl.who.isMe).ink }]}>
                  <Avatar name={pl.who.name} size={22} tint={toneOf(pl.who.isMe).tint} ink={toneOf(pl.who.isMe).ink} />
                </View>
                <View>
                  <T style={styles.personName} numberOfLines={1}>
                    {pl.who.label}
                  </T>
                  {pl.who.persona ? <T style={styles.personNote}>demo persona</T> : null}
                </View>
              </Pressable>
            ) : null,
          )}

          {/* Muse's label, following its body. */}
          {world.muse.visible ? <MuseLabel mx={mx} my={my} text={world.muse.waiting ? "choosing…" : world.muse.by === "planner" ? "Planner" : "Muse"} onPress={() => onSelect({ kind: "muse" })} /> : null}

          {/* Source outcome chips: each side's real minutes, new ideas and focus. */}
          {source
            ? source.sides.map((s) => {
                const pl = platforms.find((p) => p.side === s.side)!;
                const me = !!person(s.userId)?.isMe;
                return (
                  <Pressable
                    key={`sc-${s.userId}`}
                    onPress={() => onSelect({ kind: "source" })}
                    accessibilityRole="button"
                    accessibilityLabel={`${person(s.userId)?.label}: ${s.status === "processing" ? "still reading" : `about ${Math.round(s.minutes ?? 0)} useful minutes, ${s.ideas} new ideas${s.focus ? `, focus ${s.focus}` : ""}`}`}
                    style={[styles.outcome, { left: s.side === "left" ? 8 : width / 2 + 4, top: Math.min(height - 64, pl.center.y + pl.ry + 52), borderColor: toneOf(me).ink }]}
                  >
                    <T style={[styles.outcomeHead, { color: s.status === "failed" ? color.ink3 : toneOf(me).ink }]}>{s.status === "processing" ? "Reading…" : s.status === "failed" ? "Couldn't read it" : `~${Math.max(1, Math.round(s.minutes ?? 0))} min · ${s.ideas} new`}</T>
                    {s.focus ? (
                      <T style={styles.outcomeBody} numberOfLines={2}>
                        {s.focus}
                      </T>
                    ) : null}
                  </Pressable>
                );
              })
            : null}

          {/* Touch targets (44pt) for every object: concept, path, gap, source. */}
          {ordered.map((c) => {
            const g = geo.get(c.key)!;
            return (
              <Pressable
                key={`t-${c.key}`}
                onPress={() => onSelect({ kind: "concept", key: c.key })}
                accessibilityRole="button"
                accessibilityLabel={`${person(c.userId)?.label}: ${c.name}, ${levelWord(c)}. Show evidence.`}
                style={[styles.hit, { left: g.top.x - 22, top: g.top.y - 22 }]}
              />
            );
          })}
          {arc && path ? (
            <Pressable onPress={() => onSelect({ kind: "path" })} accessibilityRole="button" accessibilityLabel="The teaching path. Show the rule and evidence." style={[styles.hit, { left: arc.at(0.5).x - 22, top: arc.at(0.5).y - 22 }]} />
          ) : null}
          {gap ? <Pressable onPress={() => onSelect({ kind: "gap" })} accessibilityRole="button" accessibilityLabel={`Shared gap: ${gap.name}`} style={[styles.hit, { left: gapPt.x - 22, top: gapPt.y - 22 }]} /> : null}
          {source ? <Pressable onPress={() => onSelect({ kind: "source" })} accessibilityRole="button" accessibilityLabel={`Shared source: ${source.title}`} style={[styles.hit, { left: slab.x - 30, top: slab.y - 22, width: 60 }]} /> : null}
        </Animated.View>
      </GestureDetector>

      {!following ? (
        <Pressable onPress={onReturnToLive} accessibilityRole="button" accessibilityLabel="Return to the live focus" style={styles.returnLive}>
          <View style={styles.liveDot} />
          <T style={styles.returnText}>Return to live</T>
        </Pressable>
      ) : null}
    </View>
  );
}

function MuseLabel({ mx, my, text, onPress }: { mx: { get: () => number }; my: { get: () => number }; text: string; onPress: () => void }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: mx.get() - 40 }, { translateY: my.get() + 15 }] }));
  return (
    <Animated.View style={[styles.museLabel, style]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${text === "Planner" ? "Thinketh's planner" : "Muse"}: see what it did`} hitSlop={10}>
        <T style={styles.museText}>{text}</T>
      </Pressable>
    </Animated.View>
  );
}

function levelWord(c: WorldConcept): string {
  if (c.changed) return "verified now";
  if (c.verified) return "verified";
  return c.evidence === "strong" ? "strong" : c.evidence === "developing" ? "developing" : "starting out";
}

/** A raised arc between two points, with its length and a point-at-fraction function. */
function arcBetween(p: Pt, q: Pt) {
  const c = { x: (p.x + q.x) / 2, y: Math.min(p.y, q.y) - 46 };
  const at = (t: number): Pt => {
    "worklet";
    const u = 1 - t;
    return { x: u * u * p.x + 2 * u * t * c.x + t * t * q.x, y: u * u * p.y + 2 * u * t * c.y + t * t * q.y };
  };
  let len = 0;
  let prev = p;
  for (let i = 1; i <= 24; i++) {
    const n = at(i / 24);
    len += Math.hypot(n.x - prev.x, n.y - prev.y);
    prev = n;
  }
  return { d: `M${p.x},${p.y} Q${c.x},${c.y} ${q.x},${q.y}`, len, at };
}

function arrowHead(from: Pt, to: Pt): string {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const l = 7;
  const p1 = { x: to.x - l * Math.cos(ang - 0.5), y: to.y - l * Math.sin(ang - 0.5) };
  const p2 = { x: to.x - l * Math.cos(ang + 0.5), y: to.y - l * Math.sin(ang + 0.5) };
  return `M${p1.x},${p1.y} L${to.x},${to.y} L${p2.x},${p2.y}`;
}

const styles = StyleSheet.create({
  person: { position: "absolute", width: 104, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 44 },
  personRing: { borderWidth: 1.5, borderRadius: 14, padding: 1 },
  personName: { fontFamily: font.sansSemibold, fontSize: 13, lineHeight: 16, color: color.ink },
  personNote: { fontFamily: font.sans, fontSize: 10, lineHeight: 12, color: color.ink3 },
  museLabel: { position: "absolute", left: 0, top: 0, width: 80, alignItems: "center" },
  museText: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, color: color.ink2, backgroundColor: "rgba(251,249,247,0.85)", paddingHorizontal: 4, borderRadius: 4, overflow: "hidden" },
  outcome: { position: "absolute", width: "44%", padding: 8, borderRadius: 12, backgroundColor: color.canvas, borderWidth: 1 },
  outcomeHead: { fontFamily: font.sansSemibold, fontSize: 12.5, lineHeight: 16 },
  outcomeBody: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 15, color: color.ink2, marginTop: 1 },
  hit: { position: "absolute", width: 44, height: 44, borderRadius: 22 },
  returnLive: { position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: 999, backgroundColor: color.ink },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.coral },
  returnText: { fontFamily: font.sansSemibold, fontSize: 12.5, lineHeight: 16, color: color.onInk },
});
