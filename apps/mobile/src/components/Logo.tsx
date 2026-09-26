import { Image, View } from "react-native";
import { color, font } from "@/theme/tokens";
import { T } from "./Text";

const MARK = require("../../assets/brand/mark.png");

// The Thinketh mark, the same ribbon as the app icon: charcoal (what you knew) meeting coral (what changed).
export function Mark({ size = 22 }: { size?: number; mono?: boolean }) {
  return <Image source={MARK} style={{ width: size * (144 / 121), height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
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
