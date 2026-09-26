import type { ImageSourcePropType } from "react-native";

// Bundled texture photography (apps/mobile/assets/imagery; credits in IMAGE_CREDITS.md there).
// Images are texture, not identity: white, gray and charcoal only.
const IMAGES = {
  paper: require("../../assets/imagery/paper-crumpled.jpg"),
  architecture: require("../../assets/imagery/architecture-curve.jpg"),
  lightGeometry: require("../../assets/imagery/light-geometry.jpg"),
  concrete: require("../../assets/imagery/concrete-planes.jpg"),
  leaves: require("../../assets/imagery/leaf-shadows.jpg"),
  window: require("../../assets/imagery/window-light.jpg"),
  fog: require("../../assets/imagery/fog-field.jpg"),
  plaster: require("../../assets/imagery/plaster.jpg"),
  fabric: require("../../assets/imagery/fabric-folds.jpg"),
} satisfies Record<string, ImageSourcePropType>;

// One image per concept area, so the same story always carries the same texture.
const BY_CONCEPT: Record<string, ImageSourcePropType> = {
  "agent-memory": IMAGES.paper,
  "evaluator-architectures": IMAGES.architecture,
  "agent-tool-use": IMAGES.lightGeometry,
  mcp: IMAGES.concrete,
  "model-context-protocol": IMAGES.concrete,
  retrieval: IMAGES.leaves,
  "retrieval-rag": IMAGES.leaves,
  "context-windows": IMAGES.window,
  "memory-consolidation": IMAGES.fog,
  "long-running-agents": IMAGES.fabric,
  "context-compaction": IMAGES.fabric,
};

/** The texture for a development or concept: its first mapped concept, else the default. */
export function imageFor(conceptIds: readonly string[]): ImageSourcePropType {
  for (const id of conceptIds) {
    const image = BY_CONCEPT[id];
    if (image) return image;
  }
  return IMAGES.plaster;
}

// Today's story photography (apps/mobile/assets/today; credits in CREDITS.md there): one warm,
// quiet natural family, so the home screen reads as curated. Other screens keep the textures above.
const STORY = {
  peak: require("../../assets/today/peak-pink.jpg"),
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

const STORY_BY_CONCEPT: Record<string, ImageSourcePropType> = {
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

/** Today's editorial photograph for a development or concept: its first mapped concept, else a pastel sky. */
export function storyImageFor(conceptIds: readonly string[]): ImageSourcePropType {
  for (const id of conceptIds) {
    const image = STORY_BY_CONCEPT[id];
    if (image) return image;
  }
  return STORY.sky;
}
