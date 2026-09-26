import { View } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
import { T } from "@/components/Text";
import { Divider, Gutter, Row, Screen, SectionLabel } from "@/components/ui";
import { buildGroups, type Pick } from "@/lib/explore";
import { useApi } from "@/lib/hooks";
import { font, layout, space } from "@/theme/tokens";

function open(item: Pick) {
  if (item.resourceId) router.push({ pathname: "/resource/[id]", params: { id: item.resourceId } });
  else if (item.storylineId) router.push({ pathname: "/storyline/[id]", params: { id: item.storylineId } });
  else if (item.developmentId) router.push({ pathname: "/development/[id]", params: { id: item.developmentId } });
  else if (item.conceptId) router.push({ pathname: "/mind", params: { concept: item.conceptId } });
}

export default function Explore() {
  const { data } = useApi(
    async () => {
      const [today, knowledge, resources] = await Promise.all([api.getTodayBrief(), api.getKnowledge(), api.listResources().catch(() => [])]);
      return buildGroups(today, knowledge, resources);
    },
    [],
    { refetchOnFocus: true },
  );

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

      {(data ?? []).map((group) => (
        <View key={group.reason} style={{ marginTop: layout.sectionGap }}>
          <Gutter>
            <SectionLabel>{group.reason}</SectionLabel>
          </Gutter>
          <Divider />
          {group.items.map((item) => (
            <Row key={item.title} onPress={() => open(item)}>
              <T variant="body" style={{ fontFamily: font.sansMedium }}>
                {item.title}
              </T>
              <T variant="support" style={{ marginTop: 2 }}>
                {item.why}
              </T>
            </Row>
          ))}
        </View>
      ))}
    </Screen>
  );
}
