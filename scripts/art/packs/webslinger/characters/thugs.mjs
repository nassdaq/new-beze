/**
 * The street thugs of the "Webslinger" template. One drawing code, two characters:
 *
 *  - Thug: a wiry mugger in a grey-green hoodie with the hood up, a black bandana over the mouth, worn jeans,
 *    black sneakers and a wooden baseball bat. Angry little eyes in the shadow of the hood.
 *  - Enforcer (the boss): a heavy in a white tank top, shaved head, wraparound shades, a gold chain, dark cargo
 *    trousers, boots and a length of steel pipe. Same skeleton, wider shoulders and thicker arms.
 *
 * Rows: walk (a slouchy stride), attack = a swing of the weapon (wind-up over the shoulder, strike in the facing
 * direction with an impact spark, recovery). No emotes. Feet touch the bottom of the frame.
 *
 * Paths into an offscreen canvas, alpha thresholded to whole pixels, a 1 px dark outline. Deterministic.
 */

const W = 48;
const H = 64;
const TAU = Math.PI * 2;

const THUG = {
  line: '#15121A',
  top: '#4E5E4A', topDk: '#36432F', topLt: '#65775F',
  mask: '#1E1E24', maskLt: '#34343C',
  skin: '#B07A52', skinSh: '#8A5A38', skinDk: '#63401F',
  pants: '#3A4460', pantsDk: '#283048', pantsLt: '#4B587A',
  shoe: '#1F1F24', shoeSh: '#3A3A42', sole: '#DADAD4',
  weapon: '#B9854A', weaponDk: '#7D5326', weaponLt: '#D5A268', grip: '#2A2A2E',
  eyeW: '#F4EEE0', pupil: '#1A1010',
  spark: '#FFE86A', sparkHi: '#FFFFFF',
  shadow: 'rgba(20,10,20,0.28)',
};
const BRUTE = {
  line: '#15121A',
  top: '#E9E4D8', topDk: '#BFB9AC', topLt: '#FFFDF6',
  mask: '#141418', maskLt: '#3A3A44',
  skin: '#7E4F31', skinSh: '#5F381F', skinDk: '#3F2213',
  pants: '#2E2C30', pantsDk: '#1C1B1F', pantsLt: '#45434A',
  shoe: '#2A1F18', shoeSh: '#453227', sole: '#6B5A4E',
  weapon: '#8A8F98', weaponDk: '#5B6068', weaponLt: '#B8BDC6', grip: '#3A3E46',
  chain: '#E7C64A', chainDk: '#B08E2A',
  eyeW: '#F4EEE0', pupil: '#1A1010',
  spark: '#FFE86A', sparkHi: '#FFFFFF',
  shadow: 'rgba(20,10,20,0.3)',
};

// ---------------------------------------------------------------- primitives
function ell(c, x, y, rx, ry, fill, rot = 0) {
  c.beginPath(); c.ellipse(x, y, Math.max(rx, 0.2), Math.max(ry, 0.2), rot, 0, TAU); c.fillStyle = fill; c.fill();
}
function poly(c, pts, fill) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = fill; c.fill();
}
function rect(c, x, y, w, h, fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
function path(c, fill, fn) { c.beginPath(); fn(c); c.closePath(); c.fillStyle = fill; c.fill(); }
function stroke(c, color, w, fn) {
  c.beginPath(); fn(c); c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
}
function clipped(c, fn, body) { c.save(); c.beginPath(); fn(c); c.closePath(); c.clip(); body(c); c.restore(); }
function crisp(canvas, threshold = 110) {
  const c = canvas.getContext('2d');
  const img = c.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < threshold) { d[i - 3] = 0; d[i - 2] = 0; d[i - 1] = 0; d[i] = 0; } else d[i] = 255;
  }
  c.putImageData(img, 0, 0);
}
function outlined(src, color) {
  const out = document.createElement('canvas'); out.width = src.width; out.height = src.height;
  const c = out.getContext('2d'); c.imageSmoothingEnabled = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.drawImage(src, dx, dy);
  c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, out.width, out.height);
  c.globalCompositeOperation = 'source-over'; c.drawImage(src, 0, 0);
  return out;
}
function sparkStar(c, x, y, r, fill) {
  poly(c, [[x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28], [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]], fill);
}
function impact(c, P, x, y, rand) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3, l = i % 2 ? 4.5 : 3;
    stroke(c, P.spark, 1.2, (c) => { c.moveTo(x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); });
  }
  sparkStar(c, x, y, 2.6, P.spark);
  sparkStar(c, x, y, 1.3, P.sparkHi);
  for (let i = 0; i < 3; i++) {
    const a = rand() * TAU, d = 5 + rand() * 2.5;
    const px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d);
    if (px >= 3 && px <= W - 4 && py >= 3 && py <= H - 4) rect(c, px, py, 1, 1, P.sparkHi);
  }
}

// ------------------------------------------------------------------- pose
/**
 * `weapon: [x, y]` is the far end of the bat/pipe (the hand is its grip); `swing` draws a motion arc behind it.
 * Arms: L viewer-left, R viewer-right (front/back), near/far (side, drawn facing left).
 */
function pose(f, bulk) {
  const base = { s: 0, by: 0, mood: 'mean', headDx: 0, lean: 0, spread: bulk };
  if (f.anim === 'walk') {
    const s = [0, 1, 0, -1][f.index];
    return { ...base, s, by: f.index % 2 ? -1 : 0 };
  }
  const k = f.index;
  const p = { ...base, mood: ['mean', 'roar', 'mean'][k], by: [-1, 1, 0][k], spread: bulk + [1, 2, 1][k] };
  if (f.dir === 'down') {
    p.R = [
      { via: [37, 36], h: [34, 29], weapon: [40, 18] },
      { via: [36, 42], h: [24, 47], weapon: [14, 55], swing: [[41, 24], [30, 44], [14, 55]], spark: [12, 57] },
      { via: [36, 42], h: [30, 47], weapon: [36, 57] },
    ][k];
    p.L = [{ via: [12, 42], h: [15, 45], fist: true }, { via: [11, 40], h: [12, 36], fist: true }, { h: [14, 46.5], fist: true }][k];
    p.headDx = [-0.5, 0.5, 0][k];
  } else if (f.dir === 'up') {
    p.L = [
      { via: [11, 36], h: [14, 29], weapon: [8, 18] },
      { via: [11, 34], h: [18, 24], weapon: [26, 14], swing: [[6, 22], [16, 16], [26, 14]], spark: [27, 12] },
      { via: [11, 42], h: [14, 46], weapon: [8, 57] },
    ][k];
    p.R = [{ via: [36, 42], h: [33, 45], fist: true }, { via: [37, 40], h: [36, 36], fist: true }, { h: [34, 46.5], fist: true }][k];
  } else {
    p.near = [
      { via: [30, 38], h: [31, 31], weapon: [36, 20] },
      { via: [17, 38], h: [12, 39], weapon: [2, 39], swing: [[30, 26], [14, 30], [2, 39]], spark: [3, 41] },
      { via: [19, 41], h: [14, 44], weapon: [6, 52] },
    ][k];
    p.far = [{ via: [21, 41], h: [17, 39.5], fist: true }, { via: [30, 41], h: [30, 44], fist: true }, { h: [27, 46], fist: true }][k];
    p.lean = [1, -2, 0][k];
    p.headDx = [0.5, -1, 0][k];
  }
  return p;
}

// ------------------------------------------------------------- body parts
function hand(c, P, x, y, r, fist) {
  ell(c, x, y, r * 1.05, r, P.skin);
  ell(c, x + 0.4, y + r * 0.45, r * 0.75, r * 0.45, P.skinSh);
  if (fist) for (const o of [-0.9, 0, 0.9]) rect(c, x + o * r * 0.7 - 0.4, y - r * 0.55, 0.8, 0.8, P.skinDk);
}
/** The bat (tapered wood) or the pipe (even steel) from the hand `h` to `end`. */
function weapon(c, P, kind, h, end) {
  const dx = end[0] - h[0], dy = end[1] - h[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  if (kind === 'bat') {
    stroke(c, P.weaponDk, 3.6, (c) => { c.moveTo(h[0] + ux * 3 + 0.7, h[1] + uy * 3 + 0.7); c.lineTo(end[0] + 0.7, end[1] + 0.7); });
    stroke(c, P.weapon, 2.2, (c) => { c.moveTo(h[0] - ux * 2, h[1] - uy * 2); c.lineTo(h[0] + ux * 4, h[1] + uy * 4); });
    stroke(c, P.weapon, 3.4, (c) => { c.moveTo(h[0] + ux * 4, h[1] + uy * 4); c.lineTo(end[0], end[1]); });
    stroke(c, P.weaponLt, 0.9, (c) => { c.moveTo(h[0] + ux * 5 - uy * 0.9, h[1] + uy * 5 + ux * 0.9); c.lineTo(end[0] - ux * 1.5 - uy * 0.9, end[1] - uy * 1.5 + ux * 0.9); });
    stroke(c, P.grip, 2.4, (c) => { c.moveTo(h[0] - ux * 2.4, h[1] - uy * 2.4); c.lineTo(h[0] + ux * 1.6, h[1] + uy * 1.6); });
  } else {
    stroke(c, P.weaponDk, 3.2, (c) => { c.moveTo(h[0] - ux * 3 + 0.7, h[1] - uy * 3 + 0.7); c.lineTo(end[0] + 0.7, end[1] + 0.7); });
    stroke(c, P.weapon, 2.8, (c) => { c.moveTo(h[0] - ux * 3, h[1] - uy * 3); c.lineTo(end[0], end[1]); });
    stroke(c, P.weaponLt, 0.9, (c) => { c.moveTo(h[0] - ux * 2 - uy * 0.9, h[1] - uy * 2 + ux * 0.9); c.lineTo(end[0] - ux - uy * 0.9, end[1] - uy + ux * 0.9); });
    // threaded ends
    stroke(c, P.weaponDk, 3.6, (c) => { c.moveTo(end[0] - ux * 2, end[1] - uy * 2); c.lineTo(end[0], end[1]); });
    stroke(c, P.weaponDk, 3.6, (c) => { c.moveTo(h[0] - ux * 3, h[1] - uy * 3); c.lineTo(h[0] - ux * 1.5, h[1] - uy * 1.5); });
  }
}
/** Motion arc behind a swing: a translucent wedge fading toward the start. */
function swingArc(c, pts) {
  const [a, b, e] = pts;
  stroke(c, 'rgba(255,255,255,0.55)', 3, (c) => { c.moveTo(a[0], a[1]); c.quadraticCurveTo(b[0], b[1], e[0], e[1]); });
  stroke(c, 'rgba(255,255,255,0.9)', 1.2, (c) => { c.moveTo(a[0], a[1]); c.quadraticCurveTo(b[0], b[1], e[0], e[1]); });
}

/** Sleeve (hoodie) or bare arm (tank top) from shoulder to hand. */
function arm(c, P, kind, s, a, bulk) {
  const h = a.h, via = a.via ?? null;
  const w = (a.w ?? 4.6) + bulk * 1.4;
  const bare = kind === 'brute';
  const base = bare ? (a.far ? P.skinSh : P.skin) : a.far ? P.topDk : P.top;
  const shade = bare ? P.skinSh : P.topDk;
  const seg = (c, dx, dy) => {
    c.moveTo(s[0] + dx, s[1] + dy);
    if (via) c.quadraticCurveTo(via[0] + dx, via[1] + dy, h[0] + dx, h[1] + dy);
    else c.lineTo(h[0] + dx, h[1] + dy);
  };
  if (!a.far) stroke(c, shade, w, (c) => seg(c, 0.9, 0.9));
  stroke(c, base, w, (c) => seg(c, 0, 0));
  const px = via ? via[0] : s[0], py = via ? via[1] : s[1];
  let ux = h[0] - px, uy = h[1] - py; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
  if (!bare) {
    stroke(c, a.far ? P.topDk : P.topLt, 0.9, (c) => { c.moveTo(s[0] - uy * 1.2, s[1] + ux * 1.2); c.lineTo(px + (h[0] - px) * 0.5 - uy * 1.2, py + (h[1] - py) * 0.5 + ux * 1.2); });
    stroke(c, P.topDk, w + 0.4, (c) => { c.moveTo(h[0] - ux * 2.6, h[1] - uy * 2.6); c.lineTo(h[0] - ux * 0.8, h[1] - uy * 0.8); });
  } else if (!a.far) {
    // bicep highlight
    stroke(c, P.skin === BRUTE.skin ? '#9B6846' : P.skin, 1.1, (c) => { c.moveTo(s[0] - uy * 1.6, s[1] + ux * 1.6); c.lineTo(px + (h[0] - px) * 0.4 - uy * 1.6, py + (h[1] - py) * 0.4 + ux * 1.6); });
  }
  const r = 2.1 + bulk * 0.4;
  const hx = h[0] + ux * (r * 0.6), hy = h[1] + uy * (r * 0.6);
  hand(c, P, hx, hy, r, a.fist || !!a.weapon);
  return [hx, hy];
}

// ------------------------------------------------------------------ heads
function eyesMean(c, P, lx, rx, y, mood, k = 0) {
  // narrow angry eyes: white slits, pupils, brows slanting down toward the nose
  const n = mood === 'roar' ? 1.4 : 1;
  for (const [ex, side] of [[lx, -1], [rx, 1]]) {
    if (ex === null) continue;
    ell(c, ex, y, 2.2, 1.2 * n, P.eyeW);
    ell(c, ex + k * 0.4, y + 0.1, 1, 1 * n, P.pupil);
    stroke(c, P.line, 1.3, (c) => { c.moveTo(ex - side * 2.6, y - 2.2); c.lineTo(ex + side * 2.2, y - 1); });
  }
}
function bandana(c, P, x0, x1, y, side = 0) {
  const shape = (c) => { c.moveTo(x0, y); c.lineTo(x1, y); c.quadraticCurveTo(x1 + 0.5, y + 4.5, (x0 + x1) / 2 + side * 2, y + 6.5); c.quadraticCurveTo(x0 - 0.5, y + 4.5, x0, y); };
  path(c, P.mask, shape);
  clipped(c, shape, (c) => {
    rect(c, x0, y, x1 - x0, 1, P.maskLt);
    stroke(c, P.maskLt, 0.8, (c) => { c.moveTo(x0 + 2, y + 2.5); c.quadraticCurveTo((x0 + x1) / 2, y + 4, x1 - 2, y + 2.5); });
  });
}

function headFrontThug(c, P, o) {
  const { dx = 0, dy = 0, mood } = o;
  c.save(); c.translate(dx, dy);
  const hood = (c) => { c.moveTo(12, 24); c.quadraticCurveTo(11.5, 7.5, 24, 7.5); c.quadraticCurveTo(36.5, 7.5, 36, 24); c.quadraticCurveTo(36, 31.5, 30, 33.5); c.lineTo(18, 33.5); c.quadraticCurveTo(12, 31.5, 12, 24); };
  path(c, P.top, hood);
  clipped(c, hood, (c) => { rect(c, 30, 6, 8, 30, P.topDk); ell(c, 19, 12, 4, 1.6, P.topLt); });
  // the face opening, deep in shadow at the top
  const face = (c) => c.ellipse(24, 22.5, 7.6, 9, 0, 0, TAU);
  path(c, P.skin, face);
  clipped(c, face, (c) => {
    rect(c, 14, 12, 20, 6, P.skinDk);
    rect(c, 14, 17, 20, 2, P.skinSh);
    rect(c, 28.5, 12, 6, 22, P.skinSh);
  });
  stroke(c, P.topDk, 1.4, (c) => c.ellipse(24, 22.5, 7.6, 9, 0, Math.PI * 1.05, Math.PI * 1.95));
  eyesMean(c, P, 20.6, 27.4, 21.8, mood);
  bandana(c, P, 16.2, 31.8, 24.6);
  // drawstrings
  stroke(c, P.topLt, 0.9, (c) => { c.moveTo(19.5, 31); c.lineTo(18.5, 36); c.moveTo(28.5, 31); c.lineTo(29.5, 36); });
  c.restore();
}
function headBackThug(c, P, o) {
  const { dx = 0, dy = 0 } = o;
  c.save(); c.translate(dx, dy);
  const hood = (c) => { c.moveTo(12, 24); c.quadraticCurveTo(11.5, 7.5, 24, 7.5); c.quadraticCurveTo(36.5, 7.5, 36, 24); c.quadraticCurveTo(36, 33, 30, 35); c.lineTo(18, 35); c.quadraticCurveTo(12, 33, 12, 24); };
  path(c, P.top, hood);
  clipped(c, hood, (c) => {
    rect(c, 30, 6, 8, 32, P.topDk);
    ell(c, 19, 12, 4, 1.6, P.topLt);
    stroke(c, P.topDk, 1, (c) => { c.moveTo(24, 9); c.quadraticCurveTo(23, 22, 24, 35); });
    rect(c, 12, 30, 24, 6, 'rgba(0,0,0,0.16)');
  });
  c.restore();
}
function headSideThug(c, P, o) {
  const { dx = 0, dy = 0, mood } = o;
  c.save(); c.translate(dx, dy);
  const hood = (c) => { c.moveTo(11.5, 23); c.quadraticCurveTo(12, 7.5, 25, 7.5); c.quadraticCurveTo(37.5, 7.5, 37, 24); c.quadraticCurveTo(37, 33, 30, 34.5); c.lineTo(17, 34); c.quadraticCurveTo(11, 31, 11.5, 23); };
  path(c, P.top, hood);
  clipped(c, hood, (c) => { rect(c, 29, 6, 10, 32, P.topDk); ell(c, 19, 12, 4, 1.6, P.topLt); });
  // face peeks out of the hood opening
  const face = (c) => { c.moveTo(14, 16); c.quadraticCurveTo(12.5, 22, 13.6, 27); c.quadraticCurveTo(15, 31, 22, 31.5); c.lineTo(24, 31.5); c.lineTo(24, 16); };
  path(c, P.skin, face);
  clipped(c, face, (c) => { rect(c, 10, 12, 16, 5.5, P.skinDk); rect(c, 10, 17, 16, 1.8, P.skinSh); rect(c, 21, 12, 4, 22, P.skinSh); });
  poly(c, [[13.6, 22.4], [11.6, 24.6], [13.6, 26.2]], P.skin); // nose
  stroke(c, P.topDk, 1.4, (c) => { c.moveTo(13.4, 17.5); c.quadraticCurveTo(18, 12, 24.5, 15.5); });
  eyesMean(c, P, 16.6, null, 22, mood, -1);
  bandana(c, P, 12.4, 24.5, 25, -1);
  c.restore();
}

function headFrontBrute(c, P, o) {
  const { dx = 0, dy = 0, mood } = o;
  c.save(); c.translate(dx, dy);
  const head = (c) => { c.moveTo(14, 21); c.quadraticCurveTo(14, 9.5, 24, 9.5); c.quadraticCurveTo(34, 9.5, 34, 21); c.quadraticCurveTo(34.4, 29.5, 24, 31.5); c.quadraticCurveTo(13.6, 29.5, 14, 21); };
  path(c, P.skin, head);
  clipped(c, head, (c) => {
    rect(c, 29, 8, 6, 26, P.skinSh);
    ell(c, 24, 31, 8, 3, P.skinSh);
    ell(c, 21, 13, 4, 1.8, '#9B6846');
    // stubble
    rect(c, 15, 25, 18, 7, 'rgba(20,10,10,0.18)');
  });
  // ears
  ell(c, 13.6, 22, 1.8, 2.4, P.skin); ell(c, 34.4, 22, 1.8, 2.4, P.skin);
  // wraparound shades
  path(c, P.mask, (c) => { c.moveTo(14.5, 19.5); c.lineTo(33.5, 19.5); c.quadraticCurveTo(33.5, 24.5, 29, 24.5); c.quadraticCurveTo(26, 24.5, 25.5, 21.5); c.lineTo(22.5, 21.5); c.quadraticCurveTo(22, 24.5, 19, 24.5); c.quadraticCurveTo(14.5, 24.5, 14.5, 19.5); });
  rect(c, 16, 20.3, 4, 1, P.maskLt); rect(c, 27, 20.3, 4, 1, P.maskLt);
  // brow ridge over the shades
  stroke(c, P.skinDk, 1.3, (c) => { c.moveTo(16, 18.6); c.lineTo(22, 19); c.moveTo(32, 18.6); c.lineTo(26, 19); });
  // scowl / roar
  if (mood === 'roar') { ell(c, 24, 28.6, 2.4, 1.9, '#3A1414'); rect(c, 22.2, 27.4, 3.6, 0.9, '#F4EEE0'); }
  else stroke(c, P.line, 1.2, (c) => { c.moveTo(21.4, 28.8); c.quadraticCurveTo(24, 27.6, 26.8, 28.8); });
  c.restore();
}
function headBackBrute(c, P, o) {
  const { dx = 0, dy = 0 } = o;
  c.save(); c.translate(dx, dy);
  rect(c, 20, 27, 8, 8, P.skinSh);
  const head = (c) => { c.moveTo(14, 21); c.quadraticCurveTo(14, 9.5, 24, 9.5); c.quadraticCurveTo(34, 9.5, 34, 21); c.quadraticCurveTo(34.4, 30.5, 24, 32.5); c.quadraticCurveTo(13.6, 30.5, 14, 21); };
  path(c, P.skin, head);
  clipped(c, head, (c) => { rect(c, 29, 8, 6, 26, P.skinSh); ell(c, 21, 13, 4, 1.8, '#9B6846'); stroke(c, P.skinSh, 1, (c) => { c.moveTo(17, 28); c.quadraticCurveTo(24, 26, 31, 28); }); });
  ell(c, 13.6, 22, 1.5, 2.1, P.skinSh); ell(c, 34.4, 22, 1.5, 2.1, P.skinSh);
  // the shades' strap
  rect(c, 14.5, 19.5, 19, 2.2, P.mask);
  c.restore();
}
function headSideBrute(c, P, o) {
  const { dx = 0, dy = 0, mood } = o;
  c.save(); c.translate(dx, dy);
  const head = (c) => { c.moveTo(12.6, 21.5); c.quadraticCurveTo(13, 9.5, 24.5, 9.5); c.quadraticCurveTo(35.5, 9.5, 35.2, 21); c.quadraticCurveTo(35.5, 30, 27, 31.8); c.quadraticCurveTo(17, 32, 13.4, 27.5); c.quadraticCurveTo(11.8, 24.5, 12.6, 21.5); };
  path(c, P.skin, head);
  clipped(c, head, (c) => { rect(c, 27, 8, 10, 26, P.skinSh); ell(c, 21, 31, 9, 3, P.skinSh); ell(c, 19, 13, 3.6, 1.7, '#9B6846'); rect(c, 10, 25, 16, 7, 'rgba(20,10,10,0.18)'); });
  poly(c, [[13.2, 22.6], [11, 25], [13.2, 26.8]], P.skin);
  ell(c, 28.6, 23, 1.8, 2.4, P.skin);
  path(c, P.mask, (c) => { c.moveTo(12, 19.5); c.lineTo(28.5, 19.5); c.lineTo(28.5, 21.5); c.lineTo(21, 21.5); c.quadraticCurveTo(20.5, 24.5, 16.5, 24.5); c.quadraticCurveTo(12, 24.5, 12, 19.5); });
  rect(c, 13.5, 20.3, 4, 1, P.maskLt);
  if (mood === 'roar') ell(c, 14, 29, 1.6, 1.8, '#3A1414');
  else stroke(c, P.line, 1.1, (c) => { c.moveTo(12.6, 28.8); c.lineTo(16, 28.4); });
  c.restore();
}

// ---------------------------------------------------------------- bodies
function shoeFB(c, P, x, y) {
  rect(c, x, y, 7, 4, P.shoe);
  rect(c, x + 1, y, 5, 1.2, P.shoeSh);
  rect(c, x, y + 4, 7, 1, P.sole);
}
function legsFB(c, P, s, by, spread) {
  const leg = (x, lift, side) => {
    const top = 46 + by, footY = 58 - lift;
    rect(c, x, top, 6 + spread * 0.5, footY - top, P.pants);
    rect(c, x + (side > 0 ? 4.5 + spread * 0.5 : 0), top, 1.5, footY - top, P.pantsDk);
    if (side < 0) rect(c, x + 1.5, top, 0.8, footY - top, P.pantsLt);
    // a worn knee
    rect(c, x + 1.5, top + 5, 3, 1.2, P.pantsLt);
    shoeFB(c, P, x - 1 + spread * 0.25, footY);
  };
  leg(17 - spread, s < 0 ? 2 : 0, -1);
  leg(25 + spread * 0.5, s > 0 ? 2 : 0, 1);
}
function torsoFB(c, P, kind, back, bulk) {
  const bx = bulk * 1.6;
  const body = (c) => { c.moveTo(15.5 - bx, 35); c.quadraticCurveTo(15.5 - bx, 33, 17.5 - bx, 33); c.lineTo(30.5 + bx, 33); c.quadraticCurveTo(32.5 + bx, 33, 32.5 + bx, 35); c.lineTo(33.2 + bx, 48); c.lineTo(14.8 - bx, 48); };
  if (kind === 'thug') {
    path(c, P.top, body);
    clipped(c, body, (c) => {
      rect(c, 28.5, 33, 8, 16, P.topDk);
      rect(c, 14, 33, 2.6, 16, P.topLt);
      if (!back) {
        // kangaroo pocket and the zip
        rect(c, 18, 42, 12, 5.5, P.topDk); rect(c, 18, 42, 12, 1, P.topLt);
        stroke(c, P.topDk, 1, (c) => { c.moveTo(24, 33.5); c.lineTo(24, 42); });
      } else {
        stroke(c, P.topDk, 0.9, (c) => { c.moveTo(24, 33); c.lineTo(24, 48); });
      }
    });
    // ribbed hem
    poly(c, [[14.6, 47.5], [33.4, 47.5], [33.2, 50], [14.8, 50]], P.topDk);
    for (let x = 16; x < 33; x += 2.5) rect(c, x, 48.3, 0.8, 1.7, P.top);
    return;
  }
  // brute: bare shoulders, white tank top, gold chain
  path(c, P.skin, body);
  clipped(c, body, (c) => { rect(c, 28.5 + bx, 33, 8, 16, P.skinSh); rect(c, 14 - bx, 33, 2.4, 16, '#9B6846'); });
  const tank = (c) => { c.moveTo(18 - bx * 0.4, 33); c.lineTo(30 + bx * 0.4, 33); c.quadraticCurveTo(28 + bx * 0.4, 37, 31 + bx * 0.6, 40); c.lineTo(32 + bx, 48); c.lineTo(16 - bx, 48); c.lineTo(17 - bx * 0.6, 40); c.quadraticCurveTo(20 - bx * 0.4, 37, 18 - bx * 0.4, 33); };
  path(c, P.top, tank);
  clipped(c, tank, (c) => { rect(c, 27 + bx, 33, 8, 16, P.topDk); rect(c, 16 - bx, 33, 2, 16, P.topLt); if (!back) rect(c, 20, 44, 8, 0.9, P.topDk); });
  rect(c, 15 - bx, 47.2, 18 + bx * 2, 1.4, P.pantsDk); // belt
  rect(c, 22.5, 47.2, 3, 1.4, P.chain);
  if (!back) {
    stroke(c, P.chainDk, 1.6, (c) => { c.moveTo(19.5, 33); c.quadraticCurveTo(24, 40.5, 28.5, 33); });
    stroke(c, P.chain, 0.9, (c) => { c.moveTo(19.8, 33); c.quadraticCurveTo(24, 39.8, 28.2, 33); });
  }
}
function neckFB(c, P, bulk) { rect(c, 21 - bulk, 28, 6 + bulk * 2, 6, P.skinSh); rect(c, 21 - bulk, 28, 1.2, 6, P.skin); }

function hangingArm(side, sw) {
  const m = (x) => (side < 0 ? x : 48 - x);
  return { h: [m(12.8 + sw * 0.6), 46.8 - sw * 1.5] };
}

function shoeSide(c, P, x, y, lifted) {
  const t = lifted ? 1 : 0;
  const shape = (c) => { c.moveTo(x + 3, y); c.lineTo(x + 3, y + 4); c.lineTo(x - 5, y + 4 + t); c.quadraticCurveTo(x - 6.8, y + 3.6 + t, x - 5.6, y + 1.6 + t); c.quadraticCurveTo(x - 4, y + t * 0.6, x - 2.4, y + t * 0.5); };
  path(c, P.shoe, shape);
  clipped(c, shape, (c) => { rect(c, x - 1.6, y, 2.6, 1.4, P.shoeSh); });
  poly(c, [[x - 5.8, y + 4 + t], [x + 3, y + 4], [x + 3, y + 5], [x - 5.8, y + 5 + t]], P.sole);
}
function legsSide(c, P, s, by, bulk) {
  const leg = (x, lift, near) => {
    const top = 46 + by, footY = 58 - lift;
    const col = near ? P.pants : P.pantsDk;
    const knee = lift ? [x + 2.5, top + 6] : null;
    stroke(c, col, 5.6 + bulk, (c) => { c.moveTo(24 + (near ? -0.5 : 0.5), top + 1.5); if (knee) c.quadraticCurveTo(knee[0], knee[1], x, footY - 1); else c.lineTo(x, footY - 1); });
    if (near) stroke(c, P.pantsDk, 1.1, (c) => { c.moveTo(25.5, top + 2); if (knee) c.quadraticCurveTo(knee[0] + 2, knee[1], x + 2.2, footY - 1); else c.lineTo(x + 2.2, footY - 1); });
    shoeSide(c, P, x, footY, lift > 0);
  };
  leg(24 + 3.5 * s, s > 0 ? 2 : 0, false);
  leg(22 - 3.5 * s, s < 0 ? 2 : 0, true);
}
function torsoSide(c, P, kind, bulk) {
  const bx = bulk * 1.4;
  const body = (c) => { c.moveTo(18 - bx, 33); c.lineTo(30 + bx, 33); c.quadraticCurveTo(31.8 + bx, 33, 31.8 + bx, 35); c.lineTo(32.2 + bx, 48); c.lineTo(16.4 - bx, 48); c.lineTo(16.8 - bx, 35); c.quadraticCurveTo(16.8 - bx, 33, 18 - bx, 33); };
  if (kind === 'thug') {
    path(c, P.top, body);
    clipped(c, body, (c) => { rect(c, 27, 33, 7, 16, P.topDk); rect(c, 16, 33, 2.4, 16, P.topLt); rect(c, 17, 42, 6, 5.5, P.topDk); });
    poly(c, [[16.2, 47.5], [32.4, 47.5], [32.2, 50], [16.4, 50]], P.topDk);
    for (let x = 17.5; x < 32; x += 2.5) rect(c, x, 48.3, 0.8, 1.7, P.top);
    // hood bunched behind the neck
    const hood = (c) => c.ellipse(30.5, 31.5, 7, 5.2, -0.25, 0, TAU);
    path(c, P.top, hood);
    clipped(c, hood, (c) => { rect(c, 22, 32.5, 18, 6, P.topDk); ell(c, 29, 28.5, 3.4, 1.3, P.topLt); });
    return;
  }
  path(c, P.skin, body);
  clipped(c, body, (c) => { rect(c, 27 + bx, 33, 8, 16, P.skinSh); });
  const tank = (c) => { c.moveTo(19 - bx, 33); c.lineTo(27 + bx, 33); c.quadraticCurveTo(27 + bx, 38, 30 + bx, 40); c.lineTo(31.5 + bx, 48); c.lineTo(16.8 - bx, 48); c.lineTo(17.5 - bx, 40); c.quadraticCurveTo(20 - bx, 38, 19 - bx, 33); };
  path(c, P.top, tank);
  clipped(c, tank, (c) => { rect(c, 26 + bx, 33, 8, 16, P.topDk); rect(c, 17 - bx, 33, 2, 16, P.topLt); });
  rect(c, 16.5 - bx, 47.2, 16 + bx * 2, 1.4, P.pantsDk);
  stroke(c, P.chain, 1, (c) => { c.moveTo(19, 33); c.quadraticCurveTo(21, 38, 26, 34); });
  rect(c, 21, 29, 6 + bulk, 5, P.skinSh); // neck
}

// ---------------------------------------------------------------- frames
function make(kind) {
  const P = kind === 'thug' ? THUG : BRUTE;
  const bulk = kind === 'thug' ? 0 : 1;
  const wpn = kind === 'thug' ? 'bat' : 'pipe';
  const heads = kind === 'thug' ? [headFrontThug, headBackThug, headSideThug] : [headFrontBrute, headBackBrute, headSideBrute];
  const [headFront, headBack, headSide] = heads;

  const drawDown = (c, p, f) => {
    const { s, by } = p;
    legsFB(c, P, s, by, p.spread);
    c.save(); c.translate(0, by);
    neckFB(c, P, bulk);
    torsoFB(c, P, kind, false, bulk);
    const L = p.L ?? hangingArm(-1, -s);
    // in the idle/walk the weapon hangs from the viewer-right hand, pointing out and down
    const R = p.R ?? { ...hangingArm(1, s), weapon: [43 + s * 0.5, 55 - s] };
    const hL = arm(c, P, kind, [15.4 - bulk, 36], L, bulk);
    if (R.swing) swingArc(c, R.swing);
    const hR = arm(c, P, kind, [32.6 + bulk, 36], R, bulk);
    if (L.weapon) weapon(c, P, wpn, hL, L.weapon);
    if (R.weapon) weapon(c, P, wpn, hR, R.weapon);
    headFront(c, P, { dx: p.headDx, mood: p.mood });
    if (R.spark) impact(c, P, R.spark[0], R.spark[1], f.rand);
    c.restore();
  };
  const drawUp = (c, p, f) => {
    const { s, by } = p;
    legsFB(c, P, -s, by, p.spread);
    c.save(); c.translate(0, by);
    neckFB(c, P, bulk);
    torsoFB(c, P, kind, true, bulk);
    const L = p.L ?? { ...hangingArm(-1, s), weapon: [5 - s * 0.5, 55 + s] };
    const R = p.R ?? hangingArm(1, -s);
    if (L.swing) swingArc(c, L.swing);
    const hL = arm(c, P, kind, [15.4 - bulk, 36], L, bulk);
    const hR = arm(c, P, kind, [32.6 + bulk, 36], R, bulk);
    if (L.weapon) weapon(c, P, wpn, hL, L.weapon);
    if (R.weapon) weapon(c, P, wpn, hR, R.weapon);
    headBack(c, P, { dx: p.headDx });
    if (L.spark) impact(c, P, L.spark[0], L.spark[1], f.rand);
    c.restore();
  };
  const drawSide = (c, p, f) => {
    const { s, by } = p;
    const lean = p.lean || 0;
    c.save(); c.translate(lean, by);
    const far = p.far ?? { h: [28.4 - 2.4 * s, 46.6 + (s > 0 ? -0.5 : 0)], far: true };
    arm(c, P, kind, [26.5 + bulk, 36], { ...far, far: true, w: 4.6 }, bulk);
    c.restore();
    legsSide(c, P, s, by, bulk);
    c.save(); c.translate(lean, by);
    torsoSide(c, P, kind, bulk);
    // the weapon rests on the shoulder while walking
    const near = p.near ?? { h: [21.6 + 2.6 * s, 46.8 - (s > 0 ? 1.4 : 0)], weapon: [12 + 2.6 * s, 56] };
    if (near.swing) swingArc(c, near.swing);
    const hN = arm(c, P, kind, [23.5 - bulk * 0.5, 36.5], near, bulk);
    if (near.weapon) weapon(c, P, wpn, hN, near.weapon);
    headSide(c, P, { dx: p.headDx, mood: p.mood });
    if (near.spark) impact(c, P, near.spark[0], near.spark[1], f.rand);
    c.restore();
  };

  const portrait = (ctx, size) => {
    const k = size / 256;
    ctx.save(); ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const O = (fill, fn, lw = 3, col = P.line) => { ctx.beginPath(); fn(ctx); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (lw > 0) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); } };
    const S = (color, w, fn) => { ctx.beginPath(); fn(ctx); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); };
    if (kind === 'thug') {
      // hoodie with the hood up, framing a shadowed face and the bandana
      O(P.top, (c) => { c.moveTo(4, 262); c.quadraticCurveTo(10, 200, 60, 190); c.quadraticCurveTo(40, 130, 60, 70); c.quadraticCurveTo(90, 18, 128, 18); c.quadraticCurveTo(166, 18, 196, 70); c.quadraticCurveTo(216, 130, 196, 190); c.quadraticCurveTo(246, 200, 252, 262); }, 3);
      clipped(ctx, (c) => { c.moveTo(4, 262); c.quadraticCurveTo(10, 200, 60, 190); c.quadraticCurveTo(40, 130, 60, 70); c.quadraticCurveTo(90, 18, 128, 18); c.quadraticCurveTo(166, 18, 196, 70); c.quadraticCurveTo(216, 130, 196, 190); c.quadraticCurveTo(246, 200, 252, 262); }, (c) => { rect(c, 160, 0, 100, 270, 'rgba(0,0,0,0.2)'); ell(c, 96, 60, 30, 10, P.topLt); });
      const face = (c) => { c.moveTo(76, 120); c.quadraticCurveTo(76, 60, 128, 58); c.quadraticCurveTo(180, 60, 180, 120); c.quadraticCurveTo(180, 176, 128, 192); c.quadraticCurveTo(76, 176, 76, 120); };
      O(P.skin, face, 3);
      clipped(ctx, face, (c) => { rect(c, 60, 40, 140, 60, P.skinDk); rect(c, 60, 98, 140, 12, P.skinSh); rect(c, 160, 40, 30, 160, P.skinSh); });
      for (const [ex, side] of [[104, -1], [152, 1]]) {
        ell(ctx, ex, 118, 14, 8, P.eyeW); ell(ctx, ex + 2, 119, 6, 6, P.pupil); ell(ctx, ex + 1, 117, 2, 2, '#FFFFFF');
        S(P.line, 6, (c) => { c.moveTo(ex - side * 20, 100); c.lineTo(ex + side * 14, 108); });
      }
      O(P.mask, (c) => { c.moveTo(70, 134); c.lineTo(186, 134); c.quadraticCurveTo(188, 176, 128, 198); c.quadraticCurveTo(68, 176, 70, 134); }, 3);
      S(P.maskLt, 3, (c) => { c.moveTo(84, 150); c.quadraticCurveTo(128, 166, 172, 150); });
      S(P.topLt, 4, (c) => { c.moveTo(100, 196); c.lineTo(92, 240); c.moveTo(156, 196); c.lineTo(164, 240); });
    } else {
      O(P.skin, (c) => { c.moveTo(0, 262); c.quadraticCurveTo(10, 208, 70, 200); c.lineTo(186, 200); c.quadraticCurveTo(246, 208, 256, 262); }, 3);
      O(P.top, (c) => { c.moveTo(60, 262); c.quadraticCurveTo(70, 220, 96, 208); c.lineTo(160, 208); c.quadraticCurveTo(186, 220, 196, 262); }, 3);
      S(P.chainDk, 8, (c) => { c.moveTo(96, 206); c.quadraticCurveTo(128, 250, 160, 206); });
      S(P.chain, 4, (c) => { c.moveTo(96, 206); c.quadraticCurveTo(128, 246, 160, 206); });
      O(P.skinSh, (c) => { c.moveTo(102, 170); c.lineTo(154, 170); c.lineTo(160, 212); c.lineTo(96, 212); }, 3);
      const head = (c) => { c.moveTo(66, 112); c.quadraticCurveTo(66, 36, 128, 34); c.quadraticCurveTo(190, 36, 190, 112); c.quadraticCurveTo(192, 168, 128, 186); c.quadraticCurveTo(64, 168, 66, 112); };
      O(P.skin, head, 3);
      clipped(ctx, head, (c) => { rect(c, 160, 20, 40, 180, P.skinSh); ell(c, 104, 60, 28, 10, '#9B6846'); rect(c, 60, 140, 140, 50, 'rgba(20,10,10,0.18)'); });
      O(P.skin, (c) => c.ellipse(64, 118, 12, 16, 0, 0, TAU), 3); O(P.skin, (c) => c.ellipse(192, 118, 12, 16, 0, 0, TAU), 3);
      O(P.mask, (c) => { c.moveTo(70, 100); c.lineTo(186, 100); c.quadraticCurveTo(186, 134, 154, 134); c.quadraticCurveTo(134, 134, 130, 112); c.lineTo(126, 112); c.quadraticCurveTo(122, 134, 102, 134); c.quadraticCurveTo(70, 134, 70, 100); }, 3);
      rect(ctx, 80, 106, 30, 5, P.maskLt); rect(ctx, 146, 106, 30, 5, P.maskLt);
      S(P.skinDk, 6, (c) => { c.moveTo(78, 94); c.lineTo(118, 98); c.moveTo(178, 94); c.lineTo(138, 98); });
      S(P.line, 5, (c) => { c.moveTo(108, 164); c.quadraticCurveTo(128, 154, 148, 164); });
    }
    ctx.restore();
  };

  const isThug = kind === 'thug';
  return {
    id: isThug ? 'chr_thug' : 'chr_enforcer',
    name: isThug ? 'Thug' : 'Enforcer',
    role: 'enemy',
    assetId: isThug ? 'ast_web_thug' : 'ast_web_enforcer',
    file: isThug ? 'thug.png' : 'enforcer.png',
    frameWidth: W,
    frameHeight: H,
    collider: isThug ? { width: 24, height: 16, offsetX: 12, offsetY: 48 } : { width: 28, height: 16, offsetX: 10, offsetY: 48 },
    walkFrameRate: isThug ? 8 : 7,
    attackFrameRate: isThug ? 12 : 10,
    portrait: { assetId: isThug ? 'ast_web_thug_portrait' : 'ast_web_enforcer_portrait', file: isThug ? 'thug_portrait.png' : 'enforcer_portrait.png', size: 256 },
    draw(ctx, f) {
      const p = pose(f, bulk);
      ell(ctx, 24 + (p.lean || 0) * 0.5, 61.6, 10.5 + bulk * 1.5 + (p.by < 0 ? 0.5 : 0), 2.6, P.shadow);
      const A = document.createElement('canvas'); A.width = W; A.height = H;
      const c = A.getContext('2d');
      if (f.dir === 'down') drawDown(c, p, f);
      else if (f.dir === 'up') drawUp(c, p, f);
      else if (f.dir === 'left') drawSide(c, p, f);
      else { c.save(); c.translate(W, 0); c.scale(-1, 1); drawSide(c, p, f); c.restore(); }
      crisp(A);
      ctx.drawImage(outlined(A, P.line), 0, 0);
    },
    drawPortrait: portrait,
  };
}

export default [make('thug'), make('brute')];
