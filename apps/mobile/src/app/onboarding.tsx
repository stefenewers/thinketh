import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Mark, Wordmark } from "@/components/Logo";
import { SetupHeader, SetupRow, StepProgress } from "@/components/setup/Setup";
import { IconButton, ListCard, SectionHeader } from "@/components/system";
import { T } from "@/components/Text";
import { Button, Gutter, Screen } from "@/components/ui";
import { DEMO_PROFILE, GOALS, INTERESTS, legacyProfile, type LearnerProfile, saveProfile, TEACHING, useProfile } from "@/lib/profile";
import { currentMode } from "@/lib/session";
import { color, font, radius, space } from "@/theme/tokens";

// First run: three short questions and one promise. It sets the frame
// (what you follow, why, how you learn), never a mastery level.

const STEPS = 4;

/** Your own Mind starts with nothing chosen: the demo persona's answers are the demo's, not yours. */
const EMPTY_PROFILE: LearnerProfile = { interests: [], goals: [], teaching: [], completedAt: null };

export default function Onboarding() {
  const saved = useProfile();
  const personal = currentMode() === "personal";
  // Answers saved on this phone before profiles moved to the server: offered, never uploaded unasked.
  const [legacy, setLegacy] = useState<LearnerProfile | null | undefined>(personal ? undefined : null);
  useEffect(() => {
    if (personal) legacyProfile().then(setLegacy, () => setLegacy(null));
  }, [personal]);
  // Wait for the saved profile: the form seeds its state once, and Skip saves that state.
  if (saved === undefined || legacy === undefined) return <View style={{ flex: 1, backgroundColor: color.ground }} />;
  // Returning users (Profile -> Edit) start from their answers; the demo from its defaults.
  const start = saved ?? (personal ? (legacy ?? EMPTY_PROFILE) : DEMO_PROFILE);
  return <OnboardingForm start={start} personal={personal} fromDevice={!saved && !!legacy} />;
}

function OnboardingForm({ start, personal, fromDevice }: { start: LearnerProfile; personal: boolean; fromDevice: boolean }) {
  const [step, setStep] = useState(0);
  // Storyboard 12: an overview of what Thinketh will ask, before the questions.
  const [intro, setIntro] = useState(true);
  const [interests, setInterests] = useState<string[]>(start.interests);
  const [goals, setGoals] = useState<string[]>(start.goals);
  const [teaching, setTeaching] = useState<string[]>(start.teaching);
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState(start.displayName ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const finish = async () => {
    setBuilding(true);
    setSaveError(null);
    const profile: LearnerProfile = { interests, goals, teaching, completedAt: start.completedAt ?? new Date().toISOString(), ...(personal ? { displayName: name.trim() || "You" } : {}) };
    try {
      await saveProfile(profile);
    } catch (e) {
      // Nothing was saved: say so, and keep the answers on screen.
      setBuilding(false);
      setSaveError(e instanceof Error ? e.message : "Couldn't save your profile. Try again.");
      return;
    }
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
              {fromDevice ? (
                <T variant="support" style={{ marginTop: space.m }}>
                  Your earlier answers from this phone are filled in. They're saved to your account only when you finish.
                </T>
              ) : null}
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
              {personal ? (
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="What should Thinketh call you?"
                  placeholderTextColor={color.ink3}
                  maxLength={40}
                  autoCapitalize="words"
                  accessibilityLabel="Your name"
                  style={styles.name}
                />
              ) : null}
              <ListCard style={styles.list}>
                <SetupRow icon="explore" title="Your interests" subtitle={interests.join(", ")} onPress={building ? undefined : () => setStep(0)} accessibilityLabel={`Your interests: ${interests.join(", ")}. Edit`} />
                <SetupRow icon="sparkle" title="Your goals" subtitle={goals.join(", ")} onPress={building ? undefined : () => setStep(1)} accessibilityLabel={`Your goals: ${goals.join(", ")}. Edit`} />
                <SetupRow icon="mind" title="How you learn" subtitle={teaching.join(", ")} onPress={building ? undefined : () => setStep(2)} accessibilityLabel={`How you learn: ${teaching.join(", ")}. Edit`} last />
              </ListCard>

              <SectionHeader title="How it treats what you know" />
              <ListCard>
                <SetupRow icon="info" title="It doesn't assume mastery." subtitle="Every concept starts uncertain. Choosing an interest isn't evidence that you know it." />
                <SetupRow icon="check" title="It distinguishes what you report from what you demonstrate." subtitle="Saying you got it moves your knowledge state a little, within a cap. A check provides stronger evidence. Each change comes with its reason." />
                <SetupRow icon="person" title="You can correct it." subtitle="Tell it you already knew something, or check your understanding, and it adjusts." last />
              </ListCard>
            </View>
          )}

          <View style={{ flexGrow: 1, minHeight: space.x3 }} />
          {saveError ? (
            <T variant="support" style={{ color: color.ink }} accessibilityLiveRegion="polite">
              {saveError}
            </T>
          ) : null}
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
  name: {
    marginTop: space.xl,
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
