import { View } from "react-native";
import { router } from "expo-router";
import { SetupHeader, SetupRow } from "@/components/setup/Setup";
import { ListCard, SectionHeader } from "@/components/system";
import { Button, Gutter, ModalHeader, Screen } from "@/components/ui";
import { DEMO_PROFILE, useProfile } from "@/lib/profile";
import { color, space } from "@/theme/tokens";

// What Thinketh knows about you as a learner (set in onboarding). Mastery is not
// here: that lives in your Mind and only changes on evidence.
export default function ProfileScreen() {
  const profile = useProfile() ?? DEMO_PROFILE;
  const edit = () => router.push("/onboarding");
  const summary = (items: string[]) => (items.length ? items.join(", ") : "Nothing selected");

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <ModalHeader title="Learning profile" onClose={() => router.back()} topInset />
      <Screen topInset={false} background={color.canvas}>
        <Gutter>
          <SetupHeader title="How you learn" note="This frames what Thinketh shows you. What you actually know is measured separately, from evidence, in your Mind." />

          <ListCard style={{ marginTop: space.xxl }}>
            <SetupRow icon="explore" title="You follow" subtitle={summary(profile.interests)} onPress={edit} accessibilityLabel={`You follow: ${summary(profile.interests)}. Edit`} />
            <SetupRow icon="sparkle" title="You're optimizing for" subtitle={summary(profile.goals)} onPress={edit} accessibilityLabel={`You're optimizing for: ${summary(profile.goals)}. Edit`} />
            <SetupRow icon="mind" title="Thinketh teaches you with" subtitle={summary(profile.teaching)} onPress={edit} accessibilityLabel={`Thinketh teaches you with: ${summary(profile.teaching)}. Edit`} last />
          </ListCard>

          <View style={{ marginTop: space.l, alignItems: "flex-start" }}>
            <Button kind="secondary" label="Edit" onPress={edit} />
          </View>

          <SectionHeader title="Your Mind" />
          <ListCard>
            <SetupRow
              icon="mind"
              title="See what you know"
              subtitle="Your knowledge state, and why each part of it changed."
              onPress={() => {
                router.back();
                router.push("/mind");
              }}
            />
            <SetupRow
              icon="people"
              title="Learn together"
              subtitle="Bring another Mind in. Thinketh finds what can move between you."
              onPress={() => {
                router.back();
                router.push("/playground");
              }}
              last
            />
          </ListCard>
        </Gutter>
      </Screen>
    </View>
  );
}
