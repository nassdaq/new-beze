/**
 * Rooftop tileset for the "Webslinger" template: what the City tileset lacks for a big-city rooftop game.
 * Same painterly-pixel style as tilesets/city.mjs (1 px darker outlines, three-tone shading, soft contact
 * shadows), 32 px tiles, 8 columns. Used on a map together with Outdoor and City (firstGid after City).
 *
 * Ground: dark tar roofs (opaque, seamless, walkable: the ledge ring around them is what is climbed), brick
 * walls and ledges (opaque, climbable), alley ground.
 * Objects: transparent roof furniture that goes on the Decoration layer over a roof, and alley clutter.
 * Stamps: WaterTower (2×2) and Billboard (3×2).
 *
 * `climbable: true` marks a solid tile a climbing player may walk on; the editor's auto-collision writes 2.
 * Determinism: only the renderer's `rand` and the fixed-seed `lcg()` below.
 */

function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const rr = (r, a, b) => a + r() * (b - a);
const ri = (r, a, b) => Math.floor(a + r() * (b - a + 1));
const px = (ctx, x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
function ellipse(ctx, cx, cy, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function circle(ctx, cx, cy, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
function poly(ctx, pts, fill, stroke, lw = 1) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function shadow(ctx, cx, cy, rx, ry, a = 0.28) { ellipse(ctx, cx, cy, rx, ry, `rgba(30,28,40,${a})`); }
function box(ctx, x, y, w, h, fill, ink) { px(ctx, x, y, ink, w, h); px(ctx, x + 1, y + 1, fill, w - 2, h - 2); }

// ---------------------------------------------------------------- palettes
const TAR = { base: '#3b3a42', light: '#46454e', dark: '#313038', deep: '#232228', seam: '#2a292f', gravel: '#55545c', gravelL: '#6a6972' };
const LEDGE = { top: '#8c8a86', light: '#a3a19c', face: '#6a6864', deep: '#4a4845', ink: '#2e2d2b' };
const BRK = { base: '#8a4a3c', light: '#a35d4c', dark: '#6e3a2e', deep: '#4b261d', mortar: '#b9a48e', ink: '#331812' };
const GRY = { base: '#7c7f86', light: '#979aa1', dark: '#5f6268', deep: '#42444a', ink: '#2b2c31' };
const MT = { base: '#6c717a', light: '#9ba1aa', dark: '#474b52', ink: '#2a2d32', rust: '#8a5a3c' };
const WD = { base: '#a2703f', light: '#c48d55', dark: '#74502b', deep: '#4a2f15', ink: '#33200f' };
const GL = { base: '#7db5d9', light: '#c2e4f6', dark: '#4d84aa', frame: '#274764' };
const ALY = { base: '#55535a', light: '#63616a', dark: '#48464d', deep: '#333238', stain: '#3f3c48', puddle: '#5f7d93', puddleL: '#9dc0d6' };
const SIGN = { board: '#f4e6c2', boardD: '#d9c69a', red: '#c9382f', blue: '#2a63b8', green: '#2f8a3e', yellow: '#f2c53a', ink: '#2a2118', white: '#ffffff', post: '#3b3d44' };
const BIN = { base: '#2f6f4a', light: '#3f8d5f', dark: '#22523a', ink: '#132b1f', lid: '#255e40' };

// ---------------------------------------------------------------- pixel font (3x5)
const FONT = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'], M: ['101', '111', '111', '101', '101'],
  N: ['110', '101', '101', '101', '101'], O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'], W: ['101', '101', '111', '111', '101'], Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'], ' ': ['000', '000', '000', '000', '000'], '!': ['010', '010', '010', '000', '010'],
};
function text(ctx, x, y, str, color) {
  let cx = x;
  for (const ch of str) {
    const g = FONT[ch] ?? FONT[' '];
    g.forEach((row, ry) => { for (let rx = 0; rx < 3; rx++) if (row[rx] === '1') px(ctx, cx + rx, y + ry, color); });
    cx += 4;
  }
}

// ---------------------------------------------------------------- ground
function tarBase(ctx, s, seed) {
  const r = lcg(seed);
  px(ctx, 0, 0, TAR.base, s, s);
  for (let i = 0; i < 90; i++) px(ctx, ri(r, 0, s - 1), ri(r, 0, s - 1), r() < 0.5 ? TAR.light : TAR.dark);
  for (let i = 0; i < 26; i++) px(ctx, ri(r, 0, s - 1), ri(r, 0, s - 1), r() < 0.6 ? TAR.gravel : TAR.gravelL);
  // a patch of tar and a seam
  ellipse(ctx, rr(r, 6, 26), rr(r, 6, 26), rr(r, 3, 6), rr(r, 2, 4), TAR.deep);
}
function brickBase(ctx, s, seed, tone = BRK) {
  const r = lcg(seed);
  px(ctx, 0, 0, tone.mortar, s, s);
  const bh = 4, bw = 8;
  for (let row = 0; row < s / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < s / bw + 1; col++) {
      const x = col * bw + off, y = row * bh;
      const c = r() < 0.12 ? tone.dark : r() < 0.2 ? tone.light : tone.base;
      px(ctx, x, y, c, bw - 1, bh - 1);
      px(ctx, x, y + bh - 2, tone.dark, bw - 1, 1);
      if (r() < 0.25) px(ctx, x + ri(r, 1, 5), y + 1, tone.light, 1, 1);
    }
  }
}
function alleyBase(ctx, s, seed) {
  const r = lcg(seed);
  px(ctx, 0, 0, ALY.base, s, s);
  for (let i = 0; i < 80; i++) px(ctx, ri(r, 0, s - 1), ri(r, 0, s - 1), r() < 0.5 ? ALY.light : ALY.dark);
  ellipse(ctx, rr(r, 4, 28), rr(r, 4, 28), rr(r, 3, 7), rr(r, 2, 4), ALY.stain);
  px(ctx, ri(r, 2, 26), ri(r, 2, 26), ALY.deep, ri(r, 2, 5), 1);
}
/** Roof edge: the tar surface with a raised concrete ledge along `side`. */
function ledge(ctx, s, side) {
  const t = 7;
  if (side === 'n') { px(ctx, 0, 0, LEDGE.top, s, t - 2); px(ctx, 0, t - 2, LEDGE.face, s, 2); px(ctx, 0, 0, LEDGE.light, s, 1); px(ctx, 0, t, LEDGE.deep, s, 1); for (let x = 0; x < s; x += 8) px(ctx, x, 1, LEDGE.face, 1, t - 3); }
  if (side === 's') { px(ctx, 0, s - t, LEDGE.top, s, t - 3); px(ctx, 0, s - 3, LEDGE.face, s, 3); px(ctx, 0, s - t, LEDGE.light, s, 1); px(ctx, 0, s - t - 1, LEDGE.deep, s, 1); for (let x = 0; x < s; x += 8) px(ctx, x, s - t + 1, LEDGE.face, 1, t - 4); }
  if (side === 'w') { px(ctx, 0, 0, LEDGE.top, t - 2, s); px(ctx, t - 2, 0, LEDGE.face, 2, s); px(ctx, 0, 0, LEDGE.light, 1, s); px(ctx, t, 0, LEDGE.deep, 1, s); for (let y = 0; y < s; y += 8) px(ctx, 1, y, LEDGE.face, t - 3, 1); }
  if (side === 'e') { px(ctx, s - t, 0, LEDGE.top, t - 2, s); px(ctx, s - 2, 0, LEDGE.face, 2, s); px(ctx, s - t, 0, LEDGE.light, 1, s); px(ctx, s - t - 1, 0, LEDGE.deep, 1, s); for (let y = 0; y < s; y += 8) px(ctx, s - t + 1, y, LEDGE.face, t - 3, 1); }
}

// ---------------------------------------------------------------- objects
function ventTile(ctx, s, r) {
  shadow(ctx, 16, 27, 11, 3);
  box(ctx, 6, 14, 20, 13, MT.base, MT.ink);
  px(ctx, 7, 15, MT.light, 18, 2);
  for (let y = 18; y < 26; y += 2) px(ctx, 8, y, MT.dark, 16, 1);
  // the spinning turbine on top
  ellipse(ctx, 16, 12, 8, 4, MT.ink);
  ellipse(ctx, 16, 11, 7, 3, MT.light);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; px(ctx, Math.round(16 + Math.cos(a) * 5) - 0.5, Math.round(11 + Math.sin(a) * 1.8), MT.dark, 1, 2); }
  circle(ctx, 16, 11, 1.5, MT.dark);
  void r;
}
function acTile(ctx, s) {
  shadow(ctx, 16, 28, 12, 3);
  box(ctx, 4, 10, 24, 18, GRY.light, GRY.ink);
  px(ctx, 5, 11, '#b7bac0', 22, 2);
  // fan grille
  box(ctx, 7, 14, 12, 12, GRY.dark, GRY.ink);
  circle(ctx, 13, 20, 4, GRY.base); circle(ctx, 13, 20, 1.2, GRY.deep);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; px(ctx, Math.round(13 + Math.cos(a) * 3), Math.round(20 + Math.sin(a) * 3), GRY.deep); }
  // vents on the side
  for (let y = 15; y < 26; y += 2) px(ctx, 21, y, GRY.dark, 5, 1);
  px(ctx, 6, 26, GRY.deep, 20, 1);
}
function skylightTile(ctx, s) {
  box(ctx, 3, 3, 26, 26, GL.frame, LEDGE.ink);
  px(ctx, 5, 5, GL.base, 22, 22);
  px(ctx, 5, 5, GL.light, 22, 4);
  px(ctx, 5, 9, GL.dark, 22, 1);
  px(ctx, 15, 5, GL.frame, 2, 22); px(ctx, 5, 15, GL.frame, 22, 2);
  px(ctx, 7, 20, GL.light, 6, 1); px(ctx, 19, 22, GL.light, 4, 1);
}
function hatchTile(ctx, s) {
  // a roof access hatch: a low box with a door facing south; walkable (the door into the building)
  shadow(ctx, 16, 29, 12, 3);
  box(ctx, 5, 4, 22, 22, GRY.base, GRY.ink);
  px(ctx, 6, 5, GRY.light, 20, 3);
  box(ctx, 9, 12, 14, 14, MT.dark, GRY.ink);
  px(ctx, 10, 13, MT.base, 12, 2);
  px(ctx, 19, 19, SIGN.yellow, 2, 2);
  px(ctx, 11, 24, GRY.deep, 10, 1);
}
function antennaTile(ctx, s) {
  shadow(ctx, 16, 29, 5, 2);
  box(ctx, 12, 24, 8, 6, MT.base, MT.ink);
  px(ctx, 15, 3, MT.ink, 2, 22);
  px(ctx, 15, 3, MT.light, 1, 22);
  for (const y of [6, 11, 16]) { px(ctx, 8, y, MT.ink, 16, 1); px(ctx, 8, y - 1, MT.light, 16, 1); }
  px(ctx, 15, 1, SIGN.red, 2, 2);
}
function pipeTile(ctx, s) {
  // a fat pipe running left-right along the roof, seamless left-right
  shadow(ctx, 16, 22, 16, 2.5);
  px(ctx, 0, 10, MT.ink, s, 10);
  px(ctx, 0, 11, MT.base, s, 8);
  px(ctx, 0, 12, MT.light, s, 2);
  px(ctx, 0, 17, MT.dark, s, 2);
  for (const x of [4, 20]) { px(ctx, x, 9, MT.ink, 4, 12); px(ctx, x + 1, 10, MT.dark, 2, 10); px(ctx, x + 1, 11, MT.light, 1, 2); }
  px(ctx, 12, 14, MT.rust, 5, 2);
}
function crateTile(ctx, s) {
  shadow(ctx, 16, 29, 11, 3);
  box(ctx, 6, 10, 20, 18, WD.base, WD.ink);
  px(ctx, 7, 11, WD.light, 18, 2);
  for (const y of [15, 21]) px(ctx, 7, y, WD.dark, 18, 1);
  poly(ctx, [[7, 12], [24, 26]], null, WD.dark, 1.5);
  poly(ctx, [[24, 12], [7, 26]], null, WD.dark, 1.5);
  px(ctx, 12, 17, WD.deep, 8, 3); text(ctx, 13, 18, 'UP', WD.light);
}
function barrelTile(ctx, s) {
  shadow(ctx, 16, 29, 9, 3);
  px(ctx, 8, 8, MT.ink, 16, 21);
  px(ctx, 9, 9, GL.frame, 14, 19);
  px(ctx, 10, 9, '#3f6b92', 3, 19);
  for (const y of [12, 18, 24]) px(ctx, 9, y, MT.ink, 14, 1);
  ellipse(ctx, 16, 9, 8, 3, MT.ink); ellipse(ctx, 16, 9, 7, 2, MT.dark);
  px(ctx, 14, 15, MT.rust, 4, 3);
}
function dumpsterTile(ctx, s) {
  shadow(ctx, 16, 29, 14, 3);
  box(ctx, 2, 9, 28, 19, BIN.base, BIN.ink);
  px(ctx, 3, 10, BIN.light, 26, 2);
  poly(ctx, [[2, 9], [30, 9], [28, 5], [4, 5]], BIN.lid, BIN.ink, 1);
  px(ctx, 5, 6, BIN.light, 22, 1);
  for (const x of [8, 16, 24]) px(ctx, x, 13, BIN.dark, 1, 12);
  px(ctx, 4, 26, BIN.ink, 4, 3); px(ctx, 24, 26, BIN.ink, 4, 3);
  text(ctx, 10, 17, 'BIN', SIGN.white);
}
function graffitiWall(ctx, s, seed) {
  brickBase(ctx, s, seed);
  const r = lcg(seed + 7);
  const cols = [SIGN.red, SIGN.blue, SIGN.yellow, '#d64fb0', '#2fc4b2'];
  for (let i = 0; i < 3; i++) {
    const c = cols[ri(r, 0, cols.length - 1)];
    ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(rr(r, 3, 12), rr(r, 8, 24)); ctx.quadraticCurveTo(rr(r, 10, 22), rr(r, 2, 30), rr(r, 20, 29), rr(r, 8, 24)); ctx.stroke();
  }
  text(ctx, 8, 13, 'WEB', SIGN.white);
}
function fireEscape(ctx, s, seed) {
  brickBase(ctx, s, seed);
  // iron landing with railings, stairs going down to the right
  px(ctx, 2, 18, MT.ink, 28, 3);
  px(ctx, 3, 19, MT.base, 26, 1);
  for (let x = 4; x < 30; x += 4) px(ctx, x, 6, MT.ink, 1, 12);
  px(ctx, 2, 6, MT.ink, 28, 1); px(ctx, 2, 5, MT.light, 28, 1);
  for (let i = 0; i < 4; i++) px(ctx, 18 + i * 3, 21 + i * 3, MT.ink, 4, 2);
}
function warehouseDoor(ctx, s, seed) {
  brickBase(ctx, s, seed);
  // a roller door, closed look but this tile is the walkable doorway
  box(ctx, 2, 2, 28, 30, MT.dark, MT.ink);
  for (let y = 5; y < 30; y += 4) px(ctx, 3, y, MT.base, 26, 2);
  px(ctx, 3, 3, MT.light, 26, 1);
  px(ctx, 12, 12, SIGN.yellow, 8, 5); text(ctx, 13, 13, 'IN', SIGN.ink);
}
function brickWindow(ctx, s, seed) {
  brickBase(ctx, s, seed);
  box(ctx, 8, 6, 16, 18, GL.frame, BRK.ink);
  px(ctx, 10, 8, GL.base, 12, 14);
  px(ctx, 10, 8, GL.light, 12, 3);
  px(ctx, 15, 8, GL.frame, 2, 14); px(ctx, 10, 14, GL.frame, 12, 2);
  px(ctx, 7, 24, LEDGE.light, 18, 2); px(ctx, 7, 26, LEDGE.deep, 18, 1);
}
function signPost(ctx, s, boardColor, label, textColor, icon) {
  shadow(ctx, 16, 30, 6, 2);
  px(ctx, 15, 14, SIGN.post, 2, 16);
  box(ctx, 3, 3, 26, 13, boardColor, SIGN.ink);
  text(ctx, 5, 7, label, textColor);
  if (icon) icon(ctx);
}
function manholeTile(ctx, s, seed) {
  alleyBase(ctx, s, seed);
  circle(ctx, 16, 16, 9, ALY.deep);
  circle(ctx, 16, 16, 8, MT.dark);
  circle(ctx, 16, 16, 6.5, MT.base);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; px(ctx, Math.round(16 + Math.cos(a) * 4) - 1, Math.round(16 + Math.sin(a) * 4) - 1, MT.dark, 2, 2); }
}
function puddleTile(ctx, s, seed) {
  alleyBase(ctx, s, seed);
  ellipse(ctx, 15, 17, 10, 6, ALY.deep);
  ellipse(ctx, 15, 17, 9, 5, ALY.puddle);
  px(ctx, 9, 15, ALY.puddleL, 5, 1); px(ctx, 18, 19, ALY.puddleL, 3, 1);
}
function webCocoon(ctx, s) {
  // a webbed-up bundle left in an alley: decoration hinting at the hero
  shadow(ctx, 16, 29, 9, 3);
  ellipse(ctx, 16, 19, 8, 10, '#dfe9f4');
  ellipse(ctx, 16, 19, 7, 9, '#f6f9fc');
  ctx.strokeStyle = '#b9c8d8'; ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(9, 19 + i * 3.5 - 2); ctx.lineTo(23, 19 + i * 3.5 + 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(9, 19 + i * 3.5 + 2); ctx.lineTo(23, 19 + i * 3.5 - 2); ctx.stroke(); }
  px(ctx, 14, 12, '#2a2118', 4, 2);
}

// ---------------------------------------------------------------- stamps parts
function towerLeg(ctx, x) { px(ctx, x, 0, WD.ink, 3, 32); px(ctx, x + 1, 0, WD.dark, 1, 32); }
function waterTowerNW(ctx, s) {
  // top of the tank: conical lid
  poly(ctx, [[4, 30], [32, 30], [32, 12], [18, 4]], WD.base, WD.ink, 1);
  poly(ctx, [[4, 30], [4, 20], [18, 4]], WD.light, WD.ink, 1);
  px(ctx, 6, 26, WD.deep, 26, 2);
  px(ctx, 17, 1, MT.ink, 2, 4);
}
function waterTowerNE(ctx, s) {
  poly(ctx, [[0, 30], [28, 30], [28, 20], [14, 4]], WD.base, WD.ink, 1);
  poly(ctx, [[14, 4], [28, 20], [28, 30], [20, 30]], WD.dark, WD.ink, 1);
  px(ctx, 0, 26, WD.deep, 26, 2);
  px(ctx, 13, 1, MT.ink, 2, 4);
}
function waterTowerSW(ctx, s) {
  // barrel body with iron hoops, legs below
  shadow(ctx, 20, 30, 14, 3);
  px(ctx, 4, 0, WD.base, 28, 20);
  px(ctx, 4, 0, WD.light, 5, 20);
  for (let x = 9; x < 32; x += 4) px(ctx, x, 0, WD.dark, 1, 20);
  for (const y of [3, 10, 17]) px(ctx, 4, y, MT.dark, 28, 2);
  px(ctx, 4, 20, WD.ink, 28, 1);
  towerLeg(ctx, 6); towerLeg(ctx, 26);
  poly(ctx, [[7, 21], [28, 31]], null, MT.dark, 1);
}
function waterTowerSE(ctx, s) {
  shadow(ctx, 12, 30, 14, 3);
  px(ctx, 0, 0, WD.base, 28, 20);
  px(ctx, 22, 0, WD.dark, 6, 20);
  for (let x = 1; x < 22; x += 4) px(ctx, x, 0, WD.dark, 1, 20);
  for (const y of [3, 10, 17]) px(ctx, 0, y, MT.dark, 28, 2);
  px(ctx, 0, 20, WD.ink, 28, 1);
  towerLeg(ctx, 3); towerLeg(ctx, 23);
  poly(ctx, [[25, 21], [4, 31]], null, MT.dark, 1);
}
function billboardPanel(ctx, s, part) {
  // 3 wide × 2 tall: top row is the board, bottom row the frame legs on the roof
  const [col, row] = part;
  if (row === 0) {
    px(ctx, 0, 4, SIGN.ink, s, 28);
    px(ctx, col === 0 ? 2 : 0, 6, SIGN.board, col === 2 ? 30 : col === 0 ? 30 : 32, 24);
    px(ctx, col === 0 ? 2 : 0, 6, SIGN.boardD, col === 2 ? 30 : col === 0 ? 30 : 32, 3);
    if (col === 0) { px(ctx, 6, 12, SIGN.red, 20, 12); text(ctx, 8, 15, 'BUZZ', SIGN.white); }
    if (col === 1) { text(ctx, 2, 12, 'DAILY', SIGN.blue); text(ctx, 4, 20, 'NEWS', SIGN.ink); }
    if (col === 2) { circle(ctx, 14, 18, 8, SIGN.yellow); circle(ctx, 14, 18, 6, SIGN.board); text(ctx, 12, 16, '!', SIGN.red); }
    px(ctx, 0, 30, SIGN.ink, s, 2);
    // lamps on top
    for (const x of [8, 22]) { px(ctx, x, 1, MT.ink, 4, 4); px(ctx, x + 1, 2, SIGN.yellow, 2, 2); }
  } else {
    shadow(ctx, 16, 29, 14, 3);
    for (const x of col === 1 ? [6, 24] : [14]) { px(ctx, x, 0, MT.ink, 4, 28); px(ctx, x + 1, 0, MT.base, 2, 28); }
    if (col === 1) poly(ctx, [[8, 2], [26, 24], [8, 24], [26, 2]], null, MT.dark, 1.5);
    px(ctx, 4, 26, MT.ink, 24, 3);
  }
}

// ---------------------------------------------------------------- tile table
const ground = (tag, draw, extra = {}) => ({ tag, solid: false, ...extra, draw });
const climb = (tag, draw) => ({ tag, solid: true, climbable: true, draw });
const solid = (tag, draw) => ({ tag, solid: true, draw });

export default {
  id: 'tls_rooftop',
  name: 'Rooftop',
  assetId: 'ast_web_rooftop',
  file: 'rooftop.png',
  tileSize: 32,
  columns: 8,
  groundTag: 'roof_tar',
  stamps: [
    { name: 'WaterTower', tags: [['tower_nw', 'tower_ne'], ['tower_sw', 'tower_se']] },
    { name: 'Billboard', tags: [['board_l', 'board_m', 'board_r'], ['board_leg_l', 'board_leg_m', 'board_leg_r']] },
  ],
  tiles: [
    // ---- row 0: roof surfaces (climbable) and ledges
    ground('roof_tar', (ctx, s, r) => tarBase(ctx, s, 11)),
    ground('roof_tar2', (ctx, s) => { tarBase(ctx, s, 29); px(ctx, 6, 20, TAR.seam, 20, 1); }),
    climb('roof_ledge_n', (ctx, s) => { tarBase(ctx, s, 13); ledge(ctx, s, 'n'); }),
    climb('roof_ledge_s', (ctx, s) => { tarBase(ctx, s, 14); ledge(ctx, s, 's'); }),
    climb('roof_ledge_w', (ctx, s) => { tarBase(ctx, s, 15); ledge(ctx, s, 'w'); }),
    climb('roof_ledge_e', (ctx, s) => { tarBase(ctx, s, 16); ledge(ctx, s, 'e'); }),
    climb('roof_ledge_nw', (ctx, s) => { tarBase(ctx, s, 17); ledge(ctx, s, 'n'); ledge(ctx, s, 'w'); }),
    climb('roof_ledge_ne', (ctx, s) => { tarBase(ctx, s, 18); ledge(ctx, s, 'n'); ledge(ctx, s, 'e'); }),
    // ---- row 1: more ledges, brick walls (climbable), the doorway
    climb('roof_ledge_sw', (ctx, s) => { tarBase(ctx, s, 19); ledge(ctx, s, 's'); ledge(ctx, s, 'w'); }),
    climb('roof_ledge_se', (ctx, s) => { tarBase(ctx, s, 20); ledge(ctx, s, 's'); ledge(ctx, s, 'e'); }),
    climb('wall_brick', (ctx, s) => brickBase(ctx, s, 21)),
    climb('wall_brick_window', (ctx, s) => brickWindow(ctx, s, 22)),
    climb('wall_graffiti', (ctx, s) => graffitiWall(ctx, s, 23)),
    climb('wall_fire_escape', (ctx, s) => fireEscape(ctx, s, 24)),
    ground('warehouse_door', (ctx, s) => warehouseDoor(ctx, s, 25)),
    solid('wall_grey', (ctx, s) => brickBase(ctx, s, 26, { base: GRY.base, light: GRY.light, dark: GRY.dark, deep: GRY.deep, mortar: '#9ea1a7', ink: GRY.ink })),
    // ---- row 2: alley ground and clutter
    ground('alley', (ctx, s) => alleyBase(ctx, s, 31)),
    ground('alley_manhole', (ctx, s) => manholeTile(ctx, s, 32)),
    ground('alley_puddle', (ctx, s) => puddleTile(ctx, s, 33)),
    solid('dumpster', (ctx, s) => dumpsterTile(ctx, s)),
    solid('crate', (ctx, s) => crateTile(ctx, s)),
    solid('barrel', (ctx, s) => barrelTile(ctx, s)),
    solid('web_cocoon', (ctx, s) => webCocoon(ctx, s)),
    solid('sign_pizza', (ctx, s) => signPost(ctx, s, SIGN.red, 'PIZZA', SIGN.white, (c) => { circle(c, 26, 9, 2.5, SIGN.yellow); px(c, 25, 8, SIGN.red, 1, 1); px(c, 27, 10, SIGN.red, 1, 1); })),
    // ---- row 3: roof furniture (solid, transparent, over a roof tile)
    solid('roof_vent', (ctx, s, r) => ventTile(ctx, s, r)),
    solid('roof_ac', (ctx, s) => acTile(ctx, s)),
    solid('roof_skylight', (ctx, s) => skylightTile(ctx, s)),
    ground('roof_hatch', (ctx, s) => hatchTile(ctx, s)),
    solid('roof_antenna', (ctx, s) => antennaTile(ctx, s)),
    solid('roof_pipe', (ctx, s) => pipeTile(ctx, s)),
    solid('sign_news', (ctx, s) => signPost(ctx, s, SIGN.blue, 'BUZZ', SIGN.white, (c) => px(c, 23, 6, SIGN.board, 4, 6))),
    solid('sign_web', (ctx, s) => signPost(ctx, s, SIGN.board, 'HERO', SIGN.red, null)),
    // ---- row 4: stamp parts
    solid('tower_nw', (ctx, s) => waterTowerNW(ctx, s)),
    solid('tower_ne', (ctx, s) => waterTowerNE(ctx, s)),
    solid('tower_sw', (ctx, s) => waterTowerSW(ctx, s)),
    solid('tower_se', (ctx, s) => waterTowerSE(ctx, s)),
    solid('board_l', (ctx, s) => billboardPanel(ctx, s, [0, 0])),
    solid('board_m', (ctx, s) => billboardPanel(ctx, s, [1, 0])),
    solid('board_r', (ctx, s) => billboardPanel(ctx, s, [2, 0])),
    solid('board_leg_l', (ctx, s) => billboardPanel(ctx, s, [0, 1])),
    // ---- row 5
    solid('board_leg_m', (ctx, s) => billboardPanel(ctx, s, [1, 1])),
    solid('board_leg_r', (ctx, s) => billboardPanel(ctx, s, [2, 1])),
  ],
};
