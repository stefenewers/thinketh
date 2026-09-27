import { Linking, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { takeawaysApi } from "@/api/takeaways";
import { T } from "@/components/Text";
import { TopicArt } from "@/components/TopicArt";
import { Button, ErrorState, Gutter, LoadingState, ModalHeader, Screen } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { goBack } from "@/lib/nav";
import { color, radius, space } from "@/theme/tokens";

const KIND: Record<string, string> = { claim: "an extracted claim", summary: "a saved summary", takeaway: "an earlier agent takeaway" };
const VERB: Record<string, string> = { explanation: "explained", answer: "answered", revision: "revised", clarification: "asked", evidence_request: "asked for evidence", application: "proposed an application", takeaway: "proposed the takeaway" };

/**
 * A takeaway your agent retained from an agent exchange: what it says, what it rests on, what stayed
 * unresolved, and the exchange it came from. Agent material, not evidence of your understanding.
 */
export default function TakeawayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, error, loading, reload } = useApi(() => takeawaysApi.get(id!), [id]);
  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <ModalHeader title={t ? `From ${t.fromName}'s agent` : "Agent takeaway"} onClose={() => goBack()} topInset />
      <Screen topInset={false} background={color.ground}>
        {loading && !t ? (
          <LoadingState message="Opening the takeaway…" />
        ) : error || !t ? (
          <ErrorState onRetry={reload} />
        ) : (
          <Gutter>
            <TopicArt conceptIds={[t.conceptId]} unit={1.5} style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: color.surfaceMuted, marginTop: space.m }} />
            <T variant="label" style={{ marginTop: space.l }}>
              {t.conceptName} · retained by your agent
            </T>
            <T variant="title" style={{ marginTop: space.s }}>
              {t.text}
            </T>
            <T variant="meta" style={{ marginTop: space.m, color: color.ink3 }}>
              {t.grounding === "supported" ? "Supported by the passages it cites." : "Partly supported: only the supported part was kept."} Checked by {t.checkedBy === "claude" ? "Claude" : "Thinketh's deterministic check"} ·{" "}
              {new Date(t.createdAt).toLocaleDateString()}
            </T>
            {t.unresolved.length ? (
              <View style={{ marginTop: space.l }}>
                <T variant="label">Unresolved</T>
                {t.unresolved.map((u) => (
                  <T key={u} variant="support" style={{ marginTop: space.xs }}>
                    {u}
                  </T>
                ))}
              </View>
            ) : null}

            <T variant="label" style={{ marginTop: space.xl }}>
              Sources
            </T>
            {t.sources.map((s) => (
              <Pressable key={s.ref} onPress={s.url ? () => Linking.openURL(s.url!).catch(() => {}) : undefined} disabled={!s.url} accessibilityRole={s.url ? "link" : undefined} style={{ marginTop: space.s, padding: space.m, borderRadius: radius.surface, backgroundColor: color.surfaceMuted }}>
                <T variant="body" style={{ fontSize: 14.5 }}>
                  {s.ref} · {[s.publisher, s.title].filter(Boolean).join(" · ")}
                </T>
                <T variant="meta" style={{ marginTop: 2, color: color.ink3 }}>
                  Read as {KIND[s.kind]}: “{s.text}”
                </T>
              </Pressable>
            ))}

            <T variant="label" style={{ marginTop: space.xl }}>
              The exchange
            </T>
            {t.transcript.map((m, i) => (
              <T key={i} variant="support" style={{ marginTop: space.s }}>
                <T variant="support" style={{ color: color.ink }}>
                  {m.name} {VERB[m.kind]}:{" "}
                </T>
                {m.text}
              </T>
            ))}

            <T variant="support" style={{ marginTop: space.xl }}>
              Your agent retained this; that isn&apos;t the same as you understanding it. A check shows what you understand.
            </T>
            <Button label="Check my understanding" icon="arrow" onPress={() => router.push({ pathname: "/diagnostic", params: { conceptId: t.conceptId } })} style={{ marginTop: space.m, alignSelf: "flex-start" }} />
          </Gutter>
        )}
      </Screen>
    </View>
  );
}
