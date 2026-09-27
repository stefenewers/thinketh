// "Challenge this idea": the modest action under a saved takeaway, Grokbot's run while it's in flight,
// and a compact outcome (what changed and why) once it was persisted. Sources and the transcript expand.
// Nothing here is evidence about a person: the copy says so where it matters.
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import type { PlaygroundRoom, TakeawayChallenge } from "@thinketh/contracts";
import { T } from "@/components/Text";
import { Button, Divider } from "@/components/ui";
import { RaisedCard } from "@/components/system";
import { DotTag, ThreadCard } from "../pieces";
import { color, radius, space } from "@/theme/tokens";
import { ENDED, FINDING_LABEL } from "./grokbotState";

type Names = (userId: string) => string;

const said: Record<TakeawayChallenge["messages"][number]["kind"], string> = {
  clarification: "asked",
  clarification_answer: "answered",
  challenge: "challenged",
  no_issue: "found no clear issue",
  insufficient_evidence: "found the evidence too thin",
  defense: "defended it",
  revision: "revised it",
  concession: "couldn't settle it",
  assessment: "weighed the response",
};

export function ChallengePanel({
  room,
  me,
  busy,
  onStart,
  onStop,
}: {
  room: PlaygroundRoom;
  me: string;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const av = room.challengeAvailability;
  const ch = room.challenge && room.challenge.takeawayId === room.exchange?.savedTakeawayId ? room.challenge : undefined;
  if (!av && !ch) return null; // no challenger configured: the action doesn't exist
  const agent: Names = (id) => (id === "grokbot" ? "Grokbot" : id === me ? "Your agent" : `${room.participants.find((p) => p.userId === id)?.displayName ?? "Their"}'s agent`);

  if (!ch || (ch.status !== "running" && ch.status !== "completed" && av?.available)) {
    return (
      <View style={{ marginTop: space.l }}>
        {ch ? (
          <T variant="meta" style={{ color: color.ink3, marginBottom: space.xs }}>
            {ENDED[ch.status]}: {ch.note}
          </T>
        ) : null}
        {av?.available ? (
          <>
            <Button kind="secondary" label="Challenge this idea" loading={busy} onPress={onStart} style={{ alignSelf: "flex-start" }} />
            <T variant="meta" style={{ marginTop: space.xs, color: color.ink3 }}>
              Grokbot, a visiting agent, examines this takeaway and its sources, and raises one challenge if it finds one. It won&apos;t change anyone&apos;s Mind.
            </T>
          </>
        ) : av?.reason ? (
          <T variant="meta" style={{ color: color.ink3 }}>
            {av.reason}
          </T>
        ) : null}
      </View>
    );
  }
  return <ChallengeRun ch={ch} agent={agent} busy={busy} onStop={onStop} />;
}

function ChallengeRun({ ch, agent, busy, onStop }: { ch: TakeawayChallenge; agent: Names; busy: boolean; onStop: () => void }) {
  const [open, setOpen] = useState(false);
  const running = ch.status === "running";
  const visible = open ? ch.messages : ch.messages.slice(-2);
  return (
    <View style={{ marginTop: space.l }}>
      <Divider />
      <DotTag tone={running ? "coral" : "muted"} label="GROKBOT · VISITING CHALLENGER" style={{ marginTop: space.l }} />
      {running ? (
        <View style={styles.pending} accessibilityLiveRegion="polite">
          {ch.pending ? <ActivityIndicator size="small" color={color.ink3} /> : null}
          <T variant="meta" style={{ flex: 1, color: color.ink2 }}>
            {ch.pending ? `${ch.pending.label}…` : "Waiting for the next step"}
          </T>
        </View>
      ) : null}

      {ch.status === "completed" && ch.outcome ? <Outcome ch={ch} agent={agent} /> : null}
      {ch.status !== "running" && ch.status !== "completed" ? (
        <T variant="support" style={{ marginTop: space.s }}>
          {ENDED[ch.status]}. {ch.note}
        </T>
      ) : null}

      {visible.length ? (
        <View style={{ marginTop: space.m, gap: space.s }}>
          {visible.map((m) => (
            <ThreadCard key={m.id} who={`${agent(m.from)} ${m.kind === "challenge" && ch.finding ? `raised ${FINDING_LABEL[ch.finding.kind]}` : said[m.kind]}`} tone={m.from === "grokbot" ? "ink" : "coral"}>
              <T variant="body" style={{ fontSize: 15, lineHeight: 22 }} numberOfLines={open ? undefined : 4}>
                {m.text}
              </T>
              <Refs refs={m.sourceRefs} ch={ch} />
            </ThreadCard>
          ))}
        </View>
      ) : null}

      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.toggle}>
        <T variant="meta" style={{ color: color.ink }}>
          {open ? "Hide sources and transcript" : "Sources and transcript"}
        </T>
      </Pressable>
      {open ? <ChallengeDetails ch={ch} agent={agent} /> : null}

      {running ? <Button kind="secondary" label="Stop Grokbot" loading={busy} onPress={onStop} style={{ alignSelf: "flex-start", marginTop: space.s }} /> : null}
    </View>
  );
}

/** The compact outcome: the state, what changed (or didn't), and why. Shown only once persisted. */
export function Outcome({ ch, agent }: { ch: TakeawayChallenge; agent: Names }) {
  const o = ch.outcome!;
  return (
    <RaisedCard style={{ marginTop: space.m }}>
      <T variant="label">{o.toVersion ? `${o.headline} · version ${o.fromVersion} → ${o.toVersion}` : o.headline}</T>
      <T variant="support" style={{ marginTop: space.xs }}>
        {o.why}
      </T>
      {o.revisedText ? (
        <View style={{ marginTop: space.m, gap: space.s }}>
          <View>
            <T variant="meta" style={{ color: color.ink3 }}>
              Before
            </T>
            <T variant="meta" style={{ color: color.ink3, textDecorationLine: "line-through" }}>
              {ch.takeawayText}
            </T>
          </View>
          <View>
            <T variant="meta" style={{ color: color.ink3 }}>
              Now
            </T>
            <T variant="body" style={{ fontSize: 15, lineHeight: 22 }}>
              {o.revisedText}
            </T>
          </View>
        </View>
      ) : null}
      {o.declinedRevision ? (
        <T variant="meta" style={{ marginTop: space.s, color: color.ink3 }}>
          {agent(ch.defenderId)} offered a revision that wasn&apos;t applied: {o.declinedRevision.reason}
        </T>
      ) : null}
      <T variant="meta" style={{ marginTop: space.s, color: color.ink3 }}>
        Agent activity only: nobody&apos;s understanding changed.
      </T>
    </RaisedCard>
  );
}

/** Everything behind a challenge: the full exchange, Thinketh's checks, every source read, and what ran it. */
export function ChallengeDetails({ ch, agent }: { ch: TakeawayChallenge; agent: Names }) {
  const BY: Record<string, string> = { grok: "Grokbot", muse: "Muse", thinketh: "Thinketh", claude: "Claude", deterministic: "Deterministic check", planner: "Planner" };
  return (
    <View style={{ gap: space.m, marginTop: space.xs }}>
      <View style={{ gap: space.xs }}>
        <T variant="label">Transcript</T>
        {ch.messages.map((m) => (
          <T key={m.id} variant="meta" style={{ color: color.ink2 }}>
            <T variant="meta" style={{ color: color.ink }}>
              {agent(m.from)} {said[m.kind]}
              {m.sourceRefs.length ? ` [${m.sourceRefs.join(", ")}]` : ""}:{" "}
            </T>
            {m.text}
          </T>
        ))}
      </View>
      {ch.checks.length ? (
        <View style={{ gap: space.xs }}>
          <T variant="label">Checked against the cited material</T>
          {ch.checks.map((c) => (
            <T key={`${c.of}-${c.at}`} variant="meta" style={{ color: color.ink2 }}>
              The {c.of}: {c.verdict} ({c.refs.join(", ") || "no passages"}), by {c.checkedBy === "claude" ? "Claude" : "Thinketh's deterministic check"}
              {c.unsupported.length ? `. Not supported: “${c.unsupported.join(" ")}”` : ""}
            </T>
          ))}
        </View>
      ) : null}
      {ch.sources.length ? (
        <View style={{ gap: space.xs }}>
          <T variant="label">Sources</T>
          {ch.sources.map((s) => (
            <Pressable key={s.ref} onPress={s.url ? () => Linking.openURL(s.url!).catch(() => {}) : undefined} disabled={!s.url} accessibilityRole={s.url ? "link" : undefined} style={styles.source}>
              <T variant="meta" style={{ color: color.ink }}>
                {s.ref} · {[s.publisher, s.title].filter(Boolean).join(" · ")}
              </T>
              <T variant="meta" style={{ color: color.ink3 }}>
                {s.kind === "claim" ? "Extracted claim" : s.kind === "summary" ? "Saved summary" : "Earlier agent takeaway"}
                {s.ref.startsWith("C") ? ` · looked up by ${agent(s.retrievedBy)}` : ""}: “{s.text}”
              </T>
            </Pressable>
          ))}
        </View>
      ) : null}
      <T variant="meta" style={{ color: color.ink3 }}>
        Grokbot ran on {ch.challenger.model ?? ch.challenger.configuredModel} (xAI) · {ch.used.grokCalls} calls · {(ch.used.grokMs / 1000).toFixed(1)}s. Replies by Muse; checks by{" "}
        {ch.checks.some((c) => c.checkedBy === "claude") ? "Claude" : "Thinketh"}. {ch.actions.length} recorded actions:
      </T>
      {ch.actions.map((a) => (
        <T key={a.id} variant="meta" style={{ color: color.ink3 }}>
          {BY[a.by] ?? a.by}: {a.summary}
        </T>
      ))}
    </View>
  );
}

function Refs({ refs, ch }: { refs: string[]; ch: TakeawayChallenge }) {
  if (!refs.length) return null;
  return (
    <View style={styles.refs}>
      {refs.map((r) => {
        const s = ch.sources.find((x) => x.ref === r);
        return (
          <View key={r} style={styles.ref} accessibilityLabel={s ? `Source ${r}: ${s.title}` : `Source ${r}`}>
            <T variant="meta" style={{ color: color.ink2 }} numberOfLines={1}>
              {r} · {s ? [s.publisher, s.title].filter(Boolean).join(" · ") : "source"}
            </T>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pending: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.s, minHeight: 32 },
  toggle: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  refs: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space.s },
  ref: { maxWidth: "100%", paddingHorizontal: 8, minHeight: 26, justifyContent: "center", borderRadius: 8, backgroundColor: color.surfaceMuted },
  source: { padding: space.s, borderRadius: radius.surface, backgroundColor: color.surfaceMuted },
});
