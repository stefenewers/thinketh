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
