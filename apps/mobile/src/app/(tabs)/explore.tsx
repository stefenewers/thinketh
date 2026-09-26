import { View } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
import { T } from "@/components/Text";
import { Divider, Gutter, Row, Screen, SectionLabel } from "@/components/ui";
import { exploreGroups, type Recommendation } from "@/content/demo";
import { useApi } from "@/lib/hooks";
import { font, space } from "@/theme/tokens";

function open(item: Recommendation) {
  if (item.storylineId) router.push({ pathname: "/storyline/[id]", params: { id: item.storylineId } });
  else if (item.developmentId) router.push({ pathname: "/development/[id]", params: { id: item.developmentId } });
  else if (item.conceptId) router.push({ pathname: "/mind", params: { concept: item.conceptId } });
}

export default function Explore() {
  // Only recommend what exists in the current world and knowledge state, so no row leads to a dead end.
  const { data } = useApi(async () => {
    const [today, knowledge] = await Promise.all([api.getTodayBrief(), api.getKnowledge()]);
    return {
      developmentIds: new Set(today.developments.map((d) => d.id)),
      conceptIds: new Set(knowledge.items.map((i) => i.concept.id)),
    };
  }, []);
  const resolves = (item: Recommendation) =>
    !!item.storylineId ||
    (item.developmentId ? !!data?.developmentIds.has(item.developmentId) : !!item.conceptId && !!data?.conceptIds.has(item.conceptId));
  const groups = exploreGroups
    .map((g) => ({ reason: g.reason, item: g.items.find(resolves) }))
    .filter((g): g is { reason: string; item: Recommendation } => !!g.item);

  return (
    <Screen>
      <Gutter>
        <T variant="display" accessibilityRole="header">
          Explore
        </T>
        <T variant="support" style={{ marginTop: space.s }}>
          Adjacent ideas that would strengthen what you already understand. Each one says why it&apos;s here.
        </T>
      </Gutter>

      {groups.map(({ reason, item }) => (
        <View key={reason} style={{ marginTop: space.x3 }}>
          <Gutter>
            <SectionLabel>{reason}</SectionLabel>
          </Gutter>
          <Divider />
          <Row onPress={() => open(item)}>
            <T variant="body" style={{ fontFamily: font.sansMedium }}>
              {item.title}
            </T>
            <T variant="support" style={{ marginTop: 2 }}>
              {item.why}
            </T>
          </Row>
        </View>
      ))}
    </Screen>
  );
}
