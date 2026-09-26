import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { closeAll, goBack } from "@/lib/nav";
import { api, API_URL, FALLBACK_TO_MOCK, USE_MOCK_API } from "@/api";
import { adapterStatus, fetchHealth } from "@/api/devtools";
import { T } from "@/components/Text";
import { Button, Divider, Gutter, ModalHeader, Screen, SectionLabel } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { clearChecks } from "@/lib/lastCheck";
import { fmt2 } from "@/lib/knowledge";
import { clearProfile } from "@/lib/profile";
import { color, font, radius, space } from "@/theme/tokens";

// Dev-only demo controls, opened by long-pressing the Thinketh mark on Today.
// Not linked anywhere a judge would tap.
export default function DemoPanel() {
  const health = useApi(() => fetchHealth(), []);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  const reset = async () => {
    setResetting(true);
    setResetResult(null);
    try {
      await api.resetDemo();
      clearChecks();
      const h = await api.getConceptHistory("agent-memory");
      const s = h.current;
      const ok = Math.abs(s.mastery - 0.42) < 0.015 && Math.abs(s.uncertainty - 0.44) < 0.015;
      setResetResult(
        `${ok ? "Ready." : "Check this:"} Agent Memory mastery ${fmt2(s.mastery)}, uncertainty ${fmt2(s.uncertainty)}` +
          (s.misconceptionFlags.length ? `, misconception: ${s.misconceptionFlags.join("; ")}` : ", no misconception flag"),
      );
      health.reload();
    } catch (e) {
      setResetResult(`Reset failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <ModalHeader title="Demo controls (dev only)" onClose={() => goBack()} topInset />
      <Screen topInset={false}>
        <Gutter>
          <SectionLabel>Data source</SectionLabel>
          <T variant="body" style={{ fontFamily: font.sansSemibold }}>
            {USE_MOCK_API ? "Mock (on-device seed data)" : "Real API"}
          </T>
          {!USE_MOCK_API ? (
            <T variant="support" selectable>
              {API_URL} · mock fallback {FALLBACK_TO_MOCK ? "ON" : "OFF"}
            </T>
          ) : null}
          <T variant="support" style={{ marginTop: space.s }}>
            Set with EXPO_PUBLIC_USE_MOCK_API, EXPO_PUBLIC_API_URL and EXPO_PUBLIC_API_FALLBACK_TO_MOCK, then restart Expo with --clear.
          </T>
        </Gutter>

        <Gutter style={{ marginTop: space.xxl }}>
          <SectionLabel>Reset before every run</SectionLabel>
          <Button label="Reset demo" onPress={reset} loading={resetting} />
          {resetResult ? (
            <T variant="support" style={{ marginTop: space.m, color: color.ink }} accessibilityLiveRegion="polite">
              {resetResult}
            </T>
          ) : null}
          <Button
            kind="secondary"
            label="Replay onboarding"
            style={{ marginTop: space.m }}
            onPress={async () => {
              await clearProfile();
              closeAll();
            }}
          />
          <T variant="support" style={{ marginTop: space.s }}>
            Clears the saved learner profile. Today shows onboarding again. Knowledge state is untouched.
          </T>
        </Gutter>

        <View style={{ marginTop: space.xxl }}>
          <Gutter style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <SectionLabel>Sponsor adapters</SectionLabel>
            <Button kind="quiet" label="Refresh" onPress={health.reload} />
          </Gutter>
          <Divider />
          {USE_MOCK_API ? (
            <Gutter style={{ paddingVertical: space.l }}>
              <T variant="support">Mock mode: no backend, so no adapters.</T>
            </Gutter>
          ) : health.loading && !health.data ? (
            <Gutter style={{ paddingVertical: space.l }}>
              <T variant="support">Checking /health…</T>
            </Gutter>
          ) : health.error || !health.data ? (
            <Gutter style={{ paddingVertical: space.l }}>
              <T variant="support">Couldn&apos;t reach {API_URL}/health.</T>
            </Gutter>
          ) : (
            Object.entries(health.data.adapters).map(([name, h]) => {
              const status = adapterStatus(h);
              const live = status.startsWith("LIVE");
              return (
                <View key={name} style={styles.row}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <T variant="body" style={{ fontFamily: font.sansMedium, textTransform: "capitalize" }}>
                      {name}
                    </T>
                    <View style={[styles.badge, live ? styles.badgeLive : status === "DEGRADED" ? styles.badgeWarn : null]}>
                      <T style={[styles.badgeText, live && { color: color.onInk }]}>{status}</T>
                    </View>
                  </View>
                  <T variant="meta" style={{ marginTop: 2 }}>
                    {h.calls} calls · {h.fallbacks} fallbacks
                    {h.lastOkAt ? ` · last ok ${h.lastOkAt.slice(11, 19)}` : ""}
                  </T>
                  {h.lastError ? (
                    <T variant="meta" numberOfLines={3} style={{ marginTop: 2, color: color.coral }}>
                      {h.lastError}
                    </T>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.xl,
    paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.edge,
  },
  badge: { paddingHorizontal: space.s, paddingVertical: 2, borderRadius: radius.control, backgroundColor: color.fog },
  badgeLive: { backgroundColor: color.ink },
  badgeWarn: { backgroundColor: color.coralTint },
  badgeText: { fontFamily: font.sansSemibold, fontSize: 11, letterSpacing: 0.6, color: color.ink2 },
});
