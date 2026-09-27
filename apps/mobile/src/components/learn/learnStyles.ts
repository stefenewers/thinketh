import { StyleSheet } from "react-native";
import { color, font } from "@/theme/tokens";

// The Learn surfaces (Learn, Explore related ideas): one quiet system. Hairline, nearly flat cards on
// the warm ground; peach only for icon tiles and soft actions; hierarchy from type and space.

export const LEARN = {
  cardRadius: 18,
  cardBorder: "rgba(22,22,22,0.07)",
  /** Icon tiles: the same quiet neutral tile as every other pixel object in the app (not peach). */
  peachTile: color.surfaceMuted,
  softPill: "#FAE6DD",
  warmCard: "#FDF9F6",
  warmCardBorder: "rgba(192,85,58,0.10)",
} as const;

export const learnStyles = StyleSheet.create({
  pageTitle: { fontFamily: font.sansBold, fontSize: 36, lineHeight: 42, letterSpacing: -1.1, color: color.ink },
  intro: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, letterSpacing: -0.1, color: color.ink2, marginTop: 10 },
  card: { borderRadius: LEARN.cardRadius, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: LEARN.cardBorder, overflow: "hidden" },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  cardTitle: { fontFamily: font.sansSemibold, fontSize: 16, lineHeight: 21, letterSpacing: -0.25, color: color.ink },
  cardBody: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: color.ink2 },
  /** Editorial section label: small caps, tracked, warm gray. */
  eyebrow: { fontFamily: font.sansSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 1.6, textTransform: "uppercase", color: color.ink3 },
});
