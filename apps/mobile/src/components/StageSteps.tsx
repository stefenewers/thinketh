import { View } from "react-native";
import type { Resource } from "@thinketh/contracts";
import { color, font, space } from "@/theme/tokens";
import { T } from "./Text";

const STEPS: { key: Resource["stage"]; label: string }[] = [
  { key: "reading", label: "Source" },
  { key: "mapping", label: "Concepts" },
  { key: "comparing", label: "Your Mind" },
  { key: "done", label: "Delta" },
];

/** SOURCE → CONCEPTS → YOUR MIND → DELTA, driven by the stage the server reports. */
export function StageSteps({ stage, compact = false }: { stage: Resource["stage"] | undefined; compact?: boolean }) {
  const at = Math.max(0, STEPS.findIndex((s) => s.key === (stage ?? "reading")));
  return (
    <View style={{ flexDirection: compact ? "column" : "row", flexWrap: "wrap", alignItems: compact ? "flex-start" : "center", gap: compact ? 6 : space.s }} accessibilityLabel={`Step ${at + 1} of 4: ${STEPS[at]!.label}`}>
      {STEPS.map((s, i) => (
        <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
          <T
            variant="label"
            style={{
              color: i < at ? color.ink2 : i === at ? color.coral : color.ink3,
              fontFamily: i === at ? font.sansSemibold : font.sansMedium,
              opacity: i > at ? 0.6 : 1,
            }}
          >
            {i < at ? "✓ " : ""}
            {s.label}
          </T>
          {!compact && i < STEPS.length - 1 ? <T variant="label" style={{ color: color.ink3 }}>→</T> : null}
        </View>
      ))}
    </View>
  );
}
