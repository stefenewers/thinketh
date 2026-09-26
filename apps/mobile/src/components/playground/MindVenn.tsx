import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import type { MindSnapshot } from "@thinketh/contracts";
import { Avatar } from "@/components/system";
import { T } from "@/components/Text";
import { useReducedMotion } from "@/lib/hooks";
import { PATH_PROGRESS, type StageState } from "@/lib/roomStory";
import { color, font } from "@/theme/tokens";

// The Playground room (storyboard 09-11): two Minds as overlapping circles, each holding a small
// Mindprint. You are coral, the other Mind is partner blue. One canvas for the whole exchange: the
// concept in play sits in both Minds, and the coral path between them only completes when Thinketh
// verifies the learner's answer. Every animation targets a value derived from the room state and
// starts AT that value when mounted, so a refetch, reconnect or remount never replays a beat.

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const MAX_NODES = 7;
/** Where the transfer checkpoint sits on the path (fraction from teacher to learner). */
const GATE_AT = 0.68;
/** Verified moments already celebrated on this device (room + event seq): never twice. */
const celebrated = new Set<string>();

export function MindVenn({
  left,
  right,
  me,
  width,
  height = 250,
  stage,
  celebrateKey,
}: {
  left: MindSnapshot;
  right: MindSnapshot;
  me: string;
  width: number;
  height?: number;
  stage: StageState;
  /** A stable id for the verified event (room id + seq); the success pulse plays once per id. */
  celebrateKey?: string;
}) {
  const reduced = useReducedMotion();
  const head = 38;
  const h = height - head;
  const r = Math.min(h / 2 - 6, width * 0.3);
  const cy = head + h / 2;
  const off = r * 0.6;
  const sides = [
    { snap: left, cx: width / 2 - off, inward: 1 },
    { snap: right, cx: width / 2 + off, inward: -1 },
  ] as const;
  const focus = stage.conceptId;
  const tone = (userId: string) => (userId === me ? { ink: color.coral, tint: color.coralTint } : { ink: color.partner, tint: color.partnerTint });

  const placed = sides.map(({ snap, cx, inward }) => {
    const concepts = [...snap.concepts].sort((a, b) => b.importance - a.importance || a.conceptId.localeCompare(b.conceptId));
    const focusConcept = focus ? concepts.find((c) => c.conceptId === focus) : undefined;
    const rest = concepts.filter((c) => c !== focusConcept).slice(0, MAX_NODES - (focusConcept ? 1 : 0));
    // The concept in play sits a little inside each circle, so the path between them is long enough to read.
    const fx = cx + inward * r * 0.1;
    const pts = new Map<string, { x: number; y: number }>();
    if (focusConcept) pts.set(focusConcept.conceptId, { x: fx, y: cy });
    let k = 0;
    rest.forEach((c) => {
      for (;;) {
        const t = (k + 0.5) / (rest.length + 3);
        const ang = k * 2.399963 + (inward === 1 ? Math.PI * 0.9 : -Math.PI * 0.1);
        const d = r * (0.2 + 0.66 * Math.sqrt(t));
        const x = cx + Math.cos(ang) * d;
        const y = cy + Math.sin(ang) * d;
        k += 1;
        if (!focusConcept || Math.hypot(x - fx, y - cy) > r * 0.34 || k > 40) {
          pts.set(c.conceptId, { x, y });
          break;
        }
      }
    });
    const shown = new Set(pts.keys());
    const edges = snap.edges.filter((e) => shown.has(e.fromConceptId) && shown.has(e.toConceptId)).slice(0, 12);
    return { snap, cx, pts, edges, focusConcept, concepts: [focusConcept, ...rest].filter((c): c is NonNullable<typeof c> => !!c), tone: tone(snap.userId) };
  });

  const teacher = placed.find((p) => p.snap.userId === stage.teacherId);
  const learner = placed.find((p) => p.snap.userId === stage.learnerId);
  const a = teacher && focus ? teacher.pts.get(focus) : undefined;
  const b = learner && focus ? learner.pts.get(focus) : undefined;
  const hasPath = !!(a && b) && ["found", "teaching", "checkpoint", "grading", "verified", "not_yet"].includes(stage.beat);
  const names = placed.map((p) => (p.snap.userId === me ? "You" : p.snap.displayName));

  // The path: its progress is the room's state, eased when it changes while you watch.
  const target = hasPath ? PATH_PROGRESS[stage.beat] : 0;
  const progress = useSharedValue(target);
  useEffect(() => {
    progress.set(reduced ? target : withTiming(target, { duration: stage.beat === "verified" ? 1100 : 900, easing: Easing.inOut(Easing.cubic) }));
  }, [target, reduced, progress, stage.beat]);

  // The travelling head breathes while the teacher explains or Thinketh grades: work in progress, not a result.
  const breathing = stage.beat === "teaching" || stage.beat === "grading" || stage.waiting === "muse";
  // The travelling head is shown only while knowledge is in motion; never after a verdict.
  const inMotion = stage.beat === "teaching" || stage.beat === "checkpoint" || stage.beat === "grading";
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduced || !breathing) {
      pulse.set(1);
      return;
    }
    pulse.set(withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false));
  }, [breathing, reduced, pulse]);

  // The success pulse on the learner's concept: once per verified event, only if it happens while mounted.
  const halo = useSharedValue(0);
  useEffect(() => {
    if (stage.beat !== "verified" || !celebrateKey || celebrated.has(celebrateKey)) return;
    celebrated.add(celebrateKey);
    if (reduced) return;
    halo.set(0);
    halo.set(withSequence(withTiming(0, { duration: 900 }), withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })));
  }, [stage.beat, celebrateKey, reduced, halo]);

  const ax = a?.x ?? 0;
  const ay = a?.y ?? 0;
  const bx = b?.x ?? 0;
  const by = b?.y ?? 0;
  const lineProps = useAnimatedProps(() => ({ x2: ax + (bx - ax) * progress.get(), y2: ay + (by - ay) * progress.get() }));
  const headProps = useAnimatedProps(() => ({
    cx: ax + (bx - ax) * progress.get(),
    cy: ay + (by - ay) * progress.get(),
    opacity: progress.get() > 0.02 && progress.get() < 0.99 ? pulse.get() : 0,
  }));
  const haloProps = useAnimatedProps(() => ({ r: 6 + halo.get() * 14, opacity: halo.get() > 0 ? 1 - halo.get() : 0 }));

  // Muse: anchored above the path while it conducts this move; quiet at the top otherwise.
  // Only while Muse is actually conducting this move; grading and the verdict are Thinketh's.
  const anchored = hasPath && (stage.beat === "teaching" || stage.beat === "checkpoint");
  const gapMid = placed.length === 2 ? { x: width / 2, y: cy - r * 0.62 } : { x: width / 2, y: head + 4 };
  const museTarget = anchored && a && b ? { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - r * 0.62 } : stage.beat === "gap" ? gapMid : { x: width / 2, y: head + 14 };
  const mx = useSharedValue(museTarget.x);
  const my = useSharedValue(museTarget.y);
  useEffect(() => {
    if (reduced) {
      mx.set(museTarget.x);
      my.set(museTarget.y);
      return;
    }
    mx.set(withTiming(museTarget.x, { duration: 700, easing: Easing.inOut(Easing.cubic) }));
    my.set(withTiming(museTarget.y, { duration: 700, easing: Easing.inOut(Easing.cubic) }));
  }, [museTarget.x, museTarget.y, reduced, mx, my]);
  const museStyle = useAnimatedStyle(() => ({ transform: [{ translateX: mx.get() - 16 }, { translateY: my.get() - 16 }] }));
  const museOpacity = useAnimatedStyle(() => ({ opacity: stage.waiting === "muse" ? pulse.get() : 1 }));
  const showMuse = anchored || stage.beat === "gap" || stage.waiting === "muse";
  const museLabel = stage.waiting === "muse" ? "choosing…" : stage.conductedBy === "planner" ? "Planner" : "Muse";

  const gate = a && b ? { x: a.x + (b.x - a.x) * GATE_AT, y: a.y + (b.y - a.y) * GATE_AT } : undefined;
  const showGate = !!gate && (stage.beat === "checkpoint" || stage.beat === "grading" || stage.beat === "not_yet");
  const gateInk = stage.beat === "not_yet" ? color.ink3 : color.ink;
  const levelWord = (c: NonNullable<(typeof placed)[number]["focusConcept"]>) =>
    c.verified ? "verified" : c.level === "strong" || c.level === "intermediate" ? "strong" : c.level === "developing" ? "developing" : "starting out";

  return (
    <View
      style={{ width, height }}
      accessible
      accessibilityLabel={`${names[0]} and ${names[1]}: two Minds. ${a3(stage, placed.find((p) => p.snap.userId === stage.teacherId)?.snap.displayName, placed.find((p) => p.snap.userId === stage.learnerId)?.snap.displayName)}`}
    >
      <Svg width={width} height={height}>
        {placed.map((p) => (
          <G key={`c-${p.snap.userId}`}>
            <Circle cx={p.cx} cy={cy} r={r} fill={p.tone.tint} fillOpacity={0.62} stroke={p.tone.ink} strokeOpacity={0.26} strokeWidth={1.2} />
            <Circle cx={p.cx} cy={cy} r={r * 0.77} fill="none" stroke={p.tone.ink} strokeOpacity={0.1} strokeWidth={1} strokeDasharray={[2, 6]} />
          </G>
        ))}
        {placed.map((p) => (
          <G key={`e-${p.snap.userId}`}>
            {p.edges.map((e) => {
              const s = p.pts.get(e.fromConceptId)!;
              const t = p.pts.get(e.toConceptId)!;
              const lit = stage.beat === "verified" && p === learner && (e.fromConceptId === focus || e.toConceptId === focus);
              return <Line key={`${e.fromConceptId}-${e.toConceptId}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={lit ? p.tone.ink : color.ink} strokeOpacity={lit ? 0.6 : 0.14} strokeWidth={lit ? 1.8 : 1} />;
            })}
          </G>
        ))}

        {hasPath && a && b ? (
          <G>
            {/* The route the knowledge could take: faint until something travels it. */}
            <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color.ink} strokeOpacity={0.22} strokeWidth={1} strokeDasharray={[3, 4]} />
            {/* Coral while knowledge is in motion; gray once an answer didn't verify (nothing moved). */}
            <AnimatedLine x1={a.x} y1={a.y} stroke={stage.beat === "not_yet" ? color.ink3 : color.coral} strokeOpacity={stage.beat === "not_yet" ? 0.6 : 1} strokeWidth={3.2} strokeLinecap="round" animatedProps={lineProps} />
            {/* Direction: teacher to learner. */}
            <Path d={chevron(a, b)} stroke={color.ink} strokeOpacity={0.35} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </G>
        ) : null}

        {showGate && gate && a && b ? (
          // The evidence checkpoint at the learner's Mind: the path stops here until Thinketh grades.
          <G>
            <Line {...gateBar(a, b, gate)} stroke={gateInk} strokeWidth={2} strokeLinecap="round" />
            <Circle cx={gate.x} cy={gate.y} r={4} fill={color.canvas} stroke={gateInk} strokeWidth={1.4} />
            {/* Above the path, clear of the concept rings and their level words below. */}
            <SvgText x={gate.x} y={gate.y - 14} fontSize={9.5} letterSpacing={0.8} fontFamily={font.sansSemibold} fill={gateInk} textAnchor="middle">CHECK</SvgText>
          </G>
        ) : null}

        {placed.map((p) => (
          <G key={`n-${p.snap.userId}`}>
            {p.concepts.map((c) => {
              const { x, y } = p.pts.get(c.conceptId)!;
              const isFocus = c.conceptId === focus;
              const strong = c.level === "strong" || c.level === "intermediate";
              const moved = stage.beat === "verified" && isFocus && p === learner;
              return (
                <G key={c.conceptId}>
                  {isFocus ? <Circle cx={x} cy={y} r={moved ? 25 : 19} fill={p.tone.tint} fillOpacity={moved ? 1 : 0.86} stroke={p.tone.ink} strokeOpacity={moved ? 0.9 : 0.5} strokeWidth={moved ? 2.4 : 1.5} /> : null}
                  {strong || isFocus ? (
                    <Circle cx={x} cy={y} r={isFocus ? (moved ? 10 : 8) : 3.2} fill={isFocus ? p.tone.ink : color.ink} fillOpacity={isFocus ? (p === learner && !moved ? 0.55 : 1) : 0.78} />
                  ) : (
                    <Circle cx={x} cy={y} r={3} fill={color.canvas} stroke={p.tone.ink} strokeOpacity={0.6} strokeWidth={1.1} />
                  )}
                </G>
              );
            })}
          </G>
        ))}

        {hasPath && b ? <AnimatedCircle cx={b.x} cy={b.y} fill="none" stroke={color.coral} strokeWidth={1.4} animatedProps={haloProps} /> : null}
        {hasPath && inMotion ? <AnimatedCircle r={4.5} fill={color.coral} animatedProps={headProps} /> : null}

        {/* The evidence level stays legible as the path moves and after the result. */}
        {hasPath && teacher?.focusConcept && learner?.focusConcept && a && b ? (
          <G>
            {/* Below the focus rings (radius 19-25), never inside them. */}
            <SvgText x={a.x} y={a.y + 36} fontSize={10.5} fontFamily={font.sansSemibold} fill={teacher.tone.ink} textAnchor="middle">
              {levelWord(teacher.focusConcept)}
            </SvgText>
            <SvgText x={b.x} y={b.y + (stage.beat === "verified" ? 42 : 36)} fontSize={10.5} fontFamily={font.sansSemibold} fill={stage.beat === "verified" ? learner.tone.ink : color.ink2} textAnchor="middle">
              {stage.beat === "verified" ? "verified" : levelWord(learner.focusConcept)}
            </SvgText>
          </G>
        ) : null}
      </Svg>

      {placed.map((p, i) => (
        <View key={`h-${p.snap.userId}`} style={[styles.head, { left: p.cx - 60 }]}>
          <View style={[styles.headRing, { borderColor: p.tone.ink }]}>
            <Avatar name={p.snap.displayName} size={20} tint={p.tone.tint} ink={p.tone.ink} />
          </View>
          <T style={styles.headName} numberOfLines={1}>
            {names[i]}
          </T>
        </View>
      ))}

      {showMuse ? (
        <Animated.View style={[styles.museWrap, { pointerEvents: "none" }, museStyle]}>
          <Animated.View style={[styles.muse, museOpacity]} accessibilityLabel={stage.conductedBy === "planner" ? "Thinketh's planner made this move" : "Muse is conducting"}>
            <Svg width={14} height={12}>
              <Path d="M2,10 L2,2 L7,7 L12,2 L12,10" stroke={color.onInk} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
          <T style={styles.museLabel}>{museLabel}</T>
        </Animated.View>
      ) : null}
    </View>
  );
}

function a3(s: StageState, teacher?: string, learner?: string): string {
  switch (s.beat) {
    case "found":
      return teacher && learner ? `${teacher} can teach ${learner}.` : "";
    case "teaching":
      return `${teacher ?? "The teacher"} is explaining. Not yet learned.`;
    case "checkpoint":
      return `Checkpoint: ${learner ?? "the learner"} applies it in a new case.`;
    case "grading":
      return "Thinketh is grading the answer.";
    case "verified":
      return `Verified. ${learner ?? "The learner"}'s Mind updated.`;
    case "not_yet":
      return "Not verified yet. The path stops at the checkpoint.";
    default:
      return "";
  }
}

/** A small chevron at the path's midpoint, pointing from teacher to learner. */
function chevron(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 - 9;
  const dir = Math.sign(b.x - a.x) || 1;
  return `M${mx - 3 * dir},${my - 3.5} L${mx + 2 * dir},${my} L${mx - 3 * dir},${my + 3.5}`;
}

/** The checkpoint gate: a short bar across the path. */
function gateBar(a: { x: number; y: number }, b: { x: number; y: number }, g: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 9;
  const ny = (dx / len) * 9;
  return { x1: g.x - nx, y1: g.y - ny, x2: g.x + nx, y2: g.y + ny };
}

const styles = StyleSheet.create({
  head: { position: "absolute", top: 0, width: 120, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  headRing: { borderWidth: 1.5, borderRadius: 12, padding: 0.5 },
  headName: { fontFamily: font.sansSemibold, fontSize: 14, lineHeight: 18, letterSpacing: -0.2, color: color.ink },
  museWrap: { position: "absolute", left: 0, top: 0, width: 32, alignItems: "center" },
  muse: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  museLabel: { marginTop: 2, fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 12, color: color.ink2, width: 80, textAlign: "center" },
});
