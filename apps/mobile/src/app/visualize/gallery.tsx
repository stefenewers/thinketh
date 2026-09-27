import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { normalizeVisualization } from "@thinketh/contracts";
import { T } from "@/components/Text";
import { Gutter, ModalHeader, Screen } from "@/components/ui";
import { VisualizationView } from "@/components/visualization/VisualizationView";
import { OFFLINE_VISUALIZATIONS } from "@/api/visualizations";
import { VISUALIZATION_SAMPLES } from "@/content/visualizationSamples";
import { goBack } from "@/lib/nav";
import { color, font, radius, space } from "@/theme/tokens";

// Dev-only (reached from the demo panel): every grammar through the real renderer, for QA.
const ALL = [
  ...VISUALIZATION_SAMPLES.map((s) => ({ key: s.key, label: s.label, spec: normalizeVisualization(s.spec) })),
  ...Object.entries(OFFLINE_VISUALIZATIONS).map(([key, spec]) => ({ key, label: key.replace(/^dev-/, ""), spec })),
];

export default function VisualizationGallery() {
  const [i, setI] = useState(0);
  const current = ALL[i]!;
  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <ModalHeader title="Visualization gallery (dev)" onClose={() => goBack("/demo")} topInset />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tabs}>
        {ALL.map((s, j) => (
          <Pressable key={s.key} onPress={() => setI(j)} accessibilityRole="button" style={[styles.tab, j === i && styles.tabOn]}>
            <T style={[styles.tabText, j === i && { color: color.onInk }]}>{s.label}</T>
          </Pressable>
        ))}
      </ScrollView>
      <Screen topInset={false}>
        <Gutter>
          <T variant="meta" style={{ marginBottom: space.m }}>
            {current.spec.visualizationType} · {current.spec.nodes.length} nodes · {current.spec.edges.length} links · {current.spec.source}
          </T>
          <VisualizationView key={current.key} spec={current.spec} />
        </Gutter>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: space.s, paddingHorizontal: space.l, paddingVertical: space.s },
  tab: { paddingHorizontal: 12, minHeight: 34, justifyContent: "center", borderRadius: radius.pill, backgroundColor: color.fog },
  tabOn: { backgroundColor: color.ink },
  tabText: { fontFamily: font.sansMedium, fontSize: 13, color: color.ink },
});
