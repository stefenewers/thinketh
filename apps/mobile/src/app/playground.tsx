import { Component, createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAgentScreen } from "@/agent/screenContext";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/lib/nav";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CollaborativeDeltaItem, LearningScene, PlaygroundRoom } from "@thinketh/contracts";
import { narrativeLabel, topicLabel } from "@thinketh/contracts";
import { DEMO_USER_ID } from "@/api";
import { useProfile } from "@/lib/profile";
import { currentMode, currentUserId } from "@/lib/session";
import { playground, PLAYGROUND_AVAILABLE, PlaygroundError } from "@/api/playground";
import { challengeApi } from "@/api/challenge";
import { ChallengePanel } from "@/components/playground/grokbot/ChallengePanel";
import { useChallengeDriver } from "@/components/playground/grokbot/useChallengeDriver";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { WorldCanvas, type WorldSelection } from "@/components/playground/world/WorldCanvas";
import { AgentSheet, WorldNow } from "@/components/playground/world/WorldPanel";
import { projectPlayground } from "@/components/playground/world/worldState";
import { acceptRoom } from "@/lib/roomSync";
import { ActionBanner, EvidenceSheet, useRoomCues, type Selection } from "@/components/playground/room/RoomParts";
import { useReducedMotion } from "@/lib/hooks";
import { DEMO_LEARNER_NAME } from "@/content/demo";
import { Dot, DotTag, StepRow, ThreadCard, type DotTone } from "@/components/playground/pieces";
import { ListCard, RaisedCard, SectionHeader } from "@/components/system";
import { Button, Divider } from "@/components/ui";
import { useRoomChannel } from "@/lib/roomChannel";
import { DEMO_CONTROLS } from "@/lib/devFlags";
import { fmt2 } from "@/lib/knowledge";
import { color, font, gutter, radius, space } from "@/theme/tokens";

/** The device owner's name in the room (the demo persona's human). */
const HOST_NAME = DEMO_LEARNER_NAME;
const POLL_MS = 1500;
/** Scenes that happen in the one persistent room. */
const ROOM_SCENES = new Set<LearningScene>(["arrival", "comparing", "overview", "agent_exchange"]);
/** Quiet status at the top right. (Scenes of the removed guided session never reach the app: the server shows them as the overview.) */
const HEADER_RIGHT: Partial<Record<LearningScene, string>> = { waiting: "Invite", arrival: "2 minds", comparing: "2 minds", overview: "Overview", agent_exchange: "Exchange", ended: "Done" };

/** "Following Muse" (Figma Spotlight): the view goes where the conductor points until you stop following. */
const FollowContext = createContext(true);

/** The room this identity was last in, so leaving the Playground (or the app) never loses it. */
const lastRoomKey = (userId: string) => `thinketh.playground.lastRoom.v1.${userId}`;
type LastRoom = { roomId: string; me: string };

type Busy = null | "quick" | "invite" | "compare" | "join" | "share" | "exchange" | "challenge" | "leave";

export default function PlaygroundScreen() {
  const params = useLocalSearchParams<{ code?: string; as?: string }>();
  // A second device joins as someone else (e.g. "nadani"); the host device is the demo user.
  const profile = useProfile();
  const personal = currentMode() === "personal";
  const hostName = personal ? (profile?.displayName ?? "You") : HOST_NAME;
  // Personal mode: this device is its verified identity. Demo mode: the demo persona, or a seeded guest.
  const [me, setMe] = useState<string>(currentUserId() ?? DEMO_USER_ID);
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
      setRoom((prev) => acceptRoom(prev, r));
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
        (r) => setRoom((prev) => acceptRoom(prev, r)),
        () => {},
      );
    }, POLL_MS);
    return () => clearInterval(t);
  }, [roomId, me, room?.scene, seq]);

  // Realtime makes the other device's actions land immediately; polling stays as the floor.
  const [followMuse, setFollowMuse] = useState(true);
  const myName = room?.participants.find((p) => p.userId === me)?.displayName ?? hostName;
  const { live, present } = useRoomChannel(room?.realtime, me, room ? { name: myName, scene: room.scene, following: followMuse } : null, (e) => {
    if (!roomId || (seq !== undefined && e.seq <= seq)) return;
    playground.get(roomId, me).then((r) => setRoom((prev) => acceptRoom(prev, r)), () => {});
  });

  // Deep link from a second device: /playground?code=ABC123&as=nadani
  const joinedFromLink = useRef(false);
  useEffect(() => {
    if (joinedFromLink.current || !params.code || !params.as) return;
    joinedFromLink.current = true;
    // Personal mode joins as this device's own identity; `as` only picks a seeded persona in demo mode.
    const as = personal ? me : params.as;
    setMe(as);
    run("join", () => playground.join(params.code!, personal ? hostName : params.as === "nadani" ? "Nadani" : "Guest", as));
  }, [params.code, params.as, run, personal, me, hostName]);

  // Resume the room this identity was last in (unless a link is joining another one). An exchange or
  // challenge only advances while this screen is open, so coming back must pick it up, not start over.
  const [owner] = useState(() => currentUserId() ?? DEMO_USER_ID);
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || params.code) return;
    resumed.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(lastRoomKey(owner));
        if (!raw) return;
        const last = JSON.parse(raw) as LastRoom;
        const r = await playground.get(last.roomId, last.me);
        if (r.scene === "ended") return void AsyncStorage.removeItem(lastRoomKey(owner)).catch(() => {});
        setMe(last.me);
        setRoom((prev) => prev ?? r);
      } catch {
        // Gone (or unreachable): start fresh.
        AsyncStorage.removeItem(lastRoomKey(owner)).catch(() => {});
      }
    })();
  }, [owner, params.code]);
  useEffect(() => {
    if (!roomId) return;
    if (room?.scene === "ended") AsyncStorage.removeItem(lastRoomKey(owner)).catch(() => {});
    else AsyncStorage.setItem(lastRoomKey(owner), JSON.stringify({ roomId, me } satisfies LastRoom)).catch(() => {});
  }, [owner, roomId, me, room?.scene]);

  /**
   * One tap from an empty Playground to agents exchanging: open a room, bring in Nadani's seeded Mind,
   * compare, and start the exchange. Each step is the same server call the step-by-step path makes; if
   * the exchange isn't available (no Muse, nothing to teach), it stops on the overview, which says why.
   */
  const quickExchange = () =>
    run("quick", async () => {
      let r = await playground.create(hostName, me);
      setRoom(r);
      r = await playground.demoGuest(r.id);
      setRoom((prev) => acceptRoom(prev, r));
      r = await playground.compare(r.id, me);
      setRoom((prev) => acceptRoom(prev, r));
      if (r.exchangeAvailability?.available) r = await playground.startExchange(r.id, undefined, me);
      return r;
    });

  // Agent exchange driver: while it runs, ask the server for the next step, one at a time. The server claims
  // each step durably, so two devices (or a retry) never run it twice; a step someone else holds just waits.
  const advancing = useRef(false);
  const [exTick, setExTick] = useState(0);
  const exRunning = room?.exchange?.status === "running";
  const exStep = room?.exchange?.step;
  useEffect(() => {
    if (!roomId || !exRunning || exStep === undefined || advancing.current) return;
    advancing.current = true;
    playground
      .advanceExchange(roomId, exStep, me)
      .then(
        (r) => {
          setRoom((prev) => acceptRoom(prev, r));
          // Nothing moved (another device holds this step): look again shortly.
          if (r.exchange?.step === exStep && r.exchange.status === "running") return new Promise((res) => setTimeout(res, 1500));
        },
        () => new Promise((res) => setTimeout(res, 2500)),
      )
      .finally(() => {
        advancing.current = false;
        setExTick((t) => t + 1);
      });
  }, [roomId, exRunning, exStep, me, exTick]);

  // Grokbot's challenge advances the same way: one server step at a time, claimed durably.
  const onChallengeRoom = useCallback((r: PlaygroundRoom) => setRoom((prev) => acceptRoom(prev, r)), []);
  useChallengeDriver(room, me, onChallengeRoom);

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
  const reducedMotion = useReducedMotion();
  const { cue } = useRoomCues(room, me, reducedMotion);
  const [sel, setSel] = useState<Selection | "action" | null>(null);
  const [agentSel, setAgentSel] = useState<string | null>(null);
  const { width: winW, height: winH } = useWindowDimensions();
  // The persistent room: pure projection of the server's room, this viewer and what's in flight.
  const pw = projectPlayground(room, me, busy === "compare" ? "compare" : null, hostName);
  const worldH = Math.round(Math.max(260, Math.min(winW * 0.76, winH * 0.35)));
  const keyboard = useKeyboardVisible();
  // With the keyboard up the room shrinks (scaled, not re-laid-out, so nobody walks) to keep the input visible.
  const shownH = keyboard ? Math.min(worldH, 150) : worldH;
  // For the voice agent: which room and scene, never another person's private data.
  useAgentScreen({
    screen: "playground",
    route: "/playground",
    title: "Playground",
    ...(room
      ? {
          focus: { kind: "room" as const, id: room.id, label: "this Playground room" },
          visible: [`With: ${room.participants.map((p) => (p.userId === me ? "you" : p.displayName)).join(", ")}`],
          room: { id: room.id, scene, participants: room.participants.length },
        }
      : {}),
  });
  const onWorldSelect = (s: WorldSelection) => {
    if (s.kind === "agent") setAgentSel(s.userId);
    else if (s.kind === "muse") setSel({ kind: "muse" });
    else setSel({ kind: "idea" });
  };
  // Leaving ends the room for both devices; not while agents or Grokbot are mid-turn (stop them first).
  const canLeave = !!room && (scene === "overview" || scene === "agent_exchange") && room.exchange?.status !== "running" && room.challenge?.status !== "running";
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => goBack()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={{ minHeight: 44, justifyContent: "center" }}>
            <Icon name="back" size={19} color={color.ink} />
          </Pressable>
          {following ? (
            <Pressable
              onPress={() => setFollowMuse((f) => !f)}
              onLongPress={DEMO_CONTROLS ? () => setShowDiag((v) => !v) : undefined}
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
            <Pressable onLongPress={DEMO_CONTROLS ? () => setShowDiag((v) => !v) : undefined} delayLongPress={600} accessible={false}>
              <T style={styles.headerTitle} accessibilityRole="header">
                Playground
              </T>
            </Pressable>
          )}
        </View>
        {room && canLeave ? (
          <Pressable onPress={() => run("leave", () => playground.leave(room.id, me)).then(() => goBack())} disabled={busy === "leave"} accessibilityRole="button" hitSlop={10} style={{ minHeight: 44, justifyContent: "center" }}>
            <T variant="meta" style={{ color: color.ink2, fontSize: 14 }}>
              Leave
            </T>
          </Pressable>
        ) : (
          <T variant="meta" style={{ color: color.ink3, fontSize: 13 }}>
            {HEADER_RIGHT[scene] ?? ""}
          </T>
        )}
      </View>
      {room ? <PresenceLine room={room} me={me} present={present} /> : null}

      {!PLAYGROUND_AVAILABLE ? (
        <Offline />
      ) : (
        <FollowContext.Provider value={followMuse || !following}>
        {/* The room: one persistent world for the whole session, above a compact action area. */}
        <View style={{ height: shownH, overflow: "hidden", alignItems: "center" }}>
          <View style={{ width: winW, height: worldH, transform: [{ translateY: -(worldH - shownH) / 2 }, { scale: shownH / worldH }] }}>
            <RoomStageBoundary>
              <WorldCanvas room={room} world={pw} width={winW} height={worldH} following={followMuse || !inRoom} reduced={reducedMotion} onSelect={onWorldSelect} onFollow={setFollowMuse} />
            </RoomStageBoundary>
          </View>
        </View>
        <WorldNow world={pw} />
        <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: space.x4 + insets.bottom }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {scene === "waiting" ? (
            <Waiting
              room={room}
              busy={busy}
              onInvite={() => run("invite", () => playground.create(hostName, me))}
              onQuickExchange={quickExchange}
              onDemoGuest={() => room && run("invite", () => playground.demoGuest(room.id))}
              onJoin={(code, as) => {
                if (personal) return void run("join", () => playground.join(code, hostName, me));
                setMe(as);
                run("join", () => playground.join(code, as === "nadani" ? "Nadani" : "Guest", as));
              }}
            />
          ) : null}
          {room && scene === "arrival" ? <Arrival room={room} me={me} busy={busy === "compare"} onCompare={compare} /> : null}
          {/* The action area: what the room means right now, then the next action. */}
          {room && scene === "overview" ? (
            <Overview room={room} me={me} busy={busy === "exchange"} onExchange={() => run("exchange", () => playground.startExchange(room.id, undefined, me))} />
          ) : null}
          {room && scene === "agent_exchange" && room.exchange ? (
            <ExchangeScene
              room={room}
              me={me}
              busy={busy}
              onStop={() => run("exchange", () => playground.stopExchange(room.id, me))}
              onClose={() => run("exchange", () => playground.closeExchange(room.id, me))}
              onChallenge={() => run("challenge", () => challengeApi.start(room.id, me))}
              onStopChallenge={() => run("challenge", () => challengeApi.stop(room.id, me))}
            />
          ) : null}
          {room && scene === "ended" ? <Ended /> : null}
          {error ? (
            <T variant="support" tone="coral" style={{ marginHorizontal: gutter, marginTop: space.l }}>
              {error}
            </T>
          ) : null}
          {/* The textual record: every step, who did it, and the evidence behind it. */}
          {inRoom ? (
            <View style={{ paddingHorizontal: gutter, marginTop: space.xl, gap: space.s }}>
              <T variant="label" style={{ color: color.ink3 }}>
                What happened
              </T>
              <ActionBanner cue={cue} onPress={() => setSel("action")} />
            </View>
          ) : null}
          {room && showDiag ? <Provenance room={room} live={live} /> : null}
        </ScrollView>
        {room ? <EvidenceSheet room={room} world={pw} me={me} selection={sel} cue={cue} onClose={() => setSel(null)} /> : null}
        <AgentSheet
          room={room}
          world={pw}
          me={me}
          userId={agentSel}
          onClose={() => setAgentSel(null)}
          onSeeMind={(userId) => {
            setAgentSel(null);
            setSel({ kind: "mind", userId });
          }}
        />
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
  onQuickExchange,
  onDemoGuest,
  onJoin,
}: {
  room: PlaygroundRoom | null;
  busy: Busy;
  onInvite: () => void;
  onQuickExchange: () => void;
  onDemoGuest: () => void;
  onJoin: (code: string, as: string) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <View style={{ alignItems: "center", marginTop: space.l }}>
        <T variant="display" style={{ textAlign: "center" }}>
          Learn together.
        </T>
        <T variant="support" style={{ marginTop: space.s, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 300 }}>
          Bring another Mind in. Thinketh finds what can move between you.
        </T>
        <T variant="meta" style={{ marginTop: space.xs, color: color.ink3, textAlign: "center" }}>
          Your agents exchange. Thinketh checks what they keep.
        </T>
      </View>

      {!room ? (
        <View style={{ marginTop: space.xl }}>
          <Button label="Invite a collaborator" accessibilityLabel="Invite a collaborator" icon="arrow" loading={busy === "invite"} onPress={onInvite} style={styles.cta} />
          <T variant="meta" style={{ marginTop: space.m, color: color.ink3, textAlign: "center" }}>
            Nothing is shared until you invite someone.
          </T>
          {/* The short path: Nadani's seeded Mind joins, both Minds are compared, and the agents start. */}
          <Button
            kind="secondary"
            label="Let our agents exchange"
            accessibilityLabel="Let our agents exchange, with Nadani"
            loading={busy === "quick"}
            onPress={onQuickExchange}
            style={[styles.cta, { marginTop: space.l }]}
          />
          <T variant="meta" style={{ marginTop: space.s, color: color.ink3, textAlign: "center" }}>
            Brings in Nadani&apos;s Mind on this phone, compares, and starts your agents.
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
          <T variant="support">No second phone? Nadani&apos;s Mind is seeded for the demo, and this phone can speak for Nadani.</T>
          <Pill label="Bring in Nadani" busy={busy === "invite"} onPress={onDemoGuest} />
        </RaisedCard>
      )}

      <SectionHeader title="How it works" />
      <ListCard>
        <StepRow icon="person" title="Invite someone" body="A collaborator on their phone, or Nadani on this one." />
        <StepRow icon="people" title="Thinketh compares your Minds" body="Shared strengths, teaching opportunities, shared gaps." />
        <StepRow icon="ask" title="Your agents teach each other" body="One agent explains; the other questions it and keeps a sourced takeaway." />
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
function Overview({ room, me, busy, onExchange }: { room: PlaygroundRoom; me: string; busy: boolean; onExchange: () => void }) {
  const d = room.delta!;
  const aName = nameOf(room, d.aId);
  const bName = nameOf(room, d.bId);
  const items: { tag: string; tone: DotTone; item: CollaborativeDeltaItem }[] = [
    ...d.bTeachesA.slice(0, 1).map((item) => ({ tag: `${upper(d.bId === me ? "You" : bName)} → ${upper(d.aId === me ? "You" : aName)}`, tone: (d.bId === me ? "coral" : "partner") as DotTone, item })),
    ...d.aTeachesB.slice(0, 1).map((item) => ({ tag: `${upper(d.aId === me ? "You" : aName)} → ${upper(d.bId === me ? "You" : bName)}`, tone: (d.aId === me ? "coral" : "partner") as DotTone, item })),
    ...d.sharedGaps.slice(0, 1).map((item) => ({ tag: "SHARED GAP", tone: "muted" as const, item })),
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
        {/* The one next step after the delta: the agents exchange on the difference Thinketh found. */}
        <ExchangeOffer room={room} me={me} busy={busy} onStart={onExchange} />
      </View>
    </View>
  );
}

const agentOf = (room: PlaygroundRoom, id: string, me: string) => (id === me ? "Your agent" : `${nameOf(room, id)}'s agent`);
const lowerAgent = (s: string) => s.replace(/^Your/, "your");

/** "Let our agents exchange": one clear action, what will happen, and what it won't share or count. */
function ExchangeOffer({ room, me, busy, onStart }: { room: PlaygroundRoom; me: string; busy: boolean; onStart: () => void }) {
  const av = room.exchangeAvailability;
  if (!av) return null;
  const last = room.exchange && room.exchange.status !== "running" ? room.exchange : null;
  return (
    <View style={{ marginTop: space.l }}>
      <T variant="section">Let your agents exchange</T>
      {av.available ? (
        <>
          <T variant="support" style={{ marginTop: space.xs }}>
            {av.mode === "teach"
              ? `${agentOf(room, av.teacherId!, me)} teaches ${lowerAgent(agentOf(room, av.learnerId!, me))} ${topic(av.conceptId!, av.conceptName ?? "")}. They'll ask questions, check each other's sources, and bring back a sourced takeaway.`
              : `Neither of you has strong evidence on ${topic(av.conceptId!, av.conceptName ?? "")}, so your agents explore what the sources say together and bring back a sourced takeaway.`}
          </T>
          <T variant="meta" style={{ marginTop: space.xs, color: color.ink3 }}>
            They use only what&apos;s already shared here: your knowledge snapshots and Thinketh&apos;s sources. Nothing private. It doesn&apos;t count as anyone understanding it.
          </T>
          <Pill label="Let our agents exchange" busy={busy} onPress={onStart} />
        </>
      ) : av.reason ? (
        <T variant="meta" style={{ marginTop: space.xs, color: color.ink3 }}>
          {av.reason}
        </T>
      ) : null}
      {last?.outcome ? (
        <T variant="meta" style={{ marginTop: space.s, color: color.ink3 }}>
          Last exchange: {last.outcome}
        </T>
      ) : null}
    </View>
  );
}

const MESSAGE_VERB: Record<string, string> = {
  explanation: "explained",
  answer: "answered",
  revision: "revised",
  clarification: "asked",
  evidence_request: "asked for evidence",
  application: "proposed an application",
  takeaway: "proposed a takeaway",
};

const STATUS_TITLE: Record<string, string> = {
  running: "Your agents are exchanging",
  completed: "A sourced takeaway, retained",
  insufficient: "Not enough support to keep anything",
  stopped: "Stopped",
  failed: "The exchange couldn't finish",
  interrupted: "Interrupted",
};

/**
 * The exchange itself: what's actually in flight, the agents' concise messages with their sources, the
 * full transcript on request, and the result. Stop is always there while it runs.
 */
function ExchangeScene({
  room,
  me,
  busy,
  onStop,
  onClose,
  onChallenge,
  onStopChallenge,
}: {
  room: PlaygroundRoom;
  me: string;
  busy: Busy;
  onStop: () => void;
  onClose: () => void;
  onChallenge: () => void;
  onStopChallenge: () => void;
}) {
  const ex = room.exchange!;
  const [full, setFull] = useState(false);
  const running = ex.status === "running";
  const shown = full ? ex.messages : ex.messages.slice(-3);
  const sourceOf = (ref: string) => ex.sources.find((s) => s.ref === ref);
  const ownsTakeaway = ex.learnerId === me;
  return (
    <View style={{ paddingHorizontal: gutter, marginTop: space.m }}>
      <DotTag tone={running ? "coral" : "muted"} label={ex.mode === "explore" ? "SHARED EXPLORATION" : "AGENT EXCHANGE"} />
      <T variant="title" style={{ marginTop: space.s }}>
        {STATUS_TITLE[ex.status]}
      </T>
      <T variant="support" style={{ marginTop: space.xs }}>
        {agentOf(room, ex.teacherId, me)} → {lowerAgent(agentOf(room, ex.learnerId, me))} · {topic(ex.conceptId, ex.conceptName)}
      </T>
      <T variant="meta" style={{ marginTop: 2, color: color.ink3 }}>
        {ex.reason}
      </T>

      {running ? (
        <View style={styles.exPending} accessibilityLiveRegion="polite">
          {ex.pending ? <ActivityIndicator size="small" color={color.ink3} /> : null}
          <T variant="meta" style={{ flex: 1, color: color.ink2 }}>
            {ex.pending ? `${ex.pending.label}…` : "Waiting for the next step"}
          </T>
        </View>
      ) : ex.outcome ? (
        <T variant="support" style={{ marginTop: space.m }}>
          {ex.outcome}
        </T>
      ) : null}

      {shown.length ? (
        <View style={{ marginTop: space.m, gap: space.s }}>
          {!full && ex.messages.length > shown.length ? (
            <T variant="meta" style={{ color: color.ink3 }}>
              {ex.messages.length - shown.length} earlier {ex.messages.length - shown.length === 1 ? "message" : "messages"}
            </T>
          ) : null}
          {shown.map((m) => (
            <ThreadCard key={m.id} who={`${agentOf(room, m.from, me)} ${MESSAGE_VERB[m.kind]}`} tone={room.hostId === m.from ? "coral" : "partner"}>
              <T variant="body" style={{ fontSize: 15, lineHeight: 22 }} numberOfLines={full ? undefined : 5}>
                {m.text}
              </T>
              {m.sourceRefs.length ? (
                <View style={styles.exRefs}>
                  {m.sourceRefs.map((r) => {
                    const src = sourceOf(r);
                    return (
                      <Pressable
                        key={r}
                        onPress={src?.url ? () => Linking.openURL(src.url!).catch(() => {}) : undefined}
                        disabled={!src?.url}
                        accessibilityRole={src?.url ? "link" : undefined}
                        accessibilityLabel={src ? `Source ${r}: ${src.title}` : `Source ${r}`}
                        style={styles.exRef}
                      >
                        <T variant="meta" style={{ color: color.ink2 }} numberOfLines={1}>
                          {r} · {src ? [src.publisher, src.title].filter(Boolean).join(" · ") : "source"}
                        </T>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </ThreadCard>
          ))}
        </View>
      ) : null}

      {ex.messages.length || ex.actions.length ? (
        <Pressable onPress={() => setFull((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: full }} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
          <T variant="meta" style={{ color: color.ink }}>
            {full ? "Hide the full exchange" : "Show the full exchange, its sources and actions"}
          </T>
        </Pressable>
      ) : null}
      {full ? <ExchangeDetails room={room} me={me} /> : null}

      {ex.savedTakeawayId && ex.takeaway ? (
        <RaisedCard style={{ marginTop: space.m }}>
          <T variant="label">Takeaway · retained by {lowerAgent(agentOf(room, ex.learnerId, me))}</T>
          <T variant="body" style={{ marginTop: space.xs, fontSize: 15, lineHeight: 22 }}>
            {ex.check?.verdict === "partial" ? ex.check.supported.join(" ") : ex.takeaway.text}
          </T>
          <T variant="meta" style={{ marginTop: space.s, color: color.ink3 }}>
            {ex.check?.verdict === "partial" ? "Partly supported by its sources; the rest is marked unresolved." : "Supported by the passages it cites."} Checked by {ex.check?.checkedBy === "claude" ? "Claude" : "Thinketh's deterministic check"}.
          </T>
          <T variant="meta" style={{ marginTop: space.xs, color: color.ink3 }}>
            This is agent material. It doesn&apos;t mean anyone has shown they understand it.
          </T>
        </RaisedCard>
      ) : null}
      {/* Grokbot (optional): challenge the saved takeaway; present only when the server has a challenger. */}
      {ex.savedTakeawayId && !running ? <ChallengePanel room={room} me={me} busy={busy === "challenge"} onStart={onChallenge} onStop={onStopChallenge} /> : null}

      {running ? (
        <Button kind="secondary" label="Stop the exchange" loading={busy === "exchange"} onPress={onStop} style={{ alignSelf: "flex-start", marginTop: space.l }} />
      ) : (
        <View style={{ marginTop: space.l, gap: space.s, alignItems: "flex-start" }}>
          {ex.savedTakeawayId && ownsTakeaway ? (
            <Button kind="secondary" label="Open it in your Mind" onPress={() => router.push({ pathname: "/takeaway/[id]", params: { id: ex.savedTakeawayId! } })} />
          ) : ex.savedTakeawayId ? (
            <T variant="meta" style={{ color: color.ink3 }}>
              Saved to {nameOf(room, ex.learnerId)}&apos;s agent library.
            </T>
          ) : null}
          {room.challenge?.status !== "running" ? <Button kind="quiet" label="Back to the room" loading={busy === "exchange"} onPress={onClose} /> : null}
        </View>
      )}
    </View>
  );
}

/** Everything behind the exchange: each action (who did it, and which provider), and every source read. */
function ExchangeDetails({ room, me }: { room: PlaygroundRoom; me: string }) {
  const ex = room.exchange!;
  const BY: Record<string, string> = { muse: "Muse", planner: "Planner", thinketh: "Thinketh", claude: "Claude", deterministic: "Deterministic check" };
  const actor = (a: string) => (a === "coordinator" ? "Coordinator" : a === "thinketh" ? "Thinketh" : agentOf(room, a, me));
  return (
    <View style={{ gap: space.m }}>
      <View style={{ gap: space.xs }}>
        <T variant="label">Actions</T>
        {ex.actions.map((a) => (
          <T key={a.id} variant="meta" style={{ color: color.ink2 }}>
            {actor(a.actor)} ({BY[a.by]}): {a.summary}
          </T>
        ))}
      </View>
      {ex.sources.length ? (
        <View style={{ gap: space.xs }}>
          <T variant="label">Sources read</T>
          {ex.sources.map((s) => (
            <Pressable key={s.ref} onPress={s.url ? () => Linking.openURL(s.url!).catch(() => {}) : undefined} disabled={!s.url} accessibilityRole={s.url ? "link" : undefined}>
              <T variant="meta" style={{ color: color.ink2 }}>
                {s.ref} · {[s.publisher, s.title].filter(Boolean).join(" · ")} · {s.kind === "claim" ? "an extracted claim" : s.kind === "summary" ? "a saved summary" : "an earlier agent takeaway"}
              </T>
              <T variant="meta" style={{ color: color.ink3 }}>
                “{s.text}”
              </T>
            </Pressable>
          ))}
        </View>
      ) : null}
      <T variant="meta" style={{ color: color.ink3 }}>
        {ex.used.messages} messages · {ex.used.toolCalls} tool calls · {ex.used.modelCalls} model calls
      </T>
    </View>
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

function Ended() {
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <T variant="display" style={{ marginTop: space.l }}>
        Session complete.
      </T>
      <T variant="support" style={{ marginTop: space.s, fontSize: 15, lineHeight: 22 }}>
        Any takeaway your agents saved stays in their library. Nothing here changed anyone&apos;s Mind.
      </T>
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

/** Honest provenance: how the room syncs, and its code. */
function Provenance({ room, live }: { room: PlaygroundRoom; live: boolean }) {
  return (
    <T variant="meta" style={{ marginHorizontal: gutter, marginTop: space.xl, color: color.ink3, fontSize: 11 }}>
      Sync: {live ? "Supabase Realtime + polling" : "polling"} · Room {room.code}
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
  exPending: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.m, minHeight: 32 },
  exRefs: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space.s },
  exRef: { maxWidth: "100%", paddingHorizontal: 8, minHeight: 26, justifyContent: "center", borderRadius: 8, backgroundColor: color.surfaceMuted },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: gutter, paddingBottom: space.s, backgroundColor: color.canvas },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 44 },
  headerTitle: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink },
  cta: { alignSelf: "stretch", minHeight: 52 },
  codeInput: { alignSelf: "stretch", textAlign: "center", fontFamily: font.sansSemibold, fontSize: 26, lineHeight: 34, letterSpacing: 6, color: color.ink, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline, paddingVertical: space.s, marginTop: space.s },
  pill: { alignSelf: "flex-start", marginTop: space.l, borderRadius: radius.pill, paddingHorizontal: space.xl, minHeight: 46 },
  why: { marginTop: space.s, padding: space.m, backgroundColor: color.surfaceMuted, borderRadius: radius.control, gap: 2 },
});

/** Whether the software keyboard is up (so the room can make space for the input). */
function useKeyboardVisible() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setShown(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}
