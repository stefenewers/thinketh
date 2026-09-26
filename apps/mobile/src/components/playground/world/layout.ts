// Scene layout: floor coordinates (0–1) to points in a W×H scene. A back wall band, then the floor.
import type { Pt } from "./worldState";

export type Layout = { W: number; H: number; wallH: number; at: (p: Pt) => { x: number; y: number } };

export function sceneLayout(W: number, H: number): Layout {
  const wallH = Math.round(H * 0.3);
  const top = wallH + 10;
  // Room for the name labels under the front-most feet.
  const bottom = H - 36;
  return { W, H, wallH, at: (p) => ({ x: W * (0.07 + 0.86 * p.x), y: top + p.y * (bottom - top) }) };
}
