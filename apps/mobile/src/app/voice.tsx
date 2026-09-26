import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
import { Mark } from "@/components/Logo";
import { T } from "@/components/Text";
import { Button, ErrorState, Gutter, LoadingState, ModalHeader, Screen } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { color, space } from "@/theme/tokens";
import { loadLiveCatchUp } from "@/voice/availability";

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
    return { session, heroId: today.brief.heroDevelopmentId };
  }, []);
  const session = data?.session;
  const voiceReady = !!LiveCatchUp && session?.mode === "elevenlabs";
  const [phase, setPhase] = useState<Phase>("ready");
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const showTranscript = (message: string | null) => {
    setNotice(message);
    setPhase("transcript");
  };

  let body: ReactNode;
  if (loading && !session) {
    body = <LoadingState message="Preparing your catch-up…" />;
  } else if (error || !session) {
    body = <ErrorState onRetry={reload} />;
  } else if (!voiceReady || phase === "transcript") {
    body = (
      <Transcript
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
        <T variant="title">{session.fallbackTranscript[0]}</T>
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
          <Button kind="quiet" label="Read it as text instead" style={{ alignSelf: "center" }} onPress={() => showTranscript(null)} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <ModalHeader title="Catch me up" onClose={() => router.back()} topInset />
      {!session || error ? (
        body
      ) : (
        <Screen topInset={false}>
          <Gutter>
            <View style={{ alignItems: "flex-start", marginBottom: space.xl }}>
              <Mark size={28} />
            </View>
            {body}
          </Gutter>
        </Screen>
      )}
    </View>
  );
}

function Transcript({ lines, heroId, notice }: { lines: string[]; heroId: string; notice: string | null }) {
  const [shown, setShown] = useState(1);
  return (
    <>
      {notice ? (
        <T variant="meta" style={{ marginBottom: space.xl }}>
          {notice}
        </T>
      ) : null}
      {lines.slice(0, shown).map((line, i) => (
        <T key={line} variant={i === 0 ? "title" : "body"} style={[i > 0 && styles.line, i === shown - 1 && i > 0 && { color: color.ink }]}>
          {line}
        </T>
      ))}
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
  line: { marginTop: space.l, color: color.ink2, fontSize: 18, lineHeight: 28 },
  actions: { marginTop: space.xxl, gap: space.m },
});
