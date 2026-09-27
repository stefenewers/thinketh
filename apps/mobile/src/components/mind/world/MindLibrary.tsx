// Stefen's personal library: a quiet pixel room where each book is a concept. Draws the MindWorld
// projection; owns no knowledge state. Stefen walks to the book you select (selection, not mastery).
import { useEffect, useState, type ReactNode } from "react";
import { Image, Platform, Pressable, StyleSheet, View, type ImageStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { AGENT_SPRITES, PROPS } from "@/components/playground/world/assets";
import { Character } from "@/components/playground/world/Character";
import { usePaused } from "@/components/playground/world/usePaused";
import { color, font, pixel, space } from "@/theme/tokens";
import { BookCover, BookGlyph } from "./Book";
import { COLS, EVIDENCE_WORDS, ROWS, type Book, type MindWorld } from "./mindWorld";

const pixelated = (Platform.OS === "web" ? { imageRendering: "pixelated" } : {}) as ImageStyle;
const U = pixel.unit;
const POST = U * 3;
const PAD = U * 4;
const GAP = U * 5;
const BOOK_H = 54;
const ROW_GAP = U * 9;
const FLOOR_H = 92;

/** One-time highlights already shown on this device (transition ids). */
const played = new Set<string>();
export const playedHighlights: ReadonlySet<string> = played;

export function libraryGeometry(width: number) {
  const bookW = Math.min(104, Math.floor((width - 2 * space.m - 2 * POST - 2 * PAD - (COLS - 1) * GAP) / COLS));
  const caseW = COLS * bookW + (COLS - 1) * GAP + 2 * PAD + 2 * POST;
  const caseX = Math.round((width - caseW) / 2);
  const caseTop = 14;
  const rowH = BOOK_H + ROW_GAP;
  const caseH = PAD + ROWS * rowH;
  const floorTop = caseTop + caseH;
  const height = floorTop + FLOOR_H;
  const bookX = (col: number) => caseX + POST + PAD + col * (bookW + GAP);
  const bookY = (row: number) => caseTop + PAD + row * rowH;
  return { bookW, caseW, caseX, caseTop, caseH, rowH, floorTop, height, bookX, bookY };
}

export function MindLibrary({ world, width, reduced, onSelect }: { world: MindWorld; width: number; reduced: boolean; onSelect: (conceptId: string | null) => void }) {
  const paused = usePaused();
  const G = libraryGeometry(width);
  // Browsing another bay is camera-like view state; selecting a book shows its bay.
  const [bayView, setBayView] = useState<number | null>(null);
  const bay = bayView ?? world.bay;
  const shown = world.books.filter((b) => b.bay === bay);

  // Spend the one-time highlight once it has rendered, so a return or refetch doesn't replay it.
  const hl = world.highlight?.key;
  useEffect(() => {
    if (hl) played.add(hl);
  }, [hl]);

  // You: resting by the plant, or standing under the selected book (on its bay).
  const at = world.you.at && world.focus?.bay === bay ? world.you.at : null;
  const feetY = G.height - 26;
  const youX = at ? G.bookX(at.col) + G.bookW / 2 : width - 54;

  return (
    <View style={{ width, height: G.height }}>
      <Room G={G} />
      {shown.map((b) => (
        <ShelfBook key={b.conceptId} book={b} x={G.bookX(b.col)} y={G.bookY(b.row)} w={G.bookW} reduced={reduced} onPress={() => {
          setBayView(null);
          onSelect(b.selected ? null : b.conceptId);
        }} />
      ))}
      <Character
        sprite={AGENT_SPRITES.coral}
        to={{ x: youX, y: feetY }}
        facing={at ? "right" : "left"}
        tone={color.coral}
        label="You"
        react={false}
        paused={paused}
        reduced={reduced}
        a11y={`You. ${world.you.activity}.`}
      />
      {world.bays > 1 ? (
        <View style={[styles.bays, { top: G.floorTop + 8 }]}>
          <Pressable onPress={() => setBayView(Math.max(0, bay - 1))} disabled={bay === 0} accessibilityRole="button" accessibilityLabel="Previous shelf" style={[styles.bayBtn, bay === 0 && { opacity: 0.3 }]}>
            <Icon name="back" size={14} color={color.ink} />
          </Pressable>
          <T variant="meta" style={{ color: color.ink2 }}>
            Shelf {bay + 1} of {world.bays}
          </T>
          <Pressable onPress={() => setBayView(Math.min(world.bays - 1, bay + 1))} disabled={bay === world.bays - 1} accessibilityRole="button" accessibilityLabel="Next shelf" style={[styles.bayBtn, bay === world.bays - 1 && { opacity: 0.3 }]}>
            <Icon name="chevron" size={14} color={color.ink} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Room({ G }: { G: ReturnType<typeof libraryGeometry> }) {
  const plantH = PROPS.plant.height;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: G.floorTop, backgroundColor: pixel.wall }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: G.floorTop - U * 2, height: U * 2, backgroundColor: pixel.trim }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: G.floorTop, bottom: 0, backgroundColor: pixel.floor }} />
      {[0.4, 0.75].map((k) => (
        <View key={k} style={{ position: "absolute", left: 0, right: 0, top: G.floorTop + FLOOR_H * k, height: 1, backgroundColor: pixel.floorLine }} />
      ))}
      {/* The bookcase: posts, back panel and one plank under each row, on the 2pt grid. */}
      <View style={{ position: "absolute", left: G.caseX, top: G.caseTop, width: G.caseW, height: G.caseH, backgroundColor: pixel.shelfBack }} />
      <View style={{ position: "absolute", left: G.caseX, top: G.caseTop - U * 2, width: G.caseW, height: U * 3, backgroundColor: pixel.wood }} />
      <View style={{ position: "absolute", left: G.caseX, top: G.caseTop, width: POST, height: G.caseH, backgroundColor: pixel.wood }} />
      <View style={{ position: "absolute", left: G.caseX + G.caseW - POST, top: G.caseTop, width: POST, height: G.caseH, backgroundColor: pixel.wood }} />
      {Array.from({ length: ROWS }, (_, r) => (
        <View key={r} style={{ position: "absolute", left: G.caseX, top: G.bookY(r) + BOOK_H, width: G.caseW }}>
          <View style={{ height: U * 3, backgroundColor: pixel.wood }} />
          <View style={{ height: U, backgroundColor: pixel.woodDark }} />
        </View>
      ))}
      <View style={{ position: "absolute", left: G.caseX + U, top: G.caseTop + G.caseH, width: G.caseW - U * 2, height: U * 3, backgroundColor: "rgba(22,22,22,0.08)", borderRadius: U * 2 }} />
      <Image source={PROPS.plant.source} style={[{ position: "absolute", left: 10, top: G.floorTop + 6, width: PROPS.plant.width, height: plantH }, pixelated]} resizeMode="stretch" />
    </View>
  );
}

function ShelfBook({ book, x, y, w, reduced, onPress }: { book: Book; x: number; y: number; w: number; reduced: boolean; onPress: () => void }) {
  // Selected: pulled forward a little. Highlight: one soft coral ring for a newly verified change.
  const lift = useSharedValue(book.selected ? -U * 3 : 0);
  useEffect(() => {
    const to = book.selected ? -U * 3 : 0;
    lift.set(reduced ? to : withTiming(to, { duration: 220, easing: Easing.out(Easing.quad) }));
  }, [book.selected, reduced, lift]);
  const ring = useSharedValue(0);
  const [glow] = useState(book.highlight);
  useEffect(() => {
    if (!glow || reduced) return;
    ring.set(withSequence(withTiming(1, { duration: 380 }), withDelay(1400, withTiming(0, { duration: 700 }))));
  }, [glow, reduced, ring]);
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.get() }));
  return (
    <Animated.View style={[{ position: "absolute", left: x, top: y }, liftStyle]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: book.selected }} accessibilityLabel={`${book.a11y} ${book.selected ? "Selected." : "Opens its details."}`} hitSlop={4}>
        <BookCover evidence={book.evidence} uncertain={book.uncertain} changed={book.changed} selected={book.selected} title={book.title} width={w} height={BOOK_H} />
        {glow ? <Animated.View style={[styles.ring, { pointerEvents: "none" }, ringStyle]} /> : null}
      </Pressable>
    </Animated.View>
  );
}

/** What the covers mean, in words. */
export function LibraryLegend() {
  const item = (glyph: ReactNode, label: string) => (
    <View style={styles.legendItem} key={label}>
      {glyph}
      <T variant="meta" style={{ color: color.ink2, fontSize: 12 }}>
        {label}
      </T>
    </View>
  );
  return (
    <View style={styles.legend} accessible accessibilityLabel="How to read the books. Darker covers have more evidence. A dotted edge means few signals so far. A coral bookmark means stronger evidence today.">
      {item(<BookGlyph evidence="strong" />, "Strong")}
      {item(<BookGlyph evidence="developing" />, "Developing")}
      {item(<BookGlyph evidence="early" />, "Early")}
      {item(<BookGlyph evidence="early" uncertain />, "Few signals")}
      {item(<BookGlyph evidence="developing" changed="up" />, "Changed today")}
    </View>
  );
}

/** The focused book in words: legible title and every signal it carries. */
export function FocusLabel({ book }: { book: Book | null }) {
  if (!book) {
    return (
      <T variant="meta" style={{ color: color.ink2 }}>
        Each book is a concept in your Mind. Tap one to open it.
      </T>
    );
  }
  const bits = [EVIDENCE_WORDS[book.evidence], book.uncertain ? "few signals so far" : null, book.changed === "up" ? "stronger evidence today" : book.changed === "down" ? "weaker evidence today" : null].filter(Boolean);
  return (
    <View accessibilityLiveRegion="polite">
      <T style={styles.focusName}>{book.name}</T>
      <T variant="meta" style={{ color: book.changed === "up" ? color.coral : color.ink2 }}>
        {bits.join(" · ")}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: "absolute", left: -U * 3, top: -U * 3, right: -U * 3, bottom: -U * 3, borderRadius: U * 3, borderWidth: U, borderColor: color.coral },
  bays: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.s },
  bayBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: space.m, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  focusName: { fontFamily: font.sansSemibold, fontSize: 16, lineHeight: 21, color: color.ink },
});
