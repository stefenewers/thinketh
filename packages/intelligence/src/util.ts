export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Round for storage/display so transitions read cleanly (0.5093 -> 0.51). */
export const round = (x: number, places = 3): number => {
  const f = 10 ** places;
  return Math.round(x * f) / f;
};

export const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const daysBetween = (fromIso: string, to: Date): number =>
  Math.max(0, (to.getTime() - new Date(fromIso).getTime()) / DAY_MS);
