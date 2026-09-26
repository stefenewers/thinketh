// Thinketh design tokens. Derived from the Figma Make prototype (src/index.css)
// and the design spec. Coral is reserved for new / changing knowledge.

export const color = {
  ground: "#F9F7F4",
  panel: "#FFFFFF",
  ink: "#1A1918",
  ink2: "#5F5A55",
  // Darkened from the prototype's #A09A93 to keep metadata at WCAG AA-large.
  ink3: "#857F78",
  edge: "#E4E0D9",
  fog: "#EDE9E3",
  coral: "#C0553A",
  coralTint: "#F5EAE7",
  onInk: "#FFFFFF",
  // Semantic surfaces. Raised = cards and sheets; muted = explanation panels
  // inside a surface; lineSoft = separators inside raised surfaces.
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F3F0EB",
  lineSoft: "#EDE9E3",
  overlay: "rgba(26,25,24,0.22)",
  // White-first home (Today).
  canvas: "#FFFFFF",
  // Neutral hairline for white-on-white surfaces (no beige outline).
  hairline: "rgba(26,25,24,0.07)",
} as const;

// Tile tints (Today "Continue" tiles). Near-neutral; coral stays out.
export const glow = {
  tileNeutral: "#F4F3F1",
  tileCool: "#EDF1F4",
  tileCoolInk: "#3E5B70",
  tileWarm: "#F5F2EE",
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
