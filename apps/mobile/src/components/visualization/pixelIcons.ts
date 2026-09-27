import type { VisualIcon } from "@thinketh/contracts";

// Thinketh's pixel vocabulary for diagrams: 12×12 grids, drawn as crisp SVG squares, in the
// Playground room's palette. A restrained icon system inside a modern UI, not illustrations.
// '.' is transparent; every other character is a palette key below.

export const PIXEL_PALETTE: Record<string, string> = {
  k: "#2A2A28", // ink outline
  g: "#8C8781", // warm gray
  s: "#E9E1D6", // sand
  w: "#FFFFFF",
  c: "#C0553A", // Thinketh coral
  p: "#F2B9A0", // peach
  b: "#8FA7C2", // muted sky
  m: "#9B8AB4", // plum (the brain)
  n: "#6E5E8A", // deep plum
};

const blank = "............";

export const PIXEL_ICONS: Record<VisualIcon, readonly string[]> = {
  image: [blank, "kkkkkkkkkkkk", "kbbbbbbbbbbk", "kbbbbbbbppbk", "kbbbbbbbppbk", "kbbbbgbbbbbk", "kbbbgggbbbbk", "kbbgggggbgbk", "kbgggggggggk", "kggggggggggk", "kkkkkkkkkkkk", blank],
  document: ["..kkkkkkk...", "..kwwwwwkk..", "..kwgggwwkk.", "..kwwwwwwwk.", "..kwggggggk.", "..kwwwwwwwk.", "..kwggggggk.", "..kwwwwwwwk.", "..kwgggggwk.", "..kwwwwwwwk.", "..kkkkkkkkk.", blank],
  text: [blank, ".kkkkkkk....", ".kkkkkkk....", "....kk......", "....kk.gggg.", "....kk......", "....kk.gggg.", "....kk......", ".......gggg.", ".gggggggggg.", blank, blank],
  brain: [blank, "...mmmmmm...", "..mnmmnmmm..", ".mmmnmmmnmm.", ".mnmmmnmmnm.", ".mmmnmmmmmm.", ".mnmmmnmnmm.", ".mmmnmmmmnm.", "..mmmnmmmm..", "...mmmmmm...", blank, blank],
  person: [blank, "....kkkk....", "...kssssk...", "...kssssk...", "...kssssk...", "....kkkk....", "...kcccck...", "..kcccccck..", "..kcccccck..", "..kcccccck..", "..kkkkkkkk..", blank],
  memory: [blank, ".kkkkkkkkkk.", ".kssssssssk.", ".kssskksssk.", ".kkkkkkkkkk.", ".kssssssssk.", ".ksssccsssk.", ".kkkkkkkkkk.", ".kssssssssk.", ".ksssccsssk.", ".kkkkkkkkkk.", blank],
  goal: [blank, "...cccccc...", "..cwwwwwwc..", ".cwwccccwwc.", ".cwcwwwwcwc.", ".cwcwccwcwc.", ".cwcwccwcwc.", ".cwcwwwwcwc.", ".cwwccccwwc.", "..cwwwwwwc..", "...cccccc...", blank],
  facts: [blank, ".kkkkkkkkkk.", ".kwwwwwwwwk.", ".kwcwwggggk.", ".kccwwwwwwk.", ".kwwwwwwwwk.", ".kwcwwggggk.", ".kccwwwwwwk.", ".kwwwwwwwwk.", ".kkkkkkkkkk.", blank, blank],
  message: [blank, ".kkkkkkkkkk.", ".kwwwwwwwwk.", ".kwggggggwk.", ".kwwwwwwwwk.", ".kwggggwwwk.", ".kwwwwwwwwk.", ".kkkwkkkkkk.", "...kk.......", "...k........", blank, blank],
  screen: [blank, "kkkkkkkkkkkk", "kbbbbbbbbbbk", "kbwwbbbbbbbk", "kbbbbbbbbbbk", "kbbbbbbbbbbk", "kbbbbbbbbbbk", "kkkkkkkkkkkk", ".....kk.....", "....kkkk....", blank, blank],
  database: [blank, "..kkkkkkkk..", ".kssssssssk.", ".kggggggggk.", ".kssssssssk.", ".kssssssssk.", ".kggggggggk.", ".kssssssssk.", ".kssssssssk.", ".kggggggggk.", "..kkkkkkkk..", blank],
  model: [blank, "...k.k.k.k..", "..kkkkkkkk..", ".kksssssskk.", "..ksccccsk..", ".kksccccskk.", "..ksccccsk..", ".kksssssskk.", "..kkkkkkkk..", "...k.k.k.k..", blank, blank],
  tool: [blank, "........k.k.", ".......kg.gk", ".......kgggk", "......kggkk.", ".....kggk...", "....kggk....", "...kggk.....", "..kggk......", ".kggk.......", ".kkk........", blank],
  answer: ["....kkkk....", "...kppppk...", "..kppwpppk..", "..kpwppppk..", "..kppppppk..", "..kppppppk..", "...kppppk...", "....kggk....", "....kggk....", ".....kk.....", blank, blank],
  network: [blank, ".kk......kk.", ".kk......kk.", "...g....g...", "....g..g....", ".....cc.....", ".....cc.....", "....g..g....", "...g....g...", ".kk......kk.", ".kk......kk.", blank],
  agent: [blank, ".....kk.....", "...kkkkkk...", "..kwwwwwwk..", "..kwkwwkwk..", "..kwwwwwwk..", "..kwwccwwk..", "...kkkkkk...", "..kcccccck..", ".kkcccccckk.", "..kkk..kkk..", blank],
  audio: [blank, "......c.....", "....k.c.....", "....k.c.k...", "..k.k.c.k.k.", "k.k.k.c.k.k.", "..k.k.c.k.k.", "....k.c.k...", "....k.c.....", "......c.....", blank, blank],
  search: [blank, "..kkkk......", ".kwwwwk.....", "kwwwwwwk....", "kwwwwwwk....", "kwwwwwwk....", ".kwwwwk.....", "..kkkkgg....", "......ggg...", ".......ggg..", "........gg..", blank],
  cost: [blank, "...kkkkkk...", "..kppppppk..", ".kppccccppk.", ".kpcppppcpk.", ".kpcppppcpk.", ".kpcppppcpk.", ".kppccccppk.", "..kppppppk..", "...kkkkkk...", blank, blank],
  clock: [blank, "...kkkkkk...", "..kwwwwwwk..", ".kwwwkwwwwk.", ".kwwwkwwwwk.", ".kwwwkwwwwk.", ".kwwwwccwwk.", ".kwwwwwwwwk.", "..kwwwwwwk..", "...kkkkkk...", blank, blank],
  check: [blank, blank, "..........c.", ".........cc.", "........cc..", ".c.....cc...", ".cc...cc....", "..cc.cc.....", "...ccc......", "....c.......", blank, blank],
  warning: [blank, ".....kk.....", ".....kk.....", "....kppk....", "...kpccpk...", "...kpccpk...", "..kppccppk..", "..kppppppk..", ".kpppccpppk.", ".kkkkkkkkkk.", blank, blank],
  loop: [blank, "....kkkk....", "..kk....kk..", ".k........k.", ".k.......ccc", ".k........c.", ".k..........", ".k........k.", "..kk....kk..", "....kkkk....", blank, blank],
  book: [blank, "..kkkkkkkk..", "..kcccccck..", "..kcwwwwck..", "..kcccccck..", "..kcccccck..", "..kcccccck..", "..kcccccck..", "..kkkkkkkk..", "..kwwwwwwk..", "..kkkkkkkk..", blank],
};
