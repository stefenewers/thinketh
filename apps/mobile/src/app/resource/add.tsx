import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
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
      const message = e instanceof Error ? e.message : "";
      // The API's own message is written for people (e.g. "Only http and https links can be read.").
      const reason = /->\s*400:\s*(?:url: )?(.+)$/.exec(message)?.[1];
      setError(reason ?? "Thinketh couldn't save that link. Check it and try again.");
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ModalHeader title="Add a resource" onClose={() => router.back()} />
      <Gutter style={{ paddingTop: space.xl }}>
        <T variant="display" accessibilityRole="header" style={{ fontSize: 32, lineHeight: 39 }}>
          Save to learn.
        </T>
        <T variant="support" style={{ marginTop: space.m }}>
          Paste a link to an article, paper or docs page. Thinketh reads it and works out what&apos;s actually new to you.
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
        <T variant="meta" style={{ marginTop: space.l }}>
          Web pages work best. PDFs and pages that need a sign-in can&apos;t be read yet.
        </T>
      </Gutter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: {
    marginTop: space.xxl,
    minHeight: 52,
    paddingHorizontal: space.l,
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: color.edge,
    backgroundColor: color.panel,
    color: color.ink,
    fontFamily: font.sans,
    fontSize: 16,
  },
});
