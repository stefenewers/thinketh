import { useState } from "react";
import { Image, Platform, ScrollView, useWindowDimensions, View, type ImageStyle } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { AgentTakeaway, PlaygroundRoom } from "@thinketh/contracts";
import { DEMO_CONTROLS } from "@/lib/devFlags";
import { T } from "@/components/Text";
import { Gutter } from "@/components/ui";
import { ChallengePanel } from "@/components/playground/grokbot/ChallengePanel";
import { GrokbotLayer } from "@/components/playground/grokbot/GrokbotLayer";
import { projectGrokbot } from "@/components/playground/grokbot/grokbotState";
import { TakeawayChallenges } from "@/components/playground/grokbot/TakeawayChallenges";
import { AGENT_SPRITES, PROPS } from "@/components/playground/world/assets";
import { Character } from "@/components/playground/world/Character";
import { sceneLayout } from "@/components/playground/world/layout";
import { PLACES } from "@/components/playground/world/worldState";
import { color, pixel, space } from "@/theme/tokens";

// Dev-only: Grokbot's pieces rendered with rooms captured from a live run (Muse agents, Claude checks,
// Grokbot on xAI), for review before they're mounted in the Playground screen. Not linked anywhere.
// /grokbot-preview?beat=arrived|challenged|revised|no_issue|library
const live = require("@/components/playground/grokbot/fixtures/challenge-rooms.json") as Record<string, PlaygroundRoom | AgentTakeaway>;

const BEATS = {
  arrived: "overbroad_started",
  challenged: "overbroad_challenged",
  revised: "overbroad_done",
  no_issue: "own_done",
  library: "overbroad_takeaway",
} as const;

const pixelated = (Platform.OS === "web" ? { imageRendering: "pixelated" } : {}) as ImageStyle;
const ME = "demo-user";

export default function GrokbotPreview() {
  if (!DEMO_CONTROLS) return <Redirect href="/" />;
  return <Preview />;
}

function Preview() {
  const { beat = "challenged" } = useLocalSearchParams<{ beat?: keyof typeof BEATS }>();
  const { width } = useWindowDimensions();
  const [, force] = useState(0);
  if (beat === "library") {
    const t = live[BEATS.library] as AgentTakeaway;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: color.ground }}>
        <Gutter>
          <T variant="label" style={{ marginTop: space.xl }}>
            {t.conceptName} · retained by your agent · v{t.version ?? 1}
          </T>
          <T variant="title" style={{ marginTop: space.s }}>
            {t.text}
          </T>
          <TakeawayChallenges takeaway={t} me={ME} />
          <View style={{ height: 60 }} />
        </Gutter>
      </ScrollView>
    );
  }
  const room = live[BEATS[beat]] as PlaygroundRoom;
  const view = projectGrokbot(room);
  const H = 300;
  const L = sceneLayout(width, H);
  const ex = room.exchange!;
  const spots = { [ex.teacherId]: { x: 0.28, y: 0.62 }, [ex.learnerId]: { x: 0.72, y: 0.62 } };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.ground }}>
      <View style={{ width, height: H, overflow: "hidden", backgroundColor: pixel.floor }}>
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: L.wallH, backgroundColor: pixel.wall, borderBottomWidth: 3, borderBottomColor: pixel.trim }} />
        <Image source={PROPS.window.source} style={[{ position: "absolute", left: width * 0.14, top: 10, width: 56, height: 56 }, pixelated]} resizeMode="stretch" />
        <Image source={PROPS.door.source} style={[{ position: "absolute", left: L.at(PLACES.door).x - 53, top: L.wallH - 94, width: 106, height: 94 }, pixelated]} resizeMode="stretch" />
        {room.participants.map((p) => (
          <Character
            key={p.userId}
            sprite={p.userId === room.hostId ? AGENT_SPRITES.coral : AGENT_SPRITES.blue}
            to={L.at(spots[p.userId] ?? PLACES.hostHome)}
            facing={p.userId === ex.teacherId ? "right" : "left"}
            tone={p.userId === room.hostId ? color.coral : color.partner}
            label={p.userId === ME ? "You" : p.displayName}
            react={false}
            paused={false}
            reduced={false}
            a11y={p.displayName}
          />
        ))}
        <GrokbotLayer view={view} layout={L} defenderAt={spots[room.challenge!.defenderId]} width={width} paused={false} reduced={false} />
      </View>
      <Gutter>
        <T variant="meta" style={{ marginTop: space.m, color: color.ink3 }}>
          {view.status}
        </T>
        <ChallengePanel room={room} me={ME} busy={false} onStart={() => force((n) => n + 1)} onStop={() => force((n) => n + 1)} />
        <View style={{ height: 60 }} />
      </Gutter>
    </ScrollView>
  );
}

