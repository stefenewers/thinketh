import Svg, { Circle, Path } from "react-native-svg";
import { color as palette } from "@/theme/tokens";

// One monochrome outline family, 24px grid, 1.6 stroke.
const paths = {
  today: ["M4 8h16", "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M8 3v4M16 3v4"],
  library: ["M5 4h4v16H5z", "M11 4h3v16h-3z", "M16.5 5.2l2.9-.8 3.1 15-2.9.8z"],
  explore: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M15.5 8.5l-2 5-5 2 2-5z"],
  ask: ["M4 5h16v11H9l-5 4V5Z"],
  mind: ["M12 7v4M9.5 13.5 7 16M14.5 13.5 17 16"],
  chevron: ["M9 6l6 6-6 6"],
  back: ["M15 5l-7 7 7 7"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  close: ["M6 6l12 12M18 6 6 18"],
  external: ["M14 5h5v5", "M19 5l-8 8", "M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 11v5", "M12 8h.01"],
  send: ["M5 12h14", "M13 6l6 6-6 6"],
  voice: ["M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z", "M6 11a6 6 0 0 0 12 0", "M12 17v3"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "M20 20l-4-4"],
  plus: ["M12 5v14", "M5 12h14"],
  sparkle: ["M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5Z", "M18.5 16v4M16.5 18h4"],
  people: ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6", "M15.5 4.3a3.5 3.5 0 0 1 0 6.4", "M17.5 14.3c2.1.7 3.5 2.9 3.5 5.7"],
  person: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4.5 20.5c.8-3.7 3.9-6 7.5-6s6.7 2.3 7.5 6"],
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, color = palette.ink }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === "mind" ? (
        <>
          <Circle cx={12} cy={5} r={2} stroke={color} strokeWidth={1.6} />
          <Circle cx={12} cy={12.5} r={2} stroke={color} strokeWidth={1.6} />
          <Circle cx={5.5} cy={18} r={2} stroke={color} strokeWidth={1.6} />
          <Circle cx={18.5} cy={18} r={2} stroke={color} strokeWidth={1.6} />
        </>
      ) : null}
      {paths[name].map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
