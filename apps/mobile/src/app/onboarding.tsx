import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Icon } from "@/components/Icon";
import { Mark } from "@/components/Logo";
import { T } from "@/components/Text";
import { Button, Gutter, Screen } from "@/components/ui";
import { DEMO_PROFILE, GOALS, INTERESTS, type LearnerProfile, saveProfile, TEACHING, useProfile } from "@/lib/profile";
import { color, font, radius, space } from "@/theme/tokens";

// First run: three short questions and one promise. It sets the frame
// (what you follow, why, how you learn), never a mastery level.

const STEPS = 4;

export default function Onboarding() {
  const saved = useProfile();
  // Returning users (Profile -> Edit) start from their answers; first run from the demo defaults.
  const start = saved ?? DEMO_PROFILE;
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>(start.interests);
  const [goals, setGoals] = useState<string[]>(start.goals);
  const [teaching, setTeaching] = useState<string[]>(start.teaching);
  const [building, setBuilding] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const finish = async () => {
    setBuilding(true);
    const profile: LearnerProfile = { interests, goals, teaching, completedAt: new Date().toISOString() };
    await saveProfile(profile);
    // A brief, honest pause: the next screen is Today, compared against this frame.
    setTimeout(() => (router.canGoBack() ? router.back() : router.replace("/")), 900);
  };

  const canContinue = [interests, goals, teaching][step]?.length !== 0;

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <Screen contentStyle={{ paddingBottom: space.x5 }}>
        <Gutter>
          <View style={styles.top}>
            {step > 0 && !building ? (
              <Pressable onPress={() => setStep((s) => s - 1)} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
                <Icon name="back" size={20} color={color.ink} />
              </Pressable>
            ) : (
              <Mark size={22} />
            )}
            <T variant="meta">
              {step + 1} of {STEPS}
            </T>
          </View>

          {step === 0 ? (
            <Question
              title="What are you trying to stay ahead of?"
              note="Thinketh watches these fields for developments that change what you know."
              options={INTERESTS.map((key) => ({ key }))}
              selected={interests}
              onToggle={(v) => toggle(interests, setInterests, v)}
            />
          ) : step === 1 ? (
            <Question
              title="What are you optimizing for?"
              note="This decides what counts as worth your time."
              options={GOALS.map((key) => ({ key }))}
              selected={goals}
              onToggle={(v) => toggle(goals, setGoals, v)}
            />
          ) : step === 2 ? (
            <Question
              title="How should Thinketh teach you?"
              note="A starting point. Thinketh keeps learning how you learn as you use it."
              options={TEACHING}
              selected={teaching}
              onToggle={(v) => toggle(teaching, setTeaching, v)}
            />
          ) : (
            <View>
              <T variant="display" style={styles.headline} accessibilityRole="header">
                Thinketh will learn what you know as you use it.
              </T>
              <View style={{ marginTop: space.xxl, gap: space.xl }}>
                <Principle title="It doesn't assume mastery.">
                  Every concept starts uncertain. Nothing is marked as understood until you show it.
                </Principle>
                <Principle title="It updates on evidence.">
                  Answers, questions and the developments you read move your knowledge state, and each change comes with its reason.
                </Principle>
                <Principle title="You can correct it.">
                  Tell it you already knew something, or check your understanding, and it adjusts.
                </Principle>
              </View>
              <T variant="support" style={{ marginTop: space.xxl }}>
                Following {interests.join(", ")} · for {goals.join(", ").toLowerCase()} · taught with {teaching.join(", ").toLowerCase()}.
              </T>
            </View>
          )}

          <View style={{ marginTop: space.x3 }}>
            {step < STEPS - 1 ? (
              <Button label="Continue" icon="arrow" disabled={!canContinue} onPress={() => setStep((s) => s + 1)} />
            ) : (
              <Button kind="decisive" label={building ? "Building your Thinketh…" : "Build my Thinketh"} loading={building} onPress={finish} />
            )}
          </View>
        </Gutter>
      </Screen>
    </View>
  );
}

function Question({
  title,
  note,
  options,
  selected,
  onToggle,
}: {
  title: string;
  note: string;
  options: { key: string; note?: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <View>
      <T variant="display" style={styles.headline} accessibilityRole="header">
        {title}
      </T>
      <T variant="support" style={{ marginTop: space.m }}>
        {note}
      </T>
      <View style={{ marginTop: space.xxl, gap: space.s }}>
        {options.map((o) => {
          const on = selected.includes(o.key);
          return (
            <Pressable
              key={o.key}
              onPress={() => onToggle(o.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { opacity: 0.8 }]}
            >
              <View style={{ flex: 1 }}>
                <T variant="body" style={{ fontFamily: font.sansMedium }}>
                  {o.key}
                </T>
                {o.note ? <T variant="support">{o.note}</T> : null}
              </View>
              <View style={[styles.tick, on && styles.tickOn]}>{on ? <Icon name="check" size={14} color={color.onInk} /> : null}</View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Principle({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.principle}>
      <T variant="body" style={{ fontFamily: font.sansMedium }}>
        {title}
      </T>
      <T variant="support" style={{ marginTop: 2 }}>
        {children}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: space.x3 },
  headline: { fontSize: 34, lineHeight: 41 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.l,
    paddingVertical: space.l,
    paddingHorizontal: space.l,
    borderRadius: radius.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.edge,
    backgroundColor: color.panel,
    minHeight: 56,
  },
  optionOn: { borderColor: color.ink, borderWidth: 1 },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: color.edge, alignItems: "center", justifyContent: "center" },
  tickOn: { backgroundColor: color.ink, borderColor: color.ink },
  principle: { borderLeftWidth: 2, borderLeftColor: color.coral, paddingLeft: space.l },
});
