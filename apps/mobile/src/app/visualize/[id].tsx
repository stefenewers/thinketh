import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/lib/nav";
import { Button, ErrorState, Gutter, ModalHeader, Screen } from "@/components/ui";
import { VisualizationSkeleton, VisualizationView } from "@/components/visualization/VisualizationView";
import { useVisualization } from "@/lib/visualizationCache";
import { color, space } from "@/theme/tokens";

// "Visualize this": the sheet opens at once with its header; the planner's diagram (or, if it
// can't answer, the development's own before/after) settles in when ready. Reopening is instant.
export default function VisualizeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spec, loading, failed, retry } = useVisualization(id);

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <ModalHeader title="Visualize this" onClose={() => goBack({ pathname: "/development/[id]", params: { id } })} />
      {failed && !spec ? (
        <ErrorState onRetry={retry} />
      ) : (
        <Screen topInset={false}>
          <Gutter>
            {loading || !spec ? <VisualizationSkeleton /> : <VisualizationView spec={spec} />}
            {/* Seeing the new model is not the same as having it: close the loop. */}
            {spec && !loading ? (
              <Button
                kind="decisive"
                label="Check my understanding"
                icon="arrow"
                style={{ marginTop: space.xl }}
                onPress={() => router.replace({ pathname: "/diagnostic", params: { developmentId: id } })}
              />
            ) : null}
          </Gutter>
        </Screen>
      )}
    </View>
  );
}
