import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { narrativeLabel } from "@thinketh/contracts";
import { MuseMark } from "@/components/brand/MuseMark";
import { Mark } from "@/components/Logo";
import { Sheet } from "@/components/Sheet";
import { Avatar } from "@/components/system";
import { T } from "@/components/Text";
import { fmt2 } from "@/lib/knowledge";
import { cuesSince, eventToVisualCue, keyOf, type VisualCue, type World } from "@/lib/roomWorld";
import { color, font, space } from "@/theme/tokens";
import type { Selection } from "./RoomScene";

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

  // Before anything new is observed, the latest recorded action is shown still (never celebrated).
  const settled = room ? ([...room.events].reverse().map((e) => eventToVisualCue(e, room, me)).find((c) => c && c.kind !== "leave") ?? null) : null;
  const liveForRoom = live && room && room.events.some((e) => e.seq === live.seq) ? live : null;
  return liveForRoom ? { cue: liveForRoom, live: true } : { cue: settled ? { ...settled, celebrate: false } : null, live: false };
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
export function EvidenceSheet({ room, world, me, selection, cue, onClose }: { room: PlaygroundRoom; world: World; me: string; selection: Selection | "action" | null; cue: VisualCue | null; onClose: () => void }) {
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
        {e?.data?.by ? row("Conducted by", e.data.by === "fallback" ? "Thinketh's deterministic planner (Muse couldn't respond)" : "Muse, as a validated tool call from Thinketh's plan") : null}
        {cue.kind === "verified" || cue.kind === "not_verified"
          ? room.transfer?.transition
            ? row("Transition", `mastery ${fmt2(room.transfer.transition.before.mastery)} → ${fmt2(room.transfer.transition.after.mastery)}, uncertainty ${fmt2(room.transfer.transition.before.uncertainty)} → ${fmt2(room.transfer.transition.after.uncertainty)}`)
            : null
          : null}
        {(cue.kind === "verified" || cue.kind === "not_verified") && room.transfer?.transition ? (
          <T variant="support" style={{ marginTop: space.s }}>
            {room.transfer.transition.reason}
          </T>
        ) : null}
      </>
    );
  } else if (selection && typeof selection === "object") {
    if (selection.kind === "concept") {
      const c = world.concepts.find((x) => x.key === selection.key);
      if (c) {
        const other = room.snapshots.find((s) => s.userId !== c.userId);
        const mine = concept(c.userId, c.conceptId);
        const theirs = other ? concept(other.userId, c.conceptId) : undefined;
        const item = deltaItem(c.conceptId);
        title = narrativeLabel(c.conceptId, mine?.name ?? c.name);
        body = (
          <>
            <T variant="meta" style={{ color: color.ink3 }}>
              Technical concept: {mine?.name}
            </T>
            {[mine && { who: c.userId, s: mine }, theirs && other && { who: other.userId, s: theirs }].filter(Boolean).map((x) => {
              const v = x as { who: string; s: NonNullable<typeof mine> };
              return row(name(v.who), `${v.s.level}${v.s.verified ? " · verified" : ""} · mastery ${fmt2(v.s.mastery)} · uncertainty ${fmt2(v.s.uncertainty)} · ${v.s.evidenceCount} signals`);
            })}
            {item ? (
              <T variant="support" style={{ marginTop: space.s }}>
                {item.reason} Rule: {item.rule.replace(/_/g, " ")}. Computed from evidence, not chosen by a model.
              </T>
            ) : null}
            {c.changed && room.transfer?.transition ? (
              <T variant="support" style={{ marginTop: space.s }}>
                Changed by a verified answer: {fmt2(room.transfer.transition.before.mastery)} → {fmt2(room.transfer.transition.after.mastery)}. {room.transfer.transition.reason}
              </T>
            ) : null}
          </>
        );
      }
    } else if (selection.kind === "mind") {
      const snap = room.snapshots.find((s) => s.userId === selection.userId);
      const who = room.participants.find((p) => p.userId === selection.userId);
      title = `${name(selection.userId)}${selection.userId === me ? "r Mind" : "'s Mind"}`.replace("Your Mind", "Your Mind");
      body = (
        <>
          {who?.demoPersona ? <T variant="support">A seeded demo persona on this phone: her explanations are typed here. Explaining isn&apos;t evidence for anyone; the learner&apos;s answer to Thinketh&apos;s check is.</T> : null}
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
    } else if (selection.kind === "path" && world.path) {
      const item = deltaItem(world.path.conceptId);
      const tr = room.transfer;
      title = `${name(world.path.teacherId)} → ${name(world.path.learnerId)}`;
      body = (
        <>
          {item ? <T variant="support">{item.reason}</T> : null}
          {item ? row(name(room.delta!.aId), `mastery ${fmt2(item.a.mastery)} · uncertainty ${fmt2(item.a.uncertainty)} · ${item.a.evidenceCount} signals${item.a.verified ? " · verified" : ""}`) : null}
          {item ? row(name(room.delta!.bId), `mastery ${fmt2(item.b.mastery)} · uncertainty ${fmt2(item.b.uncertainty)} · ${item.b.evidenceCount} signals${item.b.verified ? " · verified" : ""}`) : null}
          {item ? row("Rule", `${item.rule.replace(/_/g, " ")} (computed by Thinketh)`) : null}
          {row("State", { possible: "possible: nothing has travelled", traveling: "the teacher is explaining (a perspective, not proof)", checkpoint: "stopped at Thinketh's checkpoint", grading: "Thinketh is grading", verified: "verified: the learner's Mind changed", not_yet: "not verified: nothing travelled; the answer was still recorded as evidence" }[world.path.state])}
          {tr?.prompt ? row("Checkpoint", tr.prompt) : null}
          {tr?.feedback ? row("Grader", tr.feedback) : null}
        </>
      );
    } else if (selection.kind === "gap" && world.gap) {
      const item = deltaItem(world.gap.conceptId);
      title = world.gap.name;
      body = (
        <>
          <T variant="support">{item?.reason ?? "Neither of you has strong evidence here yet."}</T>
          {item ? row(name(room.delta!.aId), `mastery ${fmt2(item.a.mastery)} · ${item.a.evidenceCount} signals`) : null}
          {item ? row(name(room.delta!.bId), `mastery ${fmt2(item.b.mastery)} · ${item.b.evidenceCount} signals`) : null}
          {(room.sharedGap?.lesson ?? []).slice(0, 2).map((s) => (
            <View key={s.heading} style={{ marginTop: space.s }}>
              <T variant="label">{s.heading}</T>
              <T variant="support">{s.body}</T>
            </View>
          ))}
        </>
      );
    } else if (selection.kind === "source" && world.source) {
      title = world.source.title;
      body = (
        <>
          {world.source.chosenBecause ? <T variant="support">{world.source.chosenBecause}</T> : null}
          {world.source.sides.map((s) =>
            row(name(s.userId), s.status === "processing" ? "still reading" : s.status === "failed" ? "couldn't read it" : `~${Math.max(1, Math.round(s.minutes ?? 0))} useful min · ${s.ideas} new ideas${s.focus ? ` · focus: ${s.focus}` : ""}`),
          )}
          <T variant="meta" style={{ color: color.ink3, marginTop: space.s }}>
            {world.source.claim === "different" ? "The two deltas differ: each Mind gets its own." : world.source.claim === "similar" ? "The two deltas are similar, so Thinketh doesn't claim a difference." : "Thinketh is still reading it against each Mind."}
          </T>
        </>
      );
    } else if (selection.kind === "muse") {
      const e = room.events.findLast((x) => x.actor === "muse");
      title = world.muse.by === "planner" ? "The planner made the last move" : "Muse conducts the room";
      body = (
        <>
          <T variant="support">Thinketh compares the Minds, plans the moves and grades the answers. Muse chooses among the planned moves and speaks for the room; it can&apos;t change anyone&apos;s Mind.</T>
          {room.museLine ? row("Last line", `“${room.museLine}”`) : null}
          {e ? row("Last move", `#${e.seq} · ${e.type.replace(/_/g, " ")}${e.data?.by === "fallback" ? " (planner)" : ""}`) : null}
          {row("Conductor", room.conductor.mode === "muse" ? room.conductor.detail : "deterministic planner")}
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

export { keyOf };

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
