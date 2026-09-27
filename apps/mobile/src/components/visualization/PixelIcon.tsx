import { memo } from "react";
import Svg, { Rect } from "react-native-svg";
import type { VisualIcon } from "@thinketh/contracts";
import { PIXEL_ICONS, PIXEL_PALETTE } from "./pixelIcons";

/**
 * One pixel icon. Sizes that are multiples of 12 keep every pixel square and crisp. `palette`
 * recolours keys for a context (Learn draws with a softer line than diagrams).
 */
export const PixelIcon = memo(function PixelIcon({ name, size = 24, palette }: { name: VisualIcon; size?: number; palette?: Partial<Record<string, string>> }) {
  const grid = PIXEL_ICONS[name];
  const colors = palette ? { ...PIXEL_PALETTE, ...palette } : PIXEL_PALETTE;
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      {grid.flatMap((row, y) =>
        [...row].flatMap((ch, x) =>
          ch === "." || !colors[ch] ? [] : [<Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={colors[ch]} />],
        ),
      )}
    </Svg>
  );
});
