import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { MindGraph } from "@/components/MindGraph";
import { T } from "@/components/Text";
import { Button, Divider, Gutter, Row, Screen, SectionLabel } from "@/components/ui";
import { agentMemoryStoryline } from "@/content/demo";
import { useApi } from "@/lib/hooks";
import { improvedTodayIds } from "@/lib/knowledge";
import { consumeVerb, hostOf, SOURCE_TYPE_LABEL, STAGE_COPY } from "@/lib/resources";
import { color, font, layout, radius, shadow, space } from "@/theme/tokens";

export default function Library() {
  const { data } = useApi(() => api.getKnowledge(), [], { refetchOnFocus: true });
  const updatedIds = improvedTodayIds(data?.items ?? []);
  const queue = useApi(() => api.listResources(), [], { refetchOnFocus: true });
  const resources = queue.data ?? [];

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

      {/* Save to learn: resources waiting to become part of what you understand. */}
      <View style={{ marginTop: layout.sectionGap }}>
        <Gutter style={styles.sectionHead}>
          <SectionLabel>Learning queue</SectionLabel>
          {resources.length ? (
            <Pressable onPress={() => router.push("/resource/add")} accessibilityRole="button" hitSlop={8}>
              <T variant="meta" style={{ color: color.ink }}>
                + Add a resource
              </T>
            </Pressable>
          ) : null}
        </Gutter>
        {resources.length === 0 ? (
          <Gutter>
            <T variant="section">Give Thinketh something you want to understand.</T>
            <T variant="support" style={{ marginTop: space.xs }}>
              An article, paper or docs page. Thinketh reads it and shows only what&apos;s new to you.
            </T>
            <Button kind="secondary" label="Add a resource" style={{ marginTop: space.l }} onPress={() => router.push("/resource/add")} />
          </Gutter>
        ) : (
          <>
            <Divider />
            {resources.slice(0, 5).map((r) => (
              <Row key={r.id} onPress={() => router.push({ pathname: "/resource/[id]", params: { id: r.id } })}>
                <T variant="meta">
                  {r.status === "ready" || r.status === "learned"
                    ? `${SOURCE_TYPE_LABEL[r.sourceType]} · ${r.publisher ?? hostOf(r.url)}`
                    : hostOf(r.url)}
                </T>
                <T variant="body" style={{ fontFamily: font.sansMedium, marginTop: 2 }} numberOfLines={2}>
                  {r.title}
                </T>
                <T variant="support" tone={r.status === "ready" ? "coral" : undefined}>
                  {r.status === "processing"
                    ? STAGE_COPY[r.stage]
                    : r.status === "failed"
                      ? "Couldn't read this one"
                      : r.relevance?.level === "outside"
                        ? "Outside what you're learning"
                        : `~${r.estimatedUsefulMinutes ?? "?"} useful min of ~${r.estimatedReadMinutes ?? "?"} ${consumeVerb(r)} · ${r.newToYou.length} new to you`}
                </T>
              </Row>
            ))}
          </>
        )}
      </View>

      <Gutter style={{ marginTop: layout.sectionGap }}>
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

      <View style={{ marginTop: space.xxl }}>
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
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.surface,
    padding: space.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
    ...shadow.raised,
  },
  previewLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.m, minHeight: 32 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  event: { flexDirection: "row", gap: space.l },
  rail: { width: 12, alignItems: "center" },
  node: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: color.ink2, backgroundColor: color.ground, marginTop: 2 },
  line: { flex: 1, width: 1, backgroundColor: color.edge, marginTop: 4 },
});
