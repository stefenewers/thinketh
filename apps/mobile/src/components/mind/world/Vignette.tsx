// Small, still previews from the Mind library: a shelf with the featured book, a plant, and Stefen.
// Presentation only: no simulation, no animation loop, no knowledge state. Decorative for screen
// readers; the surrounding card or heading says what it shows.
import { Image, Platform, StyleSheet, View, type ImageStyle } from "react-native";
import { AGENT_SPRITES, PROPS, type SpriteStrip } from "@/components/playground/world/assets";
import { pixel } from "@/theme/tokens";
import { BookCover } from "./Book";
import type { Book } from "./mindWorld";

const pixelated = (Platform.OS === "web" ? { imageRendering: "pixelated" } : {}) as ImageStyle;
const U = pixel.unit;

/** One still frame of a character strip (the first idle frame), optionally mirrored. */
export function SpriteStill({ sprite = AGENT_SPRITES.coral, size = 64, facing = "right" }: { sprite?: SpriteStrip; size?: number; facing?: "left" | "right" }) {
  return (
    <View style={{ width: size, height: size, overflow: "hidden", transform: [{ scaleX: facing === "left" ? -1 : 1 }] }} importantForAccessibility="no-hide-descendants" accessible={false}>
      <Image source={sprite.source} style={[{ width: size * sprite.frames, height: size }, pixelated]} resizeMode="stretch" />
    </View>
  );
}

/**
 * A shelf of up to three books with one featured (pulled forward). With no books (no linked concept)
 * it shows a plain shelf and a neutral book: nothing is claimed.
 */
export function ShelfVignette({
  width,
  height,
  books,
  featuredId,
  stefen = "left",
}: {
  width: number;
  height: number;
  books: Book[];
  featuredId: string | null;
  /** Where Stefen stands, or null for no character. */
  stefen?: "left" | "right" | null;
}) {
  const floorH = Math.round(height * 0.24);
  const floorTop = height - floorH;
  const gap = U * 3;
  const pad = U * 3;
  const sprite = Math.min(64, Math.round(height * 0.44));
  // Width each of n books can have so the whole group fits with margins.
  const room = (n: number) => (width - 40 - (stefen ? sprite + 14 : 0) - 2 * pad - (n - 1) * gap) / n;
  // Narrow scenes keep the featured book and one neighbour, so titles stay readable (never shrunk to fit).
  const fi = books.findIndex((b) => b.conceptId === featuredId);
  const trimmed = books.length === 3 && room(3) < 72 && fi >= 0 ? (fi === 2 ? books.slice(1, 3) : books.slice(fi, fi + 2)) : books;
  const shown = trimmed.length ? trimmed : null;
  const count = shown ? shown.length : 1;
  // Books as large as the scene allows (readable titles), within the group's room.
  const bookW = Math.round(Math.min(96, width * 0.24, ((height - floorH) * 0.72) / 1.15, room(count)));
  const bookH = Math.round(bookW * 1.15);
  const shelfW = count * bookW + (count - 1) * gap + 2 * pad;
  const shelfH = bookH + pad + U * 4;
  const shelfY = floorTop - shelfH - Math.round(height * 0.06);
  // One centred group: [Stefen][shelf][plant] (or mirrored). The plant is left out when there's no room.
  const plantW = PROPS.plant.width;
  const withPlant = sprite + 14 + shelfW + 12 + plantW <= width - 24;
  const groupW = (stefen ? sprite + 14 : 0) + shelfW + (withPlant ? 12 + plantW : 0);
  let x = Math.round((width - groupW) / 2);
  const place: { stefen?: number; shelf: number; plant?: number } = { shelf: 0 };
  const order = stefen === "right" ? ["plant", "shelf", "stefen"] : ["stefen", "shelf", "plant"];
  for (const k of order) {
    if (k === "stefen" && stefen) {
      place.stefen = x;
      x += sprite + 14;
    } else if (k === "shelf") {
      place.shelf = x;
      x += shelfW + 12;
    } else if (k === "plant" && withPlant) {
      place.plant = x;
      x += plantW + 12;
    }
  }
  const shelfX = place.shelf;

  return (
    <View style={{ width, height, overflow: "hidden", backgroundColor: pixel.wall }} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={[styles.floor, { top: floorTop }]} />
      <View style={[styles.trim, { top: floorTop - U * 2 }]} />
      {/* The shelf: back panel, posts, one plank. */}
      <View style={{ position: "absolute", left: shelfX, top: shelfY, width: shelfW, height: shelfH, backgroundColor: pixel.shelfBack }} />
      <View style={{ position: "absolute", left: shelfX, top: shelfY - U * 2, width: shelfW, height: U * 3, backgroundColor: pixel.wood }} />
      <View style={{ position: "absolute", left: shelfX, top: shelfY, width: U * 3, height: shelfH, backgroundColor: pixel.wood }} />
      <View style={{ position: "absolute", left: shelfX + shelfW - U * 3, top: shelfY, width: U * 3, height: shelfH, backgroundColor: pixel.wood }} />
      <View style={{ position: "absolute", left: shelfX, top: shelfY + shelfH - U * 4, width: shelfW }}>
        <View style={{ height: U * 3, backgroundColor: pixel.wood }} />
        <View style={{ height: U, backgroundColor: pixel.woodDark }} />
      </View>
      {(shown ?? [null]).map((b, i) => {
        const featured = !!b && b.conceptId === featuredId;
        return (
          <View key={b?.conceptId ?? "neutral"} style={{ position: "absolute", left: shelfX + pad + i * (bookW + gap), top: shelfY + pad - (featured ? U * 3 : 0) }}>
            <BookCover
              evidence={b?.evidence ?? "early"}
              uncertain={b?.uncertain ?? false}
              changed={b?.changed ?? null}
              selected={featured}
              title={b?.title ?? ""}
              width={bookW}
              height={bookH}
              compact
            />
          </View>
        );
      })}
      {place.plant !== undefined ? (
        <Image source={PROPS.plant.source} style={[{ position: "absolute", left: place.plant, top: floorTop - PROPS.plant.height + 14, width: PROPS.plant.width, height: PROPS.plant.height }, pixelated]} resizeMode="stretch" />
      ) : null}
      {stefen && place.stefen !== undefined ? (
        <View style={{ position: "absolute", left: place.stefen, top: floorTop - sprite + 12 }}>
          <View style={[styles.shadow, { width: sprite * 0.6, left: sprite * 0.2, top: sprite - 6 }]} />
          <SpriteStill size={sprite} facing={stefen === "left" ? "right" : "left"} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  floor: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: pixel.floor },
  trim: { position: "absolute", left: 0, right: 0, height: U * 2, backgroundColor: pixel.trim },
  shadow: { position: "absolute", height: 7, borderRadius: 7, backgroundColor: "rgba(22,22,22,0.10)" },
});
