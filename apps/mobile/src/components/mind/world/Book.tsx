// The book: Thinketh's motif for a concept in your Mind. Drawn natively on a 2pt pixel grid so it stays
// crisp beside the sprites; titles stay real typography. The same look, small, marks every handoff
// from the outside world into the Mind.
import { StyleSheet, View, type ViewStyle } from "react-native";
import { T } from "@/components/Text";
import { color, font, pixel } from "@/theme/tokens";
import { titleSize, type Evidence } from "./mindWorld";

/** Cover material per evidence level: darker, fuller covers mean more evidence. Never a lock. */
export const COVER: Record<Evidence, { fill: string; spine: string; edge: string; title: string }> = {
  strong: { fill: pixel.ink, spine: pixel.inkDeep, edge: pixel.inkDeep, title: pixel.paper },
  solid: { fill: pixel.stoneDark, spine: pixel.ink, edge: pixel.ink, title: pixel.paper },
  developing: { fill: pixel.paperEdge, spine: pixel.woodLight, edge: pixel.stoneMid, title: color.ink },
  early: { fill: pixel.paper, spine: pixel.paperEdge, edge: pixel.stoneMid, title: color.ink2 },
};

const U = pixel.unit;


export function BookCover({
  evidence,
  uncertain,
  changed,
  selected,
  title,
  width,
  height,
  compact = false,
}: {
  /** Small preview covers: tighter padding so the title keeps its size. */
  compact?: boolean;
  evidence: Evidence;
  uncertain: boolean;
  changed: "up" | "down" | null;
  selected: boolean;
  title: string;
  width: number;
  height: number;
}) {
  const c = COVER[evidence];
  return (
    <View style={{ width, height }}>
      <View
        style={[
          styles.cover,
          compact && { paddingLeft: U * 4, paddingRight: U * 3 },
          {
            width,
            height,
            backgroundColor: c.fill,
            borderColor: selected ? color.ink : c.edge,
            borderWidth: selected ? U * 1.5 : U,
            // Few signals: a dotted edge, its own meaning (not "locked", not "weak").
            borderStyle: uncertain ? "dashed" : "solid",
          },
        ]}
      >
        {/* A book lying on the shelf, spine out: the page block on top, a band near each end. */}
        <View style={[styles.pages, { borderBottomColor: c.edge }]}>
          <View style={styles.pageLine} />
          <View style={[styles.pageLine, { top: U * 2.5 }]} />
        </View>
        <View style={[styles.band, { left: U * 3, backgroundColor: c.spine }]} />
        <View style={[styles.band, { right: U * 3, backgroundColor: c.spine }]} />
        <T style={[styles.title, { color: c.title, fontSize: titleSize(title, width, compact ? 22 : 30), lineHeight: titleSize(title, width, compact ? 22 : 30) + 3 }]} numberOfLines={3}>
          {title}
        </T>
      </View>
      {changed ? <View style={[styles.ribbon, { backgroundColor: changed === "up" ? color.coral : pixel.stoneMid }]} /> : null}
    </View>
  );
}

/** The small book: legend swatches and the handoff motif on other screens. */
export function BookGlyph({ evidence = "developing", uncertain = false, changed = null, size = 14, style }: { evidence?: Evidence; uncertain?: boolean; changed?: "up" | "down" | null; size?: number; style?: ViewStyle }) {
  const c = COVER[evidence];
  const w = Math.round(size * 0.78);
  return (
    <View style={[{ width: w + 2, height: size }, style]} accessible={false}>
      <View style={{ width: w, height: size, backgroundColor: c.fill, borderColor: c.edge, borderWidth: 1.5, borderStyle: uncertain ? "dashed" : "solid", borderRadius: 1 }}>
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2.5, backgroundColor: c.spine }} />
      </View>
      {changed ? <View style={{ position: "absolute", right: 2, top: -2, width: 3, height: 7, backgroundColor: changed === "up" ? color.coral : pixel.stoneMid }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: U, paddingLeft: U * 6, paddingRight: U * 5, paddingTop: U * 4, justifyContent: "center", overflow: "hidden" },
  pages: { position: "absolute", left: 0, right: 0, top: 0, height: U * 5, backgroundColor: pixel.paper, borderBottomWidth: U / 2 },
  pageLine: { position: "absolute", left: U * 2, right: U * 2, top: U, height: 1, backgroundColor: pixel.paperEdge },
  band: { position: "absolute", top: U * 5, bottom: 0, width: U * 1.5 },
  title: { fontFamily: font.sansSemibold, fontSize: 11.5, lineHeight: 14 },
  ribbon: { position: "absolute", right: U * 5, top: -U * 2, width: U * 3, height: U * 9 },
});
