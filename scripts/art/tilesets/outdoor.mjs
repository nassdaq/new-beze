/**
 * Outdoor tileset: painterly-pixel anime overworld (RPG-Maker-style pack).
 * 32 px tiles, 8 columns, row-major. Ground tiles are opaque and tile seamlessly with
 * themselves; object tiles are transparent (Decoration layer) with a soft contact shadow.
 * See scripts/art/README.md for the contract and tilesets/TILES.md for the index table.
 *
 * Determinism: every tile only uses the renderer's `rand` plus `lcg()` below (a fixed-seed
 * LCG) so that ground variants share one identical base texture. No Math.random anywhere.
 */

// ---------------------------------------------------------------- utilities
function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const rr = (r, a, b) => a + r() * (b - a);
const ri = (r, a, b) => Math.floor(a + r() * (b - a + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

/** Draw `fn` at the 9 wrapped offsets so texture elements continue across tile edges. */
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
function shadow(ctx, cx, cy, rx, ry, a = 0.28) { ellipse(ctx, cx, cy, rx, ry, `rgba(18,40,22,${a})`); }

// ---------------------------------------------------------------- palettes
const G = { base: '#6db34b', dark: '#579a3b', light: '#84c65b', deep: '#457f2e', pale: '#a3d977', outline: '#2f5a22' };
const P = { base: '#c7a26a', light: '#dcbc86', dark: '#ab8858', deep: '#87653d', pebL: '#ead39f', pebD: '#8d6b45' };
const D = { base: '#9d6d45', light: '#b3835a', dark: '#82573a', deep: '#5f3e27', clump: '#6f4a30' };
const S = { base: '#e6d29b', light: '#f3e6bb', dark: '#cfb97f', deep: '#b39c67' };
const W = { base: '#3b89d1', deep: '#2b6db2', dark: '#215b98', light: '#5ea8e9', ripple: '#93cbf3', foam: '#dff1fc', shore: '#1c4d80' };
const T = { outline: '#1f4a21', dark: '#2f6f31', mid: '#43923c', light: '#63b34d', hi: '#95d46b', trunk: '#7c5432', trunkD: '#573619', trunkL: '#9a6d42', bark: '#4a2d15' };
const WD = { base: '#b17a46', light: '#d09a5f', dark: '#7f5230', deep: '#4a2d16', ink: '#3a2412' };
const R = { base: '#8d8e99', light: '#b9bac4', hi: '#d9dae2', dark: '#63646f', deep: '#45464f', outline: '#33343c' };

// ---------------------------------------------------------------- ground textures
/** Grass: two-tone base with mottling, single-px sparkle and small "^" tufts. Seamless. */
function grassBase(ctx, s, seed = 11) {
  const r = lcg(seed);
  px(ctx, 0, 0, G.base, s, s);
  for (let i = 0; i < 7; i++) {
    const x = rr(r, 0, s), y = rr(r, 0, s), w = rr(r, 4, 9), h = rr(r, 2.5, 5);
    wrap(ctx, s, () => ellipse(ctx, x, y, w, h, 'rgba(69,127,46,0.30)'));
  }
  for (let i = 0; i < 5; i++) {
    const x = rr(r, 0, s), y = rr(r, 0, s), w = rr(r, 3, 7), h = rr(r, 2, 4);
    wrap(ctx, s, () => ellipse(ctx, x, y, w, h, 'rgba(163,217,119,0.22)'));
  }
  for (let i = 0; i < 34; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), c = r() < 0.55 ? G.dark : G.light;
    wrap(ctx, s, () => px(ctx, x, y, c));
  }
  for (let i = 0; i < 16; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1);
    wrap(ctx, s, () => {
      px(ctx, x - 1, y + 1, G.deep); px(ctx, x + 1, y + 1, G.deep); px(ctx, x, y, G.pale); px(ctx, x, y + 1, G.light); px(ctx, x, y + 2, G.dark);
    });
  }
  for (let i = 0; i < 10; i++) { // single leaning blades
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), lean = r() < 0.5 ? -1 : 1;
    wrap(ctx, s, () => { px(ctx, x, y + 1, G.dark); px(ctx, x + lean, y, G.light); px(ctx, x, y + 2, G.deep); });
  }
}

/** Packed earth: lighter centre, speckles, pebbles with a lit top-left. Seamless. */
function pathBase(ctx, s, seed = 23, pebbles = 6) {
  const r = lcg(seed);
  px(ctx, 0, 0, P.base, s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s * 0.52);
  g.addColorStop(0, 'rgba(236,208,150,0.55)'); g.addColorStop(1, 'rgba(236,208,150,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 44; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), c = r() < 0.6 ? P.dark : P.light;
    wrap(ctx, s, () => px(ctx, x, y, c, r() < 0.3 ? 2 : 1, 1));
  }
  for (let i = 0; i < 8; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1);
    wrap(ctx, s, () => px(ctx, x, y, P.deep, 2, 1));
  }
  for (let i = 0; i < pebbles; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), w = ri(r, 2, 3), h = 2;
    wrap(ctx, s, () => { px(ctx, x, y, P.pebD, w + 1, h + 1); px(ctx, x, y, P.dark, w, h); px(ctx, x, y, P.pebL, w - 1, 1); });
  }
}

/** Dark tilled dirt with clumps. Seamless. */
function dirtBase(ctx, s, seed = 37) {
  const r = lcg(seed);
  px(ctx, 0, 0, D.base, s, s);
  for (let i = 0; i < 6; i++) {
    const x = rr(r, 0, s), y = rr(r, 0, s), w = rr(r, 4, 8), h = rr(r, 2, 4);
    wrap(ctx, s, () => ellipse(ctx, x, y, w, h, 'rgba(95,62,39,0.35)'));
  }
  for (let i = 0; i < 40; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), c = r() < 0.55 ? D.dark : D.light;
    wrap(ctx, s, () => px(ctx, x, y, c, r() < 0.4 ? 2 : 1, 1));
  }
  for (let i = 0; i < 9; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1);
    wrap(ctx, s, () => { px(ctx, x, y + 1, D.deep, 3, 1); px(ctx, x, y, D.clump, 2, 1); px(ctx, x, y - 1, D.light, 1, 1); });
  }
}

/** Pale sand with grain and a few wind ripples. Seamless. */
function sandBase(ctx, s, seed = 41) {
  const r = lcg(seed);
  px(ctx, 0, 0, S.base, s, s);
  for (let i = 0; i < 5; i++) {
    const x = rr(r, 0, s), y = rr(r, 0, s), w = rr(r, 5, 9), h = rr(r, 2, 4);
    wrap(ctx, s, () => ellipse(ctx, x, y, w, h, 'rgba(243,230,187,0.45)'));
  }
  for (let i = 0; i < 4; i++) {
    const x = rr(r, 0, s), y = rr(r, 0, s), w = rr(r, 5, 9), h = rr(r, 2, 3.5);
    wrap(ctx, s, () => ellipse(ctx, x, y, w, h, 'rgba(179,156,103,0.22)'));
  }
  for (let i = 0; i < 60; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), c = r() < 0.5 ? S.dark : (r() < 0.5 ? S.light : '#fbf3d6');
    wrap(ctx, s, () => px(ctx, x, y, c));
  }
  for (let i = 0; i < 6; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), len = ri(r, 5, 9);
    wrap(ctx, s, () => { px(ctx, x + 1, y, S.deep, len - 2, 1); px(ctx, x, y - 1, S.dark, 1, 1); px(ctx, x + len - 1, y - 1, S.dark, 1, 1); px(ctx, x + 1, y - 1, S.light, len - 2, 1); });
  }
  for (let i = 0; i < 4; i++) { // tiny shells / dark grains
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1);
    wrap(ctx, s, () => { px(ctx, x, y, S.deep, 2, 1); px(ctx, x, y - 1, '#fbf3d6', 1, 1); });
  }
}

/** Water: flat base, deeper patches, horizontal ripple bands with a thin highlight. Seamless. */
function waterBase(ctx, s, seed = 53, deep = false) {
  const r = lcg(seed);
  px(ctx, 0, 0, deep ? W.deep : W.base, s, s);
  for (let i = 0; i < 4; i++) {
    const x = rr(r, 0, s), y = rr(r, 0, s), w = rr(r, 6, 11), h = rr(r, 2, 3.5);
    wrap(ctx, s, () => ellipse(ctx, x, y, w, h, deep ? 'rgba(33,91,152,0.55)' : 'rgba(43,109,178,0.5)'));
  }
  for (let i = 0; i < (deep ? 4 : 6); i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1), len = ri(r, 7, 14);
    wrap(ctx, s, () => {
      px(ctx, x, y, W.light, len, 2);
      px(ctx, x + 1, y, W.ripple, len - 2, 1);
      px(ctx, x + 2, y, W.foam, Math.max(2, Math.floor(len / 3)), 1);
      px(ctx, x, y + 2, deep ? W.dark : W.deep, len, 1);
    });
  }
  for (let i = 0; i < 4; i++) {
    const x = ri(r, 0, s - 1), y = ri(r, 0, s - 1);
    wrap(ctx, s, () => px(ctx, x, y, W.foam, 2, 1));
  }
}

// ---------------------------------------------------------------- edge tiles
/** Boundary depth (from the grass side) per column; period = s so edges tile seamlessly. */
function waveDepth(x, s, depth, phase) {
  return depth + Math.round(1.2 * Math.sin((x / s) * Math.PI * 2 + phase) + 0.6 * Math.sin((x / s) * Math.PI * 4 + phase * 1.7));
}
/** Map a (x, d) pair in the "north" frame to the given side. Returns [x, y]. */
function sideMap(side, x, d, s) {
  if (side === 'n') return [x, d];
  if (side === 's') return [x, s - 1 - d];
  if (side === 'w') return [d, x];
  return [s - 1 - d, x];
}
/**
 * A tile whose `side` is grass and the rest is `drawMain`. The boundary is a soft wave with a
 * 1 px darker seam on each material and grass blades poking over.
 */
function grassEdgeTile(ctx, s, side, drawMain, seam, opts = {}) {
  const depth = opts.depth ?? 8, phase = opts.phase ?? 0.6;
  drawMain();
  ctx.save();
  ctx.beginPath();
  for (let x = 0; x < s; x++) {
    const d = waveDepth(x, s, depth, phase);
    const [px0, py0] = sideMap(side, x, 0, s), [px1, py1] = sideMap(side, x, d - 1, s);
    ctx.rect(Math.min(px0, px1), Math.min(py0, py1), Math.abs(px1 - px0) + 1, Math.abs(py1 - py0) + 1);
  }
  ctx.clip();
  grassBase(ctx, s);
  ctx.restore();
  for (let x = 0; x < s; x++) {
    const d = waveDepth(x, s, depth, phase);
    const put = (dd, c) => { const [X, Y] = sideMap(side, x, dd, s); px(ctx, X, Y, c); };
    put(d - 1, G.deep);            // grass shadow lip
    put(d, seam[0]);               // dark seam on the main material
    if (seam[1] && (x + 1) % 4 !== 0) put(d + 1, seam[1]); // broken lighter rim under it
    if ((x * 7 + d) % 3 === 0) put(d + 2, seam[3] ?? G.dark); // dithered specks of grass / shore
    if ((x * 5 + d) % 7 === 0) put(d - 2, G.dark);
    if (seam[2] && x % 5 === 2) put(d + 3, seam[2]); // sparse foam / pebble specks
  }
  // grass blades leaning over the edge
  for (let x = 1; x < s; x += 4) {
    const d = waveDepth(x, s, depth, phase);
    const [X0, Y0] = sideMap(side, x, d - 2, s), [X1, Y1] = sideMap(side, x, d - 3, s);
    px(ctx, X0, Y0, G.light); px(ctx, X1, Y1, G.pale);
  }
}

/**
 * Where two grass edges meet. `corner` names the quadrant ('nw', 'ne', 'sw', 'se'); with
 * `inner` true only that quadrant is grass (the inside of a path bend or crossing), otherwise the
 * two sides are grass and only that quadrant is `drawMain` (a pond or path corner seen from
 * outside). Waves and phases match the edge tiles, so the boundaries line up with them.
 */
function grassCornerTile(ctx, s, corner, inner, drawMain, seam, opts = {}) {
  const depth = opts.depth ?? 8;
  const phase = { n: 0.6, s: 2.1, w: 3.4, e: 4.9, ...(opts.phase ?? {}) };
  const [v, h] = corner.split('');
  const along = (side, X, Y) => (side === 'n' || side === 's' ? X : Y);
  const dd = (side, X, Y) => (side === 'n' ? Y : side === 's' ? s - 1 - Y : side === 'w' ? X : s - 1 - X);
  const inGrass = (side, X, Y) => dd(side, X, Y) < waveDepth(along(side, X, Y), s, depth, phase[side]);
  const grass = (X, Y) => (inner ? inGrass(v, X, Y) && inGrass(h, X, Y) : inGrass(v, X, Y) || inGrass(h, X, Y));
  drawMain();
  ctx.save();
  ctx.beginPath();
  for (let Y = 0; Y < s; Y++) for (let X = 0; X < s; X++) if (grass(X, Y)) ctx.rect(X, Y, 1, 1);
  ctx.clip();
  grassBase(ctx, s);
  ctx.restore();
  // Each side's seam and blades run only where its boundary is not swallowed by the other side.
  for (const [side, other] of [[v, h], [h, v]]) {
    for (let x = 0; x < s; x++) {
      const d = waveDepth(x, s, depth, phase[side]);
      const [bx, by] = sideMap(side, x, d, s);
      if (inner ? !inGrass(other, bx, by) : inGrass(other, bx, by)) continue;
      const put = (k, c) => { const [X, Y] = sideMap(side, x, k, s); px(ctx, X, Y, c); };
      put(d - 1, G.deep);
      put(d, seam[0]);
      if (seam[1] && (x + 1) % 4 !== 0) put(d + 1, seam[1]);
      if ((x * 7 + d) % 3 === 0) put(d + 2, seam[3] ?? G.dark);
      if ((x * 5 + d) % 7 === 0) put(d - 2, G.dark);
      if (seam[2] && x % 5 === 2) put(d + 3, seam[2]);
      if (x % 4 === 1) { put(d - 2, G.light); put(d - 3, G.pale); }
    }
  }
}

// ---------------------------------------------------------------- decorations
function grassTufts(ctx, r, n = 3, y0 = 24, y1 = 29) {
  for (let i = 0; i < n; i++) {
    const x = ri(r, 2, 28), y = ri(r, y0, y1);
    px(ctx, x - 1, y + 1, G.deep); px(ctx, x + 1, y + 1, G.deep); px(ctx, x, y, G.pale); px(ctx, x, y + 1, G.light);
  }
}

/** Layered round foliage: outline, dark base, then lit layers clipped to the silhouette. */
function foliage(ctx, lobes, pal, lift = [[-1, -3, -1], [-2, -6, -2.5]]) {
  const silhouette = (dx, dy, dr) => { ctx.beginPath(); lobes.forEach(([x, y, rad]) => { ctx.moveTo(x + dx + rad + dr, y + dy); ctx.arc(x + dx, y + dy, Math.max(1, rad + dr), 0, Math.PI * 2); }); };
  silhouette(0, 0, 1); ctx.fillStyle = pal.outline; ctx.fill();
  silhouette(0, 0, 0); ctx.fillStyle = pal.dark; ctx.fill();
  ctx.save(); silhouette(0, 0, 0); ctx.clip();
  silhouette(lift[0][0], lift[0][1], lift[0][2]); ctx.fillStyle = pal.mid; ctx.fill();
  silhouette(lift[1][0], lift[1][1], lift[1][2]); ctx.fillStyle = pal.light; ctx.fill();
  // clump definition: a dark crescent under each lobe and a highlight arc on top-left
  lobes.forEach(([x, y, rad]) => {
    ctx.strokeStyle = pal.dark; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, rad - 0.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.strokeStyle = pal.hi; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x - 1, y - 1, rad - 2.5, Math.PI * 1.15, Math.PI * 1.65); ctx.stroke();
  });
  ctx.restore();
}

function drawBush(ctx, r, berries = false) {
  shadow(ctx, 16, 27.5, 12, 3.5);
  const lobes = [[9, 20, 7], [23, 20, 7], [16, 21, 7.5], [11, 14, 6], [21, 14, 6], [16, 12, 6.5]];
  foliage(ctx, lobes, T);
  for (let i = 0; i < 4; i++) { const x = ri(r, 7, 25), y = ri(r, 9, 22); px(ctx, x, y, T.hi); }
  if (berries) {
    for (let i = 0; i < 6; i++) { const x = ri(r, 6, 26), y = ri(r, 9, 24); circle(ctx, x + 0.5, y + 0.5, 1.4, '#c93a3f'); px(ctx, x, y, '#ff8e8e'); }
  }
  grassTufts(ctx, r, 2, 25, 27);
}

/**
 * Trees are drawn ONCE as a whole 32x64 object into an offscreen canvas (cached per variant)
 * and the two tiles blit its top and bottom halves, so the seam between `tree_top` and `tree`
 * is invisible on the map. Variant 0 is a round oak, variant 1 a taller pine.
 */
const treeCache = new Map();
function treeCanvas(variant) {
  if (!treeCache.has(variant)) {
    const c = document.createElement('canvas'); c.width = 32; c.height = 64;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    if (variant === 0) drawOak(ctx, lcg(101)); else drawPine(ctx, lcg(202));
    treeCache.set(variant, c);
  }
  return treeCache.get(variant);
}
function drawTree(ctx, part, variant = 0) {
  ctx.drawImage(treeCanvas(variant), 0, part === 'top' ? 0 : 32, 32, 32, 0, 0, 32, 32);
}

/** Trunk with root flare, a lit strip, bark grooves and a knot; `top` is where the canopy hides it. */
function drawTrunk(ctx, r, top, x0, x1, flare = 3) {
  const cx = (x0 + x1) / 2;
  poly(ctx, [[x0, top], [x1, top], [x1 + 1, 52], [x1 + flare, 59], [x1 + flare + 1, 62], [x0 - flare - 1, 62], [x0 - flare, 59], [x0 - 1, 52]], T.trunk, T.bark, 1);
  px(ctx, x0 + 1, top + 1, T.trunkL, 2, 52 - top);           // lit left strip
  px(ctx, x1 - 2, top + 1, T.trunkD, 2, 56 - top);           // shaded right strip
  for (let i = 0; i < 4; i++) {                              // bark grooves
    const gx = ri(r, x0 + 2, x1 - 3), gy = ri(r, top + 3, 50), gh = ri(r, 4, 8);
    px(ctx, gx, gy, T.bark, 1, gh); px(ctx, gx + 1, gy + gh - 2, T.trunkL, 1, 1);
  }
  circle(ctx, cx + 1.5, top + 11.5, 1.6, T.trunkD); px(ctx, cx + 1, top + 11, T.bark); px(ctx, cx + 2, top + 12, T.trunkL); // knot
  px(ctx, x0 - flare, 60, T.trunkD, x1 - x0 + 2 * flare + 1, 1); // root shading
  px(ctx, x0 - flare - 2, 61, T.bark, 2, 1); px(ctx, x1 + flare + 1, 61, T.bark, 2, 1); // root tips
  grassTufts(ctx, r, 3, 58, 60);
}

/** One foliage puff: dark ball, mid and light caps offset to the top-left, a dark crescent underneath. */
function puff(ctx, x, y, rad, pal, lit = 2) {
  circle(ctx, x, y, rad, pal.dark);
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.clip();
  if (lit >= 1) circle(ctx, x - 1, y - 1.5, rad - 1.2, pal.mid);
  if (lit >= 2) circle(ctx, x - 2.5, y - 3.5, rad - 2.8, pal.light);
  if (lit >= 2) { ctx.strokeStyle = pal.hi; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x - 1.5, y - 2, rad - 3, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke(); }
  ctx.strokeStyle = pal.outline; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, rad - 0.5, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
  ctx.restore();
}

/** Round oak: a wide silhouette of overlapping puffs drawn back to front, lit from the top-left, trunk visible from y=47. */
function drawOak(ctx, r) {
  shadow(ctx, 17, 60.5, 14, 3.8, 0.4);
  drawTrunk(ctx, r, 34, 12, 20, 3);
  const puffs = [
    [10, 41, 6, 0], [22, 42, 6, 0], [16, 43, 6.5, 0],                    // bottom row, in shade, tapering to the trunk
    [5, 33, 6, 1], [27, 33, 6, 1], [16, 35, 8, 1],                        // lower middle
    [7, 26, 7.5, 2], [25, 27, 7.5, 1], [16, 25, 9, 2],                    // widest row
    [6, 18, 5.5, 2], [26, 19, 5.5, 1], [11, 15, 7, 2], [21, 16, 7, 2],    // upper row
    [16, 9, 7, 2], [11, 10, 5, 2], [21, 11, 5, 2],                        // crown, domed
  ];
  // whole-silhouette outline first so the canopy reads as one mass
  ctx.beginPath(); puffs.forEach(([x, y, rad]) => { ctx.moveTo(x + rad + 1, y); ctx.arc(x, y, rad + 1, 0, Math.PI * 2); }); ctx.fillStyle = T.outline; ctx.fill();
  puffs.forEach(([x, y, rad, lit]) => puff(ctx, x, y, rad, T, lit));
  // scattered leaf sparkles on the lit side, a few dark notches on the shaded side
  ctx.save(); ctx.beginPath(); puffs.forEach(([x, y, rad]) => { ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, Math.PI * 2); }); ctx.clip();
  for (let i = 0; i < 9; i++) px(ctx, ri(r, 3, 20), ri(r, 5, 30), T.hi, ri(r, 1, 2), 1);
  for (let i = 0; i < 5; i++) px(ctx, ri(r, 14, 29), ri(r, 30, 46), T.outline, 1, 1);
  ctx.restore();
}

/** Tall pine: four jagged frond tiers, lit from the left with a shaded right side, trunk visible from y=50. */
function drawPine(ctx, r) {
  shadow(ctx, 17, 60.5, 11.5, 3.4, 0.4);
  drawTrunk(ctx, r, 40, 13, 19, 2);
  const pal = { outline: '#173f1c', dark: '#25652b', mid: '#3a8a33', light: '#5cae43', hi: '#9ad467' };
  const tiers = [[30, 51, 15], [20, 41, 13], [10, 30, 10.5], [1, 19, 7]]; // [top, bottom, halfWidth], bottom tier first
  const cx = 16;
  tiers.forEach(([y0, y1, hw], t) => {
    // silhouette: apex, notched right flank, zig-zag hem, notched left flank
    const pts = [[cx, y0]];
    const flank = (side) => { const n = 3; for (let i = 1; i <= n; i++) { const f = i / n; pts.push([cx + side * hw * f - side * (i < n ? 1.5 : 0), y0 + (y1 - y0) * f]); if (i < n) pts.push([cx + side * hw * f + side * 0.5, y0 + (y1 - y0) * f + 2]); } };
    flank(1);
    for (let x = cx + hw - hw / 6; x > cx - hw + 0.01; x -= hw / 3) { pts.push([x, y1 - 3 - (Math.round(x) % 2)]); pts.push([x - hw / 6, y1]); }
    pts.push([cx - hw, y1]);
    const left = pts.slice().reverse();
    poly(ctx, pts, pal.dark, pal.outline, 2); poly(ctx, pts, pal.dark);
    ctx.save(); ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.clip();
    // lit face: everything left of a wavy line that bends across the tier
    poly(ctx, [[cx + 1, y0], [cx + hw * 0.55, y0 + (y1 - y0) * 0.45], [cx + hw * 0.25, y0 + (y1 - y0) * 0.7], [cx + hw * 0.4, y1], [cx - hw, y1]], pal.mid);
    poly(ctx, [[cx - 1, y0 + 2], [cx + hw * 0.1, y0 + (y1 - y0) * 0.5], [cx - hw * 0.25, y0 + (y1 - y0) * 0.75], [cx - hw * 0.15, y1 - 1], [cx - hw + 1, y1 - 1], [cx - hw * 0.55, y0 + (y1 - y0) * 0.55]], pal.light);
    // frond tips: light pixels along the hem on the lit half, outline notches on the shaded half
    for (let x = cx - hw + hw / 6; x < cx + hw; x += hw / 3) { const y = y1 - 3 - (Math.round(x) % 2); if (x < cx) px(ctx, Math.round(x) - 1, Math.round(y) - 1, pal.hi, 2, 1); else px(ctx, Math.round(x), Math.round(y) + 1, pal.outline, 1, 2); }
    for (let i = 0; i < 4; i++) { const nx = rr(r, cx - hw + 3, cx - 1), ny = rr(r, y0 + 4, y1 - 4); ctx.strokeStyle = pal.mid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx - 3, ny + 2); ctx.stroke(); }
    for (let i = 0; i < 3; i++) { const nx = rr(r, cx + 2, cx + hw - 3), ny = rr(r, y0 + 4, y1 - 4); ctx.strokeStyle = pal.outline; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx + 3, ny + 2); ctx.stroke(); }
    px(ctx, cx - 2, y0 + 3, pal.hi, 2, 1);
    ctx.restore();
    void left; void t;
  });
  px(ctx, 15, 0, pal.light, 2, 2); px(ctx, 15, 0, pal.hi, 1, 1); // tip
}

function drawRock(ctx, r, small = false) {
  if (small) {
    shadow(ctx, 16, 26, 8, 2.5);
    poly(ctx, [[9, 25], [8, 20], [12, 15], [19, 14], [24, 18], [24, 25]], R.base, R.outline, 1);
    poly(ctx, [[10, 19], [13, 16], [19, 15], [17, 19], [12, 21]], R.light);
    px(ctx, 13, 16, R.hi, 3, 1);
    poly(ctx, [[17, 20], [23, 19], [24, 25], [16, 25]], R.dark);
    grassTufts(ctx, r, 2, 23, 25);
    return;
  }
  shadow(ctx, 16, 27, 13, 3.5);
  poly(ctx, [[4, 26], [3, 18], [8, 11], [15, 7], [23, 8], [28, 14], [29, 21], [27, 26]], R.base, R.outline, 1);
  poly(ctx, [[6, 18], [9, 12], [15, 8], [22, 9], [18, 15], [11, 19]], R.light);
  poly(ctx, [[9, 13], [15, 9], [19, 10], [14, 14]], R.hi);
  poly(ctx, [[18, 15], [24, 10], [28, 15], [29, 21], [27, 26], [17, 26], [19, 19]], R.dark);
  poly(ctx, [[20, 20], [27, 20], [27, 26], [18, 26]], R.deep);
  ctx.strokeStyle = R.deep; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(11, 19); ctx.lineTo(13, 23); ctx.lineTo(12, 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(18, 15); ctx.lineTo(19, 19); ctx.stroke();
  px(ctx, 5, 24, 'rgba(255,255,255,0.15)', 1, 1);
  grassTufts(ctx, r, 3, 24, 27);
}

function post(ctx, x, top, bottom, w = 5) {
  // wooden post with a pointed cap, lit on the left
  poly(ctx, [[x, top + 3], [x + w / 2, top], [x + w, top + 3], [x + w, bottom], [x, bottom]], WD.base, WD.ink, 1);
  px(ctx, x + 1, top + 3, WD.light, 1, bottom - top - 4);
  px(ctx, x + w - 2, top + 3, WD.dark, 1, bottom - top - 4);
  px(ctx, x + 1, top + 2, WD.light, 1, 1);
}
function railH(ctx, y) {
  px(ctx, 0, y, WD.ink, 32, 5); px(ctx, 0, y + 1, WD.base, 32, 3); px(ctx, 0, y + 1, WD.light, 32, 1); px(ctx, 0, y + 3, WD.dark, 32, 1);
  for (let x = 3; x < 32; x += 9) px(ctx, x, y + 2, WD.dark, 2, 1);
}
function railV(ctx, x) {
  px(ctx, x, 0, WD.ink, 5, 32); px(ctx, x + 1, 0, WD.base, 3, 32); px(ctx, x + 1, 0, WD.light, 1, 32); px(ctx, x + 3, 0, WD.dark, 1, 32);
  for (let y = 4; y < 32; y += 9) px(ctx, x + 2, y, WD.dark, 1, 2);
}

function drawStump(ctx, r) {
  shadow(ctx, 16, 28, 12, 3);
  ellipse(ctx, 16, 26, 11.5, 5.5, WD.ink);
  px(ctx, 5, 13, WD.ink, 23, 13);
  ellipse(ctx, 16, 26, 10.5, 4.5, WD.dark);
  px(ctx, 6, 13, WD.base, 21, 13);
  px(ctx, 7, 14, WD.light, 2, 11); px(ctx, 23, 14, WD.dark, 3, 12);
  for (const x of [11, 15, 19]) px(ctx, x, 15, WD.dark, 1, 9);
  ellipse(ctx, 16, 13, 11.5, 6, WD.ink);
  ellipse(ctx, 16, 13, 10.5, 5, '#e2c48d');
  ctx.strokeStyle = '#b8935e'; ctx.lineWidth = 1;
  [[8, 3.6], [5.5, 2.4], [3, 1.2]].forEach(([rx, ry]) => { ctx.beginPath(); ctx.ellipse(16, 13, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); });
  px(ctx, 16, 13, WD.dark, 1, 1);
  ctx.strokeStyle = '#8a6238'; ctx.beginPath(); ctx.moveTo(16, 13); ctx.lineTo(24, 10); ctx.stroke();
  grassTufts(ctx, r, 3, 25, 28);
}

function drawSignpost(ctx, r) {
  shadow(ctx, 16, 29, 7, 2.2);
  post(ctx, 13, 6, 30, 6);
  poly(ctx, [[3, 9], [21, 9], [27, 14], [21, 19], [3, 19]], WD.light, WD.ink, 1);
  px(ctx, 4, 10, '#e5b578', 17, 1); px(ctx, 4, 17, WD.dark, 17, 1);
  px(ctx, 6, 12, WD.ink, 10, 1); px(ctx, 6, 14, WD.ink, 7, 1); px(ctx, 6, 16, WD.ink, 12, 1);
  px(ctx, 5, 10, '#6c6c76', 1, 1); px(ctx, 19, 10, '#6c6c76', 1, 1);
  grassTufts(ctx, r, 2, 26, 28);
}

function drawWell(ctx, r) {
  shadow(ctx, 16, 29, 13, 3);
  // stone ring
  ellipse(ctx, 16, 25, 13, 6, R.outline);
  ellipse(ctx, 16, 24, 12, 5.5, R.base);
  ellipse(ctx, 16, 23, 8, 3.5, R.outline);
  ellipse(ctx, 16, 23, 7, 3, '#173047');
  px(ctx, 12, 22, '#4c8bc9', 5, 1); px(ctx, 13, 22, W.foam, 2, 1);
  for (const [x, y, w] of [[5, 25, 4], [10, 27, 4], [16, 28, 4], [22, 27, 4], [27, 24, 3]]) { px(ctx, x, y, R.dark, w, 2); px(ctx, x, y, R.light, w - 1, 1); }
  // posts and roof
  post(ctx, 4, 8, 24, 4); post(ctx, 24, 8, 24, 4);
  px(ctx, 6, 10, WD.ink, 20, 2); px(ctx, 6, 10, WD.dark, 20, 1);
  px(ctx, 15, 11, '#d8c7a0', 1, 6); // rope
  px(ctx, 12, 16, WD.ink, 7, 6); px(ctx, 13, 17, '#7d7e8a', 5, 4); px(ctx, 13, 17, '#a9aab6', 5, 1); px(ctx, 13, 20, '#5a5b66', 5, 1); px(ctx, 14, 16, WD.ink, 3, 1);
  poly(ctx, [[1, 9], [16, 0.5], [31, 9]], '#b3563d', WD.ink, 1);
  poly(ctx, [[3, 8], [16, 1.5], [16, 8]], '#cf6f52');
  px(ctx, 15, 0, WD.ink, 2, 1);
  px(ctx, 1, 9, WD.ink, 30, 1); px(ctx, 2, 8, '#8e3e2b', 28, 1);
  grassTufts(ctx, r, 2, 27, 29);
}

function drawTallGrass(ctx, r) {
  const blades = [[5, 30, 2, 12], [9, 31, 8, 8], [13, 30, 11, 6], [17, 31, 19, 9], [21, 30, 21, 14], [25, 31, 29, 11], [11, 31, 5, 16], [19, 30, 14, 15]];
  for (const [x0, y0, x1, y1] of blades) {
    const cx = (x0 + x1) / 2 + rr(r, -2, 2);
    ctx.strokeStyle = G.outline; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, y1 + 4, x1, y1); ctx.stroke();
  }
  for (const [x0, y0, x1, y1] of blades) {
    const cx = (x0 + x1) / 2 + rr(r, -2, 2);
    ctx.strokeStyle = G.dark; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, y1 + 4, x1, y1); ctx.stroke();
    ctx.strokeStyle = G.pale; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x0 - 0.5, y0 - 2); ctx.quadraticCurveTo(cx - 0.5, y1 + 4, x1 - 0.5, y1 + 1); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function flower(ctx, x, y, petal, center, r, size = 2) {
  // stem + leaf
  px(ctx, x, y + 2, G.deep, 1, 5); px(ctx, x + 1, y + 4, G.light, 2, 1); px(ctx, x - 2, y + 5, G.light, 2, 1);
  const s = size;
  circle(ctx, x + 0.5, y - s + 0.5, s, petal); circle(ctx, x + 0.5, y + s + 0.5, s, petal);
  circle(ctx, x - s + 0.5, y + 0.5, s, petal); circle(ctx, x + s + 0.5, y + 0.5, s, petal);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, s * 2, 0, Math.PI * 2); ctx.stroke();
  circle(ctx, x + 0.5, y + 0.5, s * 0.9, center);
  px(ctx, x - 1, y - s, '#ffffff', 1, 1);
}

function drawMushroom(ctx, r) {
  shadow(ctx, 16, 28, 8, 2.2);
  for (const [cx, cy, rx, ry, big] of [[10, 22, 4, 3, false], [19, 16, 8, 6, true]]) {
    const sw = big ? 6 : 3, sh = big ? 10 : 6;
    px(ctx, cx - sw / 2 - 1, cy, WD.ink, sw + 2, sh + 1);
    px(ctx, cx - sw / 2, cy, '#f2e3c4', sw, sh); px(ctx, cx + sw / 2 - 2, cy + 1, '#cdb48b', 1, sh - 2);
    ellipse(ctx, cx, cy, rx + 1, ry + 1, WD.ink);
    ellipse(ctx, cx, cy, rx, ry, '#c8363c');
    ellipse(ctx, cx - 1, cy - 1.5, rx - 2, ry - 2.5, '#e2555a');
    ellipse(ctx, cx, cy + 1.5, rx - 0.5, 1.5, '#8f2028');
    if (big) { px(ctx, cx - 4, cy - 3, '#fff2e0', 2, 2); px(ctx, cx + 2, cy - 1, '#fff2e0', 2, 1); px(ctx, cx - 1, cy + 1, '#fff2e0', 1, 1); } else px(ctx, cx - 1, cy - 2, '#fff2e0', 2, 1);
  }
  grassTufts(ctx, r, 2, 25, 27);
}

function drawLog(ctx, r) {
  shadow(ctx, 16, 25, 13, 3);
  px(ctx, 5, 12, WD.ink, 23, 12);
  px(ctx, 6, 13, WD.base, 22, 10); px(ctx, 6, 13, WD.light, 22, 2); px(ctx, 6, 21, WD.dark, 22, 2);
  for (const x of [10, 16, 22]) { px(ctx, x, 15, WD.dark, 1, 6); px(ctx, x + 1, 16, WD.light, 1, 3); }
  ellipse(ctx, 6, 18, 4.5, 6.5, WD.ink);
  ellipse(ctx, 6, 18, 3.5, 5.5, '#e2c48d');
  ctx.strokeStyle = '#b8935e'; ctx.lineWidth = 1;
  [[2.4, 3.6], [1.1, 1.7]].forEach(([rx, ry]) => { ctx.beginPath(); ctx.ellipse(6, 18, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); });
  px(ctx, 12, 12, WD.ink, 2, 1); px(ctx, 12, 11, T.dark, 3, 1); px(ctx, 13, 10, T.light, 2, 1);
  grassTufts(ctx, r, 2, 24, 27);
}

function drawPebbles(ctx, r) {
  for (const [x, y, w] of [[6, 20, 4], [15, 12, 3], [22, 22, 5], [11, 26, 3], [25, 9, 3]]) {
    ellipse(ctx, x + w / 2, y + 2.6, w / 2 + 1, 1.6, 'rgba(18,40,22,0.25)');
    ellipse(ctx, x + w / 2, y + 1.5, w / 2 + 1, 2.5, R.outline); ellipse(ctx, x + w / 2, y + 1.5, w / 2, 1.6, R.base);
    px(ctx, x, y, R.light, w - 1, 1); px(ctx, x + w / 2, y + 2, R.dark, Math.ceil(w / 2), 1);
  }
}

function lilyPad(ctx, cx, cy, rad) {
  ctx.fillStyle = T.outline; ctx.beginPath(); ctx.ellipse(cx, cy + 1, rad + 1, rad * 0.7 + 1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = T.mid; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.ellipse(cx, cy, rad, rad * 0.7, 0, Math.PI * 0.12, Math.PI * 1.85); ctx.closePath(); ctx.fill();
  ctx.fillStyle = T.light; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.ellipse(cx - 1, cy - 1, rad - 2, (rad - 2) * 0.7, 0, Math.PI * 0.3, Math.PI * 1.6); ctx.closePath(); ctx.fill();
  px(ctx, cx - 3, cy - 2, T.hi, 2, 1);
}

// ---------------------------------------------------------------- tiles
const ground = (tag, fn) => ({ tag, solid: false, draw: fn });
const object = (tag, fn) => ({ tag, solid: true, draw: fn });
const deco = (tag, fn) => ({ tag, solid: false, draw: fn });
/** Water is impassable ground: it tiles like the other ground textures but the runtime blocks it. */
const water = (tag, fn) => ({ tag, solid: true, draw: fn });
const pathSeam = [P.deep, P.light, P.pebD, G.dark];
const waterSeam = [W.shore, W.foam, W.ripple, W.dark];

export default {
  id: 'tls_outdoor', name: 'Outdoor', assetId: 'ast_starter_tileset', file: 'tileset.png',
  tileSize: 32, columns: 8,
  groundTag: 'grass',
  /** Multi-tile objects the editor paints in one click; rows of tags, `above` rows mark cells drawn over characters. */
  stamps: [
    { name: 'Tree', tags: [['tree_top'], ['tree']], above: [[true], [false]] },
    { name: 'Pine', tags: [['tree2_top'], ['tree2']], above: [[true], [false]] },
  ],
  tiles: [
    // ---- row 0: grass family
    ground('grass', (ctx, s) => grassBase(ctx, s)),
    ground('grass2', (ctx, s, r) => {
      grassBase(ctx, s);
      for (let i = 0; i < 4; i++) { // clover: three leaves + stem
        const x = ri(r, 3, 27), y = ri(r, 4, 27);
        px(ctx, x - 1, y, G.deep, 3, 1); px(ctx, x, y - 1, G.deep, 1, 1); px(ctx, x - 1, y, G.pale, 1, 1); px(ctx, x + 1, y, G.light, 1, 1); px(ctx, x, y - 1, G.pale, 1, 1); px(ctx, x, y + 1, G.dark, 1, 1);
      }
      for (let i = 0; i < 3; i++) { const x = ri(r, 3, 28), y = ri(r, 3, 28); px(ctx, x, y, '#fff7e6', 1, 1); px(ctx, x - 1, y, '#f3e2b0', 1, 1); px(ctx, x, y + 1, G.deep, 1, 1); }
    }),
    ground('flowers', (ctx, s, r) => {
      grassBase(ctx, s);
      flower(ctx, 7, 8, '#ff6b7a', '#ffd35c', r, 1.6);
      flower(ctx, 22, 11, '#7fb2ff', '#fff2a8', r, 1.6);
      flower(ctx, 13, 21, '#fff2f5', '#ffc44d', r, 1.4);
      flower(ctx, 26, 24, '#ff9bd0', '#fff2a8', r, 1.4);
    }),
    deco('tall_grass', (ctx, s, r) => drawTallGrass(ctx, r)),
    deco('flower_red', (ctx, s, r) => { flower(ctx, 10, 17, '#e94b57', '#ffd35c', r, 2); flower(ctx, 21, 12, '#ff6b7a', '#ffd35c', r, 2); flower(ctx, 19, 23, '#e94b57', '#ffe17a', r, 1.5); grassTufts(ctx, r, 2, 26, 28); }),
    deco('flower_blue', (ctx, s, r) => { flower(ctx, 9, 13, '#5a9cff', '#fff2a8', r, 2); flower(ctx, 22, 17, '#7fb2ff', '#fff2a8', r, 2); flower(ctx, 14, 24, '#5a9cff', '#fff8c8', r, 1.5); grassTufts(ctx, r, 2, 26, 28); }),
    object('bush', (ctx, s, r) => drawBush(ctx, r, false)),
    object('rock', (ctx, s, r) => drawRock(ctx, r, false)),

    // ---- row 1: path family + dirt/sand
    ground('path', (ctx, s) => pathBase(ctx, s)),
    ground('path_edge_n', (ctx, s) => grassEdgeTile(ctx, s, 'n', () => pathBase(ctx, s), pathSeam, { phase: 0.6 })),
    ground('path_edge_s', (ctx, s) => grassEdgeTile(ctx, s, 's', () => pathBase(ctx, s), pathSeam, { phase: 2.1 })),
    ground('path_edge_w', (ctx, s) => grassEdgeTile(ctx, s, 'w', () => pathBase(ctx, s), pathSeam, { phase: 3.4 })),
    ground('path_edge_e', (ctx, s) => grassEdgeTile(ctx, s, 'e', () => pathBase(ctx, s), pathSeam, { phase: 4.9 })),
    ground('path2', (ctx, s) => pathBase(ctx, s, 71, 11)),
    ground('dirt', (ctx, s) => dirtBase(ctx, s)),
    ground('sand', (ctx, s) => sandBase(ctx, s)),

    // ---- row 2: water family
    water('water', (ctx, s) => waterBase(ctx, s)),
    water('water_edge_n', (ctx, s) => grassEdgeTile(ctx, s, 'n', () => waterBase(ctx, s), waterSeam, { phase: 1.1, depth: 8 })),
    water('water_edge_s', (ctx, s) => grassEdgeTile(ctx, s, 's', () => waterBase(ctx, s), waterSeam, { phase: 2.6, depth: 8 })),
    water('water_edge_w', (ctx, s) => grassEdgeTile(ctx, s, 'w', () => waterBase(ctx, s), waterSeam, { phase: 3.9, depth: 8 })),
    water('water_edge_e', (ctx, s) => grassEdgeTile(ctx, s, 'e', () => waterBase(ctx, s), waterSeam, { phase: 5.3, depth: 8 })),
    water('water_lily', (ctx, s, r) => {
      waterBase(ctx, s, 61);
      lilyPad(ctx, 11, 20, 6); lilyPad(ctx, 23, 11, 4.5);
      circle(ctx, 22.5, 20.5, 2.4, '#ff8fb8'); circle(ctx, 22.5, 20.5, 1.2, '#ffe1ec'); px(ctx, 22, 19, '#ffffff');
    }),
    object('water_rock', (ctx, s, r) => {
      waterBase(ctx, s, 67);
      ellipse(ctx, 16, 24, 12, 3.2, W.dark);
      poly(ctx, [[6, 24], [5, 17], [10, 11], [17, 9], [24, 12], [27, 18], [26, 24]], R.base, R.outline, 1);
      poly(ctx, [[8, 17], [11, 12], [17, 10], [15, 16], [10, 19]], R.light); px(ctx, 12, 12, R.hi, 3, 1);
      poly(ctx, [[17, 15], [24, 13], [27, 18], [26, 24], [16, 24], [18, 19]], R.dark);
      px(ctx, 4, 24, W.foam, 4, 1); px(ctx, 24, 25, W.foam, 5, 1); px(ctx, 9, 26, W.ripple, 6, 1); px(ctx, 19, 26, W.ripple, 4, 1);
    }),
    water('water2', (ctx, s) => waterBase(ctx, s, 79)),

    // ---- row 3: trees, stump, fences
    deco('tree_top', (ctx) => drawTree(ctx, 'top', 0)),
    object('tree', (ctx) => drawTree(ctx, 'bottom', 0)),
    deco('tree2_top', (ctx) => drawTree(ctx, 'top', 1)),
    object('tree2', (ctx) => drawTree(ctx, 'bottom', 1)),
    object('stump', (ctx, s, r) => drawStump(ctx, r)),
    object('fence_h', (ctx) => { shadow(ctx, 16, 27, 15, 2, 0.2); railH(ctx, 9); railH(ctx, 18); post(ctx, 13, 3, 27, 6); }),
    object('fence_v', (ctx) => { railV(ctx, 10); railV(ctx, 17); post(ctx, 13, 3, 27, 6); }),
    object('fence_post', (ctx) => { shadow(ctx, 16, 27, 5, 1.8, 0.2); post(ctx, 13, 3, 27, 6); }),

    // ---- row 4: props
    object('signpost', (ctx, s, r) => drawSignpost(ctx, r)),
    object('well', (ctx, s, r) => drawWell(ctx, r)),
    deco('mushroom', (ctx, s, r) => drawMushroom(ctx, r)),
    object('log', (ctx, s, r) => drawLog(ctx, r)),
    deco('flower_yellow', (ctx, s, r) => { flower(ctx, 9, 15, '#ffd13f', '#e07b1a', r, 2); flower(ctx, 22, 12, '#ffe06b', '#e07b1a', r, 2); flower(ctx, 17, 24, '#ffd13f', '#ff9a2a', r, 1.5); grassTufts(ctx, r, 2, 26, 28); }),
    deco('pebbles', (ctx, s, r) => drawPebbles(ctx, r)),
    object('bush_berry', (ctx, s, r) => drawBush(ctx, r, true)),
    object('rock_small', (ctx, s, r) => drawRock(ctx, r, true)),

    // ---- row 5: corners. path_corner_* = grass only in that quadrant (inside of a bend or
    // crossing); water_corner_* = that corner of a pond, grass on its two outer sides.
    ground('path_corner_nw', (ctx, s) => grassCornerTile(ctx, s, 'nw', true, () => pathBase(ctx, s), pathSeam)),
    ground('path_corner_ne', (ctx, s) => grassCornerTile(ctx, s, 'ne', true, () => pathBase(ctx, s), pathSeam)),
    ground('path_corner_sw', (ctx, s) => grassCornerTile(ctx, s, 'sw', true, () => pathBase(ctx, s), pathSeam)),
    ground('path_corner_se', (ctx, s) => grassCornerTile(ctx, s, 'se', true, () => pathBase(ctx, s), pathSeam)),
    water('water_corner_nw', (ctx, s) => grassCornerTile(ctx, s, 'nw', false, () => waterBase(ctx, s), waterSeam, { phase: { n: 1.1, w: 3.9 } })),
    water('water_corner_ne', (ctx, s) => grassCornerTile(ctx, s, 'ne', false, () => waterBase(ctx, s), waterSeam, { phase: { n: 1.1, e: 5.3 } })),
    water('water_corner_sw', (ctx, s) => grassCornerTile(ctx, s, 'sw', false, () => waterBase(ctx, s), waterSeam, { phase: { s: 2.6, w: 3.9 } })),
    water('water_corner_se', (ctx, s) => grassCornerTile(ctx, s, 'se', false, () => waterBase(ctx, s), waterSeam, { phase: { s: 2.6, e: 5.3 } })),
  ],
};
