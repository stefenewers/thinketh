import { Text as RNText, StyleSheet, type TextProps } from "react-native";
import { color, font } from "@/theme/tokens";

export type Variant =
  | "display"
  | "title"
  | "section"
  | "statement"
  | "body"
  | "support"
  | "meta"
  | "label";

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
  // Serif: hero statements, headlines, mental-model moments.
  display: {
    fontFamily: font.serif,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.6,
    color: color.ink,
  },
  title: {
    fontFamily: font.serif,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: color.ink,
  },
  section: {
    fontFamily: font.serif,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: color.ink,
  },
  statement: {
    fontFamily: font.serifItalic,
    fontSize: 22,
    lineHeight: 31,
    color: color.ink,
  },
  // Sans: everything functional.
  body: {
    fontFamily: font.sans,
    fontSize: 16,
    lineHeight: 25,
    color: color.ink,
  },
  support: {
    fontFamily: font.sans,
    fontSize: 14,
    lineHeight: 21,
    color: color.ink2,
  },
  meta: {
    fontFamily: font.sansMedium,
    fontSize: 13,
    lineHeight: 18,
    color: color.ink2,
  },
  label: {
    fontFamily: font.sansSemibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: color.ink3,
  },
});
