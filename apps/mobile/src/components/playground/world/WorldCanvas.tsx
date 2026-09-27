// The Playground room: one persistent scene for the whole session. It draws the WorldView; it owns
// no learning state. Only newly observed events on this device play their one-time motion.
import { useEffect } from "react";
import { Image, Platform, Pressable, StyleSheet, View, type ImageStyle } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { MuseMark } from "@/components/brand/MuseMark";
import { Mark } from "@/components/Logo";
import { T } from "@/components/Text";
import { color, font, pixel } from "@/theme/tokens";
import { AGENT_SPRITES, PROPS } from "./assets";
import { GrokbotLayer } from "../grokbot/GrokbotLayer";
import { projectGrokbot } from "../grokbot/grokbotState";
import { Character } from "./Character";
import { CheckpointGate, ConceptToken, MindRing } from "./ConceptToken";
import { sceneLayout } from "./layout";
import { usePaused } from "./usePaused";
import { freshEffects, PLACES, type WorldView } from "./worldState";

export type WorldSelection = { kind: "agent"; userId: string } | { kind: "concept" } | { kind: "muse" };

/** Per room: the seq when this device first saw it. Anything at or before it is history. */
const firstSeen = new Map<string, number>();
/** One-time effects already shown on this device (room id + event seq). */
const played = new Set<string>();

const pixelated = (Platform.OS === "web" ? { imageRendering: "pixelated" } : {}) as ImageStyle;
const TONE = { coral: color.coral, blue: color.partner } as const;
const EXPLORE_ZOOM = 1.3;

export function WorldCanvas({
  room,
  world,
  width,
  height,
  following,
  reduced,
  onSelect,
  onFollow,
}: {
  room: PlaygroundRoom | null;
  world: WorldView;
  width: number;
  height: number;
  following: boolean;
  reduced: boolean;
  onSelect: (s: WorldSelection) => void;
  onFollow: (follow: boolean) => void;
}) {
  const paused = usePaused();
  const L = sceneLayout(width, height);
  const grok = projectGrokbot(room);

  if (room && !firstSeen.has(room.id)) firstSeen.set(room.id, room.seq);
  const fx = freshEffects(room, room ? firstSeen.get(room.id) : undefined, played);
  // Mark one-time effects as shown once they've rendered, so a remount or return settles.
  useEffect(() => {
    for (const k of fx.enterKeys) played.add(k);
    if (fx.celebrate) played.add(fx.celebrate);
  });

  // ---- Camera: Follow frames the current exchange; Explore allows a limited pan. Camera state only.
  const f = L.at(world.focus);
  const zoom = following ? world.focus.zoom : EXPLORE_ZOOM;
  const lim = (z: number) => ({ x: (width * (z - 1)) / 2, y: (height * (z - 1)) / 2 });
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  const target = { s: zoom, tx: clamp((width / 2 - f.x) * zoom, lim(zoom).x), ty: clamp((height * 0.55 - f.y) * zoom, lim(zoom).y) };
  const tx = useSharedValue(target.tx);
  const ty = useSharedValue(target.ty);
  const sc = useSharedValue(target.s);
  useEffect(() => {
    const t = (v: number) => (reduced ? v : withTiming(v, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    if (following) {
      tx.set(t(target.tx));
      ty.set(t(target.ty));
    }
    sc.set(t(target.s));
  }, [following, target.tx, target.ty, target.s, reduced, tx, ty, sc]);
  const start = useSharedValue({ x: 0, y: 0 });
  const maxX = lim(EXPLORE_ZOOM).x;
  const maxY = lim(EXPLORE_ZOOM).y;
  const pan = usePanGesture({
    enabled: !following,
    minDistance: 6,
    onActivate: () => {
      "worklet";
      start.set({ x: tx.get(), y: ty.get() });
    },
    onUpdate: (e) => {
      "worklet";
      tx.set(Math.max(-maxX, Math.min(maxX, start.get().x + e.translationX)));
      ty.set(Math.max(-maxY, Math.min(maxY, start.get().y + e.translationY)));
    },
  });
  const camera = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: sc.get() }] }));

  const present = world.agents.filter((a) => !a.gone);
  const byDepth = [...world.agents].sort((a, b) => a.at.y - b.at.y);
  const learner = world.agents.find((a) => a.userId === world.concept?.learnerId);
  const teacher = world.agents.find((a) => a.userId === world.concept?.teacherId);
  const conceptPt = world.concept ? L.at(world.concept.at) : null;
  const learnerMindPt = world.learnerMind ? L.at(world.learnerMind.at) : null;

  // Muse: a quiet named cue that moves to what it directs. Never a character.
  // Muse: a quiet named cue on the wall line, above what it directs. Never a character.
  const museTargetX =
    world.muse.target === "concept" && conceptPt
      ? conceptPt.x
      : world.muse.target
        ? (() => {
            const a = world.agents.find((x) => x.userId === world.muse.target);
            return a ? L.at(a.at).x : null;
          })()
        : null;
  const musePt = museTargetX !== null ? { x: museTargetX, y: 6 } : { x: width / 2, y: 8 };
  const museTargetPt = museTargetX;

  return (
    <View style={{ width, height, overflow: "hidden", backgroundColor: color.ground }}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ width, height }, camera]}>
          <Backdrop W={width} H={height} wallH={L.wallH} />
          {learnerMindPt && world.learnerMind ? <MindRing at={learnerMindPt} tone={TONE[world.learnerMind.tone]} solid={world.phase === "verified"} /> : null}
          {world.checkpoint && world.concept ? <CheckpointGate at={L.at(world.checkpoint)} state={world.concept.state} paused={paused} reduced={reduced} /> : null}
          {world.thinketh === "comparing" && present.length > 1 ? <CompareSweep from={L.at(PLACES.hostHome).x} to={L.at(PLACES.guestHome).x} y={L.at(PLACES.hostHome).y} paused={paused} reduced={reduced} /> : null}
          {byDepth.map((a) => (
              <Character
                key={a.userId}
                sprite={AGENT_SPRITES[a.tone]}
                to={L.at(a.at)}
                from={fx.entering.includes(a.userId) ? L.at(PLACES.door) : undefined}
                facing={a.facing}
                tone={TONE[a.tone]}
                label={a.label}
                tag={a.gone ? "left the room" : [a.role === "teacher" ? "teaching" : a.role === "learner" ? "learning" : null, a.persona ? "demo persona" : null].filter(Boolean).join(" · ") || undefined}
                react={!!fx.celebrate && a.userId === world.concept?.learnerId}
                paused={paused}
                reduced={reduced}
                a11y={`${a.label}${a.role ? `, ${a.role === "together" ? "learning together" : a.role}` : ""}. ${a.doing}. Show details`}
                onPress={() => onSelect({ kind: "agent", userId: a.userId })}
              />
          ))}
          {world.concept && conceptPt ? (
            <ConceptToken
              concept={world.concept}
              to={conceptPt}
              tone={teacher ? TONE[teacher.tone] : color.ink2}
              learnerTone={learner ? TONE[learner.tone] : color.ink2}
              paused={paused}
              reduced={reduced}
              onPress={() => onSelect({ kind: "concept" })}
            />
          ) : null}
          {/* Agent exchange: the latest message beside the agent that sent it; "…" only while a turn is in flight. */}
          {world.phase === "exchange" && !grok.present
            ? present.map((a) => {
                const typing = world.speaking === a.userId;
                const text = !typing && world.speech?.userId === a.userId ? world.speech.text : null;
                return typing || text ? <SpeechBubble key={`bubble-${a.userId}`} at={L.at(a.at)} width={width} text={text} tone={TONE[a.tone]} /> : null;
              })
            : null}
          {/* Grokbot (optional visiting challenger): arrives, speaks and answers only from the recorded challenge. */}
          <GrokbotLayer view={grok} layout={L} defenderAt={grok.defender ? present.find((a) => a.userId === grok.defender!.userId)?.at : undefined} width={width} paused={paused} reduced={reduced} />
          {world.muse.state !== "absent" ? <MuseCue at={musePt} state={world.muse.state} by={world.muse.by} pointing={museTargetPt !== null} paused={paused} reduced={reduced} onPress={() => onSelect({ kind: "muse" })} /> : null}
        </Animated.View>
      </GestureDetector>

      {world.thinketh ? (
        <View style={styles.system} accessibilityLiveRegion="polite">
          <Mark size={12} decorative />
          <T style={styles.systemText}>{world.thinketh === "comparing" ? "Thinketh is comparing both Minds" : "Thinketh is grading the answer"}</T>
        </View>
      ) : null}

      <View style={styles.modes}>
        {following ? (
          <Pressable onPress={() => onFollow(false)} accessibilityRole="button" accessibilityLabel="Explore the room" style={styles.modeBtn}>
            <T style={styles.modeText}>Explore</T>
          </Pressable>
        ) : (
          <Pressable onPress={() => onFollow(true)} accessibilityRole="button" accessibilityLabel="Return to the live action" style={[styles.modeBtn, styles.live]}>
            <View style={styles.liveDot} />
            <T style={[styles.modeText, { color: color.onInk }]}>Return to live</T>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** A short speech bubble above an agent. Static (no animation), so reduced motion needs nothing extra. */
function SpeechBubble({ at, width, text, tone }: { at: { x: number; y: number }; width: number; text: string | null; tone: string }) {
  const w = Math.min(176, width * 0.46);
  const left = Math.max(6, Math.min(width - w - 6, at.x - w / 2));
  return (
    <View style={{ position: "absolute", left, top: Math.max(4, at.y - 150), width: w, pointerEvents: "none" }} accessibilityLiveRegion="polite">
      <View style={[styles.bubble, { borderColor: tone }]}>
        <T style={styles.bubbleText} numberOfLines={4}>
          {text ?? "…"}
        </T>
      </View>
      <View style={[styles.bubbleTail, { left: Math.max(10, Math.min(w - 20, at.x - left - 5)), borderTopColor: tone }]} />
    </View>
  );
}

/** One quiet room: a pale wall with a window and the entrance, a warm floor, one plant. */
function Backdrop({ W, H, wallH }: { W: number; H: number; wallH: number }) {
  const doorH = Math.min(PROPS.door.height, wallH - 4);
  const doorW = (PROPS.door.width * doorH) / PROPS.door.height;
  const door = sceneLayout(W, H).at(PLACES.door);
  const winS = Math.min(PROPS.window.height, wallH - 26);
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: wallH, backgroundColor: pixel.wall }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: wallH - 5, height: 5, backgroundColor: pixel.trim }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: wallH, bottom: 0, backgroundColor: pixel.floor }} />
      {[0.34, 0.58, 0.8].map((k) => (
        <View key={k} style={{ position: "absolute", left: 0, right: 0, top: wallH + (H - wallH) * k, height: 1, backgroundColor: pixel.floorLine }} />
      ))}
      <Image source={PROPS.window.source} style={[{ position: "absolute", left: W * 0.14, top: (wallH - winS) / 2 - 2, width: winS, height: winS }, pixelated]} resizeMode="stretch" />
      <Image source={PROPS.door.source} style={[{ position: "absolute", left: door.x - doorW / 2, top: wallH - doorH, width: doorW, height: doorH }, pixelated]} resizeMode="stretch" />
      <Image source={PROPS.plant.source} style={[{ position: "absolute", left: W * 0.02, top: wallH - PROPS.plant.height + 22, width: PROPS.plant.width, height: PROPS.plant.height }, pixelated]} resizeMode="stretch" />
    </View>
  );
}

/** Thinketh's comparison: a light pass across both Minds, only while the request is in flight. */
function CompareSweep({ from, to, y, paused, reduced }: { from: number; to: number; y: number; paused: boolean; reduced: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(p);
    if (paused || reduced) return;
    p.set(withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(p);
  }, [paused, reduced, p]);
  const bar = useAnimatedStyle(() => ({ transform: [{ translateX: from + (to - from) * p.get() - 1 }] }));
  return <Animated.View style={[{ position: "absolute", pointerEvents: "none", left: 0, top: y - 86, width: 2, height: 96, borderRadius: 1, backgroundColor: color.ink, opacity: 0.18 }, bar]} />;
}

function MuseCue({ at, state, by, pointing, paused, reduced, onPress }: { at: { x: number; y: number }; state: WorldView["muse"]["state"]; by: "Muse" | "Planner"; pointing: boolean; paused: boolean; reduced: boolean; onPress: () => void }) {
  const x = useSharedValue(at.x);
  const y = useSharedValue(at.y);
  useEffect(() => {
    const t = (v: number) => (reduced ? v : withTiming(v, { duration: 850, easing: Easing.inOut(Easing.cubic) }));
    x.set(t(at.x));
    y.set(t(at.y));
  }, [at.x, at.y, reduced, x, y]);
  const pulse = useSharedValue(1);
  const choosing = state === "choosing";
  useEffect(() => {
    cancelAnimation(pulse);
    pulse.set(1);
    if (!choosing || paused || reduced) return;
    pulse.set(withRepeat(withTiming(0.4, { duration: 650 }), -1, true));
    return () => cancelAnimation(pulse);
  }, [choosing, paused, reduced, pulse]);
  const place = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() - 60 }, { translateY: y.get() }] }));
  const dim = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const text = choosing ? "Muse · choosing…" : by;
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: 120, alignItems: "center" }, place]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={choosing ? "Muse is choosing the next move. Show details" : `${by}, the conductor. Show details`} style={styles.muse}>
        {/* Muse's own mark when Muse acts; the deterministic planner keeps a plain "P". */}
        <Animated.View style={dim}>
          {by === "Planner" ? (
            <View style={styles.museDot}>
              <T style={styles.museM}>P</T>
            </View>
          ) : (
            <MuseMark size={13} />
          )}
        </Animated.View>
        <T style={styles.museText}>{text}</T>
      </Pressable>
      {pointing ? <View style={styles.caret} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  system: { position: "absolute", left: 10, top: 8, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: color.edge },
  systemText: { fontFamily: font.sansSemibold, fontSize: 11.5, color: color.ink },
  modes: { position: "absolute", right: 10, bottom: 8 },
  modeBtn: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: color.edge, flexDirection: "row", alignItems: "center", gap: 6 },
  modeText: { fontFamily: font.sansSemibold, fontSize: 12, color: color.ink },
  live: { backgroundColor: color.ink, borderColor: color.ink },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.coral },
  muse: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 1, borderColor: color.edge },
  museDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  museM: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 12, color: color.onInk },
  museText: { fontFamily: font.sansSemibold, fontSize: 11.5, color: color.ink },
  bubble: { backgroundColor: "#FFFFFF", borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  bubbleText: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 15, color: color.ink },
  bubbleTail: { position: "absolute", bottom: -6, width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderLeftColor: "transparent", borderRightColor: "transparent" },
  caret: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: color.edge, marginTop: -1 },
});
