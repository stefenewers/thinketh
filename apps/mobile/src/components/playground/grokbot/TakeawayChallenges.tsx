// On a takeaway's library entry: its version history (the original stays readable) and every challenge
// that settled on it, each with its outcome and, on request, its full transcript and sources.
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { AgentTakeaway } from "@thinketh/contracts";
import { T } from "@/components/Text";
import { color, space } from "@/theme/tokens";
import { ChallengeDetails, Outcome } from "./ChallengePanel";

export function TakeawayChallenges({ takeaway, me }: { takeaway: AgentTakeaway; me: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const history = takeaway.history ?? [];
  const challenges = takeaway.challenges ?? [];
  if (!history.length && !challenges.length) return null;
  const agent = (id: string) => (id === "grokbot" ? "Grokbot" : id === me || id === takeaway.ownerId ? "Your agent" : `${takeaway.fromName}'s agent`);
  return (
    <View style={{ marginTop: space.xl }}>
      {history.length > 1 ? (
        <View style={{ gap: space.s }}>
          <T variant="label">Versions</T>
          {history.map((h) => (
            <View key={h.version}>
              <T variant="meta" style={{ color: color.ink3 }}>
                v{h.version} · {h.by === "exchange" ? "the original, from the exchange" : `after a challenge${h.reason ? `: ${h.reason}` : ""}`} · {new Date(h.at).toLocaleDateString()}
              </T>
              <T variant="support" style={{ marginTop: 2, color: h.version === (takeaway.version ?? 1) ? color.ink : color.ink3 }}>
                {h.text}
              </T>
            </View>
          ))}
        </View>
      ) : null}
      {challenges.length ? (
        <View style={{ marginTop: history.length > 1 ? space.xl : 0 }}>
          <T variant="label">Challenged by Grokbot</T>
          {challenges.map((c) => (
            <View key={c.id}>
              <Outcome ch={c} agent={agent} />
              <Pressable onPress={() => setOpen(open === c.id ? null : c.id)} accessibilityRole="button" accessibilityState={{ expanded: open === c.id }} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
                <T variant="meta" style={{ color: color.ink }}>
                  {open === c.id ? "Hide sources and transcript" : "Sources and transcript"}
                </T>
              </Pressable>
              {open === c.id ? <ChallengeDetails ch={c} agent={agent} /> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
