import { Image, Platform, StyleSheet, View, type ImageStyle } from "react-native";
import { SpriteStill } from "@/components/mind/world/Vignette";
import { PROPS } from "@/components/playground/world/assets";
import { T } from "@/components/Text";
import { color, font, pixel } from "@/theme/tokens";

// Ask's small quiet workspace: a plant, Stefen, what he offers in a speech bubble, and a corner of
// shelf under a lamp, standing on the pixel world's warm floor. Laid out in a row that flows with
// the width (no fixed coordinates), so the bubble simply wraps more on narrower phones.

const U = pixel.unit;
const pixelated = (Platform.OS === "web" ? { imageRendering: "pixelated" } : {}) as ImageStyle;
const FLOOR = 30;
const SPRITE = 64;

export function AskScene({ line }: { line: string }) {
  return (
    <View style={styles.scene}>
      <View style={styles.floor} />
      <Image source={PROPS.plant.source} style={[{ width: PROPS.plant.width, height: PROPS.plant.height, marginBottom: FLOOR - 10 }, pixelated]} resizeMode="stretch" accessible={false} />
      <View style={{ marginLeft: 10, marginBottom: FLOOR - 16 }}>
        <SpriteStill size={SPRITE} />
      </View>
      <View style={styles.bubbleSlot}>
        <View style={styles.bubble} accessibilityRole="text">
          <T style={styles.bubbleText}>{line}</T>
        </View>
      </View>
      <ShelfCorner />
      <Lamp />
    </View>
  );
}

/** Two books lying flat and two standing: a corner of the library, drawn in the pixel palette. */
function ShelfCorner() {
  const book = (w: number, h: number, fill: string, spine: string) => (
    <View style={{ width: w, height: h, backgroundColor: fill, borderWidth: U / 2, borderColor: pixel.stoneDark, borderLeftWidth: U, borderLeftColor: spine }} />
  );
  return (
    <View style={styles.shelf} accessible={false}>
      <View style={{ justifyContent: "flex-end", gap: 0 }}>
        {book(30, 7, pixel.paperEdge, pixel.woodLight)}
        {book(34, 7, pixel.stone, pixel.stoneMid)}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginLeft: 6, gap: 2 }}>
        {book(8, 38, pixel.stone, pixel.stoneMid)}
        {book(8, 44, pixel.paperEdge, pixel.woodLight)}
      </View>
    </View>
  );
}

/** A small pendant lamp hanging over the shelf. */
function Lamp() {
  return (
    <View style={styles.lamp} accessible={false}>
      <View style={{ width: U, height: 26, backgroundColor: pixel.stoneMid }} />
      <View style={{ width: 22, height: 10, borderTopLeftRadius: 11, borderTopRightRadius: 11, backgroundColor: pixel.stone, borderWidth: U / 2, borderColor: pixel.stoneMid }} />
      <View style={{ width: 8, height: U * 2, backgroundColor: pixel.paperEdge }} />
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { flexDirection: "row", alignItems: "flex-end", minHeight: 150, paddingTop: 10, paddingLeft: 14, paddingRight: 0 },
  // The floor runs edge to edge under the scene, like the Mind library's.
  floor: { position: "absolute", left: 0, right: 0, bottom: 0, height: FLOOR, backgroundColor: pixel.floor, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pixel.paperEdge },
  bubbleSlot: { flex: 1, alignSelf: "stretch", justifyContent: "flex-start", paddingLeft: 12, paddingRight: 8, paddingBottom: FLOOR + 30 },
  bubble: { alignSelf: "flex-start", maxWidth: 240, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(22,22,22,0.05)" },
  bubbleText: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: color.ink2 },
  shelf: { flexDirection: "row", alignItems: "flex-end", marginBottom: FLOOR - 6, marginRight: -2 },
  lamp: { position: "absolute", top: 0, right: 22, alignItems: "center" },
});
