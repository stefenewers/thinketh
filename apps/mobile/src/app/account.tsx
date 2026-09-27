import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Wordmark } from "@/components/Logo";
import { SetupHeader } from "@/components/setup/Setup";
import { T } from "@/components/Text";
import { Button, Gutter, Screen } from "@/components/ui";
import { resetProfileCache } from "@/lib/profile";
import { AuthError, setMode, signIn, signUp } from "@/lib/session";
import { color, font, radius, space } from "@/theme/tokens";

// Your own Mind needs to know it's you: the server only trusts a verified session. Shown when this
// build uses personal mode and the project doesn't allow anonymous sessions.
export default function AccountScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "in" | "up">(null);
  const [message, setMessage] = useState<string | null>(null);

  const done = () => {
    resetProfileCache();
    router.replace("/");
  };

  const run = async (kind: "in" | "up") => {
    setBusy(kind);
    setMessage(null);
    try {
      if (kind === "in") {
        await signIn(email, password);
        done();
      } else if ((await signUp(email, password)) === "confirm") {
        setMessage("Check your email to confirm your address, then sign in here.");
      } else {
        done();
      }
    } catch (e) {
      setMessage(e instanceof AuthError ? e.message : "Couldn't reach the sign-in service. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const ready = /\S+@\S+\.\S+/.test(email) && password.length >= 6;
  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <Screen background={color.ground} contentStyle={{ flexGrow: 1, paddingBottom: space.x4 }}>
        <Gutter style={{ flexGrow: 1 }}>
          <View style={styles.top}>
            <Wordmark height={22} />
          </View>
          <SetupHeader title="Your own Mind" note="Sign in so your preferences, saved sources and knowledge state are yours, on any device." />
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={color.ink3} autoCapitalize="none" autoComplete="email" keyboardType="email-address" accessibilityLabel="Email" style={[styles.input, { marginTop: space.xxl }]} />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password (6+ characters)" placeholderTextColor={color.ink3} secureTextEntry autoComplete="password" accessibilityLabel="Password" style={[styles.input, { marginTop: space.m }]} />
          {message ? (
            <T variant="support" style={{ marginTop: space.m, color: color.ink }} accessibilityLiveRegion="polite">
              {message}
            </T>
          ) : null}
          <Button label="Sign in" icon="arrow" loading={busy === "in"} disabled={!ready || !!busy} onPress={() => run("in")} style={{ marginTop: space.xl }} />
          <Button kind="secondary" label="Create an account" loading={busy === "up"} disabled={!ready || !!busy} onPress={() => run("up")} style={{ marginTop: space.m }} />
          <View style={{ flexGrow: 1, minHeight: space.x3 }} />
          <Button
            kind="quiet"
            label="Explore the demo instead"
            onPress={async () => {
              await setMode("demo");
              done();
            }}
          />
          <T variant="meta" style={{ color: color.ink3, marginTop: space.xs }}>
            The demo is a seeded learner, Stefen. Nothing you do there is saved as yours.
          </T>
        </Gutter>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { minHeight: 44, justifyContent: "center", marginBottom: space.xxl },
  input: {
    minHeight: 52,
    paddingHorizontal: space.l,
    borderRadius: radius.surface,
    backgroundColor: color.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
    fontFamily: font.sans,
    fontSize: 16,
    color: color.ink,
  },
});
