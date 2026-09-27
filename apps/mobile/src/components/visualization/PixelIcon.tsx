import { memo } from "react";
import Svg, { Rect } from "react-native-svg";
import type { VisualIcon } from "@thinketh/contracts";
import { PIXEL_ICONS, PIXEL_PALETTE } from "./pixelIcons";

/** One pixel icon. Sizes that are multiples of 12 keep every pixel square and crisp. */
export const PixelIcon = memo(function PixelIcon({ name, size = 24 }: { name: VisualIcon; size?: number }) {
  const grid = PIXEL_ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      {grid.flatMap((row, y) =>
        [...row].flatMap((ch, x) =>
          ch === "." || !PIXEL_PALETTE[ch] ? [] : [<Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={PIXEL_PALETTE[ch]} />],
        ),
      )}
    </Svg>
  );
});
