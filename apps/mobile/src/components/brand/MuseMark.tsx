// Muse's mark: the looping blue "m". Shown only where Muse (the conductor) acts; the deterministic
// planner and Thinketh keep their own marks. Reconstructed as a vector stroke from the supplied logo
// image (no source file was available); replace MUSE_PATH with a trace of the original when it is.
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { View } from "react-native";

export const MUSE_BLUE = { from: "#2B63EC", to: "#4A92F1" } as const;
/** One continuous cursive stroke; drawn in the VIEWBOX below. */
export const MUSE_PATH = "M64 58 L46 166 L116 60 C122 48 138 50 134 68 L118 166 L188 60 C194 48 210 50 206 68 L194 148 C192 166 210 170 230 150";
const VIEWBOX = [18, 30, 238, 162] as const;

export function MuseMark({ size = 16, label = null }: { size?: number; label?: string | null }) {
  const w = (size * VIEWBOX[2]) / VIEWBOX[3];
  return (
    <View
      style={{ width: w, height: size }}
      accessible={!!label}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label ?? undefined}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
    >
      <Svg width="100%" height="100%" viewBox={VIEWBOX.join(" ")}>
        <Defs>
          <LinearGradient id="muse" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={MUSE_BLUE.from} />
            <Stop offset="1" stopColor={MUSE_BLUE.to} />
          </LinearGradient>
        </Defs>
        <Path d={MUSE_PATH} fill="none" stroke="url(#muse)" strokeWidth={28} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
