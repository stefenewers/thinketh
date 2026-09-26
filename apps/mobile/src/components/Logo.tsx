import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { color, font } from "@/theme/tokens";
import { T } from "./Text";

// The open-page mark: the charcoal page is what you knew, the coral page is what changed.
export function Mark({ size = 22, mono = false }: { size?: number; mono?: boolean }) {
  return (
    <Svg width={size * (21.1 / 26)} height={size} viewBox="0 0 21.1 26">
      <Path d="M0 6 L9.8 10.5 L9.8 26 L0 21.5 Z" fill={color.ink} />
      <Path d="M11.8 5.5 L21.1 0 L21.1 17.3 L11.8 22.8 Z" fill={mono ? color.ink : color.coral} />
    </Svg>
  );
}

export function Wordmark({ height = 24 }: { height?: number }) {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="Thinketh"
      style={{ flexDirection: "row", alignItems: "flex-end", gap: height * 0.25 }}
    >
      <T
        style={{
          fontFamily: font.sansSemibold,
          fontSize: height,
          lineHeight: height * 1.15,
          letterSpacing: -0.04 * height,
          color: color.ink,
        }}
      >
        thinketh
      </T>
      <View style={{ paddingBottom: height * 0.18 }}>
        <Mark size={height * 0.78} />
      </View>
    </View>
  );
}
