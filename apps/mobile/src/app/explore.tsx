import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
import { Icon } from "@/components/Icon";
import { CircleBack, IdeaGlyph, ideaKind } from "@/components/learn/LearnArt";
import { LEARN, learnStyles } from "@/components/learn/learnStyles";
import { T } from "@/components/Text";
import { Gutter, Screen } from "@/components/ui";
import { buildGroups, type Pick } from "@/lib/explore";
import { useApi } from "@/lib/hooks";
import { color, font, space, warm } from "@/theme/tokens";

function open(item: Pick) {
  if (item.resourceId) router.push({ pathname: "/resource/[id]", params: { id: item.resourceId } });
  else if (item.storylineId) router.push({ pathname: "/storyline/[id]", params: { id: item.storylineId } });
  else if (item.developmentId) router.push({ pathname: "/development/[id]", params: { id: item.developmentId } });
  else if (item.conceptId) router.push({ pathname: "/mind", params: { concept: item.conceptId } });
}

/**
 * Explore related ideas: a few adjacent ideas, each in its own card that says what it is and why
 * Thinketh picked it for you. Same quiet system as Learn, which it is reached from.
 */
export default function Explore() {
  const { data, error, loading, reload } = useApi(
    async () => {
      const [today, knowledge, resources] = await Promise.all([api.getTodayBrief(), api.getKnowledge(), api.listResources().catch(() => [])]);
      return buildGroups(today, knowledge, resources);
    },
    [],
    { refetchOnFocus: true },
  );

  return (
    <Screen background={warm.ground}>
      <Gutter>
        {/* Explore is reached from Learn (and older links to /explore); it has a way back. */}
        <CircleBack onPress={() => (router.canGoBack() ? router.back() : router.replace("/library"))} />
        <T accessibilityRole="header" style={[learnStyles.pageTitle, styles.title]}>
          Explore related ideas
        </T>
        <T style={learnStyles.intro}>Adjacent ideas that would strengthen what you already understand. Each one says why it&apos;s here.</T>

        {loading && !data ? (
          <Loading />
        ) : error && !data ? (
          <Quiet title="Suggestions didn't load." body="Your saved sources and progress are safe." action={{ label: "Try again", onPress: reload }} />
        ) : !data?.length ? (
          <Quiet title="Nothing to suggest yet." body="Save a source or answer a check, and Thinketh will find what connects to what you know." />
        ) : (
          data.map((group) => (
            <View key={group.reason}>
              <T style={[learnStyles.eyebrow, styles.eyebrow]} accessibilityRole="header">
                {group.reason}
              </T>
              <View style={{ gap: space.m }}>
                {group.items.map((item) => (
                  <IdeaCard key={item.title} item={item} reason={group.reason} />
                ))}
              </View>
            </View>
          ))
        )}
      </Gutter>
    </Screen>
  );
}

/** One recommendation: what it is, and why it's here. The whole card is the tap target. */
function IdeaCard({ item, reason }: { item: Pick; reason: string }) {
  return (
    <Pressable
      onPress={() => open(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.why}`}
      style={({ pressed }) => [learnStyles.card, styles.card, pressed && learnStyles.pressed]}
    >
      <IdeaGlyph kind={ideaKind(reason, item)} conceptIds={item.conceptIds} />
      <View style={{ flex: 1 }}>
        <T style={learnStyles.cardTitle}>{item.title}</T>
        <T style={[learnStyles.cardBody, styles.why]}>{item.why}</T>
      </View>
      <View style={styles.chevron}>
        <Icon name="chevron" size={14} color={color.ink3} />
      </View>
    </Pressable>
  );
}

/** Card-shaped placeholders while the picks are worked out. */
function Loading() {
  return (
    <View accessibilityLabel="Finding related ideas" accessibilityLiveRegion="polite">
      {[0, 1].map((i) => (
        <View key={i}>
          <View style={[styles.bone, { width: 150, height: 11, marginTop: 34, marginBottom: 14 }]} />
          <View style={[learnStyles.card, styles.card]}>
            <View style={{ width: 54, height: 54, borderRadius: 15, backgroundColor: LEARN.peachTile }} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={[styles.bone, { width: "80%", height: 14 }]} />
              <View style={[styles.bone, { width: "95%", height: 11 }]} />
              <View style={[styles.bone, { width: "60%", height: 11 }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function Quiet({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={[learnStyles.card, styles.quiet]}>
      <T style={learnStyles.cardTitle}>{title}</T>
      <T style={[learnStyles.cardBody, { marginTop: 6 }]}>{body}</T>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" style={({ pressed }) => [styles.softPill, pressed && learnStyles.pressed]}>
          <T style={styles.softPillText}>{action.label}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 24 },
  eyebrow: { marginTop: 34, marginBottom: 14 },
  // Icon beside the title (top), chevron centred: a tall reason never pushes the icon adrift.
  card: { flexDirection: "row", alignItems: "flex-start", gap: 16, paddingVertical: 18, paddingLeft: 16, paddingRight: 14 },
  chevron: { alignSelf: "center" },
  why: { marginTop: 6 },
  bone: { borderRadius: 6, backgroundColor: "#F0ECE7" },
  quiet: { marginTop: 34, padding: 20, backgroundColor: LEARN.warmCard, borderColor: LEARN.warmCardBorder },
  softPill: { alignSelf: "flex-start", marginTop: 14, minHeight: 36, paddingHorizontal: 16, justifyContent: "center", borderRadius: 999, backgroundColor: LEARN.softPill },
  softPillText: { fontFamily: font.sansSemibold, fontSize: 14, lineHeight: 19, color: color.coral },
});
