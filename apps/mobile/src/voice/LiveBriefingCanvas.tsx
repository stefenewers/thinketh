import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { ConceptEdge, KnowledgeItem } from "@thinketh/contracts";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Button } from "@/components/ui";
import { color, font, gutter, space } from "@/theme/tokens";
import { LiveCaption } from "./LiveCaption";
import { VisualBoundary, VoiceMindprint } from "./VoiceMindprint";
import type { VoicePhase } from "./voiceVisualState";

export type BriefingMind = { items: KnowledgeItem[]; edges: ConceptEdge[]; changedIds: Set<string> };

/**
 * Catch Me Up, live: what Thinketh is saying, and the part of your Mind it is about.
 * Presentation only. Nothing here reads or writes knowledge state.
 */
export function LiveBriefingCanvas({
  phase,
  topic,
  focusId,
  mind,
  caption,
  announce,
  aligned,
  lastUser,
  isMuted,
  level,
  reduceMotion,
  onToggleMic,
  onEnd,
  onText,
}: {
  phase: VoicePhase;
  /** What "NOW" refers to: the focused concept, else the briefing's lead topic. */
  topic: string | null;
  focusId: string | null;
  mind: BriefingMind | null;
  caption: { current: string; previous: string };
  announce: string;
  /** Captions are timed to the audio (alignment) rather than the turn transcript shown whole. */
  aligned: boolean;
  lastUser: string;
  isMuted: boolean;
  level: SharedValue<number>;
  reduceMotion: boolean;
  onToggleMic: () => void;
  onEnd: () => void;
  onText: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const canvasW = width - gutter * 2;
  const canvasH = Math.round(Math.min(300, height * 0.34));
  const speaking = phase === "speaking";

  return (
    <View>
      <View style={styles.header}>
        <T style={styles.title}>Catch Me Up</T>
        <View style={styles.live} accessibilityLabel={speaking ? "Live. Thinketh is speaking." : "Live. Your turn."}>
          <T style={styles.liveText}>LIVE</T>
          <View style={[styles.liveDot, { backgroundColor: speaking ? color.coral : color.ink3 }]} />
        </View>
      </View>

      {topic ? (
        <View style={{ marginTop: space.l }}>
          <T variant="label">Now</T>
          <T style={styles.topic} numberOfLines={2}>
            {topic}
          </T>
        </View>
      ) : null}

      <View style={{ marginTop: space.m, marginHorizontal: -space.xs }}>
        {mind ? (
          <VisualBoundary>
            <VoiceMindprint items={mind.items} edges={mind.edges} changedIds={mind.changedIds} focusId={focusId} width={canvasW} height={canvasH} level={level} reduceMotion={reduceMotion} />
          </VisualBoundary>
        ) : (
          <View style={{ height: canvasH }} />
        )}
      </View>

      <View style={{ marginTop: space.m }}>
        {speaking || caption.current ? (
          <LiveCaption current={caption.current} previous={caption.previous} announce={announce} reduceMotion={reduceMotion} />
        ) : null}
        {caption.current && !aligned && speaking ? (
          <T variant="meta" style={{ color: color.ink3, marginTop: space.xs }}>
            Transcript of this reply
          </T>
        ) : null}
      </View>

      <View style={styles.stateBlock}>
        {speaking ? (
          <T variant="support">Interrupt any time. Just start talking.</T>
        ) : phase === "user" ? (
          <>
            <T style={styles.turn}>Listening…</T>
            <T variant="support">Thinketh hears you. It keeps this in view while you talk.</T>
          </>
        ) : (
          <>
            <T style={styles.turn}>Your turn</T>
            <T variant="support">{isMuted ? "Your mic is off. Turn it on to reply." : "Ask about this change, or interrupt with anything you're unsure about."}</T>
            {lastUser ? (
              <T variant="meta" style={{ color: color.ink3, marginTop: space.xs }} numberOfLines={2}>
                You said: “{lastUser}”
              </T>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={onToggleMic}
          accessibilityRole="button"
          accessibilityLabel={isMuted ? "Microphone is off. Turn it on." : "Microphone is on. Turn it off."}
          style={({ pressed }) => [styles.mic, isMuted && styles.micOff, pressed && { opacity: 0.7 }]}
        >
          <Icon name="voice" size={20} color={isMuted ? color.ink3 : color.ink} />
          {isMuted ? <View style={styles.micSlash} /> : null}
        </Pressable>
        <Button label="End catch-up" accessibilityLabel="End catch-up" onPress={onEnd} style={{ flex: 1 }} />
      </View>
      <Button kind="quiet" label="Read it as text instead" style={{ alignSelf: "center" }} onPress={onText} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 22, color: color.ink },
  live: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveText: { fontFamily: font.sansSemibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, color: color.ink2 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  topic: { fontFamily: font.sansSemibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: color.ink, marginTop: 2 },
  stateBlock: { marginTop: space.l, gap: 2, minHeight: 44 },
  turn: { fontFamily: font.sansSemibold, fontSize: 16, lineHeight: 21, color: color.ink },
  controls: { flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.xl },
  mic: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  micOff: { backgroundColor: color.surfaceMuted },
  micSlash: { position: "absolute", width: 26, height: 1.5, backgroundColor: color.ink3, transform: [{ rotate: "-45deg" }] },
});
