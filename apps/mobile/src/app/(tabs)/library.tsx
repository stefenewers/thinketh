import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { MindGraph } from "@/components/MindGraph";
import { T } from "@/components/Text";
import { Divider, Gutter, Row, Screen, SectionLabel } from "@/components/ui";
import { agentMemoryStoryline } from "@/content/demo";
import { useApi } from "@/lib/hooks";
import { improvedTodayIds } from "@/lib/knowledge";
import { color, radius, space } from "@/theme/tokens";

export default function Library() {
  const { data } = useApi(() => api.getKnowledge(), [], { refetchOnFocus: true });
  const updatedIds = improvedTodayIds(data?.items ?? []);

  return (
    <Screen>
      <Gutter>
        <T variant="display" accessibilityRole="header">
          Your Knowledge
        </T>
        <T variant="support" style={{ marginTop: space.s }}>
          What you understand, how it connects, and how it is changing.
        </T>
      </Gutter>

      <Gutter style={{ marginTop: space.xl }}>
        <Pressable
          onPress={() => router.push("/mind")}
          accessibilityRole="button"
          accessibilityLabel="Open your Mind"
          style={styles.preview}
        >
          {data ? (
            <MindGraph
              concepts={data.items.map((i) => i.concept)}
              states={data.items.map((i) => i.state)}
              edges={data.edges}
              selectedId={null}
              updatedIds={updatedIds}
            />
          ) : (
            <View style={{ height: 200 }} />
          )}
          <View style={styles.previewLink}>
            <T variant="meta" style={{ color: color.ink }}>
              Open your Mind
            </T>
            <Icon name="arrow" size={14} color={color.ink} />
          </View>
        </Pressable>
      </Gutter>

      <Gutter style={{ marginTop: space.x3 }}>
        <SectionLabel>Storyline</SectionLabel>
        <Pressable
          onPress={() => router.push({ pathname: "/storyline/[id]", params: { id: agentMemoryStoryline.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Open storyline: ${agentMemoryStoryline.title}`}
        >
          <T variant="section">{agentMemoryStoryline.title}</T>
          <T variant="support" style={{ marginTop: space.xs }}>
            {agentMemoryStoryline.subtitle}, and how your understanding changed with it.
          </T>
          <View style={{ marginTop: space.l }}>
            {agentMemoryStoryline.phases.map((p, i) => (
              <View key={p.label} style={styles.event}>
                <View style={styles.rail}>
                  <View style={[styles.node, p.current && { backgroundColor: color.coral, borderColor: color.coral }]} />
                  {i < agentMemoryStoryline.phases.length - 1 ? <View style={styles.line} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: space.l }}>
                  <T variant="label" tone={p.current ? "coral" : undefined}>
                    {p.label}
                  </T>
                  <T variant="body" style={{ marginTop: space.xs }}>
                    {p.headline}
                  </T>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.previewLink}>
            <T variant="meta" style={{ color: color.ink }}>
              Open the storyline
            </T>
            <Icon name="arrow" size={14} color={color.ink} />
          </View>
        </Pressable>
      </Gutter>

      <View style={{ marginTop: space.l }}>
        <Gutter>
          <SectionLabel>Browse</SectionLabel>
        </Gutter>
        <Divider />
        <Row onPress={() => router.push("/mind")}>
          <T variant="body">All concepts</T>
          <T variant="support">Everything in your knowledge state, grouped by strength.</T>
        </Row>
        <Row onPress={() => router.push("/profile")}>
          <T variant="body">Learning profile</T>
          <T variant="support">What you follow, what you&apos;re optimizing for, and how you like to learn.</T>
        </Row>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: {
    backgroundColor: color.panel,
    borderRadius: radius.surface,
    padding: space.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
  },
  previewLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.m, minHeight: 32 },
  event: { flexDirection: "row", gap: space.l },
  rail: { width: 12, alignItems: "center" },
  node: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: color.ink2, backgroundColor: color.ground, marginTop: 2 },
  line: { flex: 1, width: 1, backgroundColor: color.edge, marginTop: 4 },
});
