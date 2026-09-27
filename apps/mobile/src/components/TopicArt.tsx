// Thinketh's topic art: one small, recognizable pixel object per topic, drawn natively with the same
// pixel grid and palette as the Mind's books (components/mind/world/Book.tsx), so it stays crisp at
// thumbnail size and reads as part of the same pixel world. It replaces decorative photography in lists
// and headers. Always decorative: the text beside it says what the item is. A compact vocabulary:
// checklist (evaluation), connector (tools), drawer (memory, retrieval), document (a source), book (fallback).
import { useState } from "react";
import { PixelRatio, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { brand, pixel } from "@/theme/tokens";

/** One character per source pixel; "." is transparent. Every row of a sprite has the same width. */
const PALETTE: Record<string, string> = {
  K: pixel.ink, // outline
  I: pixel.inkDeep, // book spine
  D: pixel.stoneDark,
  M: pixel.stoneMid,
  S: pixel.stone,
  P: pixel.paper,
  E: pixel.paperEdge,
  C: brand.coral, // the one small accent
};

export type TopicArtKind = "checklist" | "connector" | "drawer" | "document" | "book";

export const SPRITES: Record<TopicArtKind, string[]> = {
  // Evaluators, checking work: a clipboard, the first item ticked (coral), two still open.
  checklist: [
    ".......KKKK.......",
    "......KDDDDK......",
    ".KKKKKDDDDDDKKKKK.",
    ".KMMMKKKKKKKKMMMK.",
    ".KMPPPPPPPPPPPPMK.",
    ".KMPPPPCPPPPPPPMK.",
    ".KMPCPCPDDDDDDPMK.",
    ".KMPPCPPPPPPPPPMK.",
    ".KMPPPPPPPPPPPPMK.",
    ".KMPPPPPPPPPPPPMK.",
    ".KMPKKKPPPPPPPPMK.",
    ".KMPKPKPDDDDDDPMK.",
    ".KMPKKKPPPPPPPPMK.",
    ".KMPPPPPPPPPPPPMK.",
    ".KMPKKKPPPPPPPPMK.",
    ".KMPKPKPDDDDPPPMK.",
    ".KMPKKKPPPPPPPPMK.",
    ".KMPPPPPPPPPPPPMK.",
    ".KMPPPPPPPPPPPPMK.",
    ".KMEEEEEEEEEEEEMK.",
    ".KMMMMMMMMMMMMMMK.",
    ".KKKKKKKKKKKKKKKK.",
  ],
  // Tool use, integrations: a plug with its cable, a coral grip band.
  connector: [
    ".....KKK..KKK.....",
    ".....KSK..KSK.....",
    ".....KSK..KSK.....",
    ".....KSK..KSK.....",
    "...KKKKKKKKKKKK...",
    "...KDDDDDDDDDDK...",
    "...KDMMMMMMMMDK...",
    "...KDDDDDDDDDDK...",
    "...KDDDCCCCDDDK...",
    "...KDDDDDDDDDDK...",
    "...KDDDCCCCDDDK...",
    "...KDDDDDDDDDDK...",
    "....KDDDDDDDDK....",
    ".....KKDDDDKK.....",
    ".......KDDK.......",
    ".......KDDK.......",
    ".......KDDK.......",
    ".......KDDK.......",
    "........KDDK......",
    "........KDDK......",
    ".........KDDK.....",
    ".........KDDK.....",
  ],
  // Memory, retrieval: a small filing drawer, pulled open, a coral-tabbed file inside.
  drawer: [
    "....KKKKKKKKKKK.....",
    "....KPPPPPPPPCK.....",
    "....KPEEEEEEPPK.....",
    "....KPPPPPPPPPK.....",
    ".KKKKKKKKKKKKKKKKKK.",
    ".KMSSSSSSSSSSSSSSMK.",
    ".KKKKKKKKKKKKKKKKKK.",
    ".KSSSSSSSSSSSSSSSSK.",
    ".KSSSSSSSSSSSSSSSSK.",
    ".KSSSSKKKKKKKKSSSSK.",
    ".KSSSSKDDDDDDKSSSSK.",
    ".KSSSSKKKKKKKKSSSSK.",
    ".KSSSSSSSSSSSSSSSSK.",
    ".KMMMMMMMMMMMMMMMMK.",
    ".KKKKKKKKKKKKKKKKKK.",
  ],
  // A source (an article, paper or page you saved): a sheet with a folded corner, one coral line.
  document: [
    "..KKKKKKKKKK......",
    "..KPPPPPPPPKK.....",
    "..KPDDDDDDPKEK....",
    "..KPPPPPPPPKEEK...",
    "..KPPPPPPPPKKKKK..",
    "..KPPPPPPPPPPPPK..",
    "..KPDDDDDDDDDPPK..",
    "..KPPPPPPPPPPPPK..",
    "..KPDDDDDDDDDDPK..",
    "..KPPPPPPPPPPPPK..",
    "..KPDDDDDDDPPPPK..",
    "..KPPPPPPPPPPPPK..",
    "..KPCCCCCPPPPPPK..",
    "..KPPPPPPPPPPPPK..",
    "..KPDDDDDDDDDPPK..",
    "..KPPPPPPPPPPPPK..",
    "..KPDDDDDDDPPPPK..",
    "..KPPPPPPPPPPPPK..",
    "..KPPPPPPPPPPPPK..",
    "..KEEEEEEEEEEEEK..",
    "..KKKKKKKKKKKKKK..",
  ],
  // No clear topic: the Mind's closed book, with a small coral ribbon.
  book: [
    "..KKKKKKKKKKK...",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KIDPPPPPPPDK..",
    "..KIDPEEEEEPDK..",
    "..KIDPPPPPPPDK..",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KIDDDDDDDDDK..",
    "..KKKKKKKKKKKK..",
    "..........KCK...",
    "..........KK....",
  ],
};

/**
 * Stable concept ids -> object. The first development concept that maps wins, so a story is drawn by
 * what it is mainly about. Anything unmapped (including concepts discovery adds) gets the book.
 */
const BY_CONCEPT: Record<string, TopicArtKind> = {
  "evaluator-architectures": "checklist",
  "agent-tool-use": "connector",
  mcp: "connector",
  "model-context-protocol": "connector",
  "agent-memory": "drawer",
  "memory-consolidation": "drawer",
  retrieval: "drawer",
  "retrieval-rag": "drawer",
};

export function topicArtFor(conceptIds: readonly string[], fallback: TopicArtKind = "book"): TopicArtKind {
  for (const id of conceptIds) {
    const kind = BY_CONCEPT[id];
    if (kind) return kind;
  }
  return fallback;
}

/** Horizontal runs of one color become one View, so a sprite is a few dozen views, not hundreds. */
function runs(rows: string[]) {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (ch !== ".") out.push({ x, y, w: end - x, fill: PALETTE[ch]! });
      x = end;
    }
  });
  return out;
}

const RUNS = Object.fromEntries(Object.entries(SPRITES).map(([k, rows]) => [k, runs(rows)])) as Record<TopicArtKind, ReturnType<typeof runs>>;

/**
 * The object for some concepts (or an explicit `kind`), centered on the tile `style` gives it. Hidden from
 * screen readers. `unit` is points per source pixel (2 in 68pt tiles, smaller for smaller tiles); it is
 * snapped to whole device pixels, so every pixel is the same crisp size on any screen.
 */
export function TopicArt({
  conceptIds = [],
  kind: explicit,
  fallback = "book",
  unit = pixel.unit,
  style,
}: {
  conceptIds?: readonly string[];
  kind?: TopicArtKind;
  fallback?: TopicArtKind;
  unit?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const kind = explicit ?? topicArtFor(conceptIds, fallback);
  const rows = SPRITES[kind];
  const u = Math.max(PixelRatio.roundToNearestPixel(unit), 1 / PixelRatio.get());
  const w = rows[0]!.length * u;
  const h = rows.length * u;
  // Centre on whole device pixels (flex centring can land between them, which seams the pixel runs).
  const [tile, setTile] = useState<{ w: number; h: number } | null>(null);
  const snap = PixelRatio.roundToNearestPixel;
  return (
    <View
      style={[styles.tile, style]}
      onLayout={(e) => setTile({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {tile ? (
        <View style={{ position: "absolute", left: snap((tile.w - w) / 2), top: snap((tile.h - h) / 2), width: w, height: h }}>
          {RUNS[kind].map((r, i) => (
            <View key={i} style={{ position: "absolute", left: r.x * u, top: r.y * u, width: r.w * u, height: u, backgroundColor: r.fill }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
