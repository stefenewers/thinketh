import { Text as RNText, StyleSheet, type TextProps } from "react-native";
import { color, font } from "@/theme/tokens";

export type Variant =
  | "display"
  | "title"
  | "section"
  | "editorial"
  | "statement"
  | "body"
  | "support"
  | "meta"
  | "label"
  | "metric";

type Props = TextProps & {
  variant?: Variant;
  tone?: keyof typeof color;
};

export function T({ variant = "body", tone, style, ...rest }: Props) {
  return (
    <RNText
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[styles[variant], tone ? { color: color[tone] } : null, style]}
    />
  );
}

const styles = StyleSheet.create({
  // Sans-first: hierarchy comes from size, weight and tracking, not font contrast.
  display: {
    fontFamily: font.sansSemibold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.8,
    color: color.ink,
  },
  title: {
    fontFamily: font.sansSemibold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: color.ink,
  },
  section: {
    fontFamily: font.sansSemibold,
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: -0.2,
    color: color.ink,
  },
  // Serif, rare by design: payoff moments only ("Your Mind", "Knowledge moved.").
  editorial: {
    fontFamily: font.serif,
    fontSize: 31,
    lineHeight: 37,
    letterSpacing: -0.5,
    color: color.ink,
  },
  // The mental-model sentence: the one editorial voice inside explanations.
  statement: {
    fontFamily: font.serifItalic,
    fontSize: 20,
    lineHeight: 28,
    color: color.ink,
  },
  body: {
    fontFamily: font.sans,
    fontSize: 15,
    lineHeight: 23,
    color: color.ink,
  },
  support: {
    fontFamily: font.sans,
    fontSize: 13,
    lineHeight: 19,
    color: color.ink2,
  },
  meta: {
    fontFamily: font.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    color: color.ink2,
  },
  label: {
    fontFamily: font.sansSemibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: color.ink3,
  },
  // Numbers as product metrics: sans, tabular.
  metric: {
    fontFamily: font.sansSemibold,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.6,
    fontVariant: ["tabular-nums"],
    color: color.ink,
  },
});
