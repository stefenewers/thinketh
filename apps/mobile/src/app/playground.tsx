import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { CollaborativeDeltaItem, PlaygroundRoom } from "@thinketh/contracts";
import { DEMO_USER_ID } from "@/api";
import { playground, PLAYGROUND_AVAILABLE, PlaygroundError } from "@/api/playground";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { StageSteps } from "@/components/StageSteps";
import { MindVenn } from "@/components/playground/MindVenn";
import { deltaClaim } from "@/lib/resourceDelta";
import { formatMinutes, planSummary } from "@/lib/planSummary";
import { DEMO_LEARNER_NAME } from "@/content/demo";
import { CardTitle, Dot, DotTag, MuseCard, OutcomeRow, StepRow, ThreadCard, TwoMinds, type DotTone } from "@/components/playground/pieces";
import { ListCard, RaisedCard, SectionHeader } from "@/components/system";
import { Button, Divider } from "@/components/ui";
import { useReducedMotion } from "@/lib/hooks";
import { useRoomChannel } from "@/lib/roomChannel";
import { fmt2 } from "@/lib/knowledge";
import { DuoMind } from "@/mindprint/DuoMind";
import { MindCanvas } from "@/mindprint/MindCanvas";
import { color, font, gutter, radius, shadow, space } from "@/theme/tokens";

/** The device owner's name in the room (the demo persona's human). */
const HOST_NAME = DEMO_LEARNER_NAME;
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
  // Technical provenance (conductor, sync, room code): hidden unless someone long-presses the title.
  const [showDiag, setShowDiag] = useState(false);
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

  const customSource = (url: string) => room && run("resource", () => playground.resource(room.id, url, me));
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.canvas }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={{ minHeight: 44, justifyContent: "center" }}>
            <Icon name="back" size={19} color={color.ink} />
          </Pressable>
          {following && scene !== "comparing" ? (
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
            {scene === "comparing" ? "Following Muse" : headerRight}
          </T>
        )}
      </View>
      {room ? <PresenceLine room={room} me={me} present={present} /> : null}

      {!PLAYGROUND_AVAILABLE ? (
        <Offline />
      ) : (
        <FollowContext.Provider value={followMuse || !following}>
        <ScrollView contentContainerStyle={{ paddingBottom: space.x4 + insets.bottom }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
          {room && showDiag ? <Provenance room={room} live={live} /> : null}
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

function Duo({ room, me, focus, trace, muse, changed, compact }: { room: PlaygroundRoom; me: string; focus?: string | null; trace?: Parameters<typeof DuoMind>[0]["trace"]; muse?: boolean; changed?: Record<string, string[]>; compact?: boolean }) {
  const { width } = useWindowDimensions();
  const { left, right } = useSides(room);
  const d = room.delta;
  const keyConcepts = useMemo(() => (d ? [...d.bTeachesA.slice(0, 1), ...d.aTeachesB.slice(0, 1), ...d.sharedGaps.slice(0, 1)].map((i) => i.conceptId) : undefined), [d]);
  const followingMuse = useContext(FollowContext);
  if (!left || !right) return <ArrivalDuo room={room} />;
  const w = width - 32;
  // Following Muse (storyboard 09-11): two overlapping Minds, composed around the concept in play.
  if (followingMuse) {
    return (
      <View style={{ alignItems: "center", marginTop: space.m }}>
        <MindVenn
          left={left}
          right={right}
          me={me}
          width={w}
          height={compact ? 190 : 240}
          focusConceptId={focus ?? null}
          trace={trace ? { conceptId: trace.conceptId, fromUserId: trace.from === "left" ? left.userId : right.userId, mode: trace.mode } : null}
          muse={muse}
        />
      </View>
    );
  }
  // Exploring: the full two-Mind canvas, nothing dimmed, pan and pinch freely.
  return (
    <View style={{ alignItems: "center", marginTop: space.m }}>
      <MindCanvas width={w} height={256} hits={[]}>
        <DuoMind left={left} right={right} edges={left.edges} width={w} height={256} focusConceptId={null} trace={trace ?? null} muse={muse} changed={changed} keyConcepts={keyConcepts} />
      </MindCanvas>
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
        <StepRow icon="people" title="Muse compares your Minds" body="Shared strengths, teaching opportunities, shared gaps." />
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
      <DotTag tone="coral" label={guest?.userId === me ? `You joined ${nameOf(room, room.hostId)}` : `${guest?.displayName ?? "Someone"} joined`} style={{ marginHorizontal: gutter, marginTop: space.m }} />
      <Duo room={room} me={me} />
      <View style={{ paddingHorizontal: gutter, marginTop: space.xl }}>
        <T variant="title">Two minds. One learning space.</T>
        <T variant="support" style={{ marginTop: space.s, fontSize: 15, lineHeight: 22 }}>
          Thinketh is finding what can move between you.
        </T>
        <Pill label="Compare our Minds" busy={busy} onPress={onCompare} />
      </View>
    </View>
  );
}

/** Storyboard 09 (Figma 1:142): Muse compares while the delta is computed. */
function Comparing({ room, me }: { room: PlaygroundRoom; me: string }) {
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
      {room.snapshots.length === 2 ? <Duo room={room} me={me} muse /> : <ArrivalDuo room={room} />}
      <View style={{ paddingHorizontal: gutter }}>
        <T variant="title" style={{ marginTop: space.xl, textAlign: "center" }}>
          Comparing your thinking
        </T>
        <T variant="support" style={{ marginTop: space.xs, textAlign: "center" }}>
          Muse is comparing both Minds
        </T>
        <RaisedCard style={{ marginTop: space.xl, gap: space.m }}>
          {rows.map((r, i) => (
            <View key={r} style={{ flexDirection: "row", alignItems: "center", gap: space.m, opacity: shown > i ? 1 : 0.45 }}>
              <View style={[styles.check, shown > i && { backgroundColor: color.ink, borderColor: color.ink }]}>{shown > i ? <Icon name="check" size={12} color={color.onInk} /> : null}</View>
              <T variant="body" style={{ color: color.ink }}>
                {r}
              </T>
            </View>
          ))}
        </RaisedCard>
        <T variant="meta" style={{ marginTop: space.l, color: color.ink3, textAlign: "center" }}>
          Muse directs the room. Thinketh evaluates evidence.
        </T>
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
    ...d.bTeachesA.slice(0, 1).map((item) => ({ tag: `${upper(bName)} → ${upper(aName)}`, tone: (d.bId === me ? "coral" : "partner") as DotTone, item })),
    ...d.aTeachesB.slice(0, 1).map((item) => ({ tag: `${upper(aName)} → ${upper(bName)}`, tone: (d.aId === me ? "coral" : "partner") as DotTone, item })),
    ...d.sharedGaps.slice(0, 1).map((item) => ({ tag: "MUSE → BOTH", tone: "muted" as const, item })),
  ];
  const words = ["No", "One", "Two", "Three"][items.length] ?? String(items.length);
  return (
    <View>
      {room.snapshots.length === 2 ? <Duo room={room} me={me} /> : null}
      <View style={{ paddingHorizontal: gutter }}>
        <T variant="display" style={{ marginTop: space.l }}>
          {items.length ? "You can teach each other." : "You're closely matched."}
        </T>
        <T variant="support" style={{ marginTop: space.s, fontSize: 15, lineHeight: 22 }}>
          {words} useful difference{items.length === 1 ? "" : "s"} in your current evidence.
        </T>
        {items.length ? (
          <RaisedCard style={{ marginTop: space.xl, paddingBottom: space.xs }}>
            <CardTitle>Emerging differences</CardTitle>
            {items.map((x, i) => (
              <DeltaRow key={x.item.conceptId + x.item.kind} tag={x.tag} tone={x.tone} item={x.item} names={{ [d.aId]: aName, [d.bId]: bName }} last={i === items.length - 1} />
            ))}
          </RaisedCard>
        ) : null}
        {d.conflicts.length ? (
          <T variant="meta" style={{ marginTop: space.l }}>
            Not assigned yet: {d.conflicts.map((c) => c.conceptName).join(", ")}. The evidence can&apos;t tell who should teach.
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
                  <T style={styles.planTitle}>{i.conceptName ? sentence(i.conceptName) : "One source, two deltas"}</T>
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
            {sentence(item.conceptName)}
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
  const { left } = useSides(room);
  const from = left?.userId === t.teacherId ? "left" : "right";
  return (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <DotTag tone="coral" label={`${upper(teacher)} → ${upper(nameOf(room, t.learnerId))}`} style={{ marginTop: space.l }} />
        <T variant="display" style={styles.conceptTitle}>
          {sentence(t.conceptName)}
        </T>
      </View>
      <Duo room={room} me={me} compact focus={t.conceptId} trace={{ conceptId: t.conceptId, from, mode: "teaching" }} />
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
            anyone; the transfer question is. (Documented in docs/PLAYGROUND.md; not shown in the product.) */}
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
      <Duo room={room} me={me} compact focus={tr.conceptId} trace={t ? { conceptId: tr.conceptId, from: left?.userId === t.teacherId ? "left" : "right", mode: "teaching" } : null} />
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
  const { left } = useSides(room);
  useEffect(() => {
    if (verified) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [verified]);
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
        <T variant="editorial" style={{ marginTop: space.m }}>
          {verified ? "Knowledge moved." : "Not yet."}
        </T>
        <T variant="support" style={{ marginTop: space.s, fontSize: 15, lineHeight: 22 }}>
          {verified ? `${learner} applied what ${teacher} taught in a new context.` : `${learner}'s answer didn't show it yet. Thinketh recorded what it did show.`}
        </T>
      </View>
      <Duo
        room={room}
        me={me}
        focus={verified ? null : tr.conceptId}
        trace={verified && t ? { conceptId: tr.conceptId, from: left?.userId === t.teacherId ? "left" : "right", mode: "moved" } : null}
        changed={verified ? { [tr.learnerId]: [tr.conceptId] } : undefined}
      />
      <View style={{ paddingHorizontal: gutter, marginTop: space.l }}>
        <ListCard>
          {verified ? (
            <>
              <OutcomeRow icon="sparkle" title={`Strengthened ${tr.learnerId === me ? "your" : `${learner}'s`} thinking on ${sentence(t?.conceptName ?? "")}`} body="New connection verified" />
              {t?.explanation ? <OutcomeRow icon="people" title={`Added a new perspective from ${t.teacherId === me ? "you" : teacher}`} body={`“${t.explanation}”`} /> : null}
              {related.length ? <OutcomeRow icon="mind" title={`Connected to ${related.length} related concept${related.length === 1 ? "" : "s"}`} body={related.join(" · ")} last={!tn} /> : null}
            </>
          ) : (
            <View style={[styles.changeRow, tn ? styles.changeDivided : null]}>
              <DotTag tone="muted" label={upper(t?.conceptName ?? "")} />
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
                  {why ? "Why Thinketh changed its model" : `Mastery ${fmt2(tn.before.mastery)} → ${fmt2(tn.after.mastery)} · why?`}
                </T>
                <View style={{ transform: [{ rotate: why ? "90deg" : "0deg" }] }}>
                  <Icon name="chevron" size={14} color={color.ink3} />
                </View>
              </View>
              {why ? (
                <View style={styles.why}>
                  <T variant="support">{tn.reason}</T>
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
        {tr.learnerId === me ? (
          <Pill label={`See ${learner === HOST_NAME ? `${learner}'s` : "your"} Mind`} onPress={() => router.push({ pathname: "/mind", params: { concept: tr.conceptId } })} />
        ) : null}
        {nextItem?.type === "peer_teach" ? (
          <Button
            label={`Next: ${nameOf(room, nextItem.teacherId)} teaches ${nameOf(room, nextItem.learnerId)} ${sentence(nextItem.conceptName ?? "").toLowerCase()}`}
            kind="quiet"
            icon="arrow"
            loading={busy}
            onPress={onPlanNext}
            style={{ alignSelf: "flex-start", marginTop: space.s }}
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
        <DotTag tone="muted" label="Shared gap" style={{ marginTop: space.l }} />
        <T variant="display" style={styles.conceptTitle}>
          {sentence(g.conceptName)}
        </T>
      </View>
      <Duo room={room} me={me} focus={g.conceptId} muse />
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
            <Pill label="Bring in a shared source" busy={busy} onPress={onNext} />
            <SourceEntry busy={sourceBusy} onSubmit={onCustomSource} />
          </View>
        ) : (
          <Pill label="Teach us the delta" onPress={() => setOpen(true)} />
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
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <RaisedCard style={{ marginTop: space.m }}>
        <T variant="label">Shared source</T>
        <T variant="title" style={{ marginTop: space.s }}>
          {res.title}
        </T>
        <T variant="meta" style={{ marginTop: space.xs, color: color.ink3 }}>
          {[res.sourceLabel, res.readMinutes ? `~${Math.round(res.readMinutes)} min full` : undefined].filter(Boolean).join(" · ")}
        </T>
      </RaisedCard>
      <RaisedCard style={{ marginTop: space.m, flexDirection: "row", paddingHorizontal: 0 }}>
        {hostFirst.map((s, i) => (
          <View key={s.userId} style={[{ flex: 1, paddingHorizontal: space.l }, i > 0 && styles.colDivided]}>
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
                <T variant="metric" style={{ fontSize: 28, lineHeight: 34, marginTop: space.s }}>~{Math.max(1, Math.round(s.usefulMinutes ?? 0))} min</T>
                <T variant="support">useful for {s.userId === me ? "you" : nameOf(room, s.userId)}</T>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.m }}>
                  {s.newIdeas > 0 ? <Dot tone="coral" size={5} /> : null}
                  <T variant="body" style={{ fontFamily: font.sansSemibold }}>
                    {s.newIdeas} new idea{s.newIdeas === 1 ? "" : "s"}
                  </T>
                </View>
                {s.focus ? (
                  <View style={{ marginTop: space.s }}>
                    <T variant="label">Focus</T>
                    <View style={styles.focusChip}>
                      <Dot tone={s.userId === me ? "coral" : "partner"} size={5} />
                      <T style={styles.focusText} numberOfLines={2}>
                        {sentence(s.focus)}
                      </T>
                    </View>
                  </View>
                ) : s.newIdeas === 0 ? (
                  <T variant="meta" style={{ marginTop: space.s }}>
                    Nothing new here for {s.userId === me ? "you" : nameOf(room, s.userId)}
                  </T>
                ) : null}
              </>
            )}
          </View>
        ))}
      </RaisedCard>
      <T variant="editorial" style={{ marginTop: space.xl, fontSize: 26, lineHeight: 31 }}>
        {claim === "reading" ? "Same source." : claim === "different" ? "Same source. Different delta." : "Same source. A similar delta."}
      </T>
      {res.note ? (
        <MuseCard style={{ marginTop: space.l }}>{res.note}</MuseCard>
      ) : (
        <T variant="support" style={{ marginTop: space.m }}>
          Thinketh is reading it against each Mind…
        </T>
      )}
      <Pill label="Start together" onPress={() => mine && router.push({ pathname: "/resource/[id]", params: { id: mine.resourceId } })} busy={!ready} />
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
  colDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.hairline },
});
