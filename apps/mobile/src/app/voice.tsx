import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { closeTo, goBack } from "@/lib/nav";
import { api } from "@/api";
import { isActive, useAgentControls, useAgentState } from "@/agent/agentContext";
import { useAgentScreen } from "@/agent/screenContext";
import { Mark } from "@/components/Logo";
import { IconButton } from "@/components/system";
import { T } from "@/components/Text";
import { Button, ErrorState, Gutter, LoadingState, Screen } from "@/components/ui";
import { useApi, useReducedMotion } from "@/lib/hooks";
import { SHORT } from "@/mindprint/model";
import { color, font, gutter, space } from "@/theme/tokens";
import { CatchUpScene, Pulse } from "@/voice/CatchUpScene";
import { nextFocus } from "@/voice/conceptFocus";
import { LiveBriefingCanvas } from "@/voice/LiveBriefingCanvas";

// Catch Me Up: one activity of the personal agent. With a development build and ElevenLabs
// configured on the server, it runs on the app's one shared conversation (started here, or
// switched to from a conversation already running); otherwise, and whenever voice fails, it is
// the text transcript. The transcript never depends on voice. Leaving this screen minimizes the
// conversation; only "End" disconnects.
type Phase = "ready" | "ended" | "transcript";

export default function VoiceScreen() {
  const agent = useAgentState();
  const controls = useAgentControls();
  const { data, error, loading, reload } = useApi(async () => {
    const today = await api.getTodayBrief();
    // Fetched once through the agent, which reuses it for the call: no second token.
    const session = await controls.prepareCatchUp();
    const hero = today.developments.find((d) => d.id === today.brief.heroDevelopmentId);
    return { session, heroId: today.brief.heroDevelopmentId, hero };
  }, []);
  // Your Mind, for the reading scene and linked concepts. Optional: voice never waits on it.
  const knowledge = useApi(() => api.getKnowledge(), []);
  const concepts = useMemo(
    () => (knowledge.data?.items ?? []).map((i) => ({ id: i.concept.id, name: i.concept.name, short: SHORT[i.concept.id] })),
    [knowledge.data],
  );
  const seedConcept = data?.hero?.conceptIds.find((id) => concepts.some((c) => c.id === id));
  const session = data?.session;
  const voiceReady = controls.supported && session?.mode === "elevenlabs";
  const live = isActive(agent.status) && agent.activity === "catch_up";
  const [phase, setPhase] = useState<Phase>("ready");
  const [notice, setNotice] = useState<string | null>(null);

  useAgentScreen({ screen: "catch_up", route: "/voice", title: "Catch Me Up", ...(data?.hero ? { visible: [`Lead story: ${data.hero.title}`] } : {}) }, "none");

  // The catch-up running here has ended: say how, and offer the next step.
  // (Adjusted during render when the call's state changes, per React's guidance; no effect.)
  const [wasLive, setWasLive] = useState(false);
  if (live && !wasLive) setWasLive(true);
  if (wasLive && !isActive(agent.status)) {
    setWasLive(false);
    if (agent.notice) {
      setNotice(agent.notice);
      setPhase("transcript");
    } else setPhase("ended");
  }

  const showTranscript = (message: string | null) => {
    setNotice(message);
    setPhase("transcript");
  };
  const start = () => {
    setPhase("ready");
    controls.start("catch_up");
  };
  // The conversation keeps going while the Mind opens: this screen closes, the dock takes over.
  const openInMind = (conceptId: string) => closeTo({ pathname: "/mind", params: { concept: conceptId, from: "voice" } });
  const scene = () => <CatchUpScene knowledge={knowledge.data ?? null} conceptId={seedConcept ?? null} fallbackTitle={data?.hero?.title} live={false} onOpenInMind={openInMind} />;

  let body: ReactNode;
  if (loading && !session) {
    body = <LoadingState message="Preparing your catch-up…" />;
  } else if (error || !session) {
    body = <ErrorState onRetry={reload} />;
  } else if (!voiceReady || phase === "transcript") {
    body = (
      <Transcript
        scene={scene()}
        lines={session.fallbackTranscript}
        heroId={data!.heroId}
        notice={
          notice ?? (session.mode === "transcript_fallback" || !voiceReady ? "Voice isn't connected here, so here is your catch-up as text." : null)
        }
      />
    );
  } else if (live) {
    body = (
      <LiveCatchUpView
        concepts={concepts}
        knowledge={knowledge.data ?? null}
        seed={{ conceptId: seedConcept, label: data?.hero?.title }}
        onEnd={() => controls.end()}
        onText={() => {
          controls.end();
          showTranscript(null);
        }}
        onOpenInMind={openInMind}
      />
    );
  } else if (phase === "ended") {
    body = (
      <View>
        <T variant="title">Catch-up ended.</T>
        <T variant="support" style={{ marginTop: space.m }}>
          Start again, or read the same catch-up as text.
        </T>
        <View style={styles.actions}>
          <Button label="Start again" icon="arrow" onPress={start} />
          <Button kind="secondary" label="Read it as text" onPress={() => showTranscript(null)} />
          <CheckUnderstanding heroId={data!.heroId} />
        </View>
      </View>
    );
  } else {
    const inCall = isActive(agent.status); // a general conversation is already running: same call, new activity
    body = (
      <View>
        {scene()}
        <T variant="title" style={{ marginTop: space.xl }}>
          {session.fallbackTranscript[0]}
        </T>
        <T variant="support" style={{ marginTop: space.m }}>
          {inCall
            ? "You're already talking with Thinketh. It will switch to your catch-up in the same conversation."
            : "A short spoken briefing on what changed for you. Interrupt it with questions any time."}
        </T>
        <View style={styles.actions}>
          <Button kind="decisive" label="Start Catch Me Up" icon="arrow" onPress={start} />
          <Button kind="quiet" label="Read as text instead" style={{ alignSelf: "center" }} onPress={() => showTranscript(null)} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <VoiceHeader live={isActive(agent.status)} />
      {!session || error ? (
        body
      ) : (
        <Screen topInset={false}>
          <Gutter style={{ paddingTop: space.m }}>{body}</Gutter>
        </Screen>
      )}
    </View>
  );
}

/** The live Catch Me Up, drawn from the shared conversation. Presentation only. */
function LiveCatchUpView({
  concepts,
  knowledge,
  seed,
  onEnd,
  onText,
  onOpenInMind,
}: {
  concepts: { id: string; name: string; short?: string }[];
  knowledge: import("@thinketh/contracts").KnowledgeResponse | null;
  seed: { conceptId?: string; label?: string };
  onEnd: () => void;
  onText: () => void;
  onOpenInMind: (conceptId: string) => void;
}) {
  const agent = useAgentState();
  const controls = useAgentControls();
  const reduced = useReducedMotion();
  const [focusId, setFocusId] = useState<string | null>(seed.conceptId ?? null);
  const spoken = `${agent.caption.previous} ${agent.caption.current}`.trim();
  // Attention follows the words: a newly named concept moves the view; otherwise it stays put.
  const [seenSpoken, setSeenSpoken] = useState(spoken);
  if (spoken !== seenSpoken) {
    setSeenSpoken(spoken);
    const next = nextFocus(focusId, spoken, concepts);
    if (next !== focusId) setFocusId(next);
  }

  if (agent.status === "connecting" || !agent.level) {
    return (
      <View style={{ paddingTop: space.s }}>
        <View style={styles.stateRow} accessibilityLiveRegion="polite">
          <Pulse reduceMotion={reduced} />
          <T variant="meta" style={{ color: color.ink2 }}>
            Connecting
          </T>
        </View>
        <T variant="title" style={{ marginTop: space.l }}>
          Starting your personalized Catch Me Up…
        </T>
        <Button kind="quiet" label="Read it as text instead" style={{ alignSelf: "center" }} onPress={onText} />
      </View>
    );
  }
  const phase = agent.phase === "speaking" ? "speaking" : agent.phase === "user" ? "user" : "listening";
  return (
    <LiveBriefingCanvas
      phase={phase}
      topic={seed.label ?? null}
      focusId={focusId}
      knowledge={knowledge}
      caption={agent.caption}
      announce={agent.announce}
      aligned={agent.aligned}
      lastUser={agent.lastUser}
      ending={agent.ending}
      isMuted={agent.isMuted}
      level={agent.level}
      reduceMotion={reduced}
      onToggleMic={() => controls.setMuted(!agent.isMuted)}
      onEnd={onEnd}
      onText={onText}
      onOpenInMind={onOpenInMind}
    />
  );
}

/** One compact header: the mark, the session, and close (a live conversation keeps going, minimized). */
function VoiceHeader({ live }: { live: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <Mark size={22} decorative />
      <T style={styles.headerTitle} accessibilityRole="header">
        Catch me up
      </T>
      <IconButton icon="close" accessibilityLabel={live ? "Close Catch me up. The conversation keeps going." : "Close Catch me up"} onPress={() => goBack()} />
    </View>
  );
}

function Transcript({ scene, lines, heroId, notice }: { scene: ReactNode; lines: string[]; heroId: string; notice: string | null }) {
  const [shown, setShown] = useState(1);
  return (
    <>
      {scene}
      <View style={styles.transcript}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T variant="label" style={{ color: color.ink3 }}>
            Thinketh
          </T>
          {/* Progress through this text, not through learning. */}
          <T variant="meta" style={{ color: color.ink3, fontVariant: ["tabular-nums"] }}>
            Part {shown} of {lines.length}
          </T>
        </View>
        {notice ? (
          <T variant="meta" style={{ marginTop: space.s, color: color.ink2 }}>
            {notice}
          </T>
        ) : null}
        {lines.slice(0, shown).map((line, i) => (
          // Earlier parts recede; the newest part reads strongest.
          <T key={line} style={i === shown - 1 ? styles.current : styles.previous}>
            {line}
          </T>
        ))}
      </View>
      <View style={{ marginTop: space.xxl, gap: space.m }}>
        {shown < lines.length ? (
          <Button label="Continue" icon="arrow" onPress={() => setShown((n) => n + 1)} />
        ) : (
          <>
            <CheckUnderstanding heroId={heroId} />
            <Button kind="quiet" label="Back to today" style={{ alignSelf: "center" }} onPress={() => goBack()} />
          </>
        )}
      </View>
    </>
  );
}

function CheckUnderstanding({ heroId }: { heroId: string }) {
  return (
    <Button
      kind="decisive"
      label="Check my understanding"
      icon="arrow"
      onPress={() => router.replace({ pathname: "/diagnostic", params: { developmentId: heroId } })}
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: gutter, paddingBottom: space.s },
  headerTitle: { flex: 1, fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 22, color: color.ink },
  transcript: { marginTop: space.xl, paddingTop: space.l, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
  previous: { marginTop: space.m, fontFamily: font.sans, fontSize: 15, lineHeight: 22, color: color.ink3 },
  current: { marginTop: space.m, fontFamily: font.sansMedium, fontSize: 21, lineHeight: 29, letterSpacing: -0.3, color: color.ink },
  actions: { marginTop: space.xxl, gap: space.m },
  stateRow: { flexDirection: "row", alignItems: "center", gap: space.s },
});
