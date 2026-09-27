// The top of Catch me up: the concept being explained, a small reading scene from your Mind, and the
// concepts linked to it. Presentation only: listening or viewing a book never changes knowledge state.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import type { KnowledgeResponse } from "@thinketh/contracts";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { T } from "@/components/Text";
import { Button } from "@/components/ui";
import { BookGlyph } from "@/components/mind/world/Book";
import { EVIDENCE_WORDS, projectMindWorld, relatedConcepts, shelfNeighbours } from "@/components/mind/world/mindWorld";
import { ShelfVignette } from "@/components/mind/world/Vignette";
import { color, font, gutter, space } from "@/theme/tokens";

const NO_HIGHLIGHTS: ReadonlySet<string> = new Set();

export function CatchUpScene({
  knowledge,
  conceptId,
  fallbackTitle,
  status,
  live,
  onOpenInMind,
}: {
  knowledge: KnowledgeResponse | null;
  /** The concept being explained (from the briefing, or the one the words just named). */
  conceptId: string | null;
  /** The briefing's topic when no concept is linked: shown as text, never as an invented book. */
  fallbackTitle?: string | null;
  status?: React.ReactNode;
  /** A live call is running: opening the Mind ends it, and the sheet says so. */
  live: boolean;
  onOpenInMind: (conceptId: string) => void;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const [sheetId, setSheetId] = useState<string | null>(null);
  // Every play (projectMindWorld) sees highlights as spent: previews never celebrate.
  const world = knowledge ? projectMindWorld(knowledge, { selectedId: conceptId, played: NO_HIGHLIGHTS }) : null;
  const item = knowledge && conceptId ? knowledge.items.find((i) => i.concept.id === conceptId) : undefined;
  const shelf = world ? shelfNeighbours(world, item ? conceptId : null) : { books: [], featured: null };
  const related = knowledge && item ? relatedConcepts(knowledge, item.concept.id) : [];
  const title = item?.concept.name ?? fallbackTitle ?? "Your catch-up";
  // The scene yields to the transcript and controls: smaller on short screens and at large text sizes.
  const sceneH = Math.round(Math.max(110, Math.min(190, height * 0.25) / (fontScale > 1.2 ? 1.35 : 1)));

  return (
    <View>
      <View style={styles.headRow}>
        <T variant="label" style={{ color: color.ink3, flex: 1 }}>
          Now exploring
        </T>
        {status}
      </View>
      <T style={styles.title} accessibilityRole="header" numberOfLines={3}>
        {title}
      </T>

      <View style={[styles.scene, { marginHorizontal: -gutter }]}>
        <ShelfVignette width={width} height={sceneH} books={shelf.books} featuredId={shelf.featured?.conceptId ?? null} stefen="right" />
      </View>

      {item ? (
        <View style={styles.mind}>
          <View style={styles.mindHead}>
            <T style={styles.mindTitle}>In your Mind</T>
            <Pressable onPress={() => setSheetId(item.concept.id)} accessibilityRole="button" accessibilityLabel={`View the ${item.concept.name} book`} hitSlop={8} style={styles.viewBook}>
              <T style={styles.viewBookText}>View book</T>
              <Icon name="arrow" size={13} color={color.ink} />
            </Pressable>
          </View>
          {related.length ? (
            <View style={styles.chips}>
              {related.map((r) => (
                <Pressable key={r.id} onPress={() => setSheetId(r.id)} accessibilityRole="button" accessibilityLabel={`${r.name}, linked in your Mind. View its book`} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                  <BookGlyph size={12} />
                  <T style={styles.chipText} numberOfLines={1}>
                    {r.title}
                  </T>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <BookSheet knowledge={knowledge} conceptId={sheetId} live={live} onClose={() => setSheetId(null)} onOpenInMind={onOpenInMind} />
    </View>
  );
}

/** A book's summary without leaving the call. Opening the full Mind is explicit about ending it. */
function BookSheet({ knowledge, conceptId, live, onClose, onOpenInMind }: { knowledge: KnowledgeResponse | null; conceptId: string | null; live: boolean; onClose: () => void; onOpenInMind: (id: string) => void }) {
  const item = knowledge && conceptId ? knowledge.items.find((i) => i.concept.id === conceptId) : undefined;
  const book = item && knowledge ? projectMindWorld(knowledge, { selectedId: item.concept.id, played: NO_HIGHLIGHTS }).focus : null;
  return (
    <Sheet visible={!!item} onClose={onClose} title={item?.concept.name ?? ""}>
      {item && book ? (
        <View style={{ paddingHorizontal: gutter, gap: space.m }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
            <BookGlyph evidence={book.evidence} uncertain={book.uncertain} changed={book.changed} size={18} />
            <T variant="meta" style={{ color: color.ink2 }}>
              {[EVIDENCE_WORDS[book.evidence], book.uncertain ? "few signals so far" : null].filter(Boolean).join(" · ")}
            </T>
          </View>
          <T variant="support" style={{ color: color.ink }}>
            {item.concept.description}
          </T>
          <T variant="meta" style={{ color: color.ink3 }}>
            Listening adds context, not evidence. A check is the strongest evidence for this book.
          </T>
          <Button
            kind="secondary"
            label={live ? "Open in your Mind (ends this catch-up)" : "Open in your Mind"}
            onPress={() => {
              onClose();
              onOpenInMind(item.concept.id);
            }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

export type VoiceState = "connecting" | "speaking" | "listening" | "user" | "ending" | "muted";

/** What the call is doing right now, from the SDK's own state. Never "Speaking" unless audio is playing. */
export function VoiceStatus({ state }: { state: VoiceState }) {
  const label = { connecting: "Connecting", speaking: "Thinketh is speaking", listening: "Listening", user: "You're talking", ending: "Ending", muted: "Mic off" }[state];
  const dot = state === "speaking" ? color.coral : state === "user" || state === "listening" ? color.ink : color.ink3;
  return (
    <View style={styles.status} accessible accessibilityLabel={label} accessibilityLiveRegion="polite">
      <View style={[styles.statusDot, { backgroundColor: dot }]} />
      <T style={styles.statusText}>{label}</T>
    </View>
  );
}

const BARS = [0.35, 0.55, 0.8, 0.5, 1, 0.7, 0.45, 0.9, 0.6, 0.4, 0.75, 0.5, 0.3];

/**
 * A level meter for Thinketh's voice: every bar scales with the SDK's real output volume (one number,
 * not a spectrum). With Reduce Motion, or while quiet, it rests flat.
 */
export function LevelMeter({ level, active, reduceMotion }: { level: SharedValue<number>; active: boolean; reduceMotion: boolean }) {
  return (
    <View style={styles.meter} accessible={false} importantForAccessibility="no-hide-descendants">
      {BARS.map((k, i) => (
        <Bar key={i} k={k} level={level} active={active && !reduceMotion} />
      ))}
    </View>
  );
}

function Bar({ k, level, active }: { k: number; level: SharedValue<number>; active: boolean }) {
  const style = useAnimatedStyle(() => ({ height: 3 + (active ? level.get() * 26 * k : 0) }));
  return <Animated.View style={[styles.bar, style, !active && { backgroundColor: color.edge }]} />;
}

/** A calm "working" pulse for connecting. Still under Reduce Motion. */
export function Pulse({ reduceMotion }: { reduceMotion: boolean }) {
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    o.set(withRepeat(withTiming(0.35, { duration: 700 }), -1, true));
    return () => cancelAnimation(o);
  }, [reduceMotion, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[styles.statusDot, { backgroundColor: color.ink3 }, style]} />;
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 32 },
  title: { fontFamily: font.sansBold, fontSize: 28, lineHeight: 33, letterSpacing: -0.8, color: color.ink, marginTop: 4 },
  scene: { marginTop: space.l },
  mind: { marginTop: space.m, padding: space.m, borderRadius: 16, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, gap: space.s },
  mindHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mindTitle: { fontFamily: font.sansSemibold, fontSize: 14, lineHeight: 18, color: color.ink },
  viewBook: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingLeft: space.s },
  viewBookText: { fontFamily: font.sansSemibold, fontSize: 13, color: color.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: color.surfaceMuted },
  chipText: { fontFamily: font.sansMedium, fontSize: 13, color: color.ink, maxWidth: 160 },
  status: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 30, borderRadius: 15, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: font.sansSemibold, fontSize: 12, color: color.ink },
  meter: { flexDirection: "row", alignItems: "center", gap: 4, height: 32 },
  bar: { width: 3, borderRadius: 2, backgroundColor: color.coral },
});
