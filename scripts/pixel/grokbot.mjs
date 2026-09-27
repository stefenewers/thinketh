// Draws Grokbot, the Playground's visiting challenger, as pixel art from the provided character design
// (grok.jpeg: a black ball with two slanted white eye marks, upper right). Redrawn at the room's pixel
// density, not pasted in, so it sits with the Pixel Office characters. Same format as the agent strips
// so the same renderer plays it: a 32×32 cell, 15 frames (5 idle, 10 moving), scaled ×6 nearest-neighbour.
// Motion: a soft bob, a glance and a blink at rest; a small hop with a 1px squash on landing while moving.
//
//   node scripts/pixel/grokbot.mjs   → apps/mobile/assets/playground/grokbot/grokbot.png
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CELL = 32;
const FRAMES = 15;
const SCALE = 6;
const BODY = [0x16, 0x16, 0x16]; // the app's ink
const EYE = [0xff, 0xff, 0xff];

/** One frame: lift (px up), squash (px wider and shorter), eyes: open | blink | glance. */
function frame(px, { lift = 0, squash = 0, eyes = "open" }) {
  const set = (x, y, c) => {
    if (x >= 0 && x < CELL && y >= 0 && y < CELL) px[y * CELL + x] = c;
  };
  // The ball: feet on the floor line (y 29), diameter 20.
  const rx = 10 + squash / 2;
  const ry = 10 - squash / 2;
  const cx = 16;
  const cy = 30 - ry - lift;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      // Slightly inside the true circle: no single-pixel nubs at the four extremes.
      if (dx * dx + dy * dy <= 0.94) set(x, y, BODY);
    }
  }
  // Two slanted capsules, upper right: 2px wide, leaning (top left, bottom right), the second shorter.
  const top = Math.round(cy - ry * 0.55);
  const shift = eyes === "glance" ? -1 : 0;
  const eye = (x0, h) => {
    if (eyes === "blink") {
      set(x0 + 1 + shift, top + h - 2, EYE);
      set(x0 + 2 + shift, top + h - 2, EYE);
      return;
    }
    for (let i = 0; i < h; i++) {
      const x = x0 + shift + (i >= h / 2 ? 1 : 0);
      set(x, top + i, EYE);
      set(x + 1, top + i, EYE);
    }
  };
  eye(16, 5);
  eye(20, 4);
}

function strip() {
  const w = CELL * FRAMES;
  const out = new Array(w * CELL).fill(0);
  const idle = [{}, { lift: 1 }, { lift: 1, eyes: "glance" }, { eyes: "glance" }, { eyes: "blink" }];
  // Moving: two small hops per cycle, squashing as it lands.
  const hop = [{ squash: 2 }, { lift: 1 }, { lift: 3 }, { lift: 2 }, {}];
  const step = [...hop, ...hop];
  [...idle, ...step].forEach((opts, f) => {
    const px = new Array(CELL * CELL).fill(0);
    frame(px, opts);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) out[y * w + f * CELL + x] = px[y * CELL + x];
  });
  return { w, h: CELL, px: out };
}

function png({ w, h, px }, scale) {
  const W = w * scale;
  const H = h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const c = px[Math.floor(y / scale) * w + Math.floor(x / scale)];
      const o = y * (W * 4 + 1) + 1 + x * 4;
      if (c) {
        raw[o] = c[0];
        raw[o + 1] = c[1];
        raw[o + 2] = c[2];
        raw[o + 3] = 255;
      }
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "apps/mobile/assets/playground/grokbot/grokbot.png");
mkdirSync(dirname(out), { recursive: true });
const s = strip();
writeFileSync(out, png(s, SCALE));
// A larger preview of every frame (for review only; not bundled).
if (process.argv.includes("--preview")) writeFileSync(process.argv[process.argv.indexOf("--preview") + 1], png(s, 12));
console.log(`wrote ${out} (${s.w * SCALE}×${s.h * SCALE})`);
