import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import type { RailStep } from "@/lib/roomStory";
import { color, font, gutter, space } from "@/theme/tokens";

/**
 * "What just happened": the current exchange as recorded steps (actor · action), compact by
 * default. Tap to see each step's recorded detail: the rule and numbers, the move's conductor,
 * the explanation, the challenge, the grade and the transition. Never invented agent thoughts.
 */
export function EventRail({ steps, next }: { steps: RailStep[]; next: string | null }) {
  const [open, setOpen] = useState(false);
  const current = steps.find((s) => s.state === "current");
  const lastDone = steps.filter((s) => s.state === "done").at(-1);
  const focus = current ?? lastDone;
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`What just happened: ${steps.filter((s) => s.state === "done").map((s) => `${s.actor} ${s.label}`).join(", ")}.${current ? ` Now: ${current.actor} ${current.label}.` : ""}`}
        style={({ pressed }) => [styles.bar, pressed && { opacity: 0.8 }]}
      >
        <View style={styles.dots}>
          {steps.map((s) => (
            <View key={s.key} style={[styles.dot, s.state === "done" && styles.dotDone, s.state === "current" && styles.dotCurrent]} />
          ))}
        </View>
        <T style={styles.line} numberOfLines={1}>
          {focus ? (
            <>
              <T style={styles.actor}>{focus.actor}</T> · {focus.label}
            </>
          ) : (
            "Nothing yet"
          )}
        </T>
        <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
          <Icon name="chevron" size={12} color={color.ink3} />
        </View>
      </Pressable>
      {next && !open ? (
        <T variant="meta" style={styles.next} numberOfLines={1}>
          Next: {next}
        </T>
      ) : null}
      {open ? (
        <View style={styles.list}>
          {steps.map((s) => (
            <View key={s.key} style={styles.row}>
              <View style={[styles.dot, { marginTop: 5 }, s.state === "done" && styles.dotDone, s.state === "current" && styles.dotCurrent]} />
              <View style={{ flex: 1 }}>
                <T style={[styles.rowTitle, s.state === "pending" && { color: color.ink3 }]}>
                  <T style={[styles.actor, s.state === "pending" && { color: color.ink3 }]}>{s.actor}</T> · {s.label}
                </T>
                {s.detail && s.state !== "pending" ? (
                  <T variant="meta" style={{ color: color.ink2, marginTop: 2 }}>
                    {s.detail}
                  </T>
                ) : null}
              </View>
            </View>
          ))}
          <T variant="meta" style={{ color: color.ink3, marginTop: space.xs }}>
            From the room&apos;s recorded events. Thinketh plans and grades; Muse conducts; only verified evidence changes a Mind.
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: gutter, marginTop: space.xs },
  bar: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 36, paddingHorizontal: space.m, borderRadius: 999, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.canvas, borderWidth: 1, borderColor: color.edge },
  dotDone: { backgroundColor: color.ink, borderColor: color.ink },
  dotCurrent: { backgroundColor: color.coral, borderColor: color.coral },
  line: { flex: 1, fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.ink },
  actor: { fontFamily: font.sansSemibold, color: color.ink },
  next: { color: color.ink3, marginTop: 4, marginLeft: space.m },
  list: { marginTop: space.s, padding: space.m, borderRadius: 16, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, gap: space.s },
  row: { flexDirection: "row", gap: space.s },
  rowTitle: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: color.ink },
});
