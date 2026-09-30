/**
 * City tileset: an East African small town (Hacho) in the same painterly-pixel style as
 * tilesets/outdoor.mjs — 1 px darker outlines, three-tone shading, soft contact shadows.
 * 32 px tiles, 8 columns, row-major. Ground tiles are opaque and seamless with themselves;
 * building parts are opaque; signs, street objects and stamp parts that stand on the ground
 * are transparent. See tilesets/TILES.md ("City tileset") for the index table and stamps.
 *
 * Determinism: only the renderer's `rand` and the fixed-seed `lcg()` below are used.
 */

// ---------------------------------------------------------------- utilities
function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const rr = (r, a, b) => a + r() * (b - a);
const ri = (r, a, b) => Math.floor(a + r() * (b - a + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function wrap(ctx, s, fn) {
  for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore(); }
}
const px = (ctx, x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
function ellipse(ctx, cx, cy, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function circle(ctx, cx, cy, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
function poly(ctx, pts, fill, stroke, lw = 1) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function shadow(ctx, cx, cy, rx, ry, a = 0.28) { ellipse(ctx, cx, cy, rx, ry, `rgba(30,28,40,${a})`); }
/** Outlined box: 1 px `ink` border, `fill` inside. */
function box(ctx, x, y, w, h, fill, ink) { px(ctx, x, y, ink, w, h); px(ctx, x + 1, y + 1, fill, w - 2, h - 2); }

// ---------------------------------------------------------------- palettes
const ASP = { base: '#4b4c53', light: '#585960', dark: '#404147', deep: '#2f3035', patch: '#45464c', line: '#e8bd3c', lineD: '#c1962a', white: '#ebebe6', whiteD: '#c6c6c0' };
const SW = { base: '#cdc7b5', light: '#dad5c6', dark: '#bab4a2', joint: '#aaa492', deep: '#6e6a5b', curbTop: '#e6e2d6', curbFace: '#8c8778', gutter: '#37383d' };
const CAB = { a: '#b47a66', aL: '#c9917c', aD: '#8f5c4c', b: '#a3a29a', bL: '#bcbbb2', bD: '#82817a', c: '#8d857c', cL: '#a49c92', cD: '#6d665e', joint: '#57504a' };
const DL = { base: '#b7804f', light: '#cf9a68', dark: '#9c6a40', deep: '#7a4f2e', pebL: '#e2bd8a', pebD: '#6b4527', grass: '#8ea04a', grassD: '#5f7030' };
const OCH = { base: '#dcae62', light: '#ecc67f', dark: '#c0904c', deep: '#8f6630', ink: '#4a3418', plinth: '#a97f45' };
const WHT = { base: '#efe8d8', light: '#faf5ea', dark: '#d4cab4', deep: '#a99f89', ink: '#4a4034' };
const RG = { base: '#8d929a', light: '#aeb3bb', dark: '#6b7078', deep: '#4c5058', ink: '#34373d', rust: '#8a5a3c' };
const RR = { base: '#b9473a', light: '#d8675a', dark: '#8d3227', deep: '#611e16', ink: '#3d110c', rust: '#6e2a1c' };
const RB = { base: '#3f70b2', light: '#6592d1', dark: '#2c5389', deep: '#1e3a60', ink: '#132540', rust: '#4b5f7a' };
const GL = { base: '#7db5d9', light: '#c2e4f6', dark: '#4d84aa', frame: '#274764', frameL: '#3f6b92' };
const WD = { base: '#b17a46', light: '#d09a5f', dark: '#7f5230', deep: '#4a2d16', ink: '#3a2412' };
const MT = { base: '#6c717a', light: '#9ba1aa', dark: '#474b52', ink: '#2a2d32' };
const GR = { outline: '#1f4a21', dark: '#2f6f31', mid: '#43923c', light: '#63b34d', hi: '#95d46b' };
const SIGN = { board: '#f4e6c2', boardD: '#d9c69a', red: '#c9382f', blue: '#2a63b8', green: '#2f8a3e', yellow: '#f2c53a', ink: '#2a2118', white: '#ffffff' };

// ---------------------------------------------------------------- pixel font (3x5)
const FONT = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'], O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'], R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'], Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  ' ': ['000', '000', '000', '000', '000'],
};
const textWidth = (str, k = 1) => str.length * 3 * k + (str.length - 1) * k;
/** Draw `str` with the 3x5 font at scale k; `shadowC` adds a 1 px drop shadow (down-right). */
function text(ctx, x, y, str, c, k = 1, shadowC = null) {
  [...str.toUpperCase()].forEach((ch, i) => {
    const g = FONT[ch] ?? FONT[' '];
    g.forEach((row, gy) => [...row].forEach((bit, gx) => {
      if (bit !== '1') return;
      const X = x + i * 4 * k + gx * k, Y = y + gy * k;
      if (shadowC) px(ctx, X + 1, Y + 1, shadowC, k, k);
      px(ctx, X, Y, c, k, k);
    }));
  });
}
function textCentered(ctx, cx, y, str, c, k = 1, shadowC = null) { text(ctx, Math.round(cx - textWidth(str, k) / 2), y, str, c, k, shadowC); }

// ---------------------------------------------------------------- ground textures
/** Asphalt: dark grey, fine speckle, faint patches and a hairline crack. Seamless. */
function asphaltBase(ctx, s, seed = 11) {
  const r = lcg(seed);
  px(ctx, 0, 0, ASP.base, s, s);
  for (let i = 0; i < 5; i++) {
    const x = rr(r, 0, s), y = rr(r, 0, s), w = rr(r, 5, 10), h = rr(r, 3, 6);
    wrap(ctx, s, () => ellipse(ctx, x, y, w, h, 'rgba(64,65,71,0.5)'));
  }
  for (let i = 0; i < 3; i++) {
    const x = rr(r, 0, s), y = rr(r, 0, s), w = rr(r, 4, 8), h = rr(r, 2, 4);
    wrap(ctx, s, () => ellipse(ctx, x, y, w, h, 'rgba(94,95,102,0.35)'));
  }
  for (let i = 0; i < 70; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), c = r() < 0.55 ? ASP.dark : ASP.light;
    wrap(ctx, s, () => px(ctx, x, y, c));
  }
  for (let i = 0; i < 6; i++) { const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1); wrap(ctx, s, () => px(ctx, x, y, ASP.deep, 2, 1)); }
  // one hairline crack
  const cx = ri(r, 4, 26), cy = ri(r, 4, 26);
  wrap(ctx, s, () => { px(ctx, cx, cy, ASP.deep, 1, 3); px(ctx, cx + 1, cy + 3, ASP.deep, 1, 2); px(ctx, cx + 1, cy + 5, ASP.deep, 2, 1); px(ctx, cx - 1, cy - 1, ASP.deep, 1, 1); });
}
/** Dashed yellow centre line, 2 px thick, period 16 so it tiles. */
function dashLine(ctx, s, axis) {
  for (const start of [2, 18]) {
    for (let k = 0; k < 10; k++) {
      const worn = (start + k) % 7 === 3;
      if (axis === 'h') { px(ctx, start + k, 15, worn ? ASP.lineD : ASP.line, 1, 2); px(ctx, start + k, 17, 'rgba(0,0,0,0.18)', 1, 1); }
      else { px(ctx, 15, start + k, worn ? ASP.lineD : ASP.line, 2, 1); px(ctx, 17, start + k, 'rgba(0,0,0,0.18)', 1, 1); }
    }
  }
}
/** White zebra bars parallel to `axis` ('v' = vertical bars; the crossing runs left-right). */
function zebra(ctx, s, axis, seed = 17) {
  const r = lcg(seed);
  for (let k = 2; k < s; k += 8) {
    for (let t = 2; t < s - 2; t++) {
      const wear = r() < 0.12;
      if (axis === 'v') px(ctx, k, t, wear ? ASP.whiteD : ASP.white, 4, 1); else px(ctx, t, k, wear ? ASP.whiteD : ASP.white, 1, 4);
    }
    if (axis === 'v') { px(ctx, k, 2, ASP.whiteD, 4, 1); px(ctx, k, s - 3, ASP.whiteD, 4, 1); px(ctx, k + 3, 2, 'rgba(0,0,0,0.15)', 1, s - 4); }
    else { px(ctx, 2, k, ASP.whiteD, 1, 4); px(ctx, s - 3, k, ASP.whiteD, 1, 4); px(ctx, 2, k + 3, 'rgba(0,0,0,0.15)', s - 4, 1); }
  }
}

/** Pale paving slabs, 16 px grid with 1 px joints, a bevel and hairline cracks. Seamless. */
function sidewalkBase(ctx, s, seed = 23, cracks = 2) {
  const r = lcg(seed);
  px(ctx, 0, 0, SW.base, s, s);
  for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
    const x = gx * 16, y = gy * 16;
    const tone = r();
    if (tone < 0.3) px(ctx, x, y, '#d3cdbc', 16, 16); else if (tone > 0.75) px(ctx, x, y, '#c8c2b0', 16, 16);
    px(ctx, x + 1, y + 1, SW.light, 14, 1); px(ctx, x + 1, y + 1, SW.light, 1, 14);
    px(ctx, x + 1, y + 15, SW.dark, 15, 1); px(ctx, x + 15, y + 1, SW.dark, 1, 15);
    px(ctx, x, y, SW.joint, 16, 1); px(ctx, x, y, SW.joint, 1, 16);
    for (let i = 0; i < 4; i++) px(ctx, x + ri(r, 2, 14), y + ri(r, 2, 14), r() < 0.5 ? '#c3bdab' : SW.light);
  }
  for (let i = 0; i < cracks; i++) {
    const x = ri(r, 3, 12) + (r() < 0.5 ? 16 : 0), y = ri(r, 3, 11) + (r() < 0.5 ? 16 : 0);
    px(ctx, x, y, SW.dark, 1, 2); px(ctx, x + 1, y + 2, SW.dark, 1, 2); px(ctx, x + 1, y + 4, SW.dark, 2, 1);
  }
}
/**
 * Curb along `side` ('n','s','w','e'): the road lies on that side. From the road inwards:
 * a dark gutter line, the pale curb top, then its shaded face (only visible on the south/east
 * sides, which face the viewer) and the joint to the slabs.
 */
function curb(ctx, s, side) {
  const band = (d, c, len = s, off = 0) => {
    if (side === 'n') px(ctx, off, d, c, len, 1);
    else if (side === 's') px(ctx, off, s - 1 - d, c, len, 1);
    else if (side === 'w') px(ctx, d, off, c, 1, len);
    else px(ctx, s - 1 - d, off, c, 1, len);
  };
  band(0, SW.gutter); band(1, SW.deep);
  if (side === 's' || side === 'e') { band(2, SW.curbTop); band(3, SW.curbTop); band(4, SW.curbFace); band(5, SW.curbFace); band(6, SW.deep); }
  else { band(2, '#f0ece1'); band(3, SW.curbTop); band(4, '#d3cebf'); band(5, SW.deep); }
  // curb stones: a joint every 8 px
  for (let k = 7; k < s; k += 8) {
    if (side === 'n') px(ctx, k, 2, SW.dark, 1, 3); else if (side === 's') px(ctx, k, s - 6, SW.dark, 1, 4);
    else if (side === 'w') px(ctx, 2, k, SW.dark, 3, 1); else px(ctx, s - 6, k, SW.dark, 4, 1);
  }
}

/** Interlocking "cabro" pavers in running bond, 8x4 blocks in three tones. Seamless. */
function cabroBase(ctx, s, seed = 29) {
  const r = lcg(seed);
  px(ctx, 0, 0, CAB.joint, s, s);
  const tones = [[CAB.a, CAB.aL, CAB.aD], [CAB.b, CAB.bL, CAB.bD], [CAB.c, CAB.cL, CAB.cD], [CAB.b, CAB.bL, CAB.bD]];
  const brick = (x, y, w, h) => { const t = tones[ri(r, 0, 3)]; px(ctx, x + 1, y + 1, t[0], w - 1, h - 1); px(ctx, x + 1, y + 1, t[1], w - 2, 1); px(ctx, x + 1, y + 1, t[1], 1, h - 2); px(ctx, x + w - 1, y + 2, t[2], 1, h - 2); px(ctx, x + 2, y + h - 1, t[2], w - 2, 1); };
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) { // basketweave: pairs of 8x4 pavers alternating direction
    const x = gx * 8, y = gy * 8;
    if ((gx + gy) % 2) { brick(x, y, 8, 4); brick(x, y + 4, 8, 4); } else { brick(x, y, 4, 8); brick(x + 4, y, 4, 8); }
  }
  for (let i = 0; i < 10; i++) { const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1); wrap(ctx, s, () => px(ctx, x, y, 'rgba(255,240,220,0.18)')); }
}

/** Dusty red murram lot with pebbles, a tyre rut and dry tufts. Seamless. */
function dirtLotBase(ctx, s, seed = 37) {
  const r = lcg(seed);
  px(ctx, 0, 0, DL.base, s, s);
  for (let i = 0; i < 6; i++) {
    const x = rr(r, 0, s), y = rr(r, 0, s), w = rr(r, 4, 9), h = rr(r, 2, 4);
    wrap(ctx, s, () => ellipse(ctx, x, y, w, h, r() < 0.5 ? 'rgba(122,79,46,0.32)' : 'rgba(207,154,104,0.35)'));
  }
  for (let i = 0; i < 48; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), c = r() < 0.55 ? DL.dark : DL.light;
    wrap(ctx, s, () => px(ctx, x, y, c, r() < 0.3 ? 2 : 1, 1));
  }
  for (let i = 0; i < 5; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), w = ri(r, 2, 3);
    wrap(ctx, s, () => { px(ctx, x, y, DL.pebD, w + 1, 3); px(ctx, x, y, DL.dark, w, 2); px(ctx, x, y, DL.pebL, w - 1, 1); });
  }
  for (let i = 0; i < 4; i++) { // dry grass tufts
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1);
    wrap(ctx, s, () => { px(ctx, x - 1, y + 1, DL.grassD); px(ctx, x + 1, y + 1, DL.grassD); px(ctx, x, y, DL.grass); px(ctx, x, y + 1, DL.grass); px(ctx, x, y + 2, DL.deep); });
  }
}

// ---------------------------------------------------------------- building parts
/** Plaster wall texture (ochre or white): subtle mottling and specks. Seamless both ways. */
function plaster(ctx, s, pal, seed = 43) {
  const r = lcg(seed);
  px(ctx, 0, 0, pal.base, s, s);
  for (let i = 0; i < 5; i++) {
    const x = rr(r, 0, s), y = rr(r, 0, s), w = rr(r, 4, 9), h = rr(r, 3, 6);
    wrap(ctx, s, () => ellipse(ctx, x, y, w, h, r() < 0.5 ? `${pal.dark}55` : `${pal.light}66`));
  }
  for (let i = 0; i < 26; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), c = r() < 0.5 ? pal.dark : pal.light;
    wrap(ctx, s, () => px(ctx, x, y, c));
  }
  for (let i = 0; i < 3; i++) { const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1); wrap(ctx, s, () => px(ctx, x, y, pal.deep, 1, 2)); }
}
/** Window with a blue frame, two panes, burglar bars, a highlight and a sill. Fits x 8..24, y 5..24. */
function window_(ctx, x = 8, y = 5, w = 16, h = 19, pal = OCH) {
  px(ctx, x - 1, y + h, pal.deep, w + 2, 2);                       // shadow under sill
  box(ctx, x, y, w, h, GL.base, GL.frame);
  px(ctx, x + 1, y + 1, GL.frameL, w - 2, 1);                      // lit frame top
  px(ctx, x + 1, y + 1, GL.light, 3, h - 2);                        // light pane strip
  px(ctx, x + 4, y + 2, GL.light, 1, 4);
  px(ctx, x + w - 5, y + 3, GL.dark, 4, h - 4);                    // shaded pane
  px(ctx, x + Math.floor(w / 2) - 1, y, GL.frame, 2, h);            // mullion
  px(ctx, x, y + Math.floor(h / 2), GL.frame, w, 1);                // transom
  for (let k = x + 3; k < x + w - 1; k += 4) px(ctx, k, y + 1, 'rgba(20,40,60,0.45)', 1, h - 2); // burglar bars
  px(ctx, x - 1, y + h - 1, pal.light, w + 2, 1); px(ctx, x - 1, y + h, pal.dark, w + 2, 1); // sill
}
/** Doorway: dark frame, wooden door with planks and a handle; the opening runs to the tile's bottom. */
function door(ctx, x = 9, y = 4, w = 14, pal = OCH, colour = WD) {
  const h = 32 - y;
  px(ctx, x - 1, y - 1, pal.deep, w + 2, h + 1);                    // frame
  px(ctx, x, y, colour.ink, w, h);
  px(ctx, x + 1, y + 1, colour.base, w - 2, h - 1);
  px(ctx, x + 1, y + 1, colour.light, 1, h - 1); px(ctx, x + w - 3, y + 1, colour.dark, 2, h - 1);
  for (const k of [x + 5, x + 9]) px(ctx, k, y + 1, colour.dark, 1, h - 1);
  px(ctx, x + 1, y + 1, colour.light, w - 2, 1);
  px(ctx, x + 2, y + 8, colour.deep, w - 4, 1); px(ctx, x + 2, y + 18, colour.deep, w - 4, 1); // cross rails
  px(ctx, x + w - 4, y + 13, '#e8c86a', 2, 2); px(ctx, x + w - 4, y + 15, '#9a7a30', 2, 1);   // brass handle
  px(ctx, x - 1, 30, 'rgba(0,0,0,0.25)', w + 2, 2);                 // threshold shade
}
/** Corrugated roof sheet: vertical ribs of period 4 in the given palette, with a few rust specks. */
function corrugation(ctx, pal, x, y, w, h, r) {
  px(ctx, x, y, pal.base, w, h);
  for (let k = x; k < x + w; k += 4) { px(ctx, k, y, pal.light, 1, h); px(ctx, k + 3, y, pal.dark, 1, h); }
  if (r) for (let i = 0; i < 4; i++) { const rx = ri(r, x, x + w - 2), ry = ri(r, y, y + h - 2); px(ctx, rx, ry, pal.rust, 1, 2); px(ctx, rx + 1, ry + 1, pal.rust, 1, 1); }
}
function ridge(ctx, pal, x = 0, w = 32) { px(ctx, x, 0, pal.ink, w, 1); px(ctx, x, 1, pal.light, w, 2); px(ctx, x, 3, pal.dark, w, 1); px(ctx, x, 4, pal.deep, w, 1); }
function eave(ctx, pal, x = 0, w = 32) { px(ctx, x, 28, pal.dark, w, 1); px(ctx, x, 29, pal.deep, w, 2); px(ctx, x, 31, pal.ink, w, 1); }
function gable(ctx, pal, side, y = 0, h = 32) { if (side === 'w') { px(ctx, 0, y, pal.ink, 1, h); px(ctx, 1, y, pal.light, 1, h); } else { px(ctx, 31, y, pal.ink, 1, h); px(ctx, 30, y, pal.deep, 1, h); } }
/** A roof tile with any combination of edges: n = ridge, s = eave, w/e = gable boards. */
function roofTile(ctx, pal, edges, r) {
  corrugation(ctx, pal, 0, 0, 32, 32, r);
  if (edges.includes('n') && edges.includes('s')) { // one-row roof strip: a sun-lit slope towards the ridge, shade under the eave
    px(ctx, 0, 3, 'rgba(255,255,255,0.14)', 32, 8); px(ctx, 0, 3, 'rgba(255,255,255,0.10)', 32, 3); px(ctx, 0, 22, 'rgba(0,0,0,0.14)', 32, 6);
  }
  if (edges.includes('n')) ridge(ctx, pal);
  if (edges.includes('s')) eave(ctx, pal);
  if (edges.includes('w')) gable(ctx, pal, 'w');
  if (edges.includes('e')) gable(ctx, pal, 'e');
}

/** Painted sign board: 1 px ink border, coloured band, text; returns nothing. */
function board(ctx, x, y, w, h, fill, ink = SIGN.ink) {
  px(ctx, x, y, ink, w, h); px(ctx, x + 1, y + 1, fill, w - 2, h - 2);
  px(ctx, x + 1, y + 1, 'rgba(255,255,255,0.35)', w - 2, 1); px(ctx, x + 1, y + h - 2, 'rgba(0,0,0,0.18)', w - 2, 1);
  px(ctx, x + 1, y + 1, 'rgba(255,255,255,0.25)', 1, h - 2);
}
/** Free-standing sign: a board on a steel post with a contact shadow. */
function standingSign(ctx, colour, label, icon, textC = SIGN.white, textShadow = 'rgba(0,0,0,0.3)') {
  shadow(ctx, 16, 29.5, 6, 2);
  px(ctx, 15, 16, MT.ink, 3, 14); px(ctx, 15, 16, MT.light, 1, 13); px(ctx, 17, 16, MT.dark, 1, 13);
  px(ctx, 12, 29, MT.ink, 9, 2); px(ctx, 13, 29, MT.base, 7, 1);
  board(ctx, 1, 2, 30, 15, colour);
  if (icon) icon(ctx);
  textCentered(ctx, 16, 9, label, textC, 1, textShadow);
  px(ctx, 3, 4, SIGN.white, 1, 1); px(ctx, 28, 4, SIGN.white, 1, 1); px(ctx, 3, 14, SIGN.ink, 1, 1); px(ctx, 28, 14, SIGN.ink, 1, 1); // screws
}

// ---------------------------------------------------------------- multi-tile objects (drawn once, split into tiles)
const cache = new Map();
function cached(key, w, h, fn) {
  if (!cache.has(key)) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    fn(ctx, lcg(key.length * 977 + w * 13 + h));
    cache.set(key, c);
  }
  return cache.get(key);
}
/** Blit cell (cx, cy) of the cached object `key` (w×h px) into the current tile. */
function part(ctx, key, w, h, cx, cy, fn) { ctx.drawImage(cached(key, w, h, fn), cx * 32, cy * 32, 32, 32, 0, 0, 32, 32); }

/** Wide sign for a facade (64x32): wall behind, board with 2x text, small motif. */
function wideSign(ctx, r, wallPal, colour, label, motif) {
  plaster(ctx, 64, wallPal, 61);
  px(ctx, 4, 27, 'rgba(0,0,0,0.22)', 58, 2);
  board(ctx, 3, 4, 58, 22, colour);
  textCentered(ctx, 32, 9, label, SIGN.white, 2, 'rgba(0,0,0,0.35)');
  if (motif) motif(ctx);
  for (const [x, y] of [[5, 6], [58, 6], [5, 23], [58, 23]]) px(ctx, x, y, y < 10 ? SIGN.white : SIGN.ink);
}
function awningStripes(ctx, x, y, w, h, a, b) {
  for (let k = 0; k < w; k += 6) px(ctx, x + k, y, ((k / 6) | 0) % 2 ? b : a, Math.min(6, w - k), h);
}
/** Striped fabric awning with a scalloped hem, over the top of a tile. */
function awning(ctx, a, b, x = 0, w = 32, y = 2) {
  px(ctx, x, y - 2, MT.ink, w, 1); px(ctx, x, y - 1, MT.light, w, 1);
  awningStripes(ctx, x, y, w, 8, a, b);
  px(ctx, x, y, 'rgba(255,255,255,0.28)', w, 1);
  px(ctx, x, y + 6, 'rgba(0,0,0,0.18)', w, 2);
  for (let k = x; k < x + w; k += 6) { // scallops
    const c = ((k - x) / 6 | 0) % 2 ? b : a;
    px(ctx, k, y + 8, c, 6, 1); px(ctx, k + 1, y + 9, c, 4, 1); px(ctx, k + 2, y + 10, c, 2, 1);
    px(ctx, k + 1, y + 10, 'rgba(0,0,0,0.3)', 1, 1); px(ctx, k + 4, y + 10, 'rgba(0,0,0,0.3)', 1, 1); px(ctx, k + 2, y + 11, 'rgba(0,0,0,0.3)', 2, 1);
  }
  px(ctx, x, y + 11, 'rgba(0,0,0,0.16)', w, 2);
}

function drawKiosk(ctx, r) {
  // 64x64: a small ochre box shop; grey corrugated roof, hatch with goods on the left, door on the right.
  shadow(ctx, 32, 62, 30, 2.5, 0.3);
  ctx.save();
  // wall body
  px(ctx, 0, 20, OCH.base, 64, 44);
  const rp = lcg(68); for (let i = 0; i < 40; i++) px(ctx, ri(rp, 1, 62), ri(rp, 22, 62), rp() < 0.5 ? OCH.dark : OCH.light);
  px(ctx, 0, 20, OCH.ink, 1, 44); px(ctx, 63, 20, OCH.ink, 1, 44); px(ctx, 1, 20, OCH.light, 1, 44); px(ctx, 62, 20, OCH.deep, 1, 44);
  px(ctx, 0, 60, OCH.plinth, 64, 4); px(ctx, 0, 60, OCH.deep, 64, 1);
  // roof
  corrugation(ctx, RG, 0, 4, 64, 18, r);
  px(ctx, 0, 4, RG.ink, 64, 1); px(ctx, 0, 5, RG.light, 64, 1); px(ctx, 0, 6, RG.dark, 64, 1);
  px(ctx, 0, 20, RG.dark, 64, 1); px(ctx, 0, 21, RG.deep, 64, 1); px(ctx, 0, 22, RG.ink, 64, 1); px(ctx, 0, 23, 'rgba(0,0,0,0.25)', 64, 2);
  px(ctx, 0, 4, RG.ink, 1, 19); px(ctx, 63, 4, RG.ink, 1, 19);
  // hand-painted name board on the roof edge
  board(ctx, 6, 8, 34, 11, SIGN.yellow); text(ctx, 9, 11, 'KIOSK', SIGN.ink, 1);
  // hatch: dark opening with shelves of goods and a lifted shutter
  box(ctx, 5, 28, 26, 24, '#3a2a1e', OCH.ink);
  px(ctx, 6, 29, '#2a1d14', 24, 22);
  px(ctx, 6, 36, WD.base, 24, 2); px(ctx, 6, 44, WD.base, 24, 2);
  const goods = ['#e0433c', '#3e8ed0', '#f0c23c', '#43a552', '#ffffff', '#e08a2c'];
  for (let i = 0; i < 6; i++) { px(ctx, 7 + i * 4, 32, goods[i], 3, 4); px(ctx, 7 + i * 4, 32, 'rgba(255,255,255,0.4)', 1, 1); }
  for (let i = 0; i < 6; i++) { px(ctx, 7 + i * 4, 40, goods[(i + 3) % 6], 3, 4); px(ctx, 7 + i * 4, 40, 'rgba(255,255,255,0.4)', 1, 1); }
  for (let i = 0; i < 4; i++) { px(ctx, 8 + i * 6, 47, '#d9e6ee', 3, 4); px(ctx, 9 + i * 6, 46, '#d9e6ee', 1, 1); }
  px(ctx, 4, 25, MT.ink, 28, 4); px(ctx, 5, 26, RB.light, 26, 2); px(ctx, 5, 26, 'rgba(255,255,255,0.4)', 26, 1); // lifted shutter
  px(ctx, 5, 51, WD.ink, 26, 3); px(ctx, 5, 51, WD.light, 26, 1); px(ctx, 5, 52, WD.base, 26, 1); // counter ledge
  // small painted ads
  px(ctx, 36, 30, SIGN.red, 8, 6); px(ctx, 37, 31, SIGN.white, 6, 1); px(ctx, 37, 33, SIGN.white, 4, 1);
  px(ctx, 36, 38, SIGN.green, 8, 6); px(ctx, 37, 39, SIGN.white, 6, 1); px(ctx, 39, 41, SIGN.white, 3, 1);
  // door (cell 1,1)
  door(ctx, 45, 30, 14, OCH);
  ctx.restore();
}

function drawStall(ctx, r, variant) {
  // 64x64 market stall: striped canopy on poles, a table with produce and a cloth.
  const [a, b] = variant === 0 ? [SIGN.red, SIGN.white] : [SIGN.green, '#f7f1d8'];
  shadow(ctx, 32, 61, 28, 3, 0.32);
  // poles
  for (const x of [4, 57]) { px(ctx, x, 20, WD.ink, 3, 36); px(ctx, x + 1, 20, WD.light, 1, 35); px(ctx, x + 2, 20, WD.dark, 1, 35); }
  // table: wooden top seen from above (y 30..46), cloth hanging over the front (y 46..57)
  px(ctx, 6, 29, WD.ink, 52, 29); px(ctx, 7, 30, WD.light, 50, 16); px(ctx, 7, 30, '#e2b678', 50, 1); px(ctx, 7, 44, WD.base, 50, 2);
  for (const x of [22, 40]) px(ctx, x, 31, WD.base, 1, 14);
  px(ctx, 7, 46, variant === 0 ? '#e8d9a8' : '#c9dbe6', 50, 11); px(ctx, 7, 46, 'rgba(0,0,0,0.18)', 50, 1); px(ctx, 7, 56, variant === 0 ? '#c9b784' : '#9fb8c9', 50, 1);
  for (let x = 11; x < 56; x += 8) px(ctx, x, 48, variant === 0 ? '#c9382f' : '#2a63b8', 2, 8);
  for (let x = 8; x < 56; x += 4) px(ctx, x, 57, 'rgba(0,0,0,0.25)', 2, 1); // fringe
  // crates and produce
  const crate = (x, y, w, h, fill, fruit, fruitL) => {
    box(ctx, x, y, w, h, WD.base, WD.ink); px(ctx, x + 1, y + 1, WD.light, w - 2, 1); px(ctx, x + 1, y + h - 2, WD.dark, w - 2, 1);
    for (let k = 0; k < Math.floor((w - 4) / 4); k++) for (let j = 0; j < 2; j++) { circle(ctx, x + 4 + k * 4, y + 4 + j * 3, 1.8, fill); px(ctx, x + 3 + k * 4, y + 3 + j * 3, fruitL); void fruit; }
  };
  if (variant === 0) {
    crate(9, 32, 18, 12, '#d73a2f', null, '#ff8a7a');    // tomatoes
    crate(29, 32, 18, 12, '#f2c12e', null, '#fff1a8');   // mangoes
    for (let i = 0; i < 3; i++) { px(ctx, 48, 33 + i * 4, '#7f6a1e', 8, 3); px(ctx, 48, 33 + i * 4, '#f4d34a', 7, 2); px(ctx, 49, 33 + i * 4, '#fff1a8', 3, 1); } // bananas
    px(ctx, 48, 33, '#5f8a2a', 2, 1); px(ctx, 48, 41, '#5f8a2a', 2, 1);
  } else {
    crate(9, 32, 18, 12, '#5aa93c', null, '#b9ee8a');    // limes / greens
    crate(29, 32, 18, 12, '#e27b26', null, '#ffc98a');   // oranges
    for (let i = 0; i < 4; i++) { px(ctx, 48 + i * 3, 33 + (i % 2), '#5b3018', 2, 9); px(ctx, 48 + i * 3, 33 + (i % 2), '#b5714a', 1, 9); px(ctx, 48 + i * 3, 33 + (i % 2), '#d9a07a', 1, 2); } // cassava
  }
  // canopy: striped, with scalloped hem and a slight slope highlight
  poly(ctx, [[0, 14], [64, 14], [64, 28], [0, 28]], MT.ink);
  awningStripes(ctx, 1, 15, 62, 11, a, b);
  px(ctx, 1, 15, 'rgba(255,255,255,0.3)', 62, 1); px(ctx, 1, 24, 'rgba(0,0,0,0.2)', 62, 2);
  poly(ctx, [[1, 15], [63, 15], [63, 8], [1, 8]], variant === 0 ? '#e9e2d2' : '#e2eadf', MT.ink, 1); // top of the canopy (roof plane)
  px(ctx, 2, 9, 'rgba(255,255,255,0.5)', 60, 1); px(ctx, 2, 13, 'rgba(0,0,0,0.12)', 60, 2);
  for (let k = 1; k < 63; k += 6) { const c = ((k - 1) / 6 | 0) % 2 ? b : a; px(ctx, k, 26, c, 6, 1); px(ctx, k + 1, 27, c, 4, 1); px(ctx, k + 2, 28, c, 2, 1); px(ctx, k + 1, 28, MT.ink, 1, 1); px(ctx, k + 4, 28, MT.ink, 1, 1); px(ctx, k + 2, 29, MT.ink, 2, 1); }
  px(ctx, 1, 29, 'rgba(0,0,0,0.2)', 62, 2);
  px(ctx, 0, 13, MT.ink, 64, 1); px(ctx, 0, 7, MT.ink, 64, 1);
  // pole tops above the canopy
  for (const x of [3, 58]) { px(ctx, x, 4, WD.ink, 3, 5); px(ctx, x + 1, 5, WD.light, 1, 3); }
  void r;
}

function drawFountain(ctx, r) {
  // 64x64 round stone fountain with a central pedestal and jets.
  shadow(ctx, 32, 58, 30, 5, 0.3);
  ellipse(ctx, 32, 40, 30, 19, MT.ink);
  ellipse(ctx, 32, 39, 29, 18, SW.dark);
  ellipse(ctx, 32, 37, 28, 17, SW.base);
  ellipse(ctx, 32, 36, 27, 16, SW.light);
  // rim stones
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) { const x = 32 + Math.cos(a) * 27, y = 36 + Math.sin(a) * 16; px(ctx, Math.round(x), Math.round(y), SW.joint, 1, 2); }
  ellipse(ctx, 32, 37, 23, 12.5, SW.deep);
  ellipse(ctx, 32, 36.5, 22, 12, '#3d86c7');
  ellipse(ctx, 32, 36, 21, 11, '#4a97d9');
  ellipse(ctx, 30, 34, 16, 7, '#5eaae6');
  for (const [x, y, w] of [[14, 38, 8], [26, 44, 10], [40, 31, 8], [44, 40, 7], [20, 30, 6]]) { px(ctx, x, y, '#a8dbf5', w, 1); px(ctx, x + 1, y, '#e8f7ff', Math.max(2, w >> 2), 1); }
  // pedestal
  ellipse(ctx, 32, 37, 8, 4.5, 'rgba(20,50,80,0.4)');
  ellipse(ctx, 32, 35, 7, 4, MT.ink); ellipse(ctx, 32, 34, 6, 3, SW.base); px(ctx, 28, 32, SW.light, 6, 1);
  px(ctx, 29, 18, MT.ink, 7, 16); px(ctx, 30, 19, SW.base, 5, 15); px(ctx, 30, 19, SW.light, 1, 15); px(ctx, 33, 19, SW.dark, 2, 15);
  ellipse(ctx, 32, 18, 6, 3, MT.ink); ellipse(ctx, 32, 17, 5, 2.5, SW.light); ellipse(ctx, 32, 16.5, 4, 1.5, '#4a97d9');
  // jets
  for (const [dx, top] of [[0, 4], [-5, 8], [5, 8]]) {
    ctx.strokeStyle = '#a8dbf5'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(32, 15); ctx.quadraticCurveTo(32 + dx * 1.5, top, 32 + dx * 3, 24); ctx.stroke();
    px(ctx, 32 + dx * 3 - 1, 25, '#e8f7ff', 3, 1); px(ctx, 32 + dx * 3, 24, '#ffffff', 1, 1);
  }
  px(ctx, 31, 12, '#e8f7ff', 2, 3); px(ctx, 32, 11, '#ffffff', 1, 1);
  // splashes on the water
  for (let i = 0; i < 6; i++) { const x = ri(r, 14, 48), y = ri(r, 28, 44); px(ctx, x, y, '#e8f7ff', 2, 1); }
}

function drawShelter(ctx, r) {
  // 96x64 bus shelter: corrugated roof on steel posts, open front, blue back wall with a bench.
  shadow(ctx, 48, 62, 44, 3, 0.3);
  // back wall (seen through the open front): white upper band, blue lower band
  px(ctx, 6, 30, MT.ink, 84, 30); px(ctx, 7, 31, WHT.base, 82, 12); px(ctx, 7, 43, RB.base, 82, 16); px(ctx, 7, 43, RB.light, 82, 1); px(ctx, 7, 57, RB.deep, 82, 2);
  px(ctx, 7, 31, WHT.light, 82, 1);
  const rp = lcg(71); for (let i = 0; i < 30; i++) px(ctx, ri(rp, 8, 88), ri(rp, 32, 42), rp() < 0.5 ? WHT.dark : WHT.light);
  // timetable poster and a route board
  box(ctx, 62, 33, 14, 18, '#f7f2e4', MT.ink); for (let k = 0; k < 5; k++) px(ctx, 64, 36 + k * 3, k % 2 ? '#8a8a8a' : SIGN.blue, 10 - (k % 3) * 2, 1);
  box(ctx, 12, 33, 20, 8, SIGN.yellow, MT.ink); text(ctx, 14, 35, 'BASI', SIGN.ink, 1);
  // bench
  px(ctx, 14, 46, MT.ink, 56, 3); px(ctx, 15, 47, MT.base, 54, 1);
  px(ctx, 12, 49, WD.ink, 60, 6); px(ctx, 13, 50, WD.base, 58, 4); px(ctx, 13, 50, WD.light, 58, 1); px(ctx, 13, 52, WD.dark, 58, 1);
  for (const x of [16, 66]) { px(ctx, x, 55, MT.ink, 2, 5); }
  // posts
  for (const x of [3, 91]) { px(ctx, x, 24, MT.ink, 3, 36); px(ctx, x + 1, 25, MT.light, 1, 34); }
  // roof plane (seen from above) with ridge and eave, plus a fascia and the blue-white bus sign standing on it
  px(ctx, 0, 6, RG.ink, 96, 22);
  corrugation(ctx, RG, 1, 7, 94, 20, r);
  px(ctx, 1, 7, RG.light, 94, 1); px(ctx, 1, 8, RG.dark, 94, 1);
  px(ctx, 1, 24, RG.dark, 94, 1); px(ctx, 1, 25, RG.deep, 94, 2); px(ctx, 0, 27, RG.ink, 96, 1); px(ctx, 1, 28, 'rgba(0,0,0,0.28)', 94, 3);
  // sign: blue board with a white bus pictogram and "BASI"
  px(ctx, 47, 2, MT.ink, 2, 6);
  board(ctx, 30, 0, 36, 12, SIGN.blue);
  busIcon(ctx, 33, 2, 1);
  text(ctx, 46, 3, 'BASI', SIGN.white, 1, 'rgba(0,0,0,0.3)');
}
function busIcon(ctx, x, y, k = 1) {
  px(ctx, x, y + 1, SIGN.white, 10 * k, 6 * k); px(ctx, x + 1, y, SIGN.white, 8 * k, 1);
  px(ctx, x + 1, y + 2, SIGN.blue, 3 * k, 2 * k); px(ctx, x + 6, y + 2, SIGN.blue, 3 * k, 2 * k);
  px(ctx, x + 1, y + 7, SIGN.ink, 2, 1); px(ctx, x + 7, y + 7, SIGN.ink, 2, 1);
}

/** Wall with a fabric awning over a window (restaurant ground floor). */
function wallAwning(ctx, s, r) {
  plaster(ctx, s, OCH, 73);
  window_(ctx, 8, 12, 16, 14);
  awning(ctx, SIGN.red, '#f7f1d8', 0, 32, 3);
}

// ---------------------------------------------------------------- street objects
function drawBench(ctx) {
  shadow(ctx, 16, 28, 14, 2.5);
  for (const x of [5, 25]) { px(ctx, x, 14, MT.ink, 3, 14); px(ctx, x + 1, 15, MT.light, 1, 12); }
  px(ctx, 3, 18, MT.ink, 27, 2); px(ctx, 3, 27, MT.ink, 27, 1);
  // slats: back rest (upper), seat (lower)
  for (const y of [7, 11]) { px(ctx, 2, y, WD.ink, 28, 4); px(ctx, 3, y + 1, WD.base, 26, 2); px(ctx, 3, y + 1, WD.light, 26, 1); }
  for (const y of [16, 20]) { px(ctx, 2, y, WD.ink, 28, 4); px(ctx, 3, y + 1, WD.base, 26, 2); px(ctx, 3, y + 1, WD.light, 26, 1); px(ctx, 3, y + 2, WD.dark, 26, 1); }
  px(ctx, 2, 24, WD.deep, 28, 1);
}
function drawLamp(ctx) {
  shadow(ctx, 16, 29.5, 6, 2);
  px(ctx, 11, 27, MT.ink, 10, 3); px(ctx, 12, 27, MT.base, 8, 1); px(ctx, 13, 26, MT.ink, 6, 1);
  px(ctx, 14, 8, MT.ink, 4, 19); px(ctx, 15, 8, MT.light, 1, 18); px(ctx, 16, 8, MT.base, 1, 18);
  px(ctx, 13, 12, MT.ink, 6, 1); px(ctx, 13, 11, MT.light, 6, 1);
  // lantern head
  poly(ctx, [[8, 8], [24, 8], [21, 1], [11, 1]], '#f8e79a', MT.ink, 1);
  px(ctx, 11, 3, '#ffffff', 4, 2); px(ctx, 12, 5, '#ffe985', 8, 2);
  px(ctx, 9, 8, MT.ink, 14, 2); px(ctx, 15, 0, MT.ink, 2, 1); px(ctx, 10, 9, MT.base, 12, 1);
  ellipse(ctx, 16, 12, 9, 3, 'rgba(255,230,120,0.28)');
}
function drawTrash(ctx) {
  shadow(ctx, 16, 29, 9, 2.5);
  px(ctx, 9, 10, GR.outline, 14, 19); px(ctx, 10, 11, '#3f8a45', 12, 17); px(ctx, 10, 11, '#5aa85e', 2, 17); px(ctx, 19, 11, '#2b6a31', 3, 17);
  for (const y of [15, 21]) px(ctx, 10, y, '#2b6a31', 12, 1);
  px(ctx, 7, 8, GR.outline, 18, 3); px(ctx, 8, 9, '#5aa85e', 16, 1); px(ctx, 8, 8, '#77c07a', 16, 1);
  px(ctx, 13, 6, GR.outline, 6, 3); px(ctx, 14, 7, '#5aa85e', 4, 1);
  px(ctx, 12, 17, '#f4f0dc', 8, 4); px(ctx, 13, 18, '#3f8a45', 6, 1);
  px(ctx, 9, 28, GR.outline, 14, 1);
}
function drawHydrant(ctx) {
  shadow(ctx, 16, 29.5, 7, 2);
  px(ctx, 11, 27, RR.ink, 10, 3); px(ctx, 12, 27, RR.dark, 8, 1);
  px(ctx, 12, 12, RR.ink, 8, 16); px(ctx, 13, 13, RR.base, 6, 14); px(ctx, 13, 13, RR.light, 2, 14); px(ctx, 17, 13, RR.dark, 2, 14);
  px(ctx, 7, 16, RR.ink, 18, 5); px(ctx, 8, 17, RR.base, 16, 3); px(ctx, 8, 17, RR.light, 16, 1); px(ctx, 8, 19, RR.dark, 16, 1);
  px(ctx, 6, 17, MT.ink, 3, 3); px(ctx, 23, 17, MT.ink, 3, 3); px(ctx, 7, 18, MT.light, 1, 1);
  px(ctx, 11, 8, RR.ink, 10, 5); px(ctx, 12, 9, RR.base, 8, 3); px(ctx, 12, 9, RR.light, 8, 1);
  px(ctx, 13, 5, RR.ink, 6, 4); px(ctx, 14, 6, RR.light, 4, 2); px(ctx, 15, 4, RR.ink, 2, 1);
  px(ctx, 14, 22, RR.dark, 4, 3);
}
function drawHedge(ctx, r) {
  shadow(ctx, 16, 29, 16, 2.5, 0.25);
  px(ctx, 0, 6, GR.outline, 32, 22);
  px(ctx, 0, 7, GR.dark, 32, 20);
  px(ctx, 0, 7, GR.mid, 32, 9); px(ctx, 0, 7, GR.light, 32, 4);
  for (let i = 0; i < 60; i++) { const x = ri(r, 0, 31), y = ri(r, 7, 26); px(ctx, x, y, y < 12 ? GR.hi : y < 18 ? GR.light : GR.dark); }
  for (let i = 0; i < 14; i++) { const x = ri(r, 0, 31), y = ri(r, 8, 25); px(ctx, x, y, GR.outline, 1, 1); }
  for (let i = 0; i < 10; i++) { const x = ri(r, 0, 31); px(ctx, x, 6 + (i % 2), GR.mid, 1, 1); px(ctx, x, 5, GR.light, 1, 1); }
  px(ctx, 0, 27, GR.outline, 32, 1);
}
function drawFlowerbed(ctx, r) {
  px(ctx, 2, 8, SW.deep, 28, 20); px(ctx, 3, 9, SW.base, 26, 18); px(ctx, 3, 9, SW.light, 26, 1);
  px(ctx, 5, 11, '#5f3f26', 22, 14); px(ctx, 5, 11, '#7a5433', 22, 2);
  for (let i = 0; i < 40; i++) px(ctx, ri(r, 5, 26), ri(r, 11, 24), r() < 0.5 ? '#4b2f1b' : '#8a6238');
  for (let i = 0; i < 9; i++) { const x = ri(r, 6, 25), y = ri(r, 12, 23); px(ctx, x, y + 1, GR.dark, 1, 2); px(ctx, x - 1, y + 1, GR.light, 1, 1); px(ctx, x + 1, y + 2, GR.light, 1, 1); }
  const cols = ['#ff5a6a', '#ffd23f', '#ff9ad4', '#fff4f4', '#ff8c2a'];
  for (let i = 0; i < 8; i++) { const x = ri(r, 6, 25), y = ri(r, 12, 22), c = pick(r, cols); circle(ctx, x + 0.5, y + 0.5, 1.7, c); px(ctx, x, y, '#ffffff'); px(ctx, x, y + 1, 'rgba(0,0,0,0.2)'); }
  for (let k = 3; k < 29; k += 6) { px(ctx, k, 9, SW.joint, 1, 1); px(ctx, k, 26, SW.joint, 1, 1); }
  for (let k = 12; k < 26; k += 6) { px(ctx, 3, k, SW.joint, 1, 1); px(ctx, 28, k, SW.joint, 1, 1); }
  px(ctx, 3, 26, SW.dark, 26, 1);
}
function railingH(ctx) {
  const ink = '#1f2328', mid = '#3c424a', light = '#6b737c';
  px(ctx, 0, 10, ink, 32, 3); px(ctx, 0, 11, mid, 32, 1); px(ctx, 0, 24, ink, 32, 3); px(ctx, 0, 25, mid, 32, 1);
  for (let x = 2; x < 32; x += 6) { px(ctx, x, 6, ink, 3, 22); px(ctx, x + 1, 8, light, 1, 18); px(ctx, x + 1, 5, ink, 1, 1); px(ctx, x + 1, 6, '#c2a24a', 1, 1); }
  px(ctx, 0, 27, 'rgba(0,0,0,0.2)', 32, 2);
}
function railingV(ctx) {
  const ink = '#1f2328', mid = '#3c424a', light = '#6b737c';
  px(ctx, 11, 0, ink, 3, 32); px(ctx, 12, 0, mid, 1, 32); px(ctx, 19, 0, ink, 3, 32); px(ctx, 20, 0, mid, 1, 32);
  for (let y = 1; y < 32; y += 6) { px(ctx, 10, y, ink, 12, 2); px(ctx, 10, y, light, 12, 1); }
  px(ctx, 22, 0, 'rgba(0,0,0,0.2)', 2, 32);
}
function drawGate(ctx) {
  shadow(ctx, 16, 29, 15, 2.5);
  // brick pillars
  for (const x of [0, 26]) {
    px(ctx, x, 2, OCH.ink, 6, 27); px(ctx, x + 1, 3, OCH.plinth, 4, 25); px(ctx, x + 1, 3, OCH.light, 1, 25);
    for (let y = 6; y < 27; y += 5) px(ctx, x + 1, y, OCH.deep, 4, 1);
    px(ctx, x - 1, 1, OCH.ink, 8, 3); px(ctx, x, 2, SW.light, 6, 1);
  }
  // steel gate leaves
  const ink = '#1f2328', mid = '#3c424a', light = '#6b737c';
  px(ctx, 6, 8, ink, 20, 3); px(ctx, 6, 9, mid, 20, 1); px(ctx, 6, 22, ink, 20, 3); px(ctx, 6, 23, mid, 20, 1);
  for (let x = 7; x < 26; x += 4) { px(ctx, x, 5, ink, 2, 22); px(ctx, x, 6, light, 1, 20); px(ctx, x, 4, '#c2a24a', 2, 1); }
  px(ctx, 15, 5, ink, 2, 22);
  // chain and padlock
  px(ctx, 12, 14, '#b0b5bd', 8, 2); px(ctx, 12, 14, '#e2e6ea', 8, 1);
  px(ctx, 14, 15, '#d9a92c', 5, 5); px(ctx, 15, 16, '#8a6a12', 3, 3); px(ctx, 15, 13, '#b0b5bd', 3, 2); px(ctx, 16, 13, '#d9a92c', 1, 1);
  px(ctx, 6, 27, 'rgba(0,0,0,0.25)', 20, 2);
}
function drawBarrier(ctx) {
  shadow(ctx, 16, 28, 14, 2.5);
  for (const x of [4, 25]) { px(ctx, x, 12, MT.ink, 3, 16); px(ctx, x + 1, 13, MT.light, 1, 14); px(ctx, x - 1, 27, MT.ink, 5, 2); }
  px(ctx, 1, 8, MT.ink, 30, 9);
  for (let k = 0; k < 28; k += 7) { px(ctx, 2 + k, 9, (k / 7) % 2 ? '#f2f2ee' : '#d6382e', 7, 7); }
  px(ctx, 2, 9, 'rgba(255,255,255,0.35)', 28, 1); px(ctx, 2, 15, 'rgba(0,0,0,0.25)', 28, 1);
  px(ctx, 1, 20, MT.ink, 30, 3); px(ctx, 2, 21, MT.base, 28, 1);
}
function drawAtm(ctx) {
  shadow(ctx, 16, 29, 10, 2.5);
  px(ctx, 7, 3, MT.ink, 18, 26); px(ctx, 8, 4, '#2f5f9e', 16, 24); px(ctx, 8, 4, '#4a7fc0', 16, 1); px(ctx, 8, 4, '#4a7fc0', 1, 24); px(ctx, 22, 5, '#213f68', 2, 23);
  box(ctx, 10, 7, 12, 8, '#8fd6d0', MT.ink); px(ctx, 11, 8, '#c9f1ec', 10, 1); px(ctx, 12, 10, '#1f4d4a', 5, 1); px(ctx, 12, 12, '#1f4d4a', 7, 1);
  px(ctx, 10, 17, MT.ink, 12, 4); px(ctx, 11, 18, '#d9dde2', 10, 2); for (let x = 12; x < 20; x += 3) px(ctx, x, 18, '#8a8f96', 1, 2);
  px(ctx, 10, 23, MT.ink, 12, 3); px(ctx, 11, 24, '#111', 10, 1);
  px(ctx, 9, 5, '#213f68', 14, 1); px(ctx, 10, 5, SIGN.yellow, 12, 1); px(ctx, 10, 1, MT.ink, 12, 3); px(ctx, 11, 2, SIGN.yellow, 10, 1);
  px(ctx, 8, 27, '#213f68', 16, 1);
}
function drawCone(ctx) {
  shadow(ctx, 16, 28.5, 8, 2);
  px(ctx, 6, 25, '#1f2328', 20, 4); px(ctx, 7, 26, '#e0682a', 18, 2); px(ctx, 7, 26, '#f28a48', 18, 1);
  poly(ctx, [[12, 25], [20, 25], [17, 5], [15, 5]], '#f06a2c', '#1f2328', 1);
  poly(ctx, [[13, 24], [15, 24], [15.5, 6]], '#ff9a5c');
  px(ctx, 13, 12, '#f5f5f0', 6, 4); px(ctx, 13, 12, '#ffffff', 6, 1); px(ctx, 14, 19, '#f5f5f0', 5, 2);
  px(ctx, 17, 13, '#c9c9c0', 2, 3);
}

// ---------------------------------------------------------------- interiors
function woodFloor(ctx, s, seed = 83) {
  const r = lcg(seed);
  px(ctx, 0, 0, WD.base, s, s);
  for (let row = 0; row < 4; row++) {
    const y = row * 8, off = row % 2 ? 12 : 0;
    px(ctx, 0, y, WD.dark, s, 1);
    px(ctx, 0, y + 1, r() < 0.5 ? '#b8834e' : WD.base, s, 7);
    px(ctx, 0, y + 1, WD.light, s, 1);
    for (let k = -1; k < 3; k++) { const x = k * 24 + off; px(ctx, x, y, WD.deep, 1, 8); px(ctx, x + 1, y + 1, WD.light, 1, 6); }
    for (let i = 0; i < 6; i++) { const x = ri(r, 0, s - 1); wrap(ctx, s, () => px(ctx, x, y + ri(r, 2, 6), WD.dark, ri(r, 2, 5), 1)); }
  }
}
function tileFloor(ctx, s) {
  px(ctx, 0, 0, '#c7b9a0', s, s);
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const x = gx * 8, y = gy * 8, dark = (gx + gy) % 2;
    px(ctx, x, y, dark ? '#c88a5e' : '#efe6d2', 8, 8);
    px(ctx, x, y, dark ? '#dda276' : '#fbf6ea', 7, 1); px(ctx, x, y, dark ? '#dda276' : '#fbf6ea', 1, 7);
    px(ctx, x + 7, y, dark ? '#9e6a44' : '#cfc3a9', 1, 8); px(ctx, x, y + 7, dark ? '#9e6a44' : '#cfc3a9', 8, 1);
  }
}
function interiorWall(ctx, s, r) {
  px(ctx, 0, 0, '#5c4a3a', s, 4); px(ctx, 0, 0, '#7a6450', s, 1); px(ctx, 0, 3, '#3f3226', s, 1); // top of the wall
  px(ctx, 0, 4, '#f1e4c8', s, 22);
  for (let i = 0; i < 24; i++) px(ctx, ri(r, 0, 31), ri(r, 5, 24), r() < 0.5 ? '#e6d7b8' : '#f9efdc');
  px(ctx, 0, 4, 'rgba(0,0,0,0.12)', s, 2);
  px(ctx, 0, 26, '#2f7a72', s, 6); px(ctx, 0, 26, '#4a9c92', s, 1); px(ctx, 0, 31, '#1e524c', s, 1); // painted dado band
}
function drawCounter(ctx) {
  px(ctx, 0, 6, WD.ink, 32, 24);
  px(ctx, 0, 7, WD.light, 32, 7); px(ctx, 0, 7, '#e2b678', 32, 1); px(ctx, 0, 13, WD.base, 32, 1);
  for (let x = 3; x < 32; x += 11) px(ctx, x, 9, WD.base, 6, 1);
  px(ctx, 0, 14, WD.ink, 32, 1);
  px(ctx, 0, 15, WD.base, 32, 14); px(ctx, 0, 15, WD.dark, 32, 1);
  for (const x of [1, 12, 23]) { box(ctx, x, 17, 9, 10, WD.base, WD.deep); px(ctx, x + 1, 18, WD.light, 7, 1); px(ctx, x + 4, 22, '#e8c86a', 2, 1); }
  px(ctx, 0, 29, WD.deep, 32, 1); px(ctx, 0, 30, 'rgba(0,0,0,0.2)', 32, 2);
}
function drawTable(ctx) {
  shadow(ctx, 16, 28, 13, 3);
  for (const x of [6, 23]) { px(ctx, x, 20, WD.ink, 3, 8); px(ctx, x + 1, 21, WD.light, 1, 6); }
  px(ctx, 2, 6, '#7a2a2a', 28, 16);
  px(ctx, 3, 7, '#d33b3b', 26, 13);
  for (let y = 7; y < 20; y += 4) for (let x = 3; x < 29; x += 4) if (((x - 3) / 4 + (y - 7) / 4) % 2 === 0) px(ctx, x, y, '#f4efe4', 4, 4);
  px(ctx, 3, 7, 'rgba(255,255,255,0.35)', 26, 1); px(ctx, 3, 19, 'rgba(0,0,0,0.25)', 26, 2);
  px(ctx, 4, 21, '#7a2a2a', 3, 3); px(ctx, 25, 21, '#7a2a2a', 3, 3); // cloth corners hanging
  circle(ctx, 16.5, 13.5, 4.5, '#2a2118'); circle(ctx, 16.5, 13.5, 3.7, '#f7f2e4'); circle(ctx, 16.5, 13.5, 2, '#d8a34a'); px(ctx, 15, 12, '#ffffff', 1, 1); // plate
  px(ctx, 22, 10, '#8a8f96', 1, 7); px(ctx, 10, 10, '#8a8f96', 1, 7); px(ctx, 9, 10, '#8a8f96', 3, 1);
}
function drawChair(ctx) {
  shadow(ctx, 16, 27.5, 8, 2.2, 0.22);
  px(ctx, 9, 4, WD.ink, 14, 12); px(ctx, 10, 5, WD.base, 12, 10); px(ctx, 10, 5, WD.light, 12, 1); px(ctx, 12, 7, WD.dark, 8, 1); px(ctx, 12, 10, WD.dark, 8, 1); px(ctx, 12, 13, WD.dark, 8, 1);
  px(ctx, 8, 16, WD.ink, 16, 7); px(ctx, 9, 17, WD.light, 14, 5); px(ctx, 9, 17, '#e2b678', 14, 1); px(ctx, 9, 21, WD.dark, 14, 1);
  for (const x of [9, 21]) { px(ctx, x, 23, WD.ink, 2, 5); px(ctx, x, 23, WD.light, 1, 4); }
}
function drawShelf(ctx, r) {
  px(ctx, 2, 2, WD.ink, 28, 28); px(ctx, 3, 3, WD.dark, 26, 26); px(ctx, 3, 3, WD.base, 1, 26); px(ctx, 28, 3, WD.deep, 1, 26);
  const goods = ['#e0433c', '#3e8ed0', '#f0c23c', '#43a552', '#f2f2ee', '#e08a2c', '#8b5cf6'];
  for (const y of [4, 13, 22]) {
    px(ctx, 3, y + 6, WD.light, 26, 2); px(ctx, 3, y + 8, WD.ink, 26, 1);
    for (let k = 0; k < 6; k++) { const c = goods[(k + y) % goods.length]; const h = 4 + ((k + y) % 3); px(ctx, 5 + k * 4, y + 6 - h, c, 3, h); px(ctx, 5 + k * 4, y + 6 - h, 'rgba(255,255,255,0.4)', 1, 1); px(ctx, 7 + k * 4, y + 6 - h, 'rgba(0,0,0,0.25)', 1, h); }
  }
  void r;
}
function drawVault(ctx) {
  px(ctx, 0, 0, '#5c4a3a', 32, 4); px(ctx, 0, 0, '#7a6450', 32, 1); px(ctx, 0, 3, '#3f3226', 32, 1);
  px(ctx, 0, 4, '#8a9099', 32, 28); px(ctx, 0, 4, '#a9b0b8', 32, 1); px(ctx, 0, 4, '#a9b0b8', 1, 28); px(ctx, 31, 4, '#5a6069', 1, 28); px(ctx, 0, 31, '#5a6069', 32, 1);
  circle(ctx, 16, 18, 12, MT.ink); circle(ctx, 16, 18, 11, '#7d848d'); circle(ctx, 15, 17, 9.5, '#98a0a9'); circle(ctx, 16, 18, 8, MT.ink); circle(ctx, 16, 18, 7, '#6d747d');
  // spoked wheel
  ctx.strokeStyle = '#d9dde2'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(16, 18, 4.5, 0, Math.PI * 2); ctx.stroke();
  for (let a = 0; a < 6; a++) { const c = Math.cos(a * Math.PI / 3), s2 = Math.sin(a * Math.PI / 3); ctx.beginPath(); ctx.moveTo(16, 18); ctx.lineTo(16 + c * 5.5, 18 + s2 * 5.5); ctx.stroke(); }
  circle(ctx, 16, 18, 1.5, '#d9dde2');
  for (let a = 0; a < 8; a++) { const c = Math.cos(a * Math.PI / 4 + 0.4), s2 = Math.sin(a * Math.PI / 4 + 0.4); px(ctx, Math.round(16 + c * 10) - 1, Math.round(18 + s2 * 10) - 1, '#d9dde2', 2, 2); }
  px(ctx, 3, 7, '#c9a24a', 4, 2); px(ctx, 25, 7, '#c9a24a', 4, 2);
}

// ---------------------------------------------------------------- tiles
const ground = (tag, fn) => ({ tag, solid: false, draw: fn });
const solid = (tag, fn) => ({ tag, solid: true, draw: fn });
const deco = (tag, fn) => ({ tag, solid: false, draw: fn });
const wallTile = (tag, seed, extra) => solid(tag, (ctx, s, r) => { plaster(ctx, s, OCH, seed); if (extra) extra(ctx, s, r); });
const whiteTile = (tag, seed, extra) => solid(tag, (ctx, s, r) => { plaster(ctx, s, WHT, seed); if (extra) extra(ctx, s, r); });
const shopfront = (ctx) => {
  px(ctx, 2, 27, OCH.deep, 28, 2);
  box(ctx, 3, 4, 26, 23, GL.base, GL.frame);
  px(ctx, 4, 5, GL.frameL, 24, 1);
  // shelves with goods seen through the glass
  const goods = ['#e0433c', '#3e8ed0', '#f0c23c', '#43a552', '#f2f2ee', '#e08a2c'];
  for (const y of [11, 19]) { px(ctx, 5, y, '#8a6a48', 22, 2); for (let k = 0; k < 5; k++) { const c = goods[(k + y) % 6]; px(ctx, 6 + k * 4, y - 4, c, 3, 4); px(ctx, 6 + k * 4, y - 4, 'rgba(255,255,255,0.35)', 1, 1); } }
  px(ctx, 5, 21, '#6a4d33', 22, 5);
  // glass reflection
  px(ctx, 4, 5, 'rgba(230,245,255,0.55)', 3, 21); px(ctx, 8, 5, 'rgba(230,245,255,0.35)', 1, 21); px(ctx, 24, 6, 'rgba(0,30,60,0.25)', 4, 20);
  px(ctx, 15, 4, GL.frame, 2, 23);
  px(ctx, 2, 26, OCH.light, 28, 1); px(ctx, 2, 27, OCH.dark, 28, 1);
};
const column = (ctx) => {
  px(ctx, 9, 0, '#7d7260', 14, 32); px(ctx, 10, 0, '#e2d9c6', 12, 32); px(ctx, 11, 0, '#fbf7ef', 4, 32); px(ctx, 12, 0, '#ffffff', 1, 32); px(ctx, 17, 0, WHT.dark, 3, 32); px(ctx, 20, 0, '#b5aa93', 2, 32);
  px(ctx, 23, 0, 'rgba(0,0,0,0.16)', 2, 32);
  for (let y = 0; y < 32; y += 8) px(ctx, 10, y + 4, 'rgba(0,0,0,0.06)', 12, 1); // faint block joints
};

const stallCell = (v, cx, cy) => (ctx) => part(ctx, `stall${v}`, 64, 64, cx, cy, (c, r) => drawStall(c, r, v));
const kioskCell = (cx, cy) => (ctx) => part(ctx, 'kiosk', 64, 64, cx, cy, drawKiosk);
const fountainCell = (cx, cy) => (ctx) => part(ctx, 'fountain', 64, 64, cx, cy, drawFountain);
const shelterCell = (cx, cy) => (ctx) => part(ctx, 'shelter', 96, 64, cx, cy, drawShelter);
const bankSign = (cx) => (ctx) => part(ctx, 'bankSign', 64, 32, cx, 0, (c, r) => wideSign(c, r, WHT, SIGN.blue, 'BENKI', (cc) => { circle(cc, 8, 15, 3, SIGN.yellow); circle(cc, 8, 15, 2.2, '#e0b12c'); px(cc, 7, 13, '#fff1a8', 2, 1); circle(cc, 56, 15, 3, SIGN.yellow); circle(cc, 56, 15, 2.2, '#e0b12c'); px(cc, 55, 13, '#fff1a8', 2, 1); }));
const foodSign = (cx) => (ctx) => part(ctx, 'foodSign', 64, 32, cx, 0, (c, r) => { wideSign(c, r, OCH, SIGN.red, 'HOTELI', (cc) => { px(cc, 6, 10, SIGN.white, 1, 10); px(cc, 5, 10, SIGN.white, 3, 1); px(cc, 5, 10, SIGN.white, 1, 3); px(cc, 7, 10, SIGN.white, 1, 3); px(cc, 58, 10, SIGN.white, 1, 10); px(cc, 57, 10, SIGN.white, 3, 4); }); });

export default {
  id: 'tls_city', name: 'City', assetId: 'ast_starter_city', file: 'city.png',
  tileSize: 32, columns: 8,
  groundTag: 'sidewalk',
  /** Multi-tile objects; every cell is solid except door cells; nothing is drawn above characters. */
  stamps: [
    { name: 'Shop', tags: [['roof_grey', 'roof_grey', 'roof_grey'], ['wall', 'wall_sign_shop', 'wall'], ['wall_shopfront', 'wall_door', 'wall_shopfront']] },
    { name: 'House', tags: [['roof_red', 'roof_red', 'roof_red'], ['wall_window', 'wall', 'wall_window'], ['wall_window', 'wall_door', 'wall_window']] },
    { name: 'Bank', tags: [['roof_grey', 'roof_grey', 'roof_grey', 'roof_grey'], ['wall_column', 'wall_sign_bank_l', 'wall_sign_bank_r', 'wall_column'], ['wall_column', 'wall_white_door', 'wall_white_window', 'wall_column']] },
    { name: 'Restaurant', tags: [['roof_blue', 'roof_blue', 'roof_blue', 'roof_blue'], ['wall_window', 'wall_sign_food_l', 'wall_sign_food_r', 'wall_window'], ['wall_awning', 'wall_awning_door', 'wall_awning', 'wall_awning']] },
    { name: 'BusShelter', tags: [['shelter_nw', 'shelter_n', 'shelter_ne'], ['shelter_sw', 'shelter_s', 'shelter_se']] },
    { name: 'StallA', tags: [['stall_a_nw', 'stall_a_ne'], ['stall_a_sw', 'stall_a_se']] },
    { name: 'StallB', tags: [['stall_b_nw', 'stall_b_ne'], ['stall_b_sw', 'stall_b_se']] },
    { name: 'Fountain', tags: [['fountain_nw', 'fountain_ne'], ['fountain_sw', 'fountain_se']] },
    { name: 'Kiosk', tags: [['kiosk_nw', 'kiosk_ne'], ['kiosk_sw', 'kiosk_door']] },
  ],
  tiles: [
    // ---- row 0: roads and the sidewalk centre
    ground('road', (ctx, s) => asphaltBase(ctx, s)),
    ground('road_line_h', (ctx, s) => { asphaltBase(ctx, s, 13); dashLine(ctx, s, 'h'); }),
    ground('road_line_v', (ctx, s) => { asphaltBase(ctx, s, 17); dashLine(ctx, s, 'v'); }),
    ground('road_cross', (ctx, s) => { asphaltBase(ctx, s, 19); dashLine(ctx, s, 'h'); dashLine(ctx, s, 'v'); px(ctx, 15, 15, ASP.line, 2, 2); }),
    ground('crosswalk_h', (ctx, s) => { asphaltBase(ctx, s, 21); zebra(ctx, s, 'v'); }),
    ground('crosswalk_v', (ctx, s) => { asphaltBase(ctx, s, 22); zebra(ctx, s, 'h', 18); }),
    ground('sidewalk', (ctx, s) => sidewalkBase(ctx, s, 23, 1)),
    ground('sidewalk_edge_n', (ctx, s) => { sidewalkBase(ctx, s, 23, 1); curb(ctx, s, 'n'); }),
    // ---- row 1: sidewalk edges and corners, paving
    ground('sidewalk_edge_s', (ctx, s) => { sidewalkBase(ctx, s, 23, 1); curb(ctx, s, 's'); }),
    ground('sidewalk_edge_w', (ctx, s) => { sidewalkBase(ctx, s, 23, 1); curb(ctx, s, 'w'); }),
    ground('sidewalk_edge_e', (ctx, s) => { sidewalkBase(ctx, s, 23, 1); curb(ctx, s, 'e'); }),
    ground('sidewalk_corner_nw', (ctx, s) => { sidewalkBase(ctx, s, 23, 1); curb(ctx, s, 'n'); curb(ctx, s, 'w'); }),
    ground('sidewalk_corner_ne', (ctx, s) => { sidewalkBase(ctx, s, 23, 1); curb(ctx, s, 'n'); curb(ctx, s, 'e'); }),
    ground('sidewalk_corner_sw', (ctx, s) => { sidewalkBase(ctx, s, 23, 1); curb(ctx, s, 'w'); curb(ctx, s, 's'); }),
    ground('sidewalk_corner_se', (ctx, s) => { sidewalkBase(ctx, s, 23, 1); curb(ctx, s, 'e'); curb(ctx, s, 's'); }),
    ground('paving', (ctx, s) => cabroBase(ctx, s)),
    // ---- row 2: dirt lot and ochre building parts
    ground('dirt_lot', (ctx, s) => dirtLotBase(ctx, s)),
    wallTile('wall', 43),
    wallTile('wall_window', 45, (ctx) => window_(ctx)),
    deco('wall_door', (ctx, s) => { plaster(ctx, s, OCH, 47); door(ctx); }),
    wallTile('wall_shopfront', 49, shopfront),
    solid('roof', (ctx, s, r) => roofTile(ctx, RG, '', r)),
    solid('roof_edge_n', (ctx, s, r) => roofTile(ctx, RG, 'n', r)),
    solid('roof_edge_s', (ctx, s, r) => roofTile(ctx, RG, 's', r)),
    // ---- row 3: roof edges, corners, coloured roof strips
    solid('roof_edge_w', (ctx, s, r) => roofTile(ctx, RG, 'w', r)),
    solid('roof_edge_e', (ctx, s, r) => roofTile(ctx, RG, 'e', r)),
    solid('roof_corner_nw', (ctx, s, r) => roofTile(ctx, RG, 'nw', r)),
    solid('roof_corner_ne', (ctx, s, r) => roofTile(ctx, RG, 'ne', r)),
    solid('roof_corner_sw', (ctx, s, r) => roofTile(ctx, RG, 'sw', r)),
    solid('roof_corner_se', (ctx, s, r) => roofTile(ctx, RG, 'se', r)),
    solid('roof_red', (ctx, s, r) => roofTile(ctx, RR, 'ns', r)),
    solid('roof_blue', (ctx, s, r) => roofTile(ctx, RB, 'ns', r)),
    // ---- row 4: free-standing signs, bench
    solid('sign_shop', (ctx) => standingSign(ctx, SIGN.yellow, 'DUKA', (c) => { px(c, 4, 5, SIGN.ink, 5, 4); px(c, 5, 4, SIGN.ink, 3, 1); px(c, 5, 6, SIGN.yellow, 3, 1); })),
    solid('sign_bank', (ctx) => standingSign(ctx, SIGN.blue, 'BENKI', (c) => { circle(c, 6, 9.5, 2.5, SIGN.yellow); px(c, 5, 8, '#fff1a8', 2, 1); })),
    solid('sign_food', (ctx) => standingSign(ctx, SIGN.red, 'HOTELI', (c) => { px(c, 5, 5, SIGN.white, 1, 8); px(c, 4, 5, SIGN.white, 3, 1); px(c, 4, 5, SIGN.white, 1, 2); px(c, 6, 5, SIGN.white, 1, 2); })),
    solid('sign_bus', (ctx) => { shadow(ctx, 16, 29.5, 6, 2); px(ctx, 15, 14, MT.ink, 3, 16); px(ctx, 15, 14, MT.light, 1, 15); px(ctx, 12, 29, MT.ink, 9, 2); circle(ctx, 16, 9, 9, SIGN.ink); circle(ctx, 16, 9, 8, SIGN.blue); circle(ctx, 16, 9, 6.5, SIGN.white); circle(ctx, 16, 9, 5.5, SIGN.blue); busIcon(ctx, 11, 5, 1); px(ctx, 11, 3, 'rgba(255,255,255,0.5)', 4, 1); }),
    solid('sign_market', (ctx) => standingSign(ctx, SIGN.green, 'SOKO', (c) => { circle(c, 6, 9.5, 2.2, '#e0433c'); circle(c, 26, 9.5, 2.2, SIGN.yellow); px(c, 5, 8, '#ff9a8a', 1, 1); px(c, 25, 8, '#fff1a8', 1, 1); })),
    solid('sign_forsale', (ctx) => standingSign(ctx, SIGN.white, 'INAUZWA', (c) => { px(c, 2, 3, SIGN.red, 28, 3); px(c, 3, 3, '#e8615a', 26, 1); }, SIGN.red, null)),
    solid('sign_park', (ctx) => standingSign(ctx, '#2f7a3e', 'BUSTANI', (c) => { px(c, 3, 13, GR.light, 26, 2); })),
    solid('bench', (ctx) => drawBench(ctx)),
    // ---- row 5: street objects
    solid('lamp', (ctx) => drawLamp(ctx)),
    solid('trash', (ctx) => drawTrash(ctx)),
    solid('hydrant', (ctx) => drawHydrant(ctx)),
    solid('hedge', (ctx, s, r) => drawHedge(ctx, r)),
    deco('flowerbed', (ctx, s, r) => drawFlowerbed(ctx, r)),
    solid('fence_city_h', (ctx) => railingH(ctx)),
    solid('fence_city_v', (ctx) => railingV(ctx)),
    solid('gate', (ctx) => drawGate(ctx)),
    // ---- row 6: more street objects, interiors
    solid('barrier', (ctx) => drawBarrier(ctx)),
    solid('atm', (ctx) => drawAtm(ctx)),
    solid('cone', (ctx) => drawCone(ctx)),
    ground('floor_wood', (ctx, s) => woodFloor(ctx, s)),
    ground('floor_tile', (ctx, s) => tileFloor(ctx, s)),
    solid('wall_interior', (ctx, s, r) => interiorWall(ctx, s, r)),
    solid('counter', (ctx) => drawCounter(ctx)),
    solid('table', (ctx) => drawTable(ctx)),
    // ---- row 7: interiors, extra building parts
    deco('chair', (ctx) => drawChair(ctx)),
    solid('shelf', (ctx, s, r) => drawShelf(ctx, r)),
    solid('vault', (ctx) => drawVault(ctx)),
    solid('roof_grey', (ctx, s, r) => roofTile(ctx, RG, 'ns', r)),
    whiteTile('wall_white', 51),
    whiteTile('wall_white_window', 53, (ctx) => window_(ctx, 8, 5, 16, 19, WHT)),
    deco('wall_white_door', (ctx, s) => { plaster(ctx, s, WHT, 55); door(ctx, 9, 4, 14, WHT, { ink: '#1f2f45', base: '#3f6fb2', light: '#6592d1', dark: '#2c5389', deep: '#1e3a60' }); }),
    whiteTile('wall_column', 57, column),
    // ---- row 8: facade signs, awning, kiosk
    wallTile('wall_sign_shop', 59, (ctx) => { px(ctx, 3, 25, 'rgba(0,0,0,0.22)', 27, 2); board(ctx, 2, 5, 28, 19, SIGN.yellow); textCentered(ctx, 16, 9, 'DUKA', SIGN.ink, 1); px(ctx, 5, 17, SIGN.red, 22, 3); px(ctx, 6, 18, SIGN.white, 8, 1); px(ctx, 16, 18, SIGN.white, 10, 1); px(ctx, 4, 7, SIGN.white); px(ctx, 27, 7, SIGN.white); px(ctx, 4, 21, SIGN.ink); px(ctx, 27, 21, SIGN.ink); }),
    solid('wall_sign_bank_l', bankSign(0)),
    solid('wall_sign_bank_r', bankSign(1)),
    solid('wall_sign_food_l', foodSign(0)),
    solid('wall_sign_food_r', foodSign(1)),
    solid('wall_awning', (ctx, s, r) => wallAwning(ctx, s, r)),
    solid('kiosk_nw', kioskCell(0, 0)),
    solid('kiosk_ne', kioskCell(1, 0)),
    // ---- row 9: kiosk bottom, stalls
    solid('kiosk_sw', kioskCell(0, 1)),
    deco('kiosk_door', kioskCell(1, 1)),
    solid('stall_a_nw', stallCell(0, 0, 0)),
    solid('stall_a_ne', stallCell(0, 1, 0)),
    solid('stall_a_sw', stallCell(0, 0, 1)),
    solid('stall_a_se', stallCell(0, 1, 1)),
    solid('stall_b_nw', stallCell(1, 0, 0)),
    solid('stall_b_ne', stallCell(1, 1, 0)),
    // ---- row 10: stall B bottom, fountain, shelter top
    solid('stall_b_sw', stallCell(1, 0, 1)),
    solid('stall_b_se', stallCell(1, 1, 1)),
    solid('fountain_nw', fountainCell(0, 0)),
    solid('fountain_ne', fountainCell(1, 0)),
    solid('fountain_sw', fountainCell(0, 1)),
    solid('fountain_se', fountainCell(1, 1)),
    solid('shelter_nw', shelterCell(0, 0)),
    solid('shelter_n', shelterCell(1, 0)),
    // ---- row 11: shelter, awning door, variants
    solid('shelter_ne', shelterCell(2, 0)),
    solid('shelter_sw', shelterCell(0, 1)),
    solid('shelter_s', shelterCell(1, 1)),
    solid('shelter_se', shelterCell(2, 1)),
    deco('wall_awning_door', (ctx, s) => { plaster(ctx, s, OCH, 75); door(ctx, 9, 12, 14, OCH); awning(ctx, SIGN.red, '#f7f1d8', 0, 32, 3); }),
    ground('sidewalk2', (ctx, s) => sidewalkBase(ctx, s, 77, 3)),
    ground('road2', (ctx, s) => asphaltBase(ctx, s, 79)),
  ],
};
