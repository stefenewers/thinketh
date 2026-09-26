import { Component, createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { CollaborativeDeltaItem, PlaygroundRoom } from "@thinketh/contracts";
import { narrativeLabel, topicLabel } from "@thinketh/contracts";
import { DEMO_USER_ID } from "@/api";
import { playground, PLAYGROUND_AVAILABLE, PlaygroundError } from "@/api/playground";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { EventRail } from "@/components/playground/EventRail";
import { RoomScene, type Selection } from "@/components/playground/room/RoomScene";
import { ActionBanner, EvidenceSheet, useRoomCues } from "@/components/playground/room/RoomParts";
import { projectRoomToWorld } from "@/lib/roomWorld";
import { useReducedMotion } from "@/lib/hooks";
import { nextHumanAction, railSteps, stageState, type Pending, type StageState } from "@/lib/roomStory";
import { deltaClaim } from "@/lib/resourceDelta";
import { formatMinutes, planSummary } from "@/lib/planSummary";
import { DEMO_LEARNER_NAME } from "@/content/demo";
import { Dot, DotTag, MuseCard, OutcomeRow, StepRow, ThreadCard, TwoMinds, type DotTone } from "@/components/playground/pieces";
import { ListCard, RaisedCard, SectionHeader } from "@/components/system";
import { Button, Divider } from "@/components/ui";
import { useRoomChannel } from "@/lib/roomChannel";
import { fmt2 } from "@/lib/knowledge";
import { color, font, gutter, radius, shadow, space } from "@/theme/tokens";

/** The device owner's name in the room (the demo persona's human). */
const HOST_NAME = DEMO_LEARNER_NAME;
const POLL_MS = 1500;
/** Verified moments whose haptic already fired on this device. */
const celebratedHaptics = new Set<string>();
/** Scenes that happen in the one persistent room. */
const ROOM_SCENES = new Set(["arrival", "comparing", "overview", "peer_teaching", "transfer", "knowledge_moved", "shared_gap", "resource"]);
/** Scenes whose "What just happened" rail tracks a teaching exchange. */
const RAIL_SCENES = new Set(["overview", "peer_teaching", "transfer", "knowledge_moved"]);

/** "Following Muse" (Figma Spotlight): the view goes where the conductor points until you stop following. */
const FollowContext = createContext(true);

type Busy = null | "invite" | "compare" | "conduct" | "explain" | "answer" | "resource" | "join";

export default function PlaygroundScreen() {
  const params = useLocalSearchParams<{ code?: string; as?: string }>();
  // A second device joins as someone else (e.g. "nadani"); the host device is the demo user.
  const [me, setMe] = useState<string>(DEMO_USER_ID);
  const [room, setRoom] = useState<PlaygroundRoom | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // Technical provenance (conductor, sync, room code): hidden unless someone long-presses the title.
  const [showDiag, setShowDiag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);

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

  // Thinketh computes the comparison; the screen shows it while the request is actually in flight, no longer.
  const compare = async () => {
    if (!room) return;
    const r = await run("compare", () => playground.compare(room.id, me));
    if (r) Haptics.selectionAsync().catch(() => {});
  };

  const scene = room?.scene ?? "waiting";
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [scene]);
  // Every scene after arrival happens in the one room; Follow Muse / Explore applies to all of them.
  const inRoom = !!room && ROOM_SCENES.has(scene) && room.snapshots.length === 2;
  const following = inRoom;
  // What this device is waiting on: shown as in progress, never as a finished step.
  const pending: Pending = busy === "conduct" ? "conduct" : busy === "answer" ? "answer" : busy === "explain" ? "explain" : null;
  const stage = room ? stageState(room, pending) : null;
  const world = room ? projectRoomToWorld(room, me, busy === "compare" ? "compare" : pending) : null;
  const reducedMotion = useReducedMotion();
  const { cue, live: cueLive } = useRoomCues(room, me, reducedMotion);
  const [sel, setSel] = useState<Selection | "action" | null>(null);
  const { width: winW, height: winH } = useWindowDimensions();
  const sceneH = Math.round(Math.min(winW * 0.92, winH * 0.44));
  const headerRight = {
    waiting: room ? "Invite" : "Invite",
    arrival: "2 minds",
    comparing: "2 minds",
    overview: "Overview",
    peer_teaching: "Leave",
    transfer: "Leave",
    knowledge_moved: "Overview",
    shared_gap: "Pause",
    resource: "Resource",
    ended: "Done",
  }[scene];

  const customSource = (url: string) => room && run("resource", () => playground.resource(room.id, url, me));
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={{ minHeight: 44, justifyContent: "center" }}>
            <Icon name="back" size={19} color={color.ink} />
          </Pressable>
          {following ? (
            <Pressable
              onPress={() => setFollowMuse((f) => !f)}
              onLongPress={() => setShowDiag((v) => !v)}
              delayLongPress={600}
              accessibilityRole="button"
              accessibilityState={{ selected: followMuse }}
              accessibilityHint={followMuse ? "Stop following and explore on your own" : "Follow Muse again"}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <T style={styles.headerTitle}>
                {followMuse ? "Following Muse" : "Exploring"}
                <T variant="meta" style={{ color: color.ink3 }}>
                  {followMuse ? "  · Stop" : "  · Follow Muse"}
                </T>
              </T>
            </Pressable>
          ) : (
            // Long-press shows the room's technical provenance (dev/demo diagnostics); never shown by default.
            <Pressable onLongPress={() => setShowDiag((v) => !v)} delayLongPress={600} accessible={false}>
              <T style={styles.headerTitle} accessibilityRole="header">
                Playground
              </T>
            </Pressable>
          )}
        </View>
        {room && (scene === "peer_teaching" || scene === "transfer") ? (
          <Pressable onPress={() => run(null, () => playground.leave(room.id, me)).then(() => router.back())} accessibilityRole="button" hitSlop={10} style={{ minHeight: 44, justifyContent: "center" }}>
            <T variant="meta" style={{ color: color.ink2, fontSize: 14 }}>
              Leave
            </T>
          </Pressable>
        ) : (
          <T variant="meta" style={{ color: color.ink3, fontSize: 13 }}>
            {headerRight}
          </T>
        )}
      </View>
      {room ? <PresenceLine room={room} me={me} present={present} /> : null}

      {!PLAYGROUND_AVAILABLE ? (
        <Offline />
      ) : (
        <FollowContext.Provider value={followMuse || !following}>
        {inRoom && room && world ? (
          // The room: mounted for the whole exchange, centred, with the live action above it.
          <View>
            <View style={{ paddingHorizontal: gutter, paddingTop: space.xs, paddingBottom: space.xs }}>
              <ActionBanner cue={cue} onPress={() => setSel("action")} />
            </View>
            <RoomStageBoundary key={room.id}>
              <RoomScene world={world} cue={cue} live={cueLive} width={winW} height={sceneH} following={followMuse} onSelect={setSel} onReturnToLive={() => setFollowMuse(true)} />
            </RoomStageBoundary>
          </View>
        ) : null}
        <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: space.x4 + insets.bottom }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
          {/* The action area: what the room means right now, then the next human action. */}
          {inRoom && room && stage ? <StageCaption room={room} me={me} stage={stage} /> : null}
          {room && scene === "overview" ? <Overview room={room} me={me} busy={busy === "conduct"} onStart={() => run("conduct", () => playground.conduct(room.id, "next", me))} /> : null}
          {room && scene === "peer_teaching" ? (
            <PeerTeaching room={room} me={me} busy={busy === "explain"} onExplain={(text) => room.teaching && run("explain", () => playground.explain(room.id, text, { asUserId: actAs(room.teaching!.teacherId), as: me }))} />
          ) : null}
          {room && scene === "transfer" ? (
            <Transfer room={room} me={me} busy={busy === "answer"} onAnswer={(text) => room.transfer && run("answer", () => playground.answer(room.id, text, { asUserId: actAs(room.transfer!.learnerId), as: me }))} />
          ) : null}
          {room && scene === "knowledge_moved" ? (
            <KnowledgeMoved
              room={room}
              me={me}
              busy={busy === "conduct"}
              onNext={() => run("conduct", () => playground.conduct(room.id, "shared_gap", me))}
              onPlanNext={() => run("conduct", () => playground.conduct(room.id, "next", me))}
              onEnd={() => run("conduct", () => playground.conduct(room.id, "end", me))}
            />
          ) : null}
          {room && scene === "shared_gap" ? (
            <SharedGap room={room} me={me} busy={busy === "conduct"} sourceBusy={busy === "resource"} onNext={() => run("conduct", () => playground.conduct(room.id, "resource", me))} onCustomSource={customSource} />
          ) : null}
          {room && scene === "resource" ? (
            <ResourceScene room={room} me={me} busy={busy === "conduct"} sourceBusy={busy === "resource"} onEnd={() => run("conduct", () => playground.conduct(room.id, "end", me))} onCustomSource={customSource} />
          ) : null}
          {room && scene === "ended" ? <Ended room={room} me={me} /> : null}
          {error ? (
            <T variant="support" tone="coral" style={{ marginHorizontal: gutter, marginTop: space.l }}>
              {error}
            </T>
          ) : null}
          {/* The textual record: every step, who did it, and the evidence behind it. */}
          {room && stage && RAIL_SCENES.has(scene) ? (
            <View style={{ marginTop: space.xl }}>
              <EventRail steps={railSteps(room, pending)} next={pending ? null : nextHumanAction(room, me)} />
            </View>
          ) : null}
          {room && showDiag ? <Provenance room={room} live={live} /> : null}
        </ScrollView>
        {room && world ? <EvidenceSheet room={room} world={world} me={me} selection={sel} cue={cue} onClose={() => setSel(null)} /> : null}
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
// The live flow speaks in plain language; the canonical name stays one tap away (docs/PLAYGROUND.md).
const headline = (id: string, name: string) => narrativeLabel(id, sentence(name));
const topic = (id: string, name: string) => topicLabel(id, sentence(name).toLowerCase());

/** A malformed room snapshot must not blank the rest of a live demo. */
class RoomStageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <View style={{ marginHorizontal: gutter, marginTop: space.l, padding: space.l, borderRadius: radius.control, backgroundColor: color.surfaceMuted }}>
        <T variant="support">The room view could not render this snapshot. The learning exchange is still available below.</T>
        <Pressable onPress={() => this.setState({ failed: false })} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}>
          <T variant="meta" style={{ color: color.ink }}>Retry room view</T>
        </Pressable>
      </View>
    ) : this.props.children;
  }
}

/** Muse can take several seconds. Say so honestly; the planner steps in if it can't answer. Mounted per wait. */
function MuseWaiting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(id);
  }, []);
  return (
    <T variant="meta" style={styles.stageCaption} accessibilityLiveRegion="polite">
      {slow ? "Still waiting for Muse. If it can't answer, Thinketh's planner makes the move from the same plan." : "Muse is choosing the next move from Thinketh's plan…"}
    </T>
  );
}

/** One line under the canvas: the essential meaning of what's on it, in plain words. */
function StageCaption({ room, me, stage }: { room: PlaygroundRoom; me: string; stage: StageState }) {
  const who = (id?: string) => (id === me ? "You" : nameOf(room, id));
  const whoLower = (id?: string) => (id === me ? "you" : nameOf(room, id));
  const concept = stage.conceptId ? room.snapshots[0]?.concepts.find((c) => c.conceptId === stage.conceptId) : undefined;
  const t = stage.conceptId && concept ? topic(stage.conceptId, concept.name) : "this";
  const tn = room.transfer?.transition;
  const text =
    stage.waiting === "muse"
      ? null
      : stage.waiting === "grading"
        ? "Thinketh is grading the answer against its rubric…"
        : {
            found: stage.teacherId ? `${who(stage.teacherId)} can teach ${whoLower(stage.learnerId)} ${t}.` : "Thinketh compared the evidence in both Minds.",
            teaching: `${who(stage.teacherId)} ${stage.teacherId === me ? "are" : "is"} explaining. A perspective, not proof of learning yet.`,
            checkpoint: `Checkpoint at ${stage.learnerId === me ? "your" : `${nameOf(room, stage.learnerId)}'s`} Mind: apply it somewhere new.`,
            grading: "Thinketh is grading the answer…",
            verified: tn ? `Verified. ${who(stage.learnerId)}: ${fmt2(tn.before.mastery)} → ${fmt2(tn.after.mastery)}.` : "Verified.",
            not_yet: "Not verified yet. The path stops at the checkpoint; nothing moved.",
            gap: "Neither Mind has strong evidence here, so Muse teaches it to both.",
            source: "",
            idle: "",
          }[stage.beat];
  if (stage.waiting === "muse") return <MuseWaiting />;
  if (!text) return null;
  return (
    <T variant="meta" style={styles.stageCaption} accessibilityLiveRegion="polite">
      {text}
    </T>
  );
}

function Pill({ label, onPress, busy, kind = "primary" }: { label: string; onPress: () => void; busy?: boolean; kind?: "primary" | "secondary" }) {
  return <Button label={label} kind={kind} loading={busy} onPress={onPress} style={styles.pill} />;
}

// ---------------------------------------------------------------------------
// Scenes

/** Storyboard 08: the entry. Nothing is shared until you invite someone. */
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
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <View style={{ alignItems: "center", marginTop: space.l }}>
        <TwoMinds />
        <T variant="display" style={{ marginTop: space.xl, textAlign: "center" }}>
          Learn together.
        </T>
        <T variant="support" style={{ marginTop: space.s, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 300 }}>
          Bring another Mind in. Thinketh finds what can move between you.
        </T>
        <T variant="meta" style={{ marginTop: space.xs, color: color.ink3, textAlign: "center" }}>
          Muse conducts the room.
        </T>
      </View>

      {!room ? (
        <View style={{ marginTop: space.xl }}>
          <Button label="Invite a collaborator" accessibilityLabel="Invite a collaborator" icon="arrow" loading={busy === "invite"} onPress={onInvite} style={styles.cta} />
          <T variant="meta" style={{ marginTop: space.m, color: color.ink3, textAlign: "center" }}>
            Nothing is shared until you invite someone.
          </T>
          {joining ? (
            <RaisedCard style={{ marginTop: space.l, alignItems: "center" }}>
              <T variant="label">Room code</T>
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
            </RaisedCard>
          ) : (
            <Pressable onPress={() => setJoining(true)} accessibilityRole="button" style={{ marginTop: space.xs, minHeight: 44, justifyContent: "center", alignItems: "center" }}>
              <T variant="meta" style={{ color: color.ink }}>
                Have a code? Join a Playground
              </T>
            </Pressable>
          )}
        </View>
      ) : (
        <RaisedCard style={{ marginTop: space.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Dot tone="coral" size={5} />
            <T variant="label">Room code</T>
          </View>
          <T style={{ fontFamily: font.sansSemibold, fontSize: 30, lineHeight: 38, letterSpacing: 6, marginTop: space.xs, color: color.ink, fontVariant: ["tabular-nums"] }} selectable>
            {room.code}
          </T>
          <T variant="support" style={{ marginTop: space.s }}>
            On the other phone, open the Playground and join with this code. Only your knowledge state is shared: never your questions, memories or sources.
          </T>
          <Divider style={{ marginVertical: space.l, backgroundColor: color.hairline }} />
          <T variant="support">No second phone? Nadani&apos;s Mind is seeded for the demo, and this phone can speak for her.</T>
          <Pill label="Bring in Nadani" busy={busy === "invite"} onPress={onDemoGuest} />
        </RaisedCard>
      )}

      <SectionHeader title="How it works" />
      <ListCard>
        <StepRow icon="person" title="Invite someone" body="A collaborator on their phone, or Nadani on this one." />
        <StepRow icon="people" title="Thinketh compares your Minds" body="Shared strengths, teaching opportunities, shared gaps." />
        <StepRow icon="ask" title="Teach each other" body="One explains; the other applies it somewhere new." />
        <StepRow icon="sparkle" title="See what moves your thinking" body="A Mind changes only after demonstration." last />
      </ListCard>
    </View>
  );
}

/** Figma 1:94. */
function Arrival({ room, me, busy, onCompare }: { room: PlaygroundRoom; me: string; busy: boolean; onCompare: () => void }) {
  const guest = room.participants.find((p) => p.userId !== room.hostId);
  return (
    <View>
      <View style={{ paddingHorizontal: gutter, marginTop: space.s }}>
        <T variant="section">{guest?.userId === me ? `You joined ${nameOf(room, room.hostId)}.` : `${guest?.displayName ?? "Someone"} joined.`} Two Minds, one room.</T>
        <T variant="support" style={{ marginTop: space.s, fontSize: 15, lineHeight: 22 }}>
          {busy ? "Thinketh is comparing the evidence in both Minds…" : "Thinketh finds what can move between you, from evidence."}
        </T>
        <Pill label="Compare our Minds" busy={busy} onPress={onCompare} />
      </View>
    </View>
  );
}

/** Storyboard 09 / Figma 1:197: the collaborative delta, computed and explainable. */
function Overview({ room, me, busy, onStart }: { room: PlaygroundRoom; me: string; busy: boolean; onStart: () => void }) {
  const d = room.delta!;
  const aName = nameOf(room, d.aId);
  const bName = nameOf(room, d.bId);
  const items: { tag: string; tone: DotTone; item: CollaborativeDeltaItem }[] = [
    ...d.bTeachesA.slice(0, 1).map((item) => ({ tag: `${upper(d.bId === me ? "You" : bName)} → ${upper(d.aId === me ? "You" : aName)}`, tone: (d.bId === me ? "coral" : "partner") as DotTone, item })),
    ...d.aTeachesB.slice(0, 1).map((item) => ({ tag: `${upper(d.aId === me ? "You" : aName)} → ${upper(d.bId === me ? "You" : bName)}`, tone: (d.aId === me ? "coral" : "partner") as DotTone, item })),
    ...d.sharedGaps.slice(0, 1).map((item) => ({ tag: "MUSE → BOTH", tone: "muted" as const, item })),
  ];
  const words = ["No", "One", "Two", "Three"][items.length] ?? String(items.length);
  const [showAll, setShowAll] = useState(false);
  return (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <T variant="section" style={{ marginTop: space.m }}>
          {items.length ? "You can teach each other." : "You're closely matched."}{" "}
          <T variant="support">
            {words} useful difference{items.length === 1 ? "" : "s"} in your current evidence.
          </T>
        </T>
        {items.length ? (
          <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showAll }} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, alignSelf: "flex-start" }}>
            <T variant="meta" style={{ color: color.ink }}>{showAll ? "Hide the differences" : "See every difference and its rule"}</T>
            <View style={{ transform: [{ rotate: showAll ? "90deg" : "0deg" }] }}>
              <Icon name="chevron" size={12} color={color.ink3} />
            </View>
          </Pressable>
        ) : null}
        {items.length && showAll ? (
          <RaisedCard style={{ marginTop: space.xs, paddingBottom: space.xs }}>
            {items.map((x, i) => (
              <DeltaRow key={x.item.conceptId + x.item.kind} tag={x.tag} tone={x.tone} item={x.item} names={{ [d.aId]: aName, [d.bId]: bName }} last={i === items.length - 1} />
            ))}
          </RaisedCard>
        ) : null}
        {d.conflicts.length ? (
          <T variant="meta" style={{ marginTop: space.l }}>
            Not assigned yet: {d.conflicts.map((c) => headline(c.conceptId, c.conceptName)).join(", ")}. The evidence can&apos;t tell who should teach.
          </T>
        ) : null}
        {/* The budget is a planning constraint, not a countdown: Start begins the first move at once. */}
        <Pill label="Start session" busy={busy} onPress={onStart} />
        {planSummary(room.plan) ? (
          <T variant="meta" style={{ marginTop: space.s, color: color.ink2 }}>
            {planSummary(room.plan)}
          </T>
        ) : null}
        {room.plan?.items.length ? <PlanDisclosure room={room} /> : null}
      </View>
    </View>
  );
}

/** The real session plan: only the moves Thinketh chose, with its planning estimates and reasons. */
function PlanDisclosure({ room }: { room: PlaygroundRoom }) {
  const [open, setOpen] = useState(false);
  const plan = room.plan!;
  const who = (i: (typeof plan.items)[number]) =>
    i.type === "peer_teach" ? `${nameOf(room, i.teacherId)} → ${nameOf(room, i.learnerId)}` : i.type === "shared_gap" ? "Muse → both" : "Shared source";
  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start" }}>
        <T variant="meta" style={{ color: color.ink }}>
          {open ? "Hide learning plan" : "View learning plan"}
        </T>
        <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
          <Icon name="chevron" size={12} color={color.ink3} />
        </View>
      </Pressable>
      {open ? (
        <View>
          <T style={styles.planHead}>{plan.budgetMinutes}-minute learning plan</T>
          <T variant="meta" style={{ color: color.ink3, marginTop: 2, marginBottom: space.s }}>
            Thinketh ranked the highest-value moves that fit your available time. Do one, some or all of them.
          </T>
          <ListCard>
            {plan.items.map((i, k) => (
              <View key={i.id} style={[styles.planRow, k < plan.items.length - 1 && styles.planDivided]}>
                <T style={styles.planMin}>{formatMinutes(i.estimatedMinutes)}</T>
                <View style={{ flex: 1 }}>
                  <T variant="meta" style={{ color: color.ink2 }}>
                    {who(i)}
                  </T>
                  <T style={styles.planTitle}>{i.conceptName && i.conceptId ? headline(i.conceptId, i.conceptName) : "One source, two deltas"}</T>
                  <T variant="meta" style={{ color: color.ink3, marginTop: 2 }}>
                    {i.rationale}
                  </T>
                </View>
                {i.done ? <Icon name="check" size={14} color={color.ink} /> : null}
              </View>
            ))}
          </ListCard>
          <T variant="meta" style={{ marginTop: space.s, color: color.ink3 }}>
            Thinketh plans the moves. Muse conducts them. Only evidence changes a Mind.
          </T>
        </View>
      ) : null}
    </View>
  );
}

/** "Use another source": paste any article, docs page, PDF or YouTube link into the room. */
function SourceEntry({ busy, onSubmit }: { busy: boolean; onSubmit: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  if (!open) {
    return <Button label="Use another source" kind="quiet" onPress={() => setOpen(true)} style={{ alignSelf: "flex-start" }} />;
  }
  return (
    <RaisedCard style={{ marginTop: space.s }}>
      <T variant="label">Another source</T>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="Paste an article, PDF or YouTube link"
        placeholderTextColor={color.ink3}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={() => url.trim() && onSubmit(url.trim())}
        style={styles.urlInput}
        accessibilityLabel="Source link"
      />
      <Pill label={busy ? "Reading it…" : "Read it for both of us"} busy={busy} onPress={() => url.trim() && onSubmit(url.trim())} />
    </RaisedCard>
  );
}

function DeltaRow({ tag, tone, item, names, last }: { tag: string; tone: DotTone; item: CollaborativeDeltaItem; names: Record<string, string>; last: boolean }) {
  const [open, setOpen] = useState(false);
  const ids = Object.keys(names);
  const side = (k: "a" | "b") => item[k];
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityHint="Shows the evidence behind this"
      style={({ pressed }) => [{ paddingVertical: space.l, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: color.hairline }, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.m }}>
        <View style={{ flex: 1 }}>
          <DotTag tone={tone} label={tag} />
          <T variant="section" style={{ marginTop: space.s }}>
            {headline(item.conceptId, item.conceptName)}
          </T>
          <T variant="support" style={{ marginTop: space.xs }}>
            {item.reason}
          </T>
        </View>
        <View style={{ paddingTop: 2, transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
          <Icon name="chevron" size={14} color={color.ink3} />
        </View>
      </View>
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
          <T variant="meta" style={{ marginTop: space.xs, color: color.ink3 }}>
            Technical concept: {item.conceptName}
          </T>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Storyboard 10 / Figma 1:216: guided teaching cards; the coral trace is live. */
function PeerTeaching({ room, me, busy, onExplain }: { room: PlaygroundRoom; me: string; busy: boolean; onExplain: (text: string) => void }) {
  const t = room.teaching!;
  const [text, setText] = useState("");
  const teacher = nameOf(room, t.teacherId);
  const canSpeak = t.teacherId === me || room.participants.find((p) => p.userId === t.teacherId)?.demoPersona;
  return (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <DotTag tone="coral" label={`${upper(teacher)} → ${upper(nameOf(room, t.learnerId))}`} style={{ marginTop: space.l }} />
        <T variant="section" style={{ marginTop: space.xs }}>
          {headline(t.conceptId, t.conceptName)}
        </T>
      </View>
      <View style={{ paddingHorizontal: gutter, marginTop: space.l, gap: space.m }}>
        <MuseCard>{room.museLine ?? `${teacher}, teach this in your own words.`}</MuseCard>
        <ThreadCard who={t.teacherId === me ? "You" : teacher} tone={t.teacherId === me ? "coral" : "partner"}>
          <T variant="meta" style={{ color: color.ink3 }}>
            Muse asked
          </T>
          <T variant="body" style={{ marginTop: 2, fontSize: 15.5, lineHeight: 23 }}>
            {t.prompt}
          </T>
        </ThreadCard>
        {canSpeak ? (
          <View style={styles.speak}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t.teacherId === me ? "Explain it in your own words…" : `Type what ${teacher} says`}
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
              style={[styles.speakBtn, (!text.trim() || busy) && { opacity: 0.35 }]}
            >
              {busy ? <ActivityIndicator color={color.onInk} /> : <Icon name="arrow" size={17} color={color.onInk} />}
            </Pressable>
          </View>
        ) : (
          <View style={styles.speak}>
            <T variant="body" style={{ color: color.ink3, flex: 1, paddingVertical: space.m }}>
              {teacher} is speaking…
            </T>
          </View>
        )}
        {/* One-device mode: the host types what the seeded persona says. Her explanation isn't evidence for
            anyone; the transfer question is. Said plainly, so it never reads as a second live phone. */}
        {t.teacherId !== me && room.participants.find((p) => p.userId === t.teacherId)?.demoPersona ? (
          <T variant="meta" style={{ color: color.ink3 }}>
            {teacher} is a demo persona on this phone: type her explanation. Only your answer to the transfer check counts as evidence.
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
  return (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <DotTag tone="coral" label={tr.learnerId === me ? "Your turn" : `${upper(learner)}'s turn`} style={{ marginTop: space.l }} />
        <T variant="title" style={{ marginTop: space.m }}>
          {tr.prompt}
        </T>
        {t?.explanation ? (
          <ThreadCard who={`${t.teacherId === me ? "You" : nameOf(room, t.teacherId)} explained`} tone={t.teacherId === me ? "coral" : "partner"} style={{ marginTop: space.l }}>
            <T variant="support" style={{ fontSize: 15, lineHeight: 22, color: color.ink }}>
              “{t.explanation}”
            </T>
          </ThreadCard>
        ) : null}
      </View>
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
            <View style={!text.trim() || busy ? { opacity: 0.4 } : undefined} pointerEvents={!text.trim() || busy ? "none" : "auto"}>
              <Pill label={busy ? "Thinketh is checking…" : "Submit"} busy={busy} onPress={() => onAnswer(text.trim())} />
            </View>
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

/** Storyboard 11 / Figma 1:269: knowledge moved, and exactly why Thinketh believes it. */
function KnowledgeMoved({ room, me, busy, onNext, onPlanNext, onEnd }: { room: PlaygroundRoom; me: string; busy: boolean; onNext: () => void; onPlanNext: () => void; onEnd: () => void }) {
  const nextItem = room.plan?.items.find((i) => !i.done);
  const gapPending = !room.sharedGap && (room.delta?.sharedGaps.length ?? 0) > 0;
  const tr = room.transfer!;
  const t = room.teaching;
  const learner = nameOf(room, tr.learnerId);
  const teacher = t ? nameOf(room, t.teacherId) : "Your peer";
  const verified = !!tr.verified;
  const [why, setWhy] = useState(false);
  // Once per verified event on this device: a refetch or remount never repeats the success moment.
  const verifiedSeq = room.events.findLast((e) => e.type === "transfer_verified")?.seq;
  useEffect(() => {
    const key = `${room.id}:${verifiedSeq}`;
    if (!verified || verifiedSeq === undefined || celebratedHaptics.has(key)) return;
    celebratedHaptics.add(key);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [verified, verifiedSeq, room.id]);
  const tn = tr.transition;
  // Concepts the moved one connects to in the learner's own Mind (from the room snapshot).
  const learnerSnap = room.snapshots.find((x) => x.userId === tr.learnerId);
  const related = learnerSnap
    ? [...new Set(learnerSnap.edges.flatMap((e) => (e.fromConceptId === tr.conceptId ? [e.toConceptId] : e.toConceptId === tr.conceptId ? [e.fromConceptId] : [])))]
        .map((id) => learnerSnap.concepts.find((c) => c.conceptId === id)?.short)
        .filter((n): n is string => !!n)
        .slice(0, 4)
    : [];
  return (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <T variant="title" style={{ marginTop: space.m }}>
          {verified ? "Knowledge moved." : "Not yet."}
        </T>
        <T variant="support" style={{ marginTop: space.s, fontSize: 15, lineHeight: 22 }}>
          {verified ? `${learner} applied what ${teacher} taught in a new context.` : `${learner}'s answer didn't show it yet. Thinketh recorded what it did show.`}
        </T>
      </View>
      <View style={{ paddingHorizontal: gutter, marginTop: space.l }}>
        {tn ? (
          <View style={{ flexDirection: "row", gap: space.s, marginBottom: space.m }}>
            <View style={styles.resultMeasure}>
              <T variant="label">MASTERY</T>
              <T style={styles.resultValue}>{fmt2(tn.before.mastery)} → {fmt2(tn.after.mastery)}</T>
            </View>
            <View style={styles.resultMeasure}>
              <T variant="label">UNCERTAINTY</T>
              <T style={styles.resultValue}>{fmt2(tn.before.uncertainty)} → {fmt2(tn.after.uncertainty)}</T>
            </View>
          </View>
        ) : null}
        <ListCard>
          {verified ? (
            <OutcomeRow icon="sparkle" title={`Strengthened ${tr.learnerId === me ? "your" : `${learner}'s`} thinking on ${topic(tr.conceptId, t?.conceptName ?? "")}`} body={related.length ? `Connected concepts lit in the room: ${related.join(" · ")}` : "New connection verified"} last={!tn} />
          ) : (
            <View style={[styles.changeRow, tn ? styles.changeDivided : null]}>
              <DotTag tone="muted" label={upper(headline(tr.conceptId, t?.conceptName ?? ""))} />
              <T variant="section" style={{ marginTop: space.s }}>
                Recorded, not verified
              </T>
              <T variant="support" style={{ marginTop: space.xs }}>
                {tr.feedback ?? ""}
              </T>
            </View>
          )}
          {tn ? (
            <Pressable onPress={() => setWhy((w) => !w)} accessibilityRole="button" accessibilityState={{ expanded: why }} style={({ pressed }) => [styles.changeRow, { minHeight: 44 }, pressed && { backgroundColor: color.surfaceMuted }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s }}>
                <T variant="meta" style={{ color: color.ink, fontVariant: ["tabular-nums"], flex: 1 }}>
                  {why ? "Why Thinketh changed its model" : "Why did Thinketh change its model?"}
                </T>
                <View style={{ transform: [{ rotate: why ? "90deg" : "0deg" }] }}>
                  <Icon name="chevron" size={14} color={color.ink3} />
                </View>
              </View>
              {why ? (
                <View style={styles.why}>
                  <T variant="meta" style={{ color: color.ink3 }}>
                    Technical concept: {t?.conceptName}
                  </T>
                  <T variant="support" style={{ marginTop: space.xs }}>
                    {tn.reason}
                  </T>
                  {verified && tr.feedback ? (
                    <T variant="meta" style={{ marginTop: space.s }}>
                      Grader: {tr.feedback}
                    </T>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </ListCard>
        {/* The next planned teaching move, up front: "what about another concept?" gets a real, different challenge. */}
        {nextItem?.type === "peer_teach" ? (
          <View style={styles.nextMove}>
            <T variant="label">Next in the plan</T>
            <T style={styles.nextTitle}>
              {nameOf(room, nextItem.teacherId)} teaches {nameOf(room, nextItem.learnerId)} {topic(nextItem.conceptId ?? "", nextItem.conceptName ?? "")}
            </T>
            <T variant="meta" style={{ color: color.ink3, marginTop: 2 }}>
              {nextItem.rationale}
            </T>
            <Button label={busy ? "Muse is setting it up…" : "Start this move"} icon="arrow" loading={busy} onPress={onPlanNext} style={{ marginTop: space.m }} />
          </View>
        ) : null}
        {tr.learnerId === me ? (
          <Button
            kind="secondary"
            label="See your Mind"
            onPress={() => router.push({ pathname: "/mind", params: { concept: tr.conceptId } })}
            style={{ alignSelf: "flex-start", marginTop: space.m }}
          />
        ) : null}
        {gapPending ? (
          <Button label="Next: the shared gap" kind="quiet" icon="arrow" loading={busy} onPress={onNext} style={{ alignSelf: "flex-start", marginTop: nextItem?.type === "peer_teach" ? 0 : space.s }} />
        ) : nextItem?.type !== "peer_teach" ? (
          <Button label="Continue" kind="quiet" icon="arrow" loading={busy} onPress={onPlanNext} style={{ alignSelf: "flex-start", marginTop: space.s }} />
        ) : null}
        {/* The plan is guidance, not a commitment: ending after any move is fine. */}
        <Button label="End session" kind="quiet" loading={busy} onPress={onEnd} style={{ alignSelf: "flex-start" }} />
        <T variant="meta" style={{ marginTop: space.s, color: color.ink3 }}>
          Source: peer learning session · just now
        </T>
      </View>
    </View>
  );
}

/** Figma 1:322: neither Mind has it; Muse teaches both. */
function SharedGap({ room, me, busy, sourceBusy, onNext, onCustomSource }: { room: PlaygroundRoom; me: string; busy: boolean; sourceBusy: boolean; onNext: () => void; onCustomSource: (url: string) => void }) {
  const g = room.sharedGap!;
  const [open, setOpen] = useState(false);
  const source = room.events.findLast((e) => e.type === "shared_gap_taught")?.data?.resourceTitle;
  return (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <DotTag tone="muted" label="Shared gap" style={{ marginTop: space.m }} />
        <T variant="section" style={{ marginTop: space.xs }}>
          {headline(g.conceptId, g.conceptName)}
        </T>
      </View>
      <View style={{ paddingHorizontal: gutter, marginTop: space.l, gap: space.m }}>
        <MuseCard>
          <T style={{ fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 21, color: color.ink, marginTop: space.s }}>Neither Mind has strong evidence here.</T>
          <T variant="support" style={{ marginTop: space.xs }}>
            Muse will teach the shared gap.
          </T>
        </MuseCard>
        {typeof source === "string" ? (
          <RaisedCard style={{ paddingVertical: space.m }}>
            <T variant="label">Resource</T>
            <T variant="body" style={{ fontFamily: font.sansSemibold, marginTop: space.s, fontSize: 15 }}>
              {source}
            </T>
          </RaisedCard>
        ) : null}
        {open ? (
          <View>
            <RaisedCard style={{ gap: space.l }}>
              {(g.lesson ?? []).map((s) => (
                <View key={s.heading}>
                  <T variant="label">{s.heading}</T>
                  <T variant="body" style={{ marginTop: space.xs }}>
                    {s.body}
                  </T>
                </View>
              ))}
            </RaisedCard>
            {/* What the next step is, before it happens: the same reading, a different delta for each Mind. */}
            <T variant="support" style={{ marginTop: space.l }}>
              Next: one shared source, read against each Mind separately. Same words, a different delta for each of you.
            </T>
            <Pill label={busy ? "Reading it for both of you…" : "Bring in a shared source"} busy={busy} onPress={onNext} />
            <SourceEntry busy={sourceBusy} onSubmit={onCustomSource} />
          </View>
        ) : (
          <Pill label="Teach it to both of us" onPress={() => setOpen(true)} />
        )}
      </View>
    </View>
  );
}

/** Figma 1:376: same source, a different delta for each Mind. */
function ResourceScene({ room, me, busy, sourceBusy, onEnd, onCustomSource }: { room: PlaygroundRoom; me: string; busy: boolean; sourceBusy: boolean; onEnd: () => void; onCustomSource: (url: string) => void }) {
  const res = room.resource!;
  const hostFirst = [...res.sides].sort((a) => (a.userId === room.hostId ? -1 : 1));
  const mine = res.sides.find((s) => s.userId === me);
  // Only claim "different" when the two computed deltas actually differ.
  const claim = deltaClaim(res.sides);
  const ready = claim !== "reading";
  // An unreadable source makes no claim about either delta.
  const anyFailed = res.sides.some((x) => x.status === "failed");
  return (
    <View style={{ paddingHorizontal: gutter }}>
      {/* The room shows the source splitting into each Mind's delta; here, one line and the actions. */}
      <T variant="meta" style={{ marginTop: space.m, color: color.ink2 }} numberOfLines={2}>
        One source · {res.title}
        {res.readMinutes ? ` · ~${Math.round(res.readMinutes)} min full` : ""}
      </T>
      {res.chosenBecause ? (
        <T variant="meta" style={{ marginTop: 2, color: color.ink3 }}>
          {res.chosenBecause}
        </T>
      ) : null}
      {hostFirst.some((x) => x.status === "failed") ? (
        <T variant="support" style={{ marginTop: space.s }}>
          Thinketh couldn&apos;t read this source for {hostFirst.filter((x) => x.status === "failed").map((x) => (x.userId === me ? "you" : nameOf(room, x.userId))).join(" and ")}. Nothing was changed; try another link.
        </T>
      ) : null}
      <T variant="title" style={{ marginTop: space.m }}>
        {claim === "reading" ? "Same source." : anyFailed ? "Same source, not read yet." : claim === "different" ? "Same source. Different delta." : "Same source. A similar delta."}
      </T>
      {res.note ? (
        <MuseCard style={{ marginTop: space.l }}>{res.note}</MuseCard>
      ) : (
        <T variant="support" style={{ marginTop: space.m }}>
          Thinketh is reading it against each Mind…
        </T>
      )}
      {ready && mine?.status === "failed" ? null : ready ? (
        <Pill label="Start together" onPress={() => mine && router.push({ pathname: "/resource/[id]", params: { id: mine.resourceId } })} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
          <ActivityIndicator color={color.ink3} />
          <T variant="support">Reading the source for both of you…</T>
        </View>
      )}
      <SourceEntry busy={sourceBusy} onSubmit={onCustomSource} />
      <Button label="End session" kind="quiet" loading={busy} onPress={onEnd} style={{ alignSelf: "flex-start", marginTop: space.s }} />
    </View>
  );
}

function Ended({ room, me }: { room: PlaygroundRoom; me: string }) {
  const verified = room.transfer?.verified;
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <View style={{ alignItems: "center", marginTop: space.l }}>
        <TwoMinds width={200} height={128} />
      </View>
      <T variant="display" style={{ marginTop: space.xl }}>
        Session complete.
      </T>
      <T variant="support" style={{ marginTop: space.s, fontSize: 15, lineHeight: 22 }}>
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
    <T variant="meta" style={{ marginHorizontal: gutter, marginTop: space.xl, color: color.ink3, fontSize: 11 }}>
      Conductor: {room.conductor.mode === "muse" ? room.conductor.detail : "deterministic fallback"} · Sync: {live ? "Supabase Realtime + polling" : "polling"} · Room {room.code}
    </T>
  );
}

function Offline() {
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <T variant="display" style={{ marginTop: space.m }}>
        Learn together.
      </T>
      <T variant="support" style={{ marginTop: space.m }}>
        The Playground runs on the Thinketh server, so it isn&apos;t available in offline mode.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  planRow: { flexDirection: "row", alignItems: "flex-start", gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m },
  planDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  planHead: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, color: color.ink, marginTop: space.xs },
  planMin: { width: 48, fontFamily: font.sansSemibold, fontSize: 13, lineHeight: 18, color: color.ink, fontVariant: ["tabular-nums"] },
  planTitle: { fontFamily: font.sansSemibold, fontSize: 14.5, lineHeight: 20, color: color.ink, marginTop: 1 },
  urlInput: { marginTop: space.s, minHeight: 44, paddingHorizontal: space.m, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, backgroundColor: color.surfaceMuted, fontFamily: font.sans, fontSize: 15, color: color.ink },
  focusChip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, marginTop: 4, paddingHorizontal: space.s, paddingVertical: 4, borderRadius: 999, backgroundColor: color.surfaceMuted },
  focusText: { fontFamily: font.sansSemibold, fontSize: 13, lineHeight: 17, color: color.ink, flexShrink: 1 },
  conceptTitle: { marginTop: space.s, fontSize: 28, lineHeight: 34 },
  stageCaption: { marginTop: space.xs, paddingHorizontal: gutter, textAlign: "center", color: color.ink2 },
  nextMove: { marginTop: space.l, padding: space.l, borderRadius: 20, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, ...shadow.soft },
  nextTitle: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 23, letterSpacing: -0.3, color: color.ink, marginTop: space.xs },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: gutter, paddingBottom: space.s, backgroundColor: color.canvas },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 44 },
  headerTitle: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink },
  cta: { alignSelf: "stretch", minHeight: 52 },
  codeInput: { alignSelf: "stretch", textAlign: "center", fontFamily: font.sansSemibold, fontSize: 26, lineHeight: 34, letterSpacing: 6, color: color.ink, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline, paddingVertical: space.s, marginTop: space.s },
  pill: { alignSelf: "flex-start", marginTop: space.l, borderRadius: radius.pill, paddingHorizontal: space.xl, minHeight: 46 },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: color.edge, alignItems: "center", justifyContent: "center" },
  why: { marginTop: space.s, padding: space.m, backgroundColor: color.surfaceMuted, borderRadius: radius.control, gap: 2 },
  speak: { flexDirection: "row", alignItems: "center", minHeight: 60, paddingLeft: space.l, paddingRight: space.s, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, backgroundColor: color.canvas, ...shadow.soft },
  speakInput: { flex: 1, fontFamily: font.sans, fontSize: 15, lineHeight: 21, color: color.ink, paddingVertical: space.m, maxHeight: 140 },
  speakBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.ink, alignItems: "center", justifyContent: "center", marginLeft: space.s },
  answer: { marginTop: space.l, minHeight: 104, padding: space.l, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, backgroundColor: color.canvas, fontFamily: font.sans, fontSize: 15, lineHeight: 22, color: color.ink, textAlignVertical: "top", ...shadow.soft },
  changeRow: { paddingHorizontal: space.l, paddingVertical: space.m },
  changeDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  resultMeasure: { flex: 1, padding: space.m, borderRadius: radius.control, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  resultValue: { marginTop: space.s, fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 23, color: color.ink, fontVariant: ["tabular-nums"] },
  colDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.hairline },
});
