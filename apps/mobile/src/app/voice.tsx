import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
import { Mark } from "@/components/Logo";
import { T } from "@/components/Text";
import { Button, ErrorState, Gutter, LoadingState, ModalHeader, Screen } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { color, space } from "@/theme/tokens";

// Catch Me Up. Real-time voice (ElevenLabs) needs a dev build and a server-minted
// token; while POST /voice/session returns mode "transcript_fallback", this is the text fallback.
export default function VoiceScreen() {
  const { data, error, loading, reload } = useApi(async () => {
    const today = await api.getTodayBrief();
    const session = await api.createVoiceSession();
    return { session, heroId: today.brief.heroDevelopmentId };
  }, []);
  const session = data?.session;
  const [shown, setShown] = useState(1);

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <ModalHeader title="Catch me up" onClose={() => router.back()} topInset />
      {loading && !session ? (
        <LoadingState message="Preparing your catch-up…" />
      ) : error || !session ? (
        <ErrorState onRetry={reload} />
      ) : (
        <Screen topInset={false}>
          <Gutter>
            <View style={{ alignItems: "flex-start", marginBottom: space.xl }}>
              <Mark size={28} />
            </View>
            {session.mode === "transcript_fallback" ? (
              <T variant="meta" style={{ marginBottom: space.xl }}>
                Voice isn&apos;t connected yet, so here is your catch-up as text.
              </T>
            ) : null}
            {session.fallbackTranscript.slice(0, shown).map((line, i) => (
              <T
                key={line}
                variant={i === 0 ? "title" : "body"}
                style={[i > 0 && styles.line, i === shown - 1 && i > 0 && { color: color.ink }]}
              >
                {line}
              </T>
            ))}
            <View style={{ marginTop: space.xxl, gap: space.m }}>
              {shown < session.fallbackTranscript.length ? (
                <Button label="Continue" icon="arrow" onPress={() => setShown((n) => n + 1)} />
              ) : (
                <>
                  <Button
                    kind="decisive"
                    label="Check my understanding"
                    icon="arrow"
                    onPress={() => router.replace({ pathname: "/diagnostic", params: { developmentId: data!.heroId } })}
                  />
                  <Button kind="quiet" label="Back to today" style={{ alignSelf: "center" }} onPress={() => router.back()} />
                </>
              )}
            </View>
          </Gutter>
        </Screen>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { marginTop: space.l, color: color.ink2, fontSize: 18, lineHeight: 28 },
});
