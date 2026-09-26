import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { DiagramView } from "@/components/DiagramView";
import { T } from "@/components/Text";
import { Button, ErrorState, Gutter, LoadingState, ModalHeader, Screen } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { color, space } from "@/theme/tokens";

export default function VisualizeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: spec, error, loading, reload } = useApi(() => api.visualize({ developmentId: id }), [id]);

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <ModalHeader title="Visualize this" onClose={() => router.back()} />
      {loading && !spec ? (
        <LoadingState message="Drawing your old and new mental model…" />
      ) : error || !spec ? (
        <ErrorState onRetry={reload} />
      ) : (
        <Screen topInset={false}>
          <Gutter>
            <T variant="title" accessibilityRole="header">
              {spec.title}
            </T>
            <T variant="support" style={{ marginTop: space.s }}>
              {spec.teachingGoal}
            </T>
            <View style={{ marginTop: space.xxl }}>
              <DiagramView spec={spec} />
            </View>
            <T variant="statement" style={{ marginTop: space.xxl, fontSize: 19, lineHeight: 28 }}>
              {spec.caption}
            </T>
            {/* Seeing the new model is not the same as having it: close the loop. */}
            <Button
              kind="decisive"
              label="Check my understanding"
              icon="arrow"
              style={{ marginTop: space.xxl }}
              onPress={() => router.replace({ pathname: "/diagnostic", params: { developmentId: id } })}
            />
          </Gutter>
        </Screen>
      )}
    </View>
  );
}
