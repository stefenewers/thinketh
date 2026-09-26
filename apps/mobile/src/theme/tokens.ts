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
} as const;

// 4-point scale from the design spec.
export const space = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
  x3: 40,
  x4: 48,
  x5: 64,
} as const;

export const radius = {
  control: 8,
  surface: 14,
  feature: 24,
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

export const gutter = space.xl;
