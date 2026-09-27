import { StyleSheet, View } from "react-native";
import type { DiagramSpec } from "@thinketh/contracts";
import { color, font, radius, space } from "@/theme/tokens";
import { Icon } from "./Icon";
import { T } from "./Text";

/**
 * The shift in one glance: what you used to think, what's true now, and what
 * stayed the same. Deterministic from the DiagramSpec groups; no boxes-and-
 * arrows puzzle to decode on a phone.
 */
export function DiagramView({ spec }: { spec: DiagramSpec }) {
  const shared = spec.nodes.filter((n) => n.group === "shared");
  const before = spec.nodes.filter((n) => n.group === "before" || !n.group);
  const after = spec.nodes.filter((n) => n.group === "after");

  return (
    <View
      accessible
      accessibilityLabel={`${spec.title}. Before: ${before.map((n) => n.label).join(", ")}. Now: ${after.map((n) => n.label).join(", ")}.${
        shared.length ? ` Still true: ${shared.map((n) => n.label).join(", ")}.` : ""
      }`}
    >
      {before.length ? (
        <View style={styles.before}>
          <T variant="label">Before</T>
          {before.map((n) => (
            <T key={n.id} variant="body" style={styles.beforeText}>
              {n.label}
            </T>
          ))}
        </View>
      ) : null}

      <View style={styles.arrow}>
        <Icon name="arrow" size={18} color={color.coral} />
      </View>

      {after.length ? (
        <View style={styles.after}>
          <T variant="label" tone="coral">
            Now
          </T>
          {after.map((n) => (
            <T key={n.id} variant="body" style={styles.afterText}>
              {n.label}
            </T>
          ))}
        </View>
      ) : null}

      {shared.length ? (
        <View style={{ marginTop: space.xl }}>
          <T variant="label">Still true</T>
          <T variant="support" style={{ marginTop: space.xs }}>
            {shared.map((n) => n.label).join(" · ")}
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  before: { padding: space.l, borderRadius: radius.surface, backgroundColor: color.fog, gap: space.s },
  beforeText: { color: color.ink2, fontSize: 15, lineHeight: 22 },
  arrow: { alignItems: "center", paddingVertical: space.m, transform: [{ rotate: "90deg" }] },
  after: { padding: space.l, borderRadius: radius.surface, backgroundColor: color.canvas, borderWidth: 1, borderColor: color.coral, gap: space.s },
  afterText: { fontFamily: font.sansMedium, fontSize: 16, lineHeight: 23, color: color.ink },
});
