import type { ComponentType } from "react";
import { Image as RNImage, Platform, type ImageSourcePropType, type StyleProp, type ImageStyle } from "react-native";
import { requireOptionalNativeModule } from "expo";

type ExpoImageProps = { source: ImageSourcePropType; style?: StyleProp<ImageStyle>; contentFit?: "cover"; transition?: number; accessible?: boolean };

// expo-image needs its native module, which an older dev build won't have; fall back to
// React Native's Image there so the screen never breaks. Never throws.
let ExpoImage: ComponentType<ExpoImageProps> | null = null;
try {
  if (Platform.OS === "web" || requireOptionalNativeModule("ExpoImage")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ExpoImage = (require("expo-image") as typeof import("expo-image")).Image as unknown as ComponentType<ExpoImageProps>;
  }
} catch {
  ExpoImage = null;
}

/** A decorative photographic texture: cover-fit, soft fade-in, hidden from screen readers. */
export function Texture({ source, style }: { source: ImageSourcePropType; style?: StyleProp<ImageStyle> }) {
  if (ExpoImage) return <ExpoImage source={source} style={style} contentFit="cover" transition={200} accessible={false} />;
  return <RNImage source={source} style={style} resizeMode="cover" accessible={false} />;
}
