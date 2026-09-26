import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api";
import { Mark } from "@/components/Logo";
import { IconButton } from "@/components/system";
import { T } from "@/components/Text";
import { Button, ErrorState, Gutter, LoadingState, Screen } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { SHORT } from "@/mindprint/model";
import { color, font, gutter, space } from "@/theme/tokens";
import { loadLiveCatchUp } from "@/voice/availability";
import { CatchUpScene } from "@/voice/CatchUpScene";

// Catch Me Up. With a development build and ElevenLabs configured on the server,
// this is a live voice conversation; otherwise, and whenever voice fails, it is
// the text transcript. The transcript never depends on voice.
type Phase = "ready" | "live" | "ended" | "transcript";

/** Null on web, in Expo Go, or if the native voice module is missing. */
const LiveCatchUp = loadLiveCatchUp();

export default function VoiceScreen() {
  const { data, error, loading, reload } = useApi(async () => {
    const today = await api.getTodayBrief();
    const session = await api.createVoiceSession();
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
  const voiceReady = !!LiveCatchUp && session?.mode === "elevenlabs";
  const [phase, setPhase] = useState<Phase>("ready");
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const showTranscript = (message: string | null) => {
    setNotice(message);
    setPhase("transcript");
  };
  // Leaving for the Mind replaces this screen, which ends any live call (the session cleans up on unmount).
  const openInMind = (conceptId: string) => router.replace({ pathname: "/mind", params: { concept: conceptId, from: "voice" } });
  const scene = (live = false) => <CatchUpScene knowledge={knowledge.data ?? null} conceptId={seedConcept ?? null} fallbackTitle={data?.hero?.title} live={live} onOpenInMind={openInMind} />;

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
  } else if (phase === "live" && LiveCatchUp) {
    body = (
      <LiveCatchUp
        key={attempt}
        onFallback={() => showTranscript("Voice couldn't connect, so here is your catch-up as text.")}
        onEnded={() => setPhase("ended")}
        onShowTranscript={() => showTranscript(null)}
        onOpenInMind={openInMind}
        knowledge={knowledge.data ?? null}
        concepts={concepts}
        seed={{ conceptId: seedConcept, label: data?.hero?.title }}
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
          <Button
            label="Start again"
            icon="arrow"
            onPress={() => {
              setAttempt((n) => n + 1);
              setPhase("live");
            }}
          />
          <Button kind="secondary" label="Read it as text" onPress={() => showTranscript(null)} />
          <CheckUnderstanding heroId={data!.heroId} />
        </View>
      </View>
    );
  } else {
    body = (
      <View>
        {scene()}
        <T variant="title" style={{ marginTop: space.xl }}>
          {session.fallbackTranscript[0]}
        </T>
        <T variant="support" style={{ marginTop: space.m }}>
          A short spoken briefing on what changed for you. Interrupt it with questions any time.
        </T>
        <View style={styles.actions}>
          <Button
            kind="decisive"
            label="Start Catch Me Up"
            icon="arrow"
            onPress={() => {
              setAttempt((n) => n + 1);
              setPhase("live");
            }}
          />
          <Button kind="quiet" label="Read as text instead" style={{ alignSelf: "center" }} onPress={() => showTranscript(null)} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <VoiceHeader />
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

/** One compact header: the mark, the session, and close (closing ends any live call). */
function VoiceHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <Mark size={22} decorative />
      <T style={styles.headerTitle} accessibilityRole="header">
        Catch me up
      </T>
      <IconButton icon="close" accessibilityLabel="Close Catch me up" onPress={() => router.back()} />
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
            <Button kind="quiet" label="Back to today" style={{ alignSelf: "center" }} onPress={() => router.back()} />
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
});
