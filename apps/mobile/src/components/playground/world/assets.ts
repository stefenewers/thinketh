// The curated Pixel Office subset used by the Playground room, with where each frame came from.
// Frames were inspected (zoomed and pixel-diffed), not assumed:
//   Characters.png is 320×320: five characters, two rows each, 32×32 cells.
//   Even rows (5 frames): an idle loop. Feet stay planted; the body bobs 1px.
//   Odd rows (10 frames): a stepping cycle. The feet alternate and the arms and head bob.
//   Every frame faces three-quarters right. There is no left-facing, talking or handing-over
//   animation, so the room mirrors sprites to face left and conveys teaching through position,
//   facing and the concept object, never a fake gesture.
// Exported with nearest-neighbour scaling ×6 (one source pixel = 2pt at 64pt, exactly 1:1 on @3x).
import type { ImageSourcePropType } from "react-native";

export const SPRITE_SCALE = 6;
/** On-screen points per source pixel. */
export const PT_PER_PX = 2;

export type SpriteStrip = {
  source: ImageSourcePropType;
  /** Frame size in points on screen. */
  frame: number;
  /** Frames in the strip, left to right. */
  frames: number;
  clips: { idle: { start: number; count: number; fps: number }; step: { start: number; count: number; fps: number } };
  /** Where these frames came from in the purchased sheet. */
  provenance: string;
};

const strip = (source: ImageSourcePropType, rows: [number, number]): SpriteStrip => ({
  source,
  frame: 32 * PT_PER_PX,
  frames: 15,
  clips: { idle: { start: 0, count: 5, fps: 5 }, step: { start: 5, count: 10, fps: 12 } },
  provenance: `Pixel_Office_32x32_v1.1/PNG/Characters/Characters.png rows ${rows[0]} (idle, x 0-159) and ${rows[1]} (step, x 0-319), y ${rows[0] * 32}-${rows[1] * 32 + 31}`,
});

export const AGENT_SPRITES = {
  // Stefen (host, coral): the man with glasses and a maroon jacket. Recoloured: deep brown skin, black hair,
  // softer lips (#ffcb92→#7a4a2a, #de9761→#5c3620, #d79466→#5a3520, #ffac7e→#8a5634, #431809→#1c1210, #ce3232→#8c3a2c).
  coral: strip(require("../../../../assets/playground/pixel-office/agent-coral.png"), [2, 3]),
  // Nadani (guest, blue): the woman with dark hair. Recoloured: deep brown skin (#f6ca94→#6f4226, #d59781→#553119,
  // #efb8a7→#7d4b2d), top from pink to Nadani's blue (#f92a82→#4e7ba6, #f374ae→#7fa3c6, #ea4e95→#3e6690),
  // skirt from blue to charcoal (#025fb7→#2b2b2b, #0083df→#3a3a3a, #0076c9→#333333), softer lips (#ce3232→#8c3a2c).
  blue: strip(require("../../../../assets/playground/pixel-office/agent-blue.png"), [4, 5]),
} as const;

export type Prop = { source: ImageSourcePropType; width: number; height: number; provenance: string };
const prop = (source: ImageSourcePropType, w: number, h: number, provenance: string): Prop => ({ source, width: w * PT_PER_PX, height: h * PT_PER_PX, provenance });

export const PROPS = {
  door: prop(require("../../../../assets/playground/pixel-office/door.png"), 53, 47, "Environment/Door List.png x16 y17 53×47 (closed double door)"),
  window: prop(require("../../../../assets/playground/pixel-office/window.png"), 32, 32, "Environment/Environment.png x0 y0 32×32 (window)"),
  plant: prop(require("../../../../assets/playground/pixel-office/plant.png"), 20, 28, "Props/Props.png x294 y196 20×28 (potted plant)"),
} as const;

// Grokbot, the optional visiting challenger: drawn for Thinketh from the provided character design (a black
// ball with two slanted eye marks), in the same strip format as the agents (scripts/pixel/grokbot.mjs).
// Idle: bob, glance, blink. Moving: a small hop with a squash on landing.
export const GROKBOT_SPRITE: SpriteStrip = {
  source: require("../../../../assets/playground/grokbot/grokbot.png"),
  frame: 32 * PT_PER_PX,
  frames: 15,
  clips: { idle: { start: 0, count: 5, fps: 4 }, step: { start: 5, count: 10, fps: 12 } },
  provenance: "Original pixel art (scripts/pixel/grokbot.mjs) from the provided Grokbot design; not from the Pixel Office pack",
};
