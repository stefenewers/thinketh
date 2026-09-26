// Native text around the room: the ten-second read, and who each agent is and what they're doing.
// The canvas is never the only way to reach this information.
import { Pressable, StyleSheet, View } from "react-native";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { Sheet } from "@/components/Sheet";
import { T } from "@/components/Text";
import { color, font, gutter, space } from "@/theme/tokens";
import type { WorldView } from "./worldState";

/** Who is teaching, what idea, what Thinketh is waiting for, and whether it was verified. */
export function WorldNow({ world }: { world: WorldView }) {
  const v = world.now.verified;
  const tone = v === true ? color.coral : v === false ? color.ink3 : world.thinketh ? color.ink : color.ink3;
  return (
    <View style={styles.now} accessibilityLiveRegion="polite" accessible accessibilityLabel={[world.now.teaching, world.now.idea, world.now.waitingFor].filter(Boolean).join(". ")}>
      {world.now.teaching || world.now.idea ? (
        <T style={styles.nowTitle} numberOfLines={2}>
          {world.now.teaching ?? ""}
          {world.now.teaching && world.now.idea ? <T style={styles.nowIdea}> · {world.now.idea}</T> : <T style={styles.nowIdea}>{world.now.idea ?? ""}</T>}
        </T>
      ) : null}
      <View style={styles.waitRow}>
        <View style={[styles.waitDot, { backgroundColor: tone }]} />
        <T style={[styles.wait, v === true && { color: color.ink }]} numberOfLines={2}>
          {world.now.waitingFor}
        </T>
      </View>
    </View>
  );
}

/** Tap an agent: their role, what they're doing now, where they're acting from, what the room shares. */
export function AgentSheet({ room, world, me, userId, onClose, onSeeMind }: { room: PlaygroundRoom | null; world: WorldView; me: string; userId: string | null; onClose: () => void; onSeeMind: (userId: string) => void }) {
  const a = world.agents.find((x) => x.userId === userId);
  const host = room?.participants.find((p) => p.role === "host");
  const snap = room?.snapshots.find((s) => s.userId === userId);
  const row = (label: string, value: string) => (
    <View key={label} style={styles.row}>
      <T variant="meta" style={{ color: color.ink3, width: 96 }}>
        {label}
      </T>
      <T variant="meta" style={{ color: color.ink, flex: 1 }}>
        {value}
      </T>
    </View>
  );
  const role = !a?.role ? "In the room" : a.role === "teacher" ? "Teaching this move" : a.role === "learner" ? "Learning this move" : "Learning together";
  const device = !a ? "" : a.isMe ? "This device" : a.persona ? `Seeded demo persona. ${host?.displayName ?? "The host"} types for them on this phone; it isn't a second live device.` : "Their own device";
  return (
    <Sheet visible={!!a} onClose={onClose} title={a ? (a.isMe ? "You" : a.name) : ""}>
      {a ? (
        <View style={{ paddingHorizontal: gutter }}>
          {row("Role", role)}
          {row("Now", a.doing)}
          {row("Acting from", device)}
          {snap ? row("Shares", `Knowledge state for ${snap.concepts.length} concepts. Never: ${snap.excludes.join(", ")}.`) : null}
          {snap ? (
            <Pressable onPress={() => onSeeMind(a.userId)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", marginTop: space.s }}>
              <T variant="meta" style={{ color: color.ink, fontFamily: font.sansSemibold }}>
                {a.userId === me ? "See your shared Mind snapshot" : `See ${a.name}'s shared Mind snapshot`}
              </T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  now: { paddingHorizontal: gutter, paddingTop: space.s, paddingBottom: space.xs, gap: 3 },
  nowTitle: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, color: color.ink },
  nowIdea: { fontFamily: font.sans, fontSize: 15, lineHeight: 20, color: color.ink2 },
  waitRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  waitDot: { width: 7, height: 7, borderRadius: 4 },
  wait: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 18, color: color.ink2, flexShrink: 1 },
  row: { flexDirection: "row", gap: space.s, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.lineSoft },
});
