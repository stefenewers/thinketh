import type { ImageSourcePropType } from "react-native";

// One photographic family across the app (apps/mobile/assets/today; credits in CREDITS.md there):
// warm, quiet natural scenes. Each concept always carries the same photograph, so a story, its
// concept and its sources look related wherever they appear.
const STORY = {
  peak: require("../../assets/today/peak-sunset.jpg"),
  dunes: require("../../assets/today/dunes-gold.jpg"),
  forest: require("../../assets/today/forest-mist.jpg"),
  stair: require("../../assets/today/stair-stone.jpg"),
  reservoir: require("../../assets/today/reservoir-low-sun.jpg"),
  ripples: require("../../assets/today/sand-ripples.jpg"),
  sea: require("../../assets/today/sea-long-exposure.jpg"),
  clouds: require("../../assets/today/clouds-pink.jpg"),
  sky: require("../../assets/today/sky-pastel.jpg"),
  horizon: require("../../assets/today/horizon-pastel.jpg"),
} satisfies Record<string, ImageSourcePropType>;

const BY_CONCEPT: Record<string, ImageSourcePropType> = {
  "agent-memory": STORY.peak,
  "evaluator-architectures": STORY.stair,
  "agent-tool-use": STORY.dunes,
  mcp: STORY.ripples,
  "model-context-protocol": STORY.ripples,
  retrieval: STORY.reservoir,
  "retrieval-rag": STORY.reservoir,
  "context-windows": STORY.horizon,
  "memory-consolidation": STORY.forest,
  "long-running-agents": STORY.sea,
  "context-compaction": STORY.clouds,
};

/** The photograph for a development or concept: its first mapped concept, else a pastel sky. */
export function imageFor(conceptIds: readonly string[]): ImageSourcePropType {
  for (const id of conceptIds) {
    const image = BY_CONCEPT[id];
    if (image) return image;
  }
  return STORY.sky;
}

/** Today's name for the same function. */
export const storyImageFor = imageFor;
