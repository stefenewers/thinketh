import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { PlaygroundRoom, RoomEvent } from "@thinketh/contracts";
import { MuseMark } from "@/components/brand/MuseMark";
import { Mark } from "@/components/Logo";
import { Sheet } from "@/components/Sheet";
import { Avatar } from "@/components/system";
import { T } from "@/components/Text";
import { fmt2 } from "@/lib/knowledge";
import { color, font, space } from "@/theme/tokens";
import type { WorldView } from "../world/worldState";

/** What someone tapped in the room: a Mind, the idea between the agents, or Muse. */
export type Selection = { kind: "mind"; userId: string } | { kind: "idea" } | { kind: "muse" };

// ---------------------------------------------------------------------------
// Cues: transient captions for events this device newly observes (never replayed).

export type CueActor = { kind: "thinketh" | "muse" | "planner" | "person"; name: string };
export type VisualCue = { seq: number; kind: "arrive" | "compare" | "difference" | "leave"; actor: CueActor; label: string };

export function eventToVisualCue(e: RoomEvent, room: PlaygroundRoom, me: string): VisualCue | null {
  const who = (id: unknown) => (typeof id === "string" ? (id === me ? "You" : (room.participants.find((p) => p.userId === id)?.displayName ?? "Someone")) : "Someone");
  const person: CueActor = { kind: "person", name: who(e.actor) };
  switch (e.type) {
    case "participant_joined":
      return { seq: e.seq, kind: "arrive", actor: person, label: `${who(e.actor)} joined the room` };
    case "participant_left":
      return { seq: e.seq, kind: "leave", actor: person, label: `${who(e.actor)} left` };
    case "compare_started":
      return { seq: e.seq, kind: "compare", actor: { kind: "thinketh", name: "Thinketh" }, label: "Thinketh is comparing the two shared snapshots" };
    case "delta_ready":
      return { seq: e.seq, kind: "difference", actor: { kind: "thinketh", name: "Thinketh" }, label: e.summary };
    default:
      return null;
  }
}

/** Cues for events after `lastSeq`, in order. The caller keeps `lastSeq`, so nothing plays twice. */
export function cuesSince(room: PlaygroundRoom, lastSeq: number, me: string): VisualCue[] {
  return room.events
    .filter((e) => e.seq > lastSeq)
    .sort((a, b) => a.seq - b.seq)
    .map((e) => eventToVisualCue(e, room, me))
    .filter((c): c is VisualCue => !!c);
}

/** The last sequence number this device has shown per room: survives remounts, so nothing replays. */
const shownSeq = new Map<string, number>();
const CUE_MS = 1800;

/**
 * Newly observed room events, played once and in order. On first sight of a room (a load, a
 * reconnect, coming back to it) the settled state shows with its latest action as a still caption.
 * Cues never block the next human action; the room and the action area read the server state.
 */
export function useRoomCues(room: PlaygroundRoom | null, me: string, reduced: boolean): { cue: VisualCue | null; live: boolean } {
  const [live, setLive] = useState<VisualCue | null>(null);
  const queue = useRef<VisualCue[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!room) return;
    const last = shownSeq.get(room.id);
    // First sight (a load, a reconnect, coming back): settle, don't replay.
    if (last === undefined) {
      shownSeq.set(room.id, room.seq);
      return;
    }
    if (room.seq <= last) return;
    shownSeq.set(room.id, room.seq);
    queue.current.push(...cuesSince(room, last, me));
    const pump = () => {
      // Reduced motion: no sequence, only the latest action.
      const next = reduced ? queue.current.splice(0).at(-1) : queue.current.shift();
      if (!next) {
        timer.current = null;
        return;
      }
      setLive(next);
      timer.current = setTimeout(pump, queue.current.length ? CUE_MS : 0);
    };
    if (!timer.current) timer.current = setTimeout(pump, 0);
  }, [room?.id, room?.seq, me, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Before anything new is observed, the latest recorded action is shown still.
  const settled = room ? ([...room.events].reverse().map((e) => eventToVisualCue(e, room, me)).find((c) => c && c.kind !== "leave") ?? null) : null;
  const liveForRoom = live && room && room.events.some((e) => e.seq === live.seq) ? live : null;
  return liveForRoom ? { cue: liveForRoom, live: true } : { cue: settled, live: false };
}

/** Who acted, in one line: Thinketh's actions look like Thinketh's, Muse's like Muse's. */
export function ActionBanner({ cue, onPress }: { cue: VisualCue | null; onPress: () => void }) {
  if (!cue) return null;
  const k = cue.actor.kind;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${cue.label}. Show the recorded action.`} accessibilityLiveRegion="polite" style={({ pressed }) => [styles.banner, pressed && { opacity: 0.8 }]}>
      {k === "thinketh" ? (
        <View style={styles.badgeThinketh}>
          <Mark size={11} tone="dark" decorative />
        </View>
      ) : k === "muse" || k === "planner" ? (
        k === "muse" ? (
          <View style={styles.badgeMuseMark}>
            <MuseMark size={12} />
          </View>
        ) : (
          <View style={[styles.badgeMuse, { backgroundColor: color.ink2 }]}>
            <T style={styles.badgeMuseText}>P</T>
          </View>
        )
      ) : (
        <Avatar name={cue.actor.name === "You" ? "Stefen" : cue.actor.name} size={22} />
      )}
      <T style={styles.bannerText} numberOfLines={2}>
        <T style={styles.bannerActor}>{cue.actor.name}</T> · {cue.label.replace(new RegExp(`^${cue.actor.name} `), "")}
      </T>
    </Pressable>
  );
}

/** The evidence behind anything tapped in the room: the rule, the numbers, the recorded action. */
export function EvidenceSheet({ room, world, me, selection, cue, onClose }: { room: PlaygroundRoom; world: WorldView; me: string; selection: Selection | "action" | null; cue: VisualCue | null; onClose: () => void }) {
  const name = (id?: string) => (id === me ? "You" : (room.participants.find((p) => p.userId === id)?.displayName ?? "Someone"));
  const concept = (userId: string, conceptId: string) => room.snapshots.find((s) => s.userId === userId)?.concepts.find((c) => c.conceptId === conceptId);
  const deltaItem = (conceptId: string) => (room.delta ? [...room.delta.bTeachesA, ...room.delta.aTeachesB, ...room.delta.sharedGaps, ...room.delta.conflicts].find((i) => i.conceptId === conceptId) : undefined);
  const row = (label: string, value: string) => (
    <View key={label} style={styles.row}>
      <T variant="meta" style={{ color: color.ink3, width: 108 }}>
        {label}
      </T>
      <T variant="meta" style={{ color: color.ink, flex: 1, fontVariant: ["tabular-nums"] }}>
        {value}
      </T>
    </View>
  );
  let title = "";
  let body: React.ReactNode = null;
  if (selection === "action" && cue) {
    const e = room.events.find((x) => x.seq === cue.seq);
    title = cue.actor.kind === "thinketh" ? "Thinketh's action" : cue.actor.kind === "person" ? `${cue.actor.name}'s action` : cue.actor.kind === "planner" ? "Planner's move" : "Muse's move";
    body = (
      <>
        <T variant="body">{cue.label}</T>
        {e ? row("Recorded", `#${e.seq} · ${e.type.replace(/_/g, " ")} · ${new Date(e.at).toLocaleTimeString()}`) : null}
      </>
    );
  } else if (selection && typeof selection === "object") {
    if (selection.kind === "idea" && world.concept) {
      const c = world.concept;
      const item = deltaItem(c.conceptId);
      title = c.label;
      body = (
        <>
          <T variant="meta" style={{ color: color.ink3 }}>
            Technical concept: {room.snapshots[0]?.concepts.find((x) => x.conceptId === c.conceptId)?.name ?? c.conceptId}
          </T>
          {room.snapshots.map((snap) => {
            const s = concept(snap.userId, c.conceptId);
            return s ? row(name(snap.userId), `${s.level}${s.verified ? " · verified" : ""} · mastery ${fmt2(s.mastery)} · uncertainty ${fmt2(s.uncertainty)} · ${s.evidenceCount} signals`) : null;
          })}
          {item ? (
            <T variant="support" style={{ marginTop: space.s }}>
              {item.reason} Rule: {item.rule.replace(/_/g, " ")}. Computed from evidence, not chosen by a model.
            </T>
          ) : null}
        </>
      );
    } else if (selection.kind === "mind") {
      const snap = room.snapshots.find((s) => s.userId === selection.userId);
      const who = room.participants.find((p) => p.userId === selection.userId);
      title = selection.userId === me ? "Your Mind" : `${name(selection.userId)}'s Mind`;
      body = (
        <>
          {who?.demoPersona ? <T variant="support">A seeded demo persona on this phone: her agent exchanges for her. An agent exchange isn&apos;t evidence that anyone understood anything.</T> : null}
          {snap ? (
            <>
              {row("Shared", `${snap.concepts.length} concepts, knowledge state only`)}
              {row("Strong", snap.concepts.filter((c) => c.level === "strong" || c.level === "intermediate").map((c) => c.short).join(", ") || "none yet")}
              {row("Developing", snap.concepts.filter((c) => c.level === "developing").map((c) => c.short).join(", ") || "none")}
              <T variant="meta" style={{ color: color.ink3, marginTop: space.s }}>
                Not shared: {snap.excludes.join(", ")}.
              </T>
            </>
          ) : (
            <T variant="support">Nothing is shared until you compare.</T>
          )}
        </>
      );
    } else if (selection.kind === "muse") {
      const last = room.exchange ? [...room.exchange.actions].reverse().find((a) => a.actor === "coordinator") : undefined;
      title = world.muse.by === "Planner" ? "The planner made the last move" : "Muse coordinates the exchange";
      body = (
        <>
          <T variant="support">Muse chooses among the moves the agent exchange allows right now. Thinketh compares the Minds and checks every takeaway against its sources; Muse can&apos;t change anyone&apos;s Mind.</T>
          {last ? row("Last move", `${last.summary}${last.by === "planner" ? " (planner)" : ""}`) : null}
        </>
      );
    }
  }
  return (
    <Sheet visible={!!selection && !!body} onClose={onClose} title={title || "Evidence"}>
      <View style={{ gap: space.xs, paddingBottom: space.l }}>{body}</View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 40, paddingHorizontal: space.m, paddingVertical: 6, borderRadius: 999, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  badgeThinketh: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: color.canvas, borderWidth: 1, borderColor: color.hairline },
  badgeMuseMark: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: StyleSheet.hairlineWidth, borderColor: color.edge },
  badgeMuse: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: color.ink },
  badgeMuseText: { fontFamily: font.sansSemibold, fontSize: 11, lineHeight: 13, color: color.onInk },
  bannerText: { flex: 1, fontFamily: font.sans, fontSize: 13, lineHeight: 17, color: color.ink },
  bannerActor: { fontFamily: font.sansSemibold, color: color.ink },
  row: { flexDirection: "row", gap: space.s, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
});
