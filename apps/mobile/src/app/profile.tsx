import { View } from "react-native";
import { router } from "expo-router";
import { T } from "@/components/Text";
import { Button, Divider, Gutter, ModalHeader, Row, Screen, SectionLabel } from "@/components/ui";
import { DEMO_PROFILE, useProfile } from "@/lib/profile";
import { color, font, layout, space } from "@/theme/tokens";

// What Thinketh knows about you as a learner (set in onboarding). Mastery is not
// here: that lives in your Mind and only changes on evidence.
export default function ProfileScreen() {
  const profile = useProfile() ?? DEMO_PROFILE;
  const sections = [
    { label: "You follow", items: profile.interests },
    { label: "You're optimizing for", items: profile.goals },
    { label: "Thinketh teaches you with", items: profile.teaching },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <ModalHeader title="Learning profile" onClose={() => router.back()} topInset />
      <Screen topInset={false}>
        <Gutter>
          <T variant="display" accessibilityRole="header">
            How you learn
          </T>
          <T variant="support" style={{ marginTop: space.s }}>
            This frames what Thinketh shows you. What you actually know is measured separately, from evidence, in your Mind.
          </T>
        </Gutter>

        {sections.map((s) => (
          <Gutter key={s.label} style={{ marginTop: space.xxl }}>
            <SectionLabel>{s.label}</SectionLabel>
            <T variant="body" style={{ fontFamily: font.sansMedium }}>
              {s.items.length ? s.items.join(" · ") : "Nothing selected"}
            </T>
          </Gutter>
        ))}

        <Gutter style={{ marginTop: layout.sectionGap }}>
          <Button kind="secondary" label="Edit" onPress={() => router.push("/onboarding")} />
        </Gutter>

        <View style={{ marginTop: layout.sectionGap }}>
          <Divider />
          <Row
            onPress={() => {
              router.back();
              router.push("/mind");
            }}
          >
            <T variant="body" style={{ fontFamily: font.sansMedium }}>
              See what you know
            </T>
            <T variant="support">Your knowledge state, and why each part of it changed.</T>
          </Row>
          <Row
            onPress={() => {
              router.back();
              router.push("/playground");
            }}
          >
            <T variant="body" style={{ fontFamily: font.sansMedium }}>
              Learn together
            </T>
            <T variant="support">Bring another Mind in. Thinketh finds what can move between you.</T>
          </Row>
        </View>
      </Screen>
    </View>
  );
}
