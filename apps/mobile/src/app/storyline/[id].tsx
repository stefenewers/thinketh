import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { ConceptHistoryResponse, Development, KnowledgeStateTransition } from "@thinketh/contracts";
import { api } from "@/api";
import { T } from "@/components/Text";
import { BackBar, Button, ErrorState, Gutter, LoadingState, Row, Screen, SectionLabel } from "@/components/ui";
import { agentMemoryStoryline as story } from "@/content/demo";
import { useApi } from "@/lib/hooks";
import { evidenceLabel, masteryLabel, misconceptionLabel, shortDate, significanceLabel } from "@/lib/knowledge";
import { color, font, space } from "@/theme/tokens";

// A storyline shows two timelines side by side in meaning: how the world's
// understanding of an idea changed, and how yours did. Thinketh models both.
// One seeded storyline for now (Persistent Agent Memory).

/** Observations worth telling as part of the story (not views or revisits). */
const MILESTONE_KINDS = new Set(["diagnostic_correct", "diagnostic_partial", "diagnostic_incorrect", "misconception_detected", "explained", "already_knew", "got_it"]);

export default function StorylineScreen() {
  const { data, error, loading, reload } = useApi(
    async () => {
      const [today, history, knowledge] = await Promise.all([
        api.getTodayBrief(),
        api.getConceptHistory(story.conceptId),
        api.getKnowledge(),
      ]);
      return { today, history, knowledge };
    },
    [],
    { refetchOnFocus: true },
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.ground }}>
      <BackBar onBack={() => (router.canGoBack() ? router.back() : router.replace("/library"))} />
      {loading && !data ? (
        <LoadingState message="Lining up how this idea changed with how your understanding did…" />
      ) : error || !data ? (
        <ErrorState onRetry={reload} />
      ) : (
        <Storyline
          developments={data.today.developments}
          heroId={data.today.brief.heroDevelopmentId}
          history={data.history}
          priorMastery={data.knowledge.items.find((i) => i.concept.id === story.priorConceptId)?.state.mastery}
          priorName={data.knowledge.items.find((i) => i.concept.id === story.priorConceptId)?.concept.name ?? "Context windows"}
        />
      )}
    </View>
  );
}

function Storyline({
  developments,
  heroId,
  history,
  priorMastery,
  priorName,
}: {
  developments: Development[];
  heroId: string;
  history: ConceptHistoryResponse;
  priorMastery: number | undefined;
  priorName: string;
}) {
  const byId = new Map(developments.map((d) => [d.id, d]));
  const hero = byId.get(heroId);
  const phaseDevs = (p: (typeof story.phases)[number]) => {
    const list = p.developmentIds.map((id) => byId.get(id)).filter((d): d is Development => !!d);
    if (p.current && hero && hero.storylineIds.length > 0) list.push(hero);
    return list;
  };
  const milestones = history.transitions.filter((t) => MILESTONE_KINDS.has(t.observation.kind));
  const corrected = history.transitions.some((t) => t.observation.kind === "diagnostic_correct");
  const { current } = history;

  return (
    <Screen topInset={false} contentStyle={{ paddingTop: space.s }}>
      <Gutter>
        <SectionLabel>Storyline</SectionLabel>
        <T variant="display" accessibilityRole="header">
          {story.title}
        </T>
        <T variant="support" style={{ marginTop: space.s }}>
          {story.subtitle}
        </T>
      </Gutter>

      <Gutter style={{ marginTop: space.x3 }}>
        <T variant="label" style={{ marginBottom: space.l }}>
          How the field&apos;s understanding changed
        </T>
        {story.phases.map((p, i) => {
          const devs = phaseDevs(p);
          return (
            <View key={p.label} style={styles.event}>
              <View style={styles.rail}>
                <View style={[styles.node, p.current && styles.nodeCurrent]} />
                {i < story.phases.length - 1 ? <View style={styles.line} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: space.xxl }}>
                <T variant="label" tone={p.current ? "coral" : undefined}>
                  {p.label}
                  {devs[0] ? ` · ${shortDate(devs[0].happenedAt)}` : ""}
                </T>
                <T variant="body" style={{ fontFamily: font.sansMedium, marginTop: space.xs }}>
                  {p.headline}
                </T>
                <T variant="support" style={{ marginTop: space.xs }}>
                  {p.detail}
                </T>
                {devs.map((d) => (
                  <DevLink key={d.id} d={d} />
                ))}
              </View>
            </View>
          );
        })}
      </Gutter>

      <Gutter style={{ marginTop: space.l }}>
        <T variant="label" style={{ marginBottom: space.l }}>
          How your understanding changed
        </T>
        <Milestone
          when="Before"
          text={
            priorMastery !== undefined && priorMastery >= 0.6
              ? `You already understood ${priorName.toLowerCase()} (${masteryLabel(priorMastery).toLowerCase()}).`
              : `${priorName}: ${priorMastery !== undefined ? masteryLabel(priorMastery).toLowerCase() : "not yet measured"}.`
          }
        />
        {milestones.map((t) => (
          <Milestone key={t.id} when={shortDate(t.createdAt)} text={milestoneText(t)} change={masteryChange(t)} />
        ))}
        <Milestone
          when="Now"
          current
          text={`${history.concept.name}: ${masteryLabel(current.mastery).toLowerCase()}, ${evidenceLabel(current.uncertainty).toLowerCase()}.${
            current.misconceptionFlags.length ? ` Still open: ${current.misconceptionFlags.map(misconceptionLabel).join("; ")}.` : ""
          }`}
          last
        />
      </Gutter>

      <Gutter style={{ marginTop: space.xl }}>
        <T variant="statement" style={{ fontSize: 22, lineHeight: 31 }}>
          {corrected
            ? "The world moved from bigger windows to a memory layer, and so did your model of it."
            : "The world has moved from bigger windows to a memory layer. Your model hasn't caught up yet."}
        </T>
        <View style={{ marginTop: space.xl }}>
          {corrected ? (
            <Button label="See it in your Mind" icon="arrow" onPress={() => router.push({ pathname: "/mind", params: { concept: story.conceptId } })} />
          ) : hero ? (
            <Button
              kind="decisive"
              label="Check my understanding"
              icon="arrow"
              onPress={() => router.push({ pathname: "/diagnostic", params: { developmentId: hero.id, conceptId: story.conceptId } })}
            />
          ) : null}
        </View>
      </Gutter>
    </Screen>
  );
}

function DevLink({ d }: { d: Development }) {
  return (
    <Row onPress={() => router.push({ pathname: "/development/[id]", params: { id: d.id } })} style={styles.devLink}>
      <T variant="meta">
        {significanceLabel(d)} · {d.credibility >= 0.85 ? "high credibility" : d.credibility >= 0.7 ? "credible sources" : "early reports"}
      </T>
      <T variant="body" style={{ color: color.ink }}>
        {d.title}
      </T>
    </Row>
  );
}

function Milestone({ when, text, change, current, last }: { when: string; text: string; change?: string; current?: boolean; last?: boolean }) {
  return (
    <View style={styles.event}>
      <View style={styles.rail}>
        <View style={[styles.node, styles.nodeYou, current && styles.nodeCurrent]} />
        {last ? null : <View style={styles.line} />}
      </View>
      <View style={{ flex: 1, paddingBottom: space.xl }}>
        <T variant="label" tone={current ? "coral" : undefined}>
          {when}
        </T>
        <T variant="body" style={{ marginTop: space.xs }}>
          {text}
        </T>
        {change ? (
          <T variant="meta" style={{ marginTop: 2 }}>
            {change}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** The engine's own reason, told as a sentence about you: "Updated because you missed…" -> "You missed…". */
function milestoneText(t: KnowledgeStateTransition): string {
  const first = t.reason.split(/(?<=\.)\s/)[0] ?? t.reason;
  const told = first.replace(/^Updated because you /i, "You ");
  const cleared = t.before.misconceptionFlags.filter((f) => !t.after.misconceptionFlags.includes(f));
  return cleared.length ? `${told} Misconception corrected: ${cleared.map(misconceptionLabel).join("; ")}.` : told;
}

function masteryChange(t: KnowledgeStateTransition): string | undefined {
  if (Math.abs(t.after.mastery - t.before.mastery) < 0.005) return undefined;
  return t.after.mastery > t.before.mastery ? `Stronger: ${masteryLabel(t.before.mastery).toLowerCase()} → ${masteryLabel(t.after.mastery).toLowerCase()}` : `Weaker: ${masteryLabel(t.before.mastery).toLowerCase()} → ${masteryLabel(t.after.mastery).toLowerCase()}`;
}

const styles = StyleSheet.create({
  event: { flexDirection: "row", gap: space.l },
  rail: { width: 12, alignItems: "center" },
  node: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: color.ink2, backgroundColor: color.ground, marginTop: 4 },
  nodeYou: { borderRadius: 2 },
  nodeCurrent: { backgroundColor: color.coral, borderColor: color.coral },
  line: { flex: 1, width: 1, backgroundColor: color.edge, marginTop: 4 },
  devLink: { paddingHorizontal: 0, marginTop: space.s },
});
