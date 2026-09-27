import { View } from "react-native";
import { router } from "expo-router";
import { closeTo, goBack } from "@/lib/nav";
import { PLAYGROUND_AVAILABLE } from "@/api/playground";
import { SetupHeader, SetupRow } from "@/components/setup/Setup";
import { ListCard, SectionHeader } from "@/components/system";
import { Button, Gutter, ModalHeader, Screen } from "@/components/ui";
import { DEMO_PROFILE, resetProfileCache, useProfile } from "@/lib/profile";
import { AUTH_AVAILABLE, setMode, signOut, useSession } from "@/lib/session";
import { color, space } from "@/theme/tokens";

// What Thinketh knows about you as a learner (set in onboarding). Mastery is not
// here: that lives in your Mind and only changes on evidence.
export default function ProfileScreen() {
  const session = useSession();
  const personal = session.mode === "personal";
  const saved = useProfile();
  const profile = saved ?? (personal ? { interests: [], goals: [], teaching: [], completedAt: null } : DEMO_PROFILE);
  const leave = async (to: "signout" | "demo" | "personal") => {
    if (to === "signout") await signOut();
    else await setMode(to);
    resetProfileCache();
    router.replace("/");
  };
  const edit = () => router.push("/onboarding");
  const summary = (items: string[]) => (items.length ? items.join(", ") : "Nothing selected");

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <ModalHeader title="Learning profile" onClose={() => goBack()} topInset />
      <Screen topInset={false} background={color.ground}>
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

          <SectionHeader title="Account" />
          <ListCard>
            {personal ? (
              <>
                <SetupRow
                  icon="person"
                  title={session.session?.anonymous ? "Private session on this device" : (session.session?.email ?? "Signed in")}
                  subtitle={session.session?.anonymous ? "Your Mind is yours, but only on this phone until you sign in with email." : "Your profile, sources and Mind follow you across devices."}
                />
                <SetupRow icon="close" title="Sign out" onPress={() => leave("signout")} last={!AUTH_AVAILABLE} />
                <SetupRow icon="sparkle" title="Explore the demo instead" subtitle="A seeded learner. Nothing there is saved as yours." onPress={() => leave("demo")} last />
              </>
            ) : (
              <>
                <SetupRow icon="info" title="You're exploring the demo" subtitle="Stefen is a seeded learner. What you do here resets and isn't saved as yours." last={!AUTH_AVAILABLE} />
                {AUTH_AVAILABLE ? <SetupRow icon="person" title="Use your own Mind" subtitle="Sign in so preferences and progress are yours." onPress={() => leave("personal")} last /> : null}
              </>
            )}
          </ListCard>

          <SectionHeader title="Your Mind" />
          <ListCard>
            <SetupRow
              icon="mind"
              title="See what you know"
              subtitle="Your knowledge state, and why each part of it changed."
              onPress={() => closeTo("/mind")}
              last={!PLAYGROUND_AVAILABLE}
            />
            {PLAYGROUND_AVAILABLE ? (
              <SetupRow
                icon="people"
                title="Learn together"
                subtitle="Bring another Mind in. Thinketh finds what can move between you."
                onPress={() => closeTo("/playground")}
                last
              />
            ) : null}
          </ListCard>
        </Gutter>
      </Screen>
    </View>
  );
}
