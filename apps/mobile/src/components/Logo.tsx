// The Thinketh identity, drawn from vector outlines traced from the approved reference (docs/BRAND.md).
// Use Wordmark where the full name helps recognition; Mark (the compact "th") in constrained places.
import Svg, { Path } from "react-native-svg";
import { View } from "react-native";
import { MARK, WORDMARK, type BrandPath } from "@/components/brand/paths";
import { brand } from "@/theme/tokens";

type Tone = "dark" | "light";
const FILL: Record<Tone, string> = { dark: brand.ink, light: brand.onCoral };

function Artwork({ art, height, tone, label }: { art: BrandPath; height: number; tone: Tone; label: string | null }) {
  const [, , w, h] = art.viewBox;
  return (
    <View
      accessible={!!label}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label ?? undefined}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
      style={{ width: (height * w) / h, height }}
    >
      <Svg width="100%" height="100%" viewBox={art.viewBox.join(" ")}>
        <Path d={art.d} fill={FILL[tone]} fillRule="evenodd" />
      </Svg>
    </View>
  );
}

/** The compact "th" mark. `size` is its height; decorative when a visible "Thinketh" label sits beside it. */
export function Mark({ size = 22, tone = "dark", decorative = false }: { size?: number; tone?: Tone; decorative?: boolean }) {
  return <Artwork art={MARK} height={size} tone={tone} label={decorative ? null : "Thinketh"} />;
}

/** The full "thinketh" wordmark. `height` is the artwork's height (ascender to descender of the letters). */
export function Wordmark({ height = 24, tone = "dark" }: { height?: number; tone?: Tone }) {
  return <Artwork art={WORDMARK} height={height} tone={tone} label="Thinketh" />;
}
