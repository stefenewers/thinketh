import { memo } from "react";
import { Pressable, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import type { Resource, VisualIcon } from "@thinketh/contracts";
import { Icon } from "@/components/Icon";
import { PixelIcon } from "@/components/visualization/PixelIcon";
import { LEARN } from "./learnStyles";
import { brand, color, DEPTH_INK, lift, pixel } from "@/theme/tokens";

// Learn's artwork, in the pixel spaces' material (tokens.pixel): paper, warm stone, a softened
// charcoal line (never black) and a touch of brand coral. One pixel = 2pt, like the Mind's books.

const U = pixel.unit;
/** The line colour for Learn's pixel art: charcoal softened toward the page, not ink. */
const LINE = pixel.stoneDark;

type Box = { x: number; y: number; w: number; h: number };

/** A sheet of paper: one-pixel outline with the corners knocked off, so it reads soft, not boxy. */
function Sheet({ box, fill }: { box: Box; fill: string }) {
  const { x, y, w, h } = box;
  return (
    <>
      <Rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} fill={fill} />
      <Rect x={x + 1} y={y} width={w - 2} height={1} fill={LINE} />
      <Rect x={x + 1} y={y + h - 1} width={w - 2} height={1} fill={LINE} />
      <Rect x={x} y={y + 1} width={1} height={h - 2} fill={LINE} />
      <Rect x={x + w - 1} y={y + 1} width={1} height={h - 2} fill={LINE} />
    </>
  );
}

/** A four-armed pixel sparkle. */
function Sparkle({ cx, cy, arm = 2 }: { cx: number; cy: number; arm?: number }) {
  return (
    <>
      <Rect x={cx - arm} y={cy} width={arm * 2 + 1} height={1} fill={brand.coral} />
      <Rect x={cx} y={cy - arm} width={1} height={arm * 2 + 1} fill={brand.coral} />
    </>
  );
}

const W = 38;
const H = 48;

/** Nothing saved yet: two sheets of paper waiting to be read, and a glint of something new. */
export const SourceStackArt = memo(function SourceStackArt({ scale = 1 }: { scale?: number }) {
  const px = U * scale;
  const back: Box = { x: 12, y: 11, w: 21, h: 32 };
  const front: Box = { x: 3, y: 5, w: 22, h: 33 };
  const lines = [10, 14, 18, 22, 26, 30];
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: W * px, height: H * px }}>
      <Svg width={W * px} height={H * px} viewBox={`0 0 ${W} ${H}`}>
        {/* The ground the pages rest on. */}
        <Rect x={7} y={44} width={28} height={1} fill={pixel.paperEdge} />
        <Rect x={10} y={45} width={21} height={1} fill={pixel.trim} />
        <Sheet box={back} fill={pixel.paperEdge} />
        {[17, 21, 25, 29, 33].map((y) => (
          <Rect key={y} x={27} y={y} width={4} height={1} fill={pixel.stoneMid} />
        ))}
        <Sheet box={front} fill={pixel.paper} />
        {lines.map((y, i) => (
          <Rect key={y} x={7} y={y} width={i === lines.length - 1 ? 8 : i % 2 ? 11 : 14} height={1} fill={pixel.stoneMid} />
        ))}
        <Sparkle cx={30} cy={3} />
        <Sparkle cx={35} cy={8} arm={1} />
      </Svg>
    </View>
  );
});

/** Learn's small pixel glyphs use the same softened line as the artwork, not the diagram ink. */
const SOFT_PALETTE = { k: LINE, g: pixel.stoneMid, s: pixel.paperEdge, w: pixel.paper, c: brand.coral, p: "#F2C4AF", b: "#A9B8C7" };

const GLYPH: Record<Resource["sourceType"], VisualIcon> = {
  primary: "document",
  documentation: "book",
  research: "document",
  preprint: "document",
  repository: "database",
  reporting: "document",
  article: "document",
  video: "screen",
  document: "document",
};

/** What kind of source this is, as a small pixel glyph on a paper tile (never a stock photo). */
export function SourceGlyph({ type, size = 44 }: { type: Resource["sourceType"]; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundColor: pixel.floor,
        borderWidth: 0.5,
        borderColor: color.hairline,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <PixelIcon name={GLYPH[type]} size={24} palette={SOFT_PALETTE} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Explore related ideas

/** Why an idea is here, as a picture: the reason decides the glyph, never chance. */
export type IdeaKind = "queue" | "weak" | "builds" | "connects" | "storyline";

const REASON_KIND: Record<string, IdeaKind> = {
  "From your learning queue": "queue",
  "Strengthens a weak area": "weak",
  "Builds on today's learning": "builds",
  "Connects two things you know": "connects",
  "An emerging storyline": "storyline",
};

/** The glyph for a recommendation group; unknown reasons fall back to what the item is. */
export function ideaKind(reason: string, item: { resourceId?: string; storylineId?: string }): IdeaKind {
  return REASON_KIND[reason] ?? (item.resourceId ? "queue" : item.storylineId ? "storyline" : "builds");
}

/** Two rings that share an edge: two things you know, meeting. Same grid as the other glyphs. */
const LINKED = ["............", "............", "............", "............", "...kkkkkk...", "..k..kk..k..", "..k..kk..k..", "..k..kk..k..", "...kkkkkk...", "............", "............", "............"];

function PixelGrid({ rows, size }: { rows: readonly string[]; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      {rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "." ? [] : [<Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={(SOFT_PALETTE as Record<string, string>)[ch] ?? LINE} />])))}
    </Svg>
  );
}

/** Two lobes and their folds, drawn as a line: the part of your Mind that's still weak. */
const BRAIN = ["............", "...kk..kk...", "..k..kk..k..", ".k...kk...k.", ".k.k.kk.k.k.", ".k...kk...k.", ".k.k.kk.k.k.", ".k...kk...k.", "..k..kk..k..", "...kk..kk...", "............", "............"];
/** Three linked ideas: what you learned today and what it reaches. */
const NODES = ["............", ".....kk.....", "....k..k....", ".....kk.....", "....k..k....", "...k....k...", "...k....k...", "..k......k..", ".kk......kk.", "k..kkkkkk..k", ".kk......kk.", "............"];

const IDEA_GRID: Partial<Record<IdeaKind, readonly string[]>> = { weak: BRAIN, builds: NODES, connects: LINKED };
const IDEA_ICON: Record<"queue" | "storyline", VisualIcon> = { queue: "document", storyline: "clock" };

/** An idea's tile: pale peach, a small charcoal pixel glyph, one coral glint of "new". */
export function IdeaGlyph({ kind, size = 54 }: { kind: IdeaKind; size?: number }) {
  const grid = IDEA_GRID[kind];
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: LEARN.peachTile, alignItems: "center", justifyContent: "center" }}>
      {grid ? <PixelGrid rows={grid} size={30} /> : <PixelIcon name={IDEA_ICON[kind as "queue" | "storyline"]} size={30} palette={SOFT_PALETTE} />}
      <View style={{ position: "absolute", top: size * 0.11, right: size * 0.1 }}>
        <Svg width={10} height={10} viewBox="0 0 5 5">
          <Rect x={0} y={2} width={5} height={1} fill={brand.coral} />
          <Rect x={2} y={0} width={1} height={5} fill={brand.coral} />
        </Svg>
      </View>
    </View>
  );
}

/** The soft round back control of Learn's pushed screens: warm surface, charcoal chevron. */
export function CircleBack({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={10}
      style={({ pressed }) => [
        { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F0EB", ...lift(DEPTH_INK, 0.08, 10, 2, 2) },
        pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
      ]}
    >
      <Icon name="back" size={18} color={color.ink} />
    </Pressable>
  );
}
