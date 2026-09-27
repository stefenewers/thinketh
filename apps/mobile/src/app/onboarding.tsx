import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Mark, Wordmark } from "@/components/Logo";
import { SetupHeader, SetupRow, StepProgress } from "@/components/setup/Setup";
import { IconButton, ListCard, SectionHeader } from "@/components/system";
import { T } from "@/components/Text";
import { Button, Gutter, Screen } from "@/components/ui";
import { DEMO_PROFILE, GOALS, INTERESTS, type LearnerProfile, saveProfile, TEACHING, useProfile } from "@/lib/profile";
import { color, space } from "@/theme/tokens";

// First run: three short questions and one promise. It sets the frame
// (what you follow, why, how you learn), never a mastery level.

const STEPS = 4;

export default function Onboarding() {
  const saved = useProfile();
  // Wait for the saved profile: the form seeds its state once, and Skip saves that state.
  if (saved === undefined) return <View style={{ flex: 1, backgroundColor: color.ground }} />;
  // Returning users (Profile -> Edit) start from their answers; first run from the demo defaults.
  return <OnboardingForm start={saved ?? DEMO_PROFILE} />;
}

function OnboardingForm({ start }: { start: LearnerProfile }) {
  const [step, setStep] = useState(0);
  // Storyboard 12: an overview of what Thinketh will ask, before the questions.
  const [intro, setIntro] = useState(true);
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

  const cta = (
    <View style={styles.cta}>
      {intro ? (
        <Button label="Continue" icon="arrow" onPress={() => setIntro(false)} />
      ) : step < STEPS - 1 ? (
        <Button label="Continue" icon="arrow" disabled={!canContinue} onPress={() => setStep((s) => s + 1)} />
      ) : (
        <Button label={building ? "Building your Thinketh…" : "Build my Thinketh"} icon={building ? undefined : "arrow"} loading={building} onPress={finish} />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <Screen background={color.ground} contentStyle={{ flexGrow: 1, paddingBottom: space.x4 }}>
        <Gutter style={{ flexGrow: 1 }}>
          {intro ? (
            <View style={styles.top}>
              <View style={styles.wordmark}>
                <Wordmark height={22} />
              </View>
              {/* Skip keeps the starting frame (your saved answers, or the demo defaults). */}
              <Pressable onPress={building ? undefined : finish} accessibilityRole="button" accessibilityLabel="Skip setup" hitSlop={8} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: space.s }}>
                <T variant="meta" style={{ color: color.ink3 }}>
                  Skip
                </T>
              </Pressable>
            </View>
          ) : (
          <View style={styles.top}>
            {step > 0 && !building ? (
              <IconButton icon="back" accessibilityLabel="Back" onPress={() => setStep((s) => s - 1)} />
            ) : (
              <View style={styles.mark}>
                <Mark size={20} />
              </View>
            )}
            <View style={styles.progressWrap}>
              <StepProgress step={step} total={STEPS} />
              <T variant="meta" style={{ color: color.ink3, fontVariant: ["tabular-nums"] }}>
                {step + 1} of {STEPS}
              </T>
            </View>
          </View>
          )}

          {intro ? (
            <View>
              <SetupHeader title="Let's learn about you" note="This helps Thinketh personalize what it reads for you and how it thinks with you." />
              <ListCard style={styles.list}>
                <SetupRow icon="explore" title="Your interests" subtitle="The fields you want to stay ahead of" onPress={() => { setIntro(false); setStep(0); }} />
                <SetupRow icon="sparkle" title="Your goals" subtitle="What you want to get from Thinketh" onPress={() => { setIntro(false); setStep(1); }} />
                <SetupRow icon="ask" title="How you learn" subtitle="How Thinketh should teach you" onPress={() => { setIntro(false); setStep(2); }} />
                <SetupRow icon="mind" title="What you already know" subtitle="Never asked. Measured from evidence as you use Thinketh." last />
              </ListCard>
            </View>
          ) : step === 0 ? (
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
              <SetupHeader title="Thinketh will learn what you know as you use it." note="Here is the frame it starts from. You can change it any time from your profile." />
              <ListCard style={styles.list}>
                <SetupRow icon="explore" title="Your interests" subtitle={interests.join(", ")} onPress={building ? undefined : () => setStep(0)} accessibilityLabel={`Your interests: ${interests.join(", ")}. Edit`} />
                <SetupRow icon="sparkle" title="Your goals" subtitle={goals.join(", ")} onPress={building ? undefined : () => setStep(1)} accessibilityLabel={`Your goals: ${goals.join(", ")}. Edit`} />
                <SetupRow icon="mind" title="How you learn" subtitle={teaching.join(", ")} onPress={building ? undefined : () => setStep(2)} accessibilityLabel={`How you learn: ${teaching.join(", ")}. Edit`} last />
              </ListCard>

              <SectionHeader title="How it treats what you know" />
              <ListCard>
                <SetupRow icon="info" title="It doesn't assume mastery." subtitle="Every concept starts uncertain. Nothing is marked as understood until you show it." />
                <SetupRow icon="check" title="It updates on evidence." subtitle="Answers, questions and the developments you read move your knowledge state, and each change comes with its reason." />
                <SetupRow icon="person" title="You can correct it." subtitle="Tell it you already knew something, or check your understanding, and it adjusts." last />
              </ListCard>
            </View>
          )}

          <View style={{ flexGrow: 1, minHeight: space.x3 }} />
          {cta}
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
      <SetupHeader title={title} note={note} />
      <ListCard style={styles.list}>
        {options.map((o, i) => (
          <SetupRow key={o.key} title={o.key} subtitle={o.note} checked={selected.includes(o.key)} onPress={() => onToggle(o.key)} last={i === options.length - 1} />
        ))}
      </ListCard>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginLeft: -space.m, marginBottom: space.xxl },
  mark: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  wordmark: { height: 44, justifyContent: "center" },
  progressWrap: { flexDirection: "row", alignItems: "center", gap: space.m },
  list: { marginTop: space.xxl },
  cta: { marginTop: space.l },
});
