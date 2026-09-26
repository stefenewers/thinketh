// Thinketh design tokens: the white, precise, Mindprint-led product system.
// Coral is a signal, reserved for new / changing / active knowledge.

export const color = {
  // White-first, neutral system (the storyboard): white ground, true grays, coral as a signal.
  ground: "#FFFFFF",
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
  // Neutral hairline for white-on-white surfaces.
  hairline: "rgba(22,22,22,0.08)",
} as const;

// Tile tints (Today "Continue" tiles). Near-neutral; coral stays out.
export const glow = {
  tileNeutral: "#F4F4F2",
  tileCool: "#EEF2F5",
  tileCoolInk: "#3E5B70",
  tileWarm: "#F6F3F0",
  tileWarmInk: "#6B5A4E",
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
} as const;

export const motion = {
  tap: 150,
  small: 220,
  screen: 280,
  shared: 380,
  transition: 1400,
} as const;

// Layered surfaces: a hairline border plus this, never a heavy border.
export const shadow = {
  raised: { shadowColor: color.ink, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  sheet: { shadowColor: color.ink, shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  // Very soft lift for white cards on a white page.
  soft: { shadowColor: color.ink, shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
} as const;

export const gutter = layout.pageX;
