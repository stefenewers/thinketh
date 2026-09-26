import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { goBack } from "@/lib/nav";
import { api } from "@/api";
import { rejectedInputReason } from "@/api/http";
import { T } from "@/components/Text";
import { Button, Gutter, ModalHeader } from "@/components/ui";
import { color, font, radius, space } from "@/theme/tokens";

// Save to learn: one link in, a knowledge delta out.
export default function AddResource() {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = url.trim();
  const looksLikeUrl = /^https?:\/\/\S+\.\S+/i.test(trimmed) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(trimmed);

  const save = async () => {
    if (!looksLikeUrl || saving) return;
    setSaving(true);
    setError(null);
    try {
      const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const r = await api.addResource(withScheme);
      router.replace({ pathname: "/resource/[id]", params: { id: r.id } });
    } catch (e) {
      // The API's own message is written for people (e.g. "Only http and https links can be read.").
      const reason = rejectedInputReason(e);
      setError(reason ? capitalize(reason) : "Thinketh couldn't save that link. Check it and try again.");
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ModalHeader title="Add a resource" onClose={() => goBack("/library")} />
      <Gutter style={{ paddingTop: space.xl }}>
        <T style={styles.kicker}>Save to learn</T>
        <T variant="display" accessibilityRole="header" style={{ fontSize: 26, lineHeight: 32, letterSpacing: -0.7, marginTop: space.s }}>
          What should Thinketh read?
        </T>
        <T variant="support" style={{ marginTop: space.m }}>
          Paste a link to an article, paper, PDF or YouTube video. Thinketh reads it and works out what&apos;s actually new to you.
        </T>
        <TextInput
          value={url}
          onChangeText={(v) => {
            setUrl(v);
            setError(null);
          }}
          placeholder="https://"
          placeholderTextColor={color.ink3}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          keyboardType="url"
          maxLength={2000}
          textContentType="URL"
          returnKeyType="go"
          onSubmitEditing={save}
          editable={!saving}
          accessibilityLabel="Link to read"
          style={styles.input}
        />
        {error ? (
          <T variant="support" style={{ marginTop: space.m, color: color.coral }} accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : null}
        <View style={{ marginTop: space.xl }}>
          <Button label="Read it" icon="arrow" disabled={!looksLikeUrl} loading={saving} onPress={save} />
        </View>
        <T variant="meta" style={{ marginTop: space.l, color: color.ink3, textAlign: "center" }}>
          Videos are read from their transcripts. Pages behind a sign-in can&apos;t be read.
        </T>
      </Gutter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.3, textTransform: "uppercase", color: color.ink3 },
  input: {
    marginTop: space.xxl,
    minHeight: 46,
    paddingHorizontal: space.l,
    borderRadius: radius.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    backgroundColor: color.surfaceMuted,
    color: color.ink,
    fontFamily: font.sans,
    fontSize: 16,
  },
});

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
