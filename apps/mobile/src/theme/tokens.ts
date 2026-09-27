import { Platform } from "react-native";

// Thinketh design tokens: the white, precise, Mindprint-led product system.
// Coral is a signal, reserved for new / changing / active knowledge.

export const color = {
  // White-first, neutral system (the storyboard): white ground, true grays, coral as a signal.
  // The page: a breath warmer than white, so white cards (canvas) lift off it. One ground app-wide.
  ground: "#FBF9F7",
  panel: "#FFFFFF",
  ink: "#161616",
  ink2: "#5C5C59",
  // AA-large on white; neutral rather than warm.
  ink3: "#83837E",
  edge: "#E7E7E4",
  fog: "#F2F2F0",
  coral: "#C0553A",
  coralTint: "#F7ECE8",
  onInk: "#FFFFFF",
  // Semantic surfaces. Raised = cards and sheets; muted = explanation panels
  // inside a surface; lineSoft = separators inside raised surfaces.
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F5F5F3",
  lineSoft: "#EFEFED",
  overlay: "rgba(22,22,22,0.22)",
  canvas: "#FFFFFF",
  // The other Mind in the Playground (you are coral). Restrained, never a theme.
  partner: "#4E7BA6",
  partnerTint: "#E9F0F7",
  // Neutral hairline for white-on-white surfaces.
  hairline: "rgba(22,22,22,0.08)",
} as const;

// Today's warm light: the hero wash, the orb and the lead story's paper. Peach, never neon.
export const warm = {
  wash: "#F6B79C",
  paper: "#FBF3EE",
  orbLight: "#FFE6DA",
  orbMid: "#F7A583",
  orbDeep: "#E8704B",
  orbit: "#E79A7C",
  /** The page itself (same as color.ground). */
  ground: "#FBF9F7",
} as const;

// Tile tints (Today "Continue" tiles): one soft family each, like app icons at rest.
export const glow = {
  tileNeutral: "#FDEEE7",
  tileNeutralInk: "#D8643F",
  tileCool: "#EAF1F8",
  tileCoolInk: "#3F6E99",
  tileWarm: "#FBF1E3",
  tileWarmInk: "#B7742E",
} as const;

// 4-point scale from the design spec; the upper steps are compact for mobile
// (was 24/32/40/48/64), so section rhythm lands at 20-28 and hero pauses at 32-40.
export const space = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 28,
  x3: 32,
  x4: 40,
  x5: 48,
} as const;

// Layout aliases for the compact system.
export const layout = {
  pageX: 20,
  pageTop: space.m,
  sectionGap: 24,
  cardPad: 18,
  rowMin: 48,
  chromeH: 48,
} as const;

export const radius = {
  control: 8,
  surface: 14,
  feature: 20,
  pill: 999,
} as const;

export const font = {
  serif: "PlayfairDisplay_600SemiBold",
  serifRegular: "PlayfairDisplay_400Regular",
  serifItalic: "PlayfairDisplay_400Regular_Italic",
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemibold: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
} as const;

export const motion = {
  tap: 150,
  small: 220,
  screen: 280,
  shared: 380,
  transition: 1400,
} as const;

/**
 * A shadow in native terms. Web gets the equivalent `boxShadow` (react-native-web deprecates
 * shadow* props); native keeps shadow* + elevation so the phone renders exactly as designed.
 */
export function lift(ink: string, opacity: number, blur: number, y: number, elevation: number) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
  return Platform.OS === "web"
    ? { boxShadow: `0px ${y}px ${blur}px rgba(${r}, ${g}, ${b}, ${opacity})` }
    : { shadowColor: ink, shadowOpacity: opacity, shadowRadius: blur, shadowOffset: { width: 0, height: y }, elevation };
}

// Layered surfaces: a hairline border plus this, never a heavy border.
export const shadow = {
  raised: lift(color.ink, 0.05, 12, 3, 2),
  sheet: lift(color.ink, 0.1, 24, -4, 12),
  // Very soft lift for white cards on a white page.
  soft: lift(color.ink, 0.05, 16, 4, 1),
} as const;

// Today's depth tiers: a warm, diffuse shadow felt more than seen. One tier per role.
export const DEPTH_INK = "#2A1C15";
export const depth = {
  /** Level 1: standard raised surfaces (shortcut cards, the insights panel). Very soft, wide. */
  card: lift(DEPTH_INK, 0.08, 24, 8, 2),
  /** Level 2: the one featured surface (the lead story). Wider and a little more present. */
  feature: lift(DEPTH_INK, 0.16, 36, 16, 7),
  /** Level 3: floating circular controls (search, mic, Ask, the lead arrow). Clean and visible. */
  control: lift(DEPTH_INK, 0.14, 14, 5, 5),
} as const;

export const gutter = layout.pageX;

// The inner world's material: the pixel spaces (Mind library, Playground room) share one warm palette.
// Paper walls, soft floors, quiet wood and stone. Coral and blue stay reserved for meaning.
export const pixel = {
  /** One source pixel = 2pt, rendered nearest-neighbour. */
  unit: 2,
  wall: "#FFFFFF",
  trim: "#EEE9E3",
  floor: "#F5F0EA",
  floorLine: "rgba(22,22,22,0.035)",
  woodLight: "#D9C3A5",
  wood: "#BFA17D",
  woodDark: "#8C7155",
  woodDeep: "#5A4838",
  shelfBack: "#F1EADF",
  stone: "#C9C2B8",
  stoneMid: "#A39B90",
  stoneDark: "#6E675F",
  ink: "#3A3531",
  inkDeep: "#25211E",
  paper: "#FBF9F7",
  paperEdge: "#E7DFD3",
} as const;

// The Thinketh identity (docs/BRAND.md). One brand coral for artwork and filled surfaces (icon, splash,
// tile); `color.coral` is its accessible shade for coral text on light grounds.
export const brand = {
  coral: "#D35935",
  ink: "#161616",
  onCoral: "#FFFFFF",
} as const;
