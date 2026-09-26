// Small, dependency-free geometry for layout validation.

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Circle = { x: number; y: number; r: number };

export const inflate = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 });

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function circleRectOverlap(c: Circle, r: Rect): boolean {
  const nx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const ny = Math.max(r.y, Math.min(c.y, r.y + r.h));
  return (c.x - nx) ** 2 + (c.y - ny) ** 2 < c.r * c.r;
}

export const pointInRect = (p: Point, r: Rect) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
export const pointInCircle = (p: Point, c: Circle) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < c.r * c.r;
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const inside = (r: Rect, bounds: Rect) => r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h;

/** Points along a quadratic Bézier from a to b with control c. */
export function sampleQuad(a: Point, c: Point, b: Point, n = 18): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return out;
}

/** Proper segment intersection (shared endpoints don't count). */
export function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Text width for Inter, from per-character classes. Deliberately a little
 * generous so real glyphs never exceed the reserved box.
 */
export function measureText(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    if ("iljtfr.,'|!:; ".includes(ch)) w += 0.32;
    else if ("mwMW".includes(ch)) w += 0.86;
    else if (ch >= "A" && ch <= "Z") w += 0.68;
    else if ("()".includes(ch)) w += 0.36;
    else w += 0.56;
  }
  return Math.ceil(w * fontSize) + 2;
}
