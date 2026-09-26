import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { T } from "@/components/Text";
import { color, font, space } from "@/theme/tokens";

/**
 * The sentence being spoken (large, ink) and the one before it (small, receding).
 * Screen readers get completed sentences only, never every revealed character.
 */
export function LiveCaption({ current, previous, announce, reduceMotion }: { current: string; previous: string; announce: string; reduceMotion: boolean }) {
  return (
    <View style={styles.wrap}>
      {previous ? (
        <Animated.View key={`p-${previous}`} entering={reduceMotion ? undefined : FadeIn.duration(260)}>
          <T style={styles.previous} numberOfLines={2} importantForAccessibility="no" accessibilityElementsHidden>
            {previous}
          </T>
        </Animated.View>
      ) : null}
      {current ? (
        <T style={styles.current} numberOfLines={4} importantForAccessibility="no" accessibilityElementsHidden>
          {current}
        </T>
      ) : null}
      {/* The accessible caption: one polite announcement per finished sentence. */}
      <T style={styles.srOnly} accessibilityLiveRegion="polite">
        {announce}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 120, justifyContent: "flex-end", gap: space.s },
  previous: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: color.ink3 },
  current: { fontFamily: font.sansMedium, fontSize: 21, lineHeight: 29, letterSpacing: -0.3, color: color.ink },
  srOnly: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
