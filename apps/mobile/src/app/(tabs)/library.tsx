import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { Resource } from "@thinketh/contracts";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { SourceStackArt } from "@/components/learn/LearnArt";
import { LEARN, learnStyles } from "@/components/learn/learnStyles";
import { T } from "@/components/Text";
import { Button, Gutter, Screen } from "@/components/ui";
import { TopicArt } from "@/components/TopicArt";
import { useApi } from "@/lib/hooks";
import { consumeVerb, hostOf, SOURCE_TYPE_LABEL, STAGE_COPY } from "@/lib/resources";
import { color, font, pixel, space, warm } from "@/theme/tokens";

const VISIBLE = 5;
const addSource = () => router.push("/resource/add");

/**
 * Learn: what can I read, save or explore next? What you saved (yours), a way to add more, and,
 * kept separate, what Thinketh suggests. The storyline is reached from its development and concept;
 * your learning profile from your avatar on Today.
 */
export default function Learn() {
  const queue = useApi(() => api.listResources(), [], { refetchOnFocus: true });
  const resources = queue.data ?? [];
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? resources : resources.slice(0, VISIBLE);

  return (
    <Screen background={warm.ground}>
      <Gutter>
        <T accessibilityRole="header" style={styles.title}>
          Learn
        </T>
        <T style={styles.intro}>Save what you want to understand. Thinketh reads each one against your Mind and shows what&apos;s new for you.</T>
        <Button
          label="Add a source"
          icon="arrow"
          style={styles.primary}
          labelStyle={styles.primaryLabel}
          onPress={addSource}
          accessibilityHint="An article, paper, docs page or video"
        />

        <Heading title="Saved by you" action={resources.length > VISIBLE ? { label: showAll ? "Show fewer" : "See all", onPress: () => setShowAll((v) => !v) } : undefined} />
        {queue.loading && !queue.data ? (
          <T variant="support" style={styles.loading}>
            Loading what you&apos;ve saved…
          </T>
        ) : resources.length === 0 ? (
          <EmptySaved />
        ) : (
          <View style={styles.card}>
            {shown.map((r, i) => (
              <QueueRow key={r.id} r={r} last={i === shown.length - 1} />
            ))}
          </View>
        )}

        {/* Thinketh's suggestions, kept apart from what you saved. */}
        <Heading title="Suggested for you" />
        <Pressable
          onPress={() => router.push("/explore")}
          accessibilityRole="button"
          accessibilityLabel="Explore related ideas. Adjacent ideas Thinketh picked because they'd strengthen what you already know."
          style={({ pressed }) => [styles.card, styles.suggestion, pressed && styles.pressed]}
        >
          <TopicArt kind="book" unit={1.34} style={styles.suggestionIcon} />
          <View style={{ flex: 1 }}>
            <T style={styles.rowTitle}>Explore related ideas</T>
            <T style={[styles.rowBody, styles.suggestionBody]}>Adjacent ideas Thinketh picked because they&apos;d strengthen what you already know.</T>
          </View>
          <Icon name="chevron" size={14} color={color.ink3} />
        </Pressable>
      </Gutter>
    </Screen>
  );
}

function Heading({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.heading}>
      <T style={styles.headingText} accessibilityRole="header">
        {title}
      </T>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={10} style={styles.headingAction}>
          <T variant="meta">{action.label}</T>
          <Icon name="chevron" size={13} color={color.ink2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Nothing saved yet: what Learn is for, a quiet way in, and the pages waiting to be read. */
function EmptySaved() {
  return (
    <View style={[styles.card, styles.empty]}>
      <View style={{ flex: 1 }}>
        <T style={styles.emptyTitle}>Nothing saved yet</T>
        <T style={styles.emptyBody}>Add an article, paper or docs page. Thinketh shows only the parts that are new to you.</T>
        <Pressable onPress={addSource} accessibilityRole="button" accessibilityLabel="Add your first source" style={({ pressed }) => [styles.softPill, pressed && styles.pressed]}>
          <T style={styles.softPillText}>Add your first source</T>
          <Icon name="arrow" size={15} color={color.coral} />
        </Pressable>
      </View>
      <SourceStackArt />
    </View>
  );
}

function queueStatus(r: Resource): string {
  if (r.status === "processing") return STAGE_COPY[r.stage];
  if (r.status === "failed") return "Couldn't read this one";
  if (r.relevance?.level === "outside") return "Outside the topics you follow";
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
      {/* Decorative: the saved source's topic (or a plain document when it maps to none). */}
      <TopicArt conceptIds={r.matchedConceptIds} fallback="document" unit={1.5} style={styles.thumb} />
      <View style={[styles.rowMain, !last && styles.divided]}>
        <View style={{ flex: 1 }}>
          <T style={styles.meta} numberOfLines={1}>
            {ready ? `${SOURCE_TYPE_LABEL[r.sourceType]} · ${r.publisher ?? hostOf(r.url)}` : hostOf(r.url)}
          </T>
          <T style={styles.rowTitle} numberOfLines={2}>
            {r.title}
          </T>
          {/* Coral only for something ready with new ideas for you; everything else is neutral. */}
          <T style={[styles.rowBody, r.status === "ready" && r.relevance?.level !== "outside" && { color: color.coral }]} numberOfLines={1}>
            {queueStatus(r)}
          </T>
        </View>
        <Icon name="chevron" size={14} color={color.ink3} />
      </View>
    </Pressable>
  );
}

// Learn's own rhythm (measured from the reference at iPhone width): a large title, a quiet intro,
// one strong action, then two calm sections. Cards are hairline and flat; depth is left to Today.
const styles = StyleSheet.create({
  title: { ...learnStyles.pageTitle, marginTop: space.s },
  intro: learnStyles.intro,
  primary: { marginTop: 22, minHeight: 48 },
  primaryLabel: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 40, marginBottom: 12 },
  headingText: { fontFamily: font.sansSemibold, fontSize: 20, lineHeight: 25, letterSpacing: -0.4, color: color.ink },
  headingAction: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44 },
  loading: { paddingVertical: space.l },
  card: learnStyles.card,
  pressed: learnStyles.pressed,
  empty: { flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 22, paddingLeft: 22, paddingRight: 18, backgroundColor: LEARN.warmCard, borderColor: LEARN.warmCardBorder },
  emptyTitle: { fontFamily: font.sansSemibold, fontSize: 18, lineHeight: 23, letterSpacing: -0.3, color: color.ink },
  emptyBody: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: color.ink2, marginTop: 8 },
  softPill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, marginTop: 16, minHeight: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: LEARN.softPill },
  softPillText: { fontFamily: font.sansSemibold, fontSize: 14.5, lineHeight: 19, color: color.coral },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: 16 },
  // Main's pixel topic art, on the same paper tile the Learn system uses.
  thumb: { width: 48, height: 48, borderRadius: 13, backgroundColor: pixel.floor, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: 16, paddingRight: 16, marginLeft: 14 },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  meta: { fontFamily: font.sansMedium, fontSize: 12, lineHeight: 16, color: color.ink3 },
  rowTitle: { ...learnStyles.cardTitle, marginTop: 1 },
  rowBody: { ...learnStyles.cardBody, marginTop: 3 },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 18, paddingLeft: 16, paddingRight: 14 },
  suggestionBody: { fontSize: 13, lineHeight: 18, letterSpacing: -0.1 },
  suggestionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: LEARN.peachTile },
});
