import { View } from "react-native";
import { router } from "expo-router";
import { T } from "@/components/Text";
import { Divider, Gutter, Row, Screen, SectionLabel } from "@/components/ui";
import { exploreGroups, type Recommendation } from "@/content/demo";
import { font, space } from "@/theme/tokens";

function open(item: Recommendation) {
  if (item.developmentId) router.push({ pathname: "/development/[id]", params: { id: item.developmentId } });
  else if (item.conceptId) router.push({ pathname: "/mind", params: { concept: item.conceptId } });
}

export default function Explore() {
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

      {exploreGroups.map((group) => (
        <View key={group.reason} style={{ marginTop: space.x3 }}>
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
