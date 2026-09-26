import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { Resource } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { ListCard, SectionHeader } from "@/components/system";
import { T } from "@/components/Text";
import { Texture } from "@/components/Texture";
import { Button, Gutter, Screen } from "@/components/ui";
import { agentMemoryStoryline } from "@/content/demo";
import { storyImageFor } from "@/content/imagery";
import { useApi } from "@/lib/hooks";
import { consumeVerb, hostOf, SOURCE_TYPE_LABEL, STAGE_COPY } from "@/lib/resources";
import { color, depth, font, glow, space, warm } from "@/theme/tokens";

const VISIBLE = 5;

/**
 * Learn: what can I read, save or explore next? Saved sources (the learning queue), a way to add
 * one, a way into related ideas, and the storyline you're following. Your Mind lives in its own tab.
 */
export default function Learn() {
  const queue = useApi(() => api.listResources(), [], { refetchOnFocus: true });
  const resources = queue.data ?? [];
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? resources : resources.slice(0, VISIBLE);

  return (
    <Screen background={warm.ground}>
      <Gutter>
        <T variant="display" accessibilityRole="header">
          Learn
        </T>
        <T variant="support" style={{ marginTop: space.s }}>
          Save what you want to understand. Thinketh reads it against your Mind and keeps what&apos;s new for you.
        </T>
        <Button label="Add a source" icon="arrow" style={{ marginTop: space.l }} onPress={() => router.push("/resource/add")} accessibilityHint="An article, paper, docs page or video" />
      </Gutter>

      <Gutter>
        <SectionHeader
          title="Your learning queue"
          action={resources.length > VISIBLE ? { label: showAll ? "Show fewer" : "See all", onPress: () => setShowAll((v) => !v) } : undefined}
        />
        {queue.loading && !queue.data ? (
          <T variant="support">Loading what you&apos;ve saved…</T>
        ) : resources.length === 0 ? (
          <View style={styles.empty}>
            <T variant="section">Nothing saved yet.</T>
            <T variant="support" style={{ marginTop: space.xs }}>
              Add an article, paper or docs page. Thinketh shows only the parts that are new to you.
            </T>
          </View>
        ) : (
          <ListCard style={styles.panel}>
            {shown.map((r, i) => (
              <QueueRow key={r.id} r={r} last={i === shown.length - 1} />
            ))}
          </ListCard>
        )}

        <SectionHeader title="Go further" />
        <ListCard style={styles.panel}>
          <EntryRow
            icon="explore"
            tint={glow.tileCool}
            ink={glow.tileCoolInk}
            title="Explore related ideas"
            subtitle="Adjacent ideas that would strengthen what you already understand."
            onPress={() => router.push("/explore")}
          />
          <EntryRow
            icon="library"
            tint={glow.tileWarm}
            ink={glow.tileWarmInk}
            title={agentMemoryStoryline.title}
            subtitle={`${agentMemoryStoryline.subtitle}, and how your understanding changed with it.`}
            onPress={() => router.push({ pathname: "/storyline/[id]", params: { id: agentMemoryStoryline.id } })}
          />
          <EntryRow
            icon="people"
            tint={glow.tileNeutral}
            ink={glow.tileNeutralInk}
            title="Learning profile"
            subtitle="What you follow, what you're optimizing for, and how you like to learn."
            onPress={() => router.push("/profile")}
            last
          />
        </ListCard>
      </Gutter>
    </Screen>
  );
}

function queueStatus(r: Resource): string {
  if (r.status === "processing") return STAGE_COPY[r.stage];
  if (r.status === "failed") return "Couldn't read this one";
  if (r.relevance?.level === "outside") return "Outside what you're learning";
  return `~${r.estimatedUsefulMinutes ?? "?"} useful min of ~${r.estimatedReadMinutes ?? "?"} ${consumeVerb(r)} · ${r.newToYou.length} new for you`;
}

function QueueRow({ r, last }: { r: Resource; last: boolean }) {
  const ready = r.status === "ready" || r.status === "learned";
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/resource/[id]", params: { id: r.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${r.title}. ${queueStatus(r)}.`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.surfaceMuted }]}
    >
      <Texture source={storyImageFor(r.matchedConceptIds)} style={styles.thumb} />
      <View style={[styles.rowBody, !last && styles.divided]}>
        <View style={{ flex: 1 }}>
          <T style={styles.meta} numberOfLines={1}>
            {ready ? `${SOURCE_TYPE_LABEL[r.sourceType]} · ${r.publisher ?? hostOf(r.url)}` : hostOf(r.url)}
          </T>
          <T style={styles.title} numberOfLines={2}>
            {r.title}
          </T>
          <T style={[styles.status, r.status === "ready" && { color: color.coral }]} numberOfLines={1}>
            {queueStatus(r)}
          </T>
        </View>
        <Icon name="chevron" size={13} color={color.ink3} />
      </View>
    </Pressable>
  );
}

function EntryRow({ icon, tint, ink, title, subtitle, onPress, last }: { icon: "explore" | "library" | "people"; tint: string; ink: string; title: string; subtitle: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.surfaceMuted }]}>
      <View style={[styles.icon, { backgroundColor: tint }]}>
        <Icon name={icon} size={19} color={ink} />
      </View>
      <View style={[styles.rowBody, !last && styles.divided]}>
        <View style={{ flex: 1 }}>
          <T style={styles.title} numberOfLines={1}>
            {title}
          </T>
          <T style={styles.status} numberOfLines={2}>
            {subtitle}
          </T>
        </View>
        <Icon name="chevron" size={13} color={color.ink3} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { borderColor: "rgba(22,22,22,0.05)", ...depth.card },
  empty: { paddingVertical: space.m },
  row: { flexDirection: "row", alignItems: "stretch", paddingLeft: space.m },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.m, paddingRight: space.m, marginLeft: space.m },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  thumb: { width: 56, height: 56, borderRadius: 12, alignSelf: "center", backgroundColor: color.surfaceMuted },
  icon: { width: 42, height: 42, borderRadius: 13, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  meta: { fontFamily: font.sansMedium, fontSize: 12, lineHeight: 16, color: color.ink3 },
  title: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink, marginTop: 2 },
  status: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.ink2, marginTop: 2 },
});
