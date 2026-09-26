import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";
import * as Haptics from "expo-haptics";
import type { CollaborativeDeltaItem, PlaygroundRoom } from "@thinketh/contracts";
import { layoutMind } from "@thinketh/mindprint";
import { api, DEMO_USER_ID } from "@/api";
import { playground, PLAYGROUND_AVAILABLE, PlaygroundError } from "@/api/playground";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { StageSteps } from "@/components/StageSteps";
import { Button, Divider } from "@/components/ui";
import { useApi, useReducedMotion } from "@/lib/hooks";
import { useRoomChannel } from "@/lib/roomChannel";
import { fmt2 } from "@/lib/knowledge";
import { DuoMind } from "@/mindprint/DuoMind";
import { MindCanvas } from "@/mindprint/MindCanvas";
import { Mindprint } from "@/mindprint/Mindprint";
import { layoutEdges, nodesFromKnowledge } from "@/mindprint/model";
import { color, font, gutter, radius, space } from "@/theme/tokens";

/** The device owner's name in the room (the demo persona's human). */
const HOST_NAME = "Stefen";
const POLL_MS = 1500;
/** Muse's "comparing" beat is shown at least this long, even when the server is instant. */
const COMPARE_MS = 2600;

/** "Following Muse" (Figma Spotlight): the view goes where the conductor points until you stop following. */
const FollowContext = createContext(true);

type Busy = null | "invite" | "compare" | "conduct" | "explain" | "answer" | "resource" | "join";

export default function PlaygroundScreen() {
  const params = useLocalSearchParams<{ code?: string; as?: string }>();
  // A second device joins as someone else (e.g. "nadani"); the host device is the demo user.
  const [me, setMe] = useState<string>(DEMO_USER_ID);
  const [room, setRoom] = useState<PlaygroundRoom | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const insets = useSafeAreaInsets();

  const run = useCallback(async (kind: Busy, fn: () => Promise<PlaygroundRoom>) => {
    setBusy(kind);
    setError(null);
    try {
      const r = await fn();
      setRoom(r);
      return r;
    } catch (err) {
      setError(err instanceof PlaygroundError ? err.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  // Server is the source of truth: poll the room (realtime events only make it sooner).
  const roomId = room?.id;
  const seq = room?.seq;
  useEffect(() => {
    if (!roomId || room?.scene === "ended") return;
    const t = setInterval(() => {
      playground.get(roomId, me).then(
        (r) => setRoom((prev) => (prev && r.seq === prev.seq && r.resource?.sides.map((s) => s.status + s.stage).join() === prev.resource?.sides.map((s) => s.status + s.stage).join() ? prev : r)),
        () => {},
      );
    }, POLL_MS);
    return () => clearInterval(t);
  }, [roomId, me, room?.scene, seq]);

  // Realtime makes the other device's actions land immediately; polling stays as the floor.
  const [followMuse, setFollowMuse] = useState(true);
  const myName = room?.participants.find((p) => p.userId === me)?.displayName ?? HOST_NAME;
  const { live, present } = useRoomChannel(room?.realtime, me, room ? { name: myName, scene: room.scene, following: followMuse } : null, (e) => {
    if (!roomId || (seq !== undefined && e.seq <= seq)) return;
    playground.get(roomId, me).then(setRoom, () => {});
  });

  // Deep link from a second device: /playground?code=ABC123&as=nadani
  const joinedFromLink = useRef(false);
  useEffect(() => {
    if (joinedFromLink.current || !params.code || !params.as) return;
    joinedFromLink.current = true;
    setMe(params.as);
    run("join", () => playground.join(params.code!, params.as === "nadani" ? "Nadani" : "Guest", params.as!));
  }, [params.code, params.as, run]);

  const other = room?.participants.find((p) => p.userId !== me);
  const actAs = (userId: string) => (userId !== me && other?.demoPersona && other.userId === userId ? userId : undefined);

  const compare = async () => {
    if (!room) return;
    setComparing(true);
    const started = Date.now();
    const r = await run("compare", () => playground.compare(room.id, me));
    const wait = COMPARE_MS - (Date.now() - started);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    setComparing(false);
    if (r) Haptics.selectionAsync().catch(() => {});
  };

  const scene = comparing ? "comparing" : (room?.scene ?? "waiting");
  const following = ["peer_teaching", "transfer", "shared_gap", "comparing"].includes(scene);
  const headerRight = {
    waiting: room ? "Invite" : "Invite",
    arrival: "2 minds",
    comparing: "Following Muse",
    overview: "Overview",
    peer_teaching: "Leave",
    transfer: "Leave",
    knowledge_moved: "Overview",
    shared_gap: "Pause",
    resource: "Resource",
    ended: "Done",
  }[scene];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + space.s }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={{ minHeight: 44, justifyContent: "center" }}>
            <Icon name="back" size={18} color={color.ink2} />
          </Pressable>
          {following && scene !== "comparing" ? (
            <Pressable
              onPress={() => setFollowMuse((f) => !f)}
              accessibilityRole="button"
              accessibilityState={{ selected: followMuse }}
              accessibilityHint={followMuse ? "Stop following and explore on your own" : "Follow Muse again"}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <T variant="body" style={{ color: color.ink2, fontSize: 15 }}>
                {followMuse ? "Following Muse" : "Exploring"}
                <T variant="meta" style={{ color: color.ink3 }}>
                  {followMuse ? "  · Stop" : "  · Follow Muse"}
                </T>
              </T>
            </Pressable>
          ) : (
            <T variant="body" style={{ color: color.ink2, fontSize: 15 }}>
              Playground
            </T>
          )}
        </View>
        {room && (scene === "peer_teaching" || scene === "transfer") ? (
          <Pressable onPress={() => run(null, () => playground.leave(room.id, me)).then(() => router.back())} accessibilityRole="button" hitSlop={10} style={{ minHeight: 44, justifyContent: "center" }}>
            <T variant="body" style={{ color: color.ink3, fontSize: 15 }}>
              Leave
            </T>
          </Pressable>
        ) : (
          <T variant="body" style={{ color: color.ink3, fontSize: 15 }}>
            {scene === "comparing" ? "Following Muse" : headerRight}
          </T>
        )}
      </View>
      {room ? <PresenceLine room={room} me={me} present={present} /> : null}

      {!PLAYGROUND_AVAILABLE ? (
        <Offline />
      ) : (
        <FollowContext.Provider value={followMuse || !following}>
        <ScrollView contentContainerStyle={{ paddingBottom: space.x5 + insets.bottom }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {scene === "waiting" ? (
            <Waiting
              room={room}
              busy={busy}
              onInvite={() => run("invite", () => playground.create(HOST_NAME))}
              onDemoGuest={() => room && run("invite", () => playground.demoGuest(room.id))}
              onJoin={(code, as) => {
                setMe(as);
                run("join", () => playground.join(code, as === "nadani" ? "Nadani" : "Guest", as));
              }}
            />
          ) : null}
          {room && scene === "arrival" ? <Arrival room={room} me={me} busy={busy === "compare"} onCompare={compare} /> : null}
          {room && scene === "comparing" ? <Comparing room={room} me={me} /> : null}
          {room && scene === "overview" ? <Overview room={room} me={me} busy={busy === "conduct"} onStart={() => run("conduct", () => playground.conduct(room.id, "next", me))} /> : null}
          {room && scene === "peer_teaching" ? (
            <PeerTeaching room={room} me={me} busy={busy === "explain"} onExplain={(text) => room.teaching && run("explain", () => playground.explain(room.id, text, { asUserId: actAs(room.teaching!.teacherId), as: me }))} />
          ) : null}
          {room && scene === "transfer" ? (
            <Transfer room={room} me={me} busy={busy === "answer"} onAnswer={(text) => room.transfer && run("answer", () => playground.answer(room.id, text, { asUserId: actAs(room.transfer!.learnerId), as: me }))} />
          ) : null}
          {room && scene === "knowledge_moved" ? <KnowledgeMoved room={room} me={me} busy={busy === "conduct"} onNext={() => run("conduct", () => playground.conduct(room.id, "shared_gap", me))} /> : null}
          {room && scene === "shared_gap" ? <SharedGap room={room} me={me} busy={busy === "conduct"} onNext={() => run("conduct", () => playground.conduct(room.id, "resource", me))} /> : null}
          {room && scene === "resource" ? <ResourceScene room={room} me={me} busy={busy === "conduct"} onEnd={() => run("conduct", () => playground.conduct(room.id, "end", me))} /> : null}
          {room && scene === "ended" ? <Ended room={room} me={me} /> : null}
          {error ? (
            <T variant="support" tone="coral" style={{ marginHorizontal: gutter, marginTop: space.l }}>
              {error}
            </T>
          ) : null}
          {room ? <Provenance room={room} live={live} /> : null}
        </ScrollView>
        </FollowContext.Provider>
      )}
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Helpers

const nameOf = (room: PlaygroundRoom, id: string | undefined) => room.participants.find((p) => p.userId === id)?.displayName ?? "Someone";
const upper = (s: string) => s.toUpperCase();
/** Figma sets concept titles in sentence case ("Evaluator architectures"); keep acronyms. */
const sentence = (s: string) => s.split(" ").map((w, i) => (i === 0 || /^[A-Z0-9]{2,}/.test(w) ? w : w.toLowerCase())).join(" ");

/** Host on the left, the other Mind on the right (Figma). */
function useSides(room: PlaygroundRoom) {
  const left = room.snapshots.find((s) => s.userId === room.hostId) ?? room.snapshots[0];
  const right = room.snapshots.find((s) => s.userId !== left?.userId);
  return { left, right };
}

function Duo({ room, focus, trace, muse, changed }: { room: PlaygroundRoom; focus?: string | null; trace?: Parameters<typeof DuoMind>[0]["trace"]; muse?: boolean; changed?: Record<string, string[]> }) {
  const { width } = useWindowDimensions();
  const { left, right } = useSides(room);
  const d = room.delta;
  const keyConcepts = useMemo(() => (d ? [...d.bTeachesA.slice(0, 1), ...d.aTeachesB.slice(0, 1), ...d.sharedGaps.slice(0, 1)].map((i) => i.conceptId) : undefined), [d]);
  const followingMuse = useContext(FollowContext);
  if (!left || !right) return <ArrivalDuo room={room} />;
  const w = width - 32;
  const duo = (
    <DuoMind
      left={left}
      right={right}
      edges={left.edges}
      width={w}
      height={256}
      // Following: Muse's spotlight frames the view. Exploring: nothing dimmed, pan and pinch freely.
      focusConceptId={followingMuse ? (focus ?? null) : null}
      trace={trace ?? null}
      muse={muse}
      changed={changed}
      keyConcepts={keyConcepts}
    />
  );
  return (
    <View style={{ alignItems: "center", marginTop: space.l }}>
      {followingMuse ? duo : <MindCanvas width={w} height={256} hits={[]}>{duo}</MindCanvas>}
    </View>
  );
}

/** Before snapshots exist (arrival), both Minds come from the Mind endpoint for the host and a quiet silhouette for the guest. */
function ArrivalDuo({ room }: { room: PlaygroundRoom }) {
  return (
    <View style={{ height: 292, alignItems: "center", justifyContent: "center" }}>
      <T variant="meta">{room.participants.map((p) => p.displayName).join("  ·  ")}</T>
    </View>
  );
}

function Pill({ label, onPress, busy, kind = "primary" }: { label: string; onPress: () => void; busy?: boolean; kind?: "primary" | "secondary" }) {
  return <Button label={label} kind={kind} loading={busy} onPress={onPress} style={styles.pill} />;
}

// ---------------------------------------------------------------------------
// Scenes

/** Figma 1:65: your Mind, alone; nothing is shared until you invite someone. */
function Waiting({
  room,
  busy,
  onInvite,
  onDemoGuest,
  onJoin,
}: {
  room: PlaygroundRoom | null;
  busy: Busy;
  onInvite: () => void;
  onDemoGuest: () => void;
  onJoin: (code: string, as: string) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const { width } = useWindowDimensions();
  const { data } = useApi(() => api.getKnowledge(), []);
  const w = width - 64;
  const h = 250;
  const layout = useMemo(() => {
    if (!data) return null;
    const nodes = nodesFromKnowledge(data.items, new Set());
    return { layout: layoutMind(nodes, layoutEdges(data.edges), { x: 0, y: 0, w, h }, { lod: "normal" }), nodes: new Map(nodes.map((n) => [n.id, n])) };
  }, [data, w]);
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <T variant="display" style={{ marginTop: space.xl }}>
        Learn together.
      </T>
      <T variant="support" style={{ marginTop: space.s, fontSize: 16, lineHeight: 24 }}>
        Bring another Mind in. Thinketh will find the useful differences.
      </T>
      <T style={styles.soloName}>{HOST_NAME}</T>
      <View style={{ alignItems: "center", height: h }}>{layout ? <Mindprint width={w} height={h} regions={[{ layout: layout.layout, nodes: layout.nodes, stubs: true }]} /> : <ActivityIndicator color={color.ink3} />}</View>

      {!room ? (
        <View style={{ alignItems: "center", marginTop: space.xl }}>
          <Pressable onPress={onInvite} accessibilityRole="button" accessibilityLabel="Invite a collaborator" style={({ pressed }) => [{ alignItems: "center" }, pressed && { opacity: 0.7 }]}>
            <View style={styles.plus}>{busy === "invite" ? <ActivityIndicator color={color.ink} /> : <T style={{ fontSize: 26, lineHeight: 30, color: color.ink }}>+</T>}</View>
            <T variant="body" style={{ marginTop: space.m }}>
              Invite a collaborator
            </T>
          </Pressable>
          <T variant="meta" style={{ marginTop: space.x3, color: color.ink3 }}>
            Nothing is shared until you invite someone.
          </T>
          {joining ? (
            <View style={styles.joinBox}>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="Room code"
                placeholderTextColor={color.ink3}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.codeInput}
                accessibilityLabel="Room code"
              />
              {/* A second demo phone joins as Nadani so her seeded Mind is the one in the room. */}
              <Pill label="Join as Nadani" busy={busy === "join"} onPress={() => code.length === 6 && onJoin(code, "nadani")} />
            </View>
          ) : (
            <Pressable onPress={() => setJoining(true)} accessibilityRole="button" style={{ marginTop: space.l, minHeight: 44, justifyContent: "center" }}>
              <T variant="meta" style={{ color: color.ink }}>
                Have a code? Join a Playground
              </T>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.inviteCard}>
          <T variant="label">Room code</T>
          <T style={{ fontFamily: font.serif, fontSize: 34, letterSpacing: 6, marginTop: space.s, color: color.ink }} selectable>
            {room.code}
          </T>
          <T variant="support" style={{ marginTop: space.s }}>
            On the other phone, open the Playground and join with this code. Only your knowledge state is shared: never your questions, memories or sources.
          </T>
          <Divider style={{ marginVertical: space.l }} />
          <T variant="support">No second phone? Nadani&apos;s Mind is seeded for the demo, and this phone can speak for her.</T>
          <Pill label="Bring in Nadani" kind="secondary" busy={busy === "invite"} onPress={onDemoGuest} />
        </View>
      )}
    </View>
  );
}

/** Figma 1:94. */
function Arrival({ room, me, busy, onCompare }: { room: PlaygroundRoom; me: string; busy: boolean; onCompare: () => void }) {
  const guest = room.participants.find((p) => p.userId !== room.hostId);
  return (
    <View>
      <T variant="meta" tone="coral" style={{ marginHorizontal: gutter, marginTop: space.m }}>
        {guest?.userId === me ? `You joined ${nameOf(room, room.hostId)}` : `${guest?.displayName ?? "Someone"} joined`}
      </T>
      <Duo room={room} />
      <View style={{ paddingHorizontal: gutter, marginTop: space.xl }}>
        <T variant="title">Two minds. One learning space.</T>
        <T variant="support" style={{ marginTop: space.s }}>
          Thinketh is finding what can move between you.
        </T>
        <Pill label="Compare our Minds" busy={busy} onPress={onCompare} />
      </View>
    </View>
  );
}

/** Figma 1:142: Muse compares while the delta is computed. */
function Comparing({ room }: { room: PlaygroundRoom; me: string }) {
  const [step, setStep] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const ts = [700, 1500, 2300].map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, [reduced]);
  const shown = reduced ? 3 : step;
  const rows = ["Shared strengths", "Peer teaching opportunities", "Shared gaps"];
  return (
    <View>
      {room.snapshots.length === 2 ? <Duo room={room} muse /> : <ArrivalDuo room={room} />}
      <View style={{ paddingHorizontal: gutter, alignItems: "center" }}>
        <T variant="section" style={{ marginTop: space.xl }}>
          Muse is comparing both Minds
        </T>
        <View style={{ marginTop: space.xl, gap: space.l, alignSelf: "center" }}>
          {rows.map((r, i) => (
            <View key={r} style={{ flexDirection: "row", alignItems: "center", gap: space.m, opacity: shown > i ? 1 : 0.45 }}>
              <View style={[styles.check, shown > i && { backgroundColor: color.ink, borderColor: color.ink }]}>{shown > i ? <Icon name="check" size={12} color={color.onInk} /> : null}</View>
              <T variant="body" style={{ color: color.ink2 }}>
                {r}
              </T>
            </View>
          ))}
        </View>
        <T variant="meta" style={{ marginTop: space.x4, color: color.ink2 }}>
          Muse directs the room. Thinketh evaluates evidence.
        </T>
      </View>
    </View>
  );
}

/** Figma 1:197: the collaborative delta, computed and explainable. */
function Overview({ room, busy, onStart }: { room: PlaygroundRoom; me: string; busy: boolean; onStart: () => void }) {
  const d = room.delta!;
  const aName = nameOf(room, d.aId);
  const bName = nameOf(room, d.bId);
  const items: { tag: string; coral: boolean; item: CollaborativeDeltaItem }[] = [
    ...d.bTeachesA.slice(0, 1).map((item) => ({ tag: `${upper(bName)} → ${upper(aName)}`, coral: true, item })),
    ...d.aTeachesB.slice(0, 1).map((item) => ({ tag: `${upper(aName)} → ${upper(bName)}`, coral: true, item })),
    ...d.sharedGaps.slice(0, 1).map((item) => ({ tag: "MUSE → BOTH", coral: false, item })),
  ];
  const words = ["No", "One", "Two", "Three"][items.length] ?? String(items.length);
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <T variant="display" style={{ marginTop: space.xl }}>
        {items.length ? "You can teach each other." : "You're closely matched."}
      </T>
      <T variant="support" style={{ marginTop: space.s, color: color.ink3 }}>
        {words} useful difference{items.length === 1 ? "" : "s"} in your current evidence.
      </T>
      <View style={{ marginTop: space.x3 }}>
        {items.map((x, i) => (
          <DeltaRow key={x.item.conceptId + x.item.kind} tag={x.tag} coral={x.coral} item={x.item} names={{ [d.aId]: aName, [d.bId]: bName }} last={i === items.length - 1} />
        ))}
      </View>
      {d.conflicts.length ? (
        <T variant="meta" style={{ marginTop: space.l }}>
          Not assigned yet: {d.conflicts.map((c) => c.conceptName).join(", ")}. The evidence can&apos;t tell who should teach.
        </T>
      ) : null}
      <Pill label="Start 7-minute session" busy={busy} onPress={onStart} />
      <T variant="meta" style={{ marginTop: space.l, color: color.ink2 }}>
        Muse sets the order. Thinketh evaluates evidence.
      </T>
    </View>
  );
}

function DeltaRow({ tag, coral, item, names, last }: { tag: string; coral: boolean; item: CollaborativeDeltaItem; names: Record<string, string>; last: boolean }) {
  const [open, setOpen] = useState(false);
  const ids = Object.keys(names);
  const side = (k: "a" | "b") => item[k];
  return (
    <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityHint="Shows the evidence behind this" style={{ paddingVertical: space.xl, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: color.edge }}>
      <T variant="label" tone={coral ? "coral" : undefined}>
        {tag}
      </T>
      <T variant="section" style={{ marginTop: space.m, fontSize: 23, lineHeight: 29 }}>
        {sentence(item.conceptName)}
      </T>
      <T variant="support" style={{ marginTop: space.xs }}>
        {item.reason}
      </T>
      {open ? (
        <View style={styles.why}>
          {(["a", "b"] as const).map((k, i) => (
            <T key={k} variant="meta" style={{ fontVariant: ["tabular-nums"] }}>
              {names[ids[i]!]}: mastery {fmt2(side(k).mastery)} · uncertainty {fmt2(side(k).uncertainty)} · {side(k).evidenceCount} signals{side(k).verified ? " · verified" : ""}
            </T>
          ))}
          <T variant="meta" style={{ marginTop: space.xs, color: color.ink3 }}>
            Rule: {item.rule.replace("_", " ")}. Computed from evidence, not chosen by a model.
          </T>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Figma 1:216: the teacher explains in their own words; the coral trace is live. */
function PeerTeaching({ room, me, busy, onExplain }: { room: PlaygroundRoom; me: string; busy: boolean; onExplain: (text: string) => void }) {
  const t = room.teaching!;
  const [text, setText] = useState("");
  const teacher = nameOf(room, t.teacherId);
  const canSpeak = t.teacherId === me || room.participants.find((p) => p.userId === t.teacherId)?.demoPersona;
  const { left } = useSides(room);
  const from = left?.userId === t.teacherId ? "left" : "right";
  return (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <T variant="label" tone="coral" style={{ marginTop: space.l }}>
          {upper(teacher)} → {upper(nameOf(room, t.learnerId))}
        </T>
        <T variant="display" style={styles.conceptTitle}>
          {sentence(t.conceptName)}
        </T>
      </View>
      <Duo room={room} focus={t.conceptId} trace={{ conceptId: t.conceptId, from, mode: "teaching" }} />
      <View style={{ paddingHorizontal: gutter, marginTop: space.l }}>
        <T variant="body" style={{ fontFamily: font.sansSemibold, fontSize: 18 }}>
          {room.museLine ?? `${teacher}, teach this in your own words.`}
        </T>
        <T variant="body" style={{ marginTop: space.m, color: color.ink2, fontSize: 17, lineHeight: 26 }}>
          {t.prompt}
        </T>
        {canSpeak ? (
          <View style={styles.speak}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={`${teacher} is speaking…`}
              placeholderTextColor={color.ink3}
              multiline
              maxLength={2000}
              style={styles.speakInput}
              accessibilityLabel={`${teacher}'s explanation`}
            />
            <Pressable
              onPress={() => text.trim() && onExplain(text.trim())}
              disabled={busy || !text.trim()}
              accessibilityRole="button"
              accessibilityLabel="Done explaining"
              style={[styles.speakBtn, (!text.trim() || busy) && { opacity: 0.5 }]}
            >
              {busy ? <ActivityIndicator color={color.coral} /> : <T style={{ color: color.coral, fontFamily: font.sansSemibold, fontSize: 18, lineHeight: 20 }}>•••</T>}
            </Pressable>
          </View>
        ) : (
          <View style={styles.speak}>
            <T variant="body" style={{ color: color.ink3, flex: 1 }}>
              {teacher} is speaking…
            </T>
          </View>
        )}
        {canSpeak && t.teacherId !== me ? (
          <T variant="meta" style={{ marginTop: space.m, color: color.ink3 }}>
            One-device mode: type what {teacher} says. Her explanation isn&apos;t evidence for anyone; the transfer question is.
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** Between 1:216 and 1:269: the learner applies it somewhere new. Graded by Thinketh, not Muse. */
function Transfer({ room, me, busy, onAnswer }: { room: PlaygroundRoom; me: string; busy: boolean; onAnswer: (text: string) => void }) {
  const tr = room.transfer!;
  const t = room.teaching;
  const [text, setText] = useState("");
  const learner = nameOf(room, tr.learnerId);
  const canAnswer = tr.learnerId === me || room.participants.find((p) => p.userId === tr.learnerId)?.demoPersona;
  const { left } = useSides(room);
  return (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <T variant="label" tone="coral" style={{ marginTop: space.l }}>
          {tr.learnerId === me ? "Your turn" : `${upper(learner)}'s turn`}
        </T>
        <T variant="title" style={{ marginTop: space.m }}>
          {tr.prompt}
        </T>
        {t?.explanation ? (
          <View style={styles.quote}>
            <T variant="label">{nameOf(room, t.teacherId)} explained</T>
            <T variant="support" style={{ marginTop: space.xs, fontFamily: font.serifItalic, fontSize: 16, lineHeight: 23, color: color.ink2 }}>
              “{t.explanation}”
            </T>
          </View>
        ) : null}
      </View>
      <Duo room={room} focus={tr.conceptId} trace={t ? { conceptId: tr.conceptId, from: left?.userId === t.teacherId ? "left" : "right", mode: "teaching" } : null} />
      <View style={{ paddingHorizontal: gutter }}>
        {canAnswer ? (
          <>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Apply it in your own words…"
              placeholderTextColor={color.ink3}
              multiline
              maxLength={2000}
              style={styles.answer}
              accessibilityLabel="Your answer"
            />
            <Pill label={busy ? "Thinketh is checking…" : "Submit"} busy={busy} onPress={() => text.trim() && onAnswer(text.trim())} />
          </>
        ) : (
          <T variant="support" style={{ marginTop: space.l }}>
            {learner} is answering…
          </T>
        )}
        <T variant="meta" style={{ marginTop: space.l, color: color.ink3 }}>
          Thinketh grades this against a rubric. Muse can&apos;t change anyone&apos;s Mind.
        </T>
      </View>
    </View>
  );
}

/** Figma 1:269: knowledge moved, and exactly why Thinketh believes it. */
function KnowledgeMoved({ room, me, busy, onNext }: { room: PlaygroundRoom; me: string; busy: boolean; onNext: () => void }) {
  const tr = room.transfer!;
  const t = room.teaching;
  const learner = nameOf(room, tr.learnerId);
  const teacher = t ? nameOf(room, t.teacherId) : "Your peer";
  const verified = !!tr.verified;
  const [why, setWhy] = useState(false);
  const { left } = useSides(room);
  useEffect(() => {
    if (verified) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [verified]);
  const tn = tr.transition;
  return (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <T variant="display" style={{ marginTop: space.xl }}>
          {verified ? "Knowledge moved." : "Not yet."}
        </T>
        <T variant="support" style={{ marginTop: space.s, fontSize: 16, lineHeight: 24 }}>
          {verified ? `${learner} applied what ${teacher} taught in a new context.` : `${learner}'s answer didn't show it yet. Thinketh recorded what it did show.`}
        </T>
      </View>
      <Duo
        room={room}
        focus={verified ? null : tr.conceptId}
        trace={verified && t ? { conceptId: tr.conceptId, from: left?.userId === t.teacherId ? "left" : "right", mode: "moved" } : null}
        changed={verified ? { [tr.learnerId]: [tr.conceptId] } : undefined}
      />
      <View style={{ paddingHorizontal: gutter, marginTop: space.l }}>
        <T variant="label" tone={verified ? "coral" : undefined}>
          {upper(t?.conceptName ?? "")}
        </T>
        <T variant="section" style={{ marginTop: space.m, fontSize: 25, lineHeight: 31 }}>
          {verified ? "New connection verified" : "Recorded, not verified"}
        </T>
        <T variant="support" style={{ marginTop: space.m, fontSize: 16, lineHeight: 24 }}>
          {verified ? `${teacher} explained it. ${learner} applied it in a new context. Thinketh updated only after demonstration.` : (tr.feedback ?? "")}
        </T>
        {tn ? (
          <Pressable onPress={() => setWhy((w) => !w)} accessibilityRole="button" accessibilityState={{ expanded: why }} style={{ marginTop: space.m, minHeight: 44, justifyContent: "center" }}>
            <T variant="meta">{why ? "Why Thinketh changed its model" : `Mastery ${fmt2(tn.before.mastery)} → ${fmt2(tn.after.mastery)} · why?`}</T>
          </Pressable>
        ) : null}
        {why && tn ? (
          <View style={styles.why}>
            <T variant="support">{tn.reason}</T>
            {verified && tr.feedback ? (
              <T variant="meta" style={{ marginTop: space.s }}>
                Grader: {tr.feedback}
              </T>
            ) : null}
          </View>
        ) : null}
        {tr.learnerId === me ? (
          <Pill label={`See ${learner === HOST_NAME ? `${learner}'s` : "your"} Mind`} onPress={() => router.push({ pathname: "/mind", params: { concept: tr.conceptId } })} />
        ) : null}
        <Button label="Next: the shared gap" kind="quiet" loading={busy} onPress={onNext} style={{ alignSelf: "flex-start", marginTop: space.s }} />
        <T variant="meta" style={{ marginTop: space.s, color: color.ink2 }}>
          Source: peer learning session · just now
        </T>
      </View>
    </View>
  );
}

/** Figma 1:322: neither Mind has it; Muse teaches both. */
function SharedGap({ room, busy, onNext }: { room: PlaygroundRoom; me: string; busy: boolean; onNext: () => void }) {
  const g = room.sharedGap!;
  const [open, setOpen] = useState(false);
  const source = room.events.findLast((e) => e.type === "shared_gap_taught")?.data?.resourceTitle;
  return (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <T variant="label" style={{ marginTop: space.l }}>
          Shared gap
        </T>
        <T variant="display" style={styles.conceptTitle}>
          {sentence(g.conceptName)}
        </T>
      </View>
      <Duo room={room} focus={g.conceptId} muse />
      <View style={{ paddingHorizontal: gutter, marginTop: space.l }}>
        <T variant="body" style={{ fontFamily: font.sansSemibold, fontSize: 18 }}>
          Neither Mind has strong evidence here.
        </T>
        <T variant="support" style={{ marginTop: space.m, fontSize: 16 }}>
          Muse will teach the shared gap.
        </T>
        {typeof source === "string" ? (
          <View style={styles.resourceSmall}>
            <T variant="label">Resource</T>
            <T variant="body" style={{ fontFamily: font.sansSemibold, marginTop: space.s, fontSize: 17 }}>
              {source}
            </T>
          </View>
        ) : null}
        {open ? (
          <View style={{ marginTop: space.xl }}>
            {(g.lesson ?? []).map((s) => (
              <View key={s.heading} style={{ marginBottom: space.l }}>
                <T variant="label">{s.heading}</T>
                <T variant="body" style={{ marginTop: space.xs }}>
                  {s.body}
                </T>
              </View>
            ))}
            <Pill label="Bring in a shared source" busy={busy} onPress={onNext} />
          </View>
        ) : (
          <Pill label="Teach us the delta" onPress={() => setOpen(true)} />
        )}
      </View>
    </View>
  );
}


/** Figma 1:376: same source, a different delta for each Mind. */
function ResourceScene({ room, me, busy, onEnd }: { room: PlaygroundRoom; me: string; busy: boolean; onEnd: () => void }) {
  const res = room.resource!;
  const { width } = useWindowDimensions();
  const colW = (width - gutter * 2) / 2;
  const hostFirst = [...res.sides].sort((a) => (a.userId === room.hostId ? -1 : 1));
  const mine = res.sides.find((s) => s.userId === me);
  const ready = res.sides.every((s) => s.status !== "processing");
  // Only claim "different" when the two computed deltas actually differ.
  const differs = new Set(res.sides.map((s) => `${s.newIdeas}|${Math.round(s.usefulMinutes ?? 0)}|${s.focus ?? ""}`)).size > 1;
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <View style={styles.sourceCard}>
        <T variant="title" style={{ fontSize: 25, lineHeight: 31 }}>
          {res.title}
        </T>
        <T variant="meta" style={{ marginTop: space.xs, color: color.ink3 }}>
          {[res.sourceLabel, res.readMinutes ? `~${Math.round(res.readMinutes)} min full` : undefined].filter(Boolean).join(" · ")}
        </T>
      </View>
      <Svg width={width - gutter * 2} height={40}>
        <Line x1={(width - gutter * 2) / 2} y1={0} x2={colW / 2} y2={40} stroke={color.edge} strokeWidth={1} />
        <Line x1={(width - gutter * 2) / 2} y1={0} x2={colW * 1.5} y2={40} stroke={color.edge} strokeWidth={1} />
      </Svg>
      <View style={{ flexDirection: "row", marginTop: space.s }}>
        {hostFirst.map((s) => (
          <View key={s.userId} style={{ width: colW, paddingRight: space.m }}>
            <T variant="label">{upper(nameOf(room, s.userId))}</T>
            {s.status === "processing" ? (
              <View style={{ marginTop: space.m }}>
                <StageSteps stage={s.stage} compact />
              </View>
            ) : s.status === "failed" ? (
              <T variant="support" style={{ marginTop: space.m }}>
                Couldn&apos;t read it.
              </T>
            ) : (
              <>
                <T style={{ fontFamily: font.serif, fontSize: 34, lineHeight: 42, color: color.coral, marginTop: space.m }}>~{Math.max(1, Math.round(s.usefulMinutes ?? 0))} min</T>
                <T variant="support">useful for {s.userId === me ? "you" : nameOf(room, s.userId)}</T>
                <T variant="body" style={{ fontFamily: font.sansSemibold, marginTop: space.m }}>
                  {s.newIdeas} new idea{s.newIdeas === 1 ? "" : "s"}
                </T>
                {s.focus ? (
                  <T variant="meta" style={{ marginTop: 2 }}>
                    mostly {s.focus}
                  </T>
                ) : null}
              </>
            )}
          </View>
        ))}
      </View>
      <T variant="title" style={{ marginTop: space.x3, fontSize: 25 }}>
        {!ready || differs ? "Same source. Different delta." : "Same source. A similar delta."}
      </T>
      {res.note ? (
        <View style={{ marginTop: space.xl }}>
          <T variant="label">Muse</T>
          <T style={{ fontFamily: font.serif, fontSize: 19, lineHeight: 27, color: color.ink, marginTop: space.s }}>{res.note}</T>
        </View>
      ) : (
        <T variant="support" style={{ marginTop: space.m }}>
          Thinketh is reading it against each Mind…
        </T>
      )}
      <Pill label="Start together" onPress={() => mine && router.push({ pathname: "/resource/[id]", params: { id: mine.resourceId } })} busy={!ready} />
      <Button label="End session" kind="quiet" loading={busy} onPress={onEnd} style={{ alignSelf: "flex-start", marginTop: space.s }} />
    </View>
  );
}

function Ended({ room, me }: { room: PlaygroundRoom; me: string }) {
  const verified = room.transfer?.verified;
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <T variant="display" style={{ marginTop: space.xl }}>
        Session complete.
      </T>
      <T variant="support" style={{ marginTop: space.s, fontSize: 16, lineHeight: 24 }}>
        {verified ? `${nameOf(room, room.transfer!.learnerId)}'s Mind keeps what was verified. Nothing else changed.` : "Nothing was verified, so no Mind changed."}
      </T>
      <Pill label="See your Mind" onPress={() => router.push({ pathname: "/mind", params: room.transfer && room.transfer.learnerId === me ? { concept: room.transfer.conceptId } : {} })} />
    </View>
  );
}

/** Presence (Figma multiplayer grammar): who's here and whether they're following. Quiet, one line. */
function PresenceLine({ room, me, present }: { room: PlaygroundRoom; me: string; present: Record<string, { name: string; scene: string; following: boolean }> }) {
  const other = room.participants.find((p) => p.userId !== me);
  const p = other ? present[other.userId] : undefined;
  if (!other || other.demoPersona || !p) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: gutter, marginTop: -4 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.coral }} />
      <T variant="meta" style={{ color: color.ink3 }}>
        {p.following ? `${other.displayName} is here` : `${other.displayName} is exploring on their own`}
      </T>
    </View>
  );
}

/** Honest provenance: who conducted, how the room syncs. */
function Provenance({ room, live }: { room: PlaygroundRoom; live: boolean }) {
  return (
    <T variant="meta" style={{ marginHorizontal: gutter, marginTop: space.x3, color: color.ink3, fontSize: 11 }}>
      Conductor: {room.conductor.mode === "muse" ? room.conductor.detail : "deterministic fallback"} · Sync: {live ? "Supabase Realtime + polling" : "polling"} · Room {room.code}
    </T>
  );
}

function Offline() {
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <T variant="display" style={{ marginTop: space.xl }}>
        Learn together.
      </T>
      <T variant="support" style={{ marginTop: space.m }}>
        The Playground runs on the Thinketh server, so it isn&apos;t available in offline mode.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  conceptTitle: { marginTop: space.m, fontSize: 31, lineHeight: 38 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: gutter, paddingBottom: space.s },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  soloName: { fontFamily: font.serif, fontSize: 22, lineHeight: 28, color: color.ink, textAlign: "center", marginTop: space.x3 },
  joinBox: { marginTop: space.l, alignSelf: "stretch", alignItems: "center" },
  codeInput: { alignSelf: "stretch", textAlign: "center", fontFamily: font.serif, fontSize: 28, letterSpacing: 6, color: color.ink, borderBottomWidth: 1, borderBottomColor: color.edge, paddingVertical: space.s },
  plus: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel, alignItems: "center", justifyContent: "center" },
  inviteCard: { marginTop: space.xl, padding: space.xl, backgroundColor: color.panel, borderRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, borderColor: color.edge },
  pill: { alignSelf: "flex-start", marginTop: space.xl, borderRadius: radius.pill, paddingHorizontal: space.xl, minHeight: 52 },
  privateMind: { width: "100%", height: 200, borderRadius: radius.surface, borderWidth: 1, borderColor: color.edge, borderStyle: "dashed", alignItems: "center", justifyContent: "center", padding: space.m },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: color.edge, alignItems: "center", justifyContent: "center" },
  why: { marginTop: space.m, padding: space.m, backgroundColor: color.fog, borderRadius: radius.control, gap: 2 },
  speak: { flexDirection: "row", alignItems: "center", marginTop: space.xl, minHeight: 72, paddingLeft: space.l, paddingRight: space.m, borderRadius: radius.feature, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel },
  speakInput: { flex: 1, fontFamily: font.sans, fontSize: 16, lineHeight: 22, color: color.ink, paddingVertical: space.m, maxHeight: 140 },
  speakBtn: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: color.coral, backgroundColor: color.coralTint, alignItems: "center", justifyContent: "center", marginLeft: space.s },
  quote: { marginTop: space.l, paddingLeft: space.m, borderLeftWidth: 2, borderLeftColor: color.coralTint },
  answer: { marginTop: space.xl, minHeight: 110, padding: space.l, borderRadius: radius.surface, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel, fontFamily: font.sans, fontSize: 16, lineHeight: 23, color: color.ink, textAlignVertical: "top" },
  resourceSmall: { marginTop: space.xl, padding: space.l, borderRadius: radius.surface, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel },
  sourceCard: { marginTop: space.l, padding: space.xl, borderRadius: radius.surface, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel },
});
