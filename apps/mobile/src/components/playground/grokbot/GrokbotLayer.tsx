// Grokbot in the room: it walks in from the door when a challenge is first seen, stands between the
// agents, shows "…" only while its own call is in flight, and its delivered line after. The defending
// agent's line appears over that agent the same way. Driven only by projectGrokbot (recorded state).
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { color, font } from "@/theme/tokens";
import { GROKBOT_SPRITE } from "../world/assets";
import { Character } from "../world/Character";
import type { Layout } from "../world/layout";
import { PLACES, type Pt } from "../world/worldState";
import type { GrokbotView } from "./grokbotState";

/** Where Grokbot stands: the back of the room, between the two agents. */
export const GROKBOT_SPOT: Pt = { x: 0.5, y: 0.2 };
/** Challenges whose arrival already played on this device (a remount never replays it). */
const arrived = new Set<string>();

export function GrokbotLayer({
  view,
  layout,
  defenderAt,
  width,
  paused,
  reduced,
  onPress,
}: {
  view: GrokbotView;
  layout: Layout;
  /** Floor position of the defending agent, for its bubble. */
  defenderAt?: Pt;
  width: number;
  paused: boolean;
  reduced: boolean;
  onPress?: () => void;
}) {
  if (!view.present || !view.challengeId) return null;
  const at = layout.at(GROKBOT_SPOT);
  const fresh = !arrived.has(view.challengeId);
  if (fresh) arrived.add(view.challengeId);
  return (
    <>
      <Character
        key={view.challengeId}
        sprite={GROKBOT_SPRITE}
        to={at}
        from={fresh && !reduced ? layout.at(PLACES.door) : undefined}
        facing="left"
        tone={color.ink}
        label="Grokbot"
        tag="visiting challenger"
        react={false}
        paused={paused}
        reduced={reduced}
        a11y={`Grokbot, a visiting challenger. ${view.status}`}
        onPress={onPress}
      />
      {view.working || view.say ? <Bubble at={at} width={width} text={view.working ? null : view.say} dark /> : null}
      {view.defender && defenderAt ? <Bubble at={layout.at(defenderAt)} width={width} text={view.defender.working ? null : view.defender.say} /> : null}
    </>
  );
}

/** A short speech bubble above a character. Static, so reduced motion needs nothing extra. */
function Bubble({ at, width, text, dark }: { at: { x: number; y: number }; width: number; text: string | null; dark?: boolean }) {
  const w = Math.min(184, width * 0.5);
  const left = Math.max(6, Math.min(width - w - 6, at.x - w / 2));
  return (
    <View style={{ position: "absolute", left, top: Math.max(4, at.y - 128), width: w, pointerEvents: "none" }} accessibilityLiveRegion="polite">
      <View style={[styles.bubble, dark ? styles.dark : null]}>
        <T style={[styles.text, dark ? { color: color.onInk } : null]} numberOfLines={4}>
          {text ?? "…"}
        </T>
      </View>
      <View style={[styles.tail, { left: Math.max(10, Math.min(w - 20, at.x - left - 5)), borderTopColor: dark ? color.ink : color.edge }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: color.edge, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  dark: { backgroundColor: color.ink, borderColor: color.ink },
  text: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 15, color: color.ink },
  tail: { position: "absolute", bottom: -6, width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderLeftColor: "transparent", borderRightColor: "transparent" },
});
