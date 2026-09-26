import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/lib/nav";
import { api } from "@/api";
import { DiagramView } from "@/components/DiagramView";
import { T } from "@/components/Text";
import { Button, ErrorState, Gutter, LoadingState, ModalHeader, Screen, SectionLabel } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { color, font, radius, space } from "@/theme/tokens";

export default function MakeItStickScreen() {
  const { id, conceptId } = useLocalSearchParams<{ id: string; conceptId: string }>();
  const { data: aid, error, loading, reload } = useApi(
    () => api.makeItStick({ conceptId, developmentId: id }),
    [conceptId, id],
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <ModalHeader title="Make it stick" onClose={() => goBack({ pathname: "/development/[id]", params: { id } })} />
      {loading && !aid ? (
        <LoadingState message="Finding an analogy that fits what you already know…" />
      ) : error || !aid ? (
        <ErrorState onRetry={reload} />
      ) : (
        <Screen topInset={false}>
          <Gutter>
            <SectionLabel>Think of it like this</SectionLabel>
            <T variant="body" style={{ fontSize: 16, lineHeight: 25 }}>
              {aid.analogy}
            </T>

            <View style={styles.hook}>
              <T variant="label" style={{ marginBottom: space.m }}>
                Remember
              </T>
              <T variant="statement" style={{ fontSize: 20, lineHeight: 28 }}>
                {aid.memoryHook}
              </T>
            </View>

            <SectionLabel>The model in three steps</SectionLabel>
            {aid.threeStepModel.map((step, i) => (
              <View key={step} style={styles.step}>
                <T style={styles.stepNum}>{i + 1}</T>
                <T variant="body" style={{ flex: 1 }}>
                  {step}
                </T>
              </View>
            ))}

            {aid.optionalDiagram ? (
              <View style={{ marginTop: space.xxl }}>
                <DiagramView spec={aid.optionalDiagram} />
              </View>
            ) : null}

            <View style={styles.recall}>
              <T variant="label" style={{ marginBottom: space.s }}>
                Recall
              </T>
              <T variant="body" style={{ fontFamily: font.sansMedium }}>
                {aid.recallQuestion}
              </T>
              <T variant="support" style={{ marginTop: space.s }}>
                Answer it in your head before you move on. Retrieval is what makes it stick.
              </T>
            </View>

            {id ? (
              <Button
                kind="decisive"
                label="Check my understanding"
                icon="arrow"
                style={{ marginTop: space.xl }}
                onPress={() => router.replace({ pathname: "/diagnostic", params: { developmentId: id, conceptId } })}
              />
            ) : null}
          </Gutter>
        </Screen>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hook: { marginVertical: space.x3, paddingVertical: space.xl, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  step: { flexDirection: "row", gap: space.l, marginBottom: space.l, alignItems: "flex-start" },
  stepNum: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 24, color: color.ink3, width: 18, fontVariant: ["tabular-nums"] },
  recall: { marginTop: space.xxl, padding: space.xl, backgroundColor: color.fog, borderRadius: radius.surface },
});
