/**
 * Spidey — the player of the "Webslinger" template: a wall-crawling, web-slinging city hero.
 *
 * A lean acrobat in a full-body suit: red mask with big white teardrop lenses (black-rimmed), red torso and
 * gloves, blue upper arms, blue tights, red boots, a dark web pattern over the red and a small black spider on
 * the chest (a bigger one on the back). Nothing of the person shows; the lenses do all the acting (they narrow
 * to focus, widen in surprise, curve up when he celebrates).
 *
 * Rows: walk (a springy stride: bounce, arm counter-swing, lenses steady), attack = a quick punch (wind-up,
 * strike with impact spark, recovery), then the "web" directional set (arm out, two fingers down, a burst of
 * silk leaving the wrist), then the emotes celebrate / point / crouch (drawn facing down).
 *
 * Drawing approach (same as the starter characters): paths into an offscreen canvas, alpha thresholded to whole
 * pixels, a 1 px dark outline grown around the silhouette. Deterministic (f.rand only).
 */

const W = 48;
const H = 64;
const TAU = Math.PI * 2;

const P = {
  line: '#160B10',
  red: '#C8202E', redDk: '#8E1420', redLt: '#E4434D', redWeb: 'rgba(60,0,12,0.62)',
  blue: '#1F3F8F', blueDk: '#14295F', blueLt: '#3560BF',
  lens: '#FFFFFF', lensSh: '#DCE6F2', lensRim: '#0E0C12',
  spider: '#101015',
  silk: '#FFFFFF', silkSh: '#CFE6FF',
  spark: '#FFE86A', sparkHi: '#FFFFFF',
  shadow: 'rgba(20,10,20,0.28)',
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

// ------------------------------------------------------------ post-process
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

// ------------------------------------------------------------------- pose
/**
 * Arm descriptors in viewer coordinates: { h: hand, via: elbow, fist, thwip, open, point, big, small, spark, silk }.
 * L = viewer-left arm, R = viewer-right arm; for side views `near` / `far`. `s` is the stride (-1..1), `by` the
 * body bob (negative = up), `mood` drives the lenses: 'calm' | 'focus' | 'wide' | 'joy'.
 */
function pose(f) {
  const base = { s: 0, by: 0, mood: 'calm', headDx: 0, headDy: 0, spread: 0, lean: 0 };
  if (f.anim === 'walk') {
    const s = [0, 1, 0, -1][f.index];
    return { ...base, s, by: f.index % 2 ? -1 : 0 };
  }
  const k = f.index;
  const side = f.dir === 'left' || f.dir === 'right';
  if (f.anim === 'attack') {
    const p = { ...base, mood: ['focus', 'wide', 'calm'][k], by: [0, 1, 0][k], spread: [1, 2, 1][k] };
    if (f.dir === 'down') {
      p.L = [
        { via: [12, 42.5], h: [13.5, 37.5], fist: true },
        { via: [14, 42], h: [19.5, 45.5], fist: true, big: true, spark: [16, 51] },
        { via: [12.5, 41], h: [14, 45], fist: true },
      ][k];
      p.R = [
        { via: [35, 42.5], h: [30.5, 40], fist: true },
        { via: [35, 41], h: [31.5, 43], fist: true },
        { h: [33.5, 46.5], fist: true },
      ][k];
      p.headDx = [-0.5, 0.5, 0][k];
    } else if (f.dir === 'up') {
      p.R = [
        { via: [36.5, 42], h: [34.5, 38.5], fist: true, big: true },
        { via: [34.5, 31], h: [31.5, 25.5], fist: true, small: true, spark: [31.5, 19.5] },
        { via: [36, 41], h: [34, 45], fist: true },
      ][k];
      p.L = [
        { via: [12.5, 42], h: [16.5, 40], fist: true },
        { via: [12.5, 42], h: [15.5, 41], fist: true },
        { h: [14, 46.5], fist: true },
      ][k];
      p.by = [0, -1, 0][k];
    } else {
      p.near = [
        { via: [30, 41], h: [29.5, 37.5], fist: true },
        { via: [16.5, 37.5], h: [11.5, 37.5], fist: true, spark: [9.5, 37.5] },
        { via: [18.5, 41], h: [14.5, 41.5], fist: true },
      ][k];
      p.far = [
        { via: [21, 41], h: [17, 39.5], fist: true },
        { via: [30, 41], h: [30, 44], fist: true },
        { h: [27, 46], fist: true },
      ][k];
      p.lean = [1, -2, 0][k];
      p.headDx = [0.5, -1, 0][k];
    }
    return p;
  }
  if (f.anim === 'web') {
    // Two fingers down, palm out, the line leaves the wrist on the middle frame.
    const p = { ...base, mood: ['focus', 'focus', 'calm'][k], by: [0, 1, 0][k], spread: [1, 2, 1][k] };
    if (f.dir === 'down') {
      p.R = [
        { via: [36, 40], h: [33, 35], fist: true },
        { via: [36.5, 42], h: [27.5, 50.5], thwip: true, big: true, silk: [27.5, 56] },
        { via: [36, 41], h: [29, 47.5], thwip: true },
      ][k];
      p.L = [{ via: [12.5, 42], h: [15, 44], fist: true }, { via: [12, 41], h: [13.5, 40], fist: true }, { h: [14, 46.5], fist: true }][k];
      p.headDx = [0.5, 0, 0][k];
    } else if (f.dir === 'up') {
      p.R = [
        { via: [36.5, 42], h: [35, 38.5], fist: true },
        { via: [36.5, 32], h: [33.5, 21.5], thwip: true, small: true, silk: [33.5, 15.5] },
        { via: [36, 34], h: [34, 26], thwip: true, small: true },
      ][k];
      p.L = [{ h: [14, 46.5], fist: true }, { via: [12.5, 42], h: [15.5, 41], fist: true }, { h: [14, 46.5], fist: true }][k];
      p.by = [0, -1, 0][k];
    } else {
      p.near = [
        { via: [29, 40], h: [27, 35.5], fist: true },
        { via: [16, 38], h: [6.5, 37], thwip: true, silk: [3, 37] },
        { via: [17, 39], h: [9, 38], thwip: true },
      ][k];
      p.far = [{ via: [21, 41], h: [18, 40], fist: true }, { via: [30, 41], h: [30.5, 44.5], fist: true }, { h: [27, 46], fist: true }][k];
      p.lean = [1, -1, 0][k];
      p.headDx = [0.5, -0.5, 0][k];
    }
    return p;
  }
  // emotes (facing down)
  const p = { ...base, emote: f.anim, k };
  if (f.anim === 'celebrate') {
    p.mood = ['calm', 'joy', 'joy'][k];
    p.by = [0, -3, 0][k];
    p.spread = [1, 0, 2][k];
    p.L = [
      { via: [11.5, 40.5], h: [12.5, 31], fist: true },
      { via: [11, 28], h: [10.5, 15.5], thwip: true },
      { via: [11.5, 33.5], h: [7.5, 34.5], open: true },
    ][k];
    p.R = [
      { via: [36.5, 40.5], h: [35.5, 31], fist: true },
      { via: [37, 28], h: [37.5, 15.5], thwip: true },
      { via: [36.5, 33.5], h: [40.5, 34.5], open: true },
    ][k];
    p.sparkles = k === 1;
  } else if (f.anim === 'point') {
    p.mood = 'calm'; p.headDx = 1;
    p.L = { via: [12, 42], h: [16, 44.5], fist: true };
    p.R = { h: [39, 36.5], point: true };
  } else if (f.anim === 'crouch') {
    // Landing pose: knees bent, one hand on the ground, the other arm out for balance.
    p.mood = 'focus'; p.by = 5; p.crouch = true; p.spread = 3;
    p.L = { via: [10, 48], h: [9, 57], open: true, big: true };
    p.R = { via: [38, 42], h: [42, 37.5], open: true };
  }
  return p;
}

// ------------------------------------------------------------- shared bits
function sparkStar(c, x, y, r, fill) {
  poly(c, [[x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28], [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]], fill);
}
/** Punch impact: yellow burst with a white core. */
function impact(c, x, y, rand) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3, l = i % 2 ? 4.5 : 3;
    stroke(c, P.spark, 1.2, (c) => { c.moveTo(x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); });
  }
  sparkStar(c, x, y, 2.6, P.spark);
  sparkStar(c, x, y, 1.3, P.sparkHi);
  for (let i = 0; i < 3; i++) {
    const a = rand() * TAU, d = 5 + rand() * 2.5;
    const px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d);
    if (px >= 4 && px <= W - 5 && py >= 3 && py <= H - 4) rect(c, px, py, 1, 1, P.sparkHi);
  }
}
/** The first puff of silk leaving the wrist: a small white star of strands with a few drifting dots. */
function thwip(c, x, y, rand) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2, l = i % 2 ? 3.6 : 2.4;
    stroke(c, i % 2 ? P.silkSh : P.silk, 1, (c) => { c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); });
  }
  ell(c, x, y, 1.2, 1.2, P.silk);
  for (let i = 0; i < 3; i++) {
    const a = rand() * TAU, d = 4.5 + rand() * 2;
    const px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d);
    if (px >= 2 && px <= W - 3 && py >= 2 && py <= H - 3) rect(c, px, py, 1, 1, P.silk);
  }
}

/** Gloved hand at (x,y). kind: 'fist' | 'thwip' | 'open' | 'point'. dir = unit vector of the forearm. */
function hand(c, x, y, kind, dir, r = 2.1) {
  const [ux, uy] = dir;
  ell(c, x, y, r * 1.05, r, P.red);
  ell(c, x + 0.4, y + r * 0.45, r * 0.75, r * 0.45, P.redDk);
  if (kind === 'fist') {
    for (const o of [-0.9, 0, 0.9]) rect(c, x + o * r * 0.7 - 0.4, y - r * 0.55, 0.8, 0.8, P.redDk);
    return;
  }
  if (kind === 'point') {
    stroke(c, P.red, 1.7, (c) => { c.moveTo(x, y - 0.3); c.lineTo(x + ux * (r + 2.2), y - 0.3 + uy * (r + 2.2)); });
    return;
  }
  // open palm: fingers fan out ahead of the wrist; thwip folds the two middle ones back
  const nx = -uy, ny = ux;
  const fingers = kind === 'thwip' ? [-1.4, 1.4] : [-1.4, -0.5, 0.5, 1.4];
  for (const o of fingers) {
    const len = r + (kind === 'thwip' ? 2 : 1.6);
    stroke(c, P.red, 1.3, (c) => { c.moveTo(x + nx * o * 0.9, y + ny * o * 0.9); c.lineTo(x + nx * o * 1.3 + ux * len, y + ny * o * 1.3 + uy * len); });
  }
  if (kind === 'thwip') {
    // the folded middle fingers read as a small dark notch in the palm
    rect(c, x + ux * 0.6 - 0.8, y + uy * 0.6 - 0.8, 1.6, 1.6, P.redDk);
  }
}

/** Arm from shoulder `s` to hand: blue upper arm to the elbow, red glove from the elbow to the hand. */
function arm(c, s, a) {
  const h = a.h;
  const via = a.via ?? [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2];
  const w = a.w ?? 4.4;
  const dim = a.far;
  const blue = dim ? P.blueDk : P.blue, red = dim ? P.redDk : P.red;
  if (!dim) {
    stroke(c, P.blueDk, w, (c) => { c.moveTo(s[0] + 0.9, s[1] + 0.9); c.lineTo(via[0] + 0.9, via[1] + 0.9); });
    stroke(c, P.redDk, w, (c) => { c.moveTo(via[0] + 0.9, via[1] + 0.9); c.lineTo(h[0] + 0.9, h[1] + 0.9); });
  }
  stroke(c, blue, w, (c) => { c.moveTo(s[0], s[1]); c.lineTo(via[0], via[1]); });
  stroke(c, red, w, (c) => { c.moveTo(via[0], via[1]); c.lineTo(h[0], h[1]); });
  let ux = h[0] - via[0], uy = h[1] - via[1]; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
  // glove cuff: a dark band at the elbow end and a light fold along the upper arm
  stroke(c, P.redDk, w + 0.4, (c) => { c.moveTo(via[0] - uy * 0.5, via[1] + ux * 0.5); c.lineTo(via[0] + uy * 0.5, via[1] - ux * 0.5); });
  if (!dim) stroke(c, P.blueLt, 0.8, (c) => { c.moveTo(s[0] - uy * 1.1, s[1] + ux * 1.1); c.lineTo(via[0] * 0.6 + s[0] * 0.4 - uy * 1.1, via[1] * 0.6 + s[1] * 0.4 + ux * 1.1); });
  // web lines on the glove
  stroke(c, P.redWeb, 0.8, (c) => { c.moveTo(via[0] + ux * 1.5 - uy * 1.6, via[1] + uy * 1.5 + ux * 1.6); c.lineTo(via[0] + ux * 1.5 + uy * 1.6, via[1] + uy * 1.5 - ux * 1.6); });
  stroke(c, P.redWeb, 0.8, (c) => { c.moveTo(via[0] + ux * 3.5 - uy * 1.6, via[1] + uy * 3.5 + ux * 1.6); c.lineTo(via[0] + ux * 3.5 + uy * 1.6, via[1] + uy * 3.5 - ux * 1.6); });
  const r = a.big ? 3.2 : a.small ? 1.7 : 2.1;
  const kind = a.fist ? 'fist' : a.thwip ? 'thwip' : a.point ? 'point' : 'open';
  const hx = h[0] + ux * (r * 0.6), hy = h[1] + uy * (r * 0.6);
  hand(c, hx, hy, kind, [ux, uy], r);
  return [hx, hy];
}

// ------------------------------------------------------------------ heads
/** Web pattern over a mask: radial lines from the focus point plus concentric arcs, clipped by `shape`. */
function webbing(c, shape, fx, fy, radius, angles) {
  clipped(c, shape, (c) => {
    for (const a of angles) stroke(c, P.redWeb, 1, (c) => { c.moveTo(fx, fy); c.lineTo(fx + Math.cos(a) * radius, fy + Math.sin(a) * radius); });
    for (const r of [3.5, 7, 10.5, 14]) {
      stroke(c, P.redWeb, 1, (c) => {
        // arcs sag between the radial lines: a polyline of short chords
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const a = -Math.PI + (i / n) * TAU;
          const rr = r - (i % 2 ? 0.6 : 0);
          const x = fx + Math.cos(a) * rr, y = fy + Math.sin(a) * rr;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
      });
    }
  });
}

/** One lens: a white teardrop leaning outward, black rim. `k` is the outward direction (-1 left, 1 right). */
function lens(c, x, y, k, mood, scale = 1) {
  const ry = (mood === 'focus' ? 2.6 : mood === 'wide' ? 4.8 : 4.1) * scale;
  const rx = 3.4 * scale;
  const rot = k * 0.45;
  const shape = (c) => {
    // a pointed inner corner, round outer end
    c.moveTo(x - k * rx * 1.05, y + ry * 0.35);
    c.quadraticCurveTo(x - k * rx * 0.2, y - ry * 1.35, x + k * rx * 0.8, y - ry * 0.7);
    c.quadraticCurveTo(x + k * rx * 1.25, y + ry * 0.2, x + k * rx * 0.5, y + ry);
    c.quadraticCurveTo(x - k * rx * 0.3, y + ry * 1.1, x - k * rx * 1.05, y + ry * 0.35);
  };
  if (mood === 'joy') {
    // happy: the lens curves up into a crescent
    stroke(c, P.lensRim, 2.6, (c) => c.arc(x, y + 0.8, rx * 0.95, Math.PI * 1.1 + rot * 0.2, Math.PI * 1.9 + rot * 0.2));
    stroke(c, P.lens, 1.4, (c) => c.arc(x, y + 0.8, rx * 0.95, Math.PI * 1.1 + rot * 0.2, Math.PI * 1.9 + rot * 0.2));
    return;
  }
  c.save();
  stroke(c, P.lensRim, 2.2, (c) => { shape(c); c.closePath(); });
  path(c, P.lens, shape);
  clipped(c, shape, (c) => {
    ell(c, x + k * 0.8, y + ry * 0.55, rx * 0.9, ry * 0.5, P.lensSh);
  });
  c.restore();
}

function headFront(c, o) {
  const { dx = 0, dy = 0, mood = 'calm' } = o;
  c.save(); c.translate(dx, dy);
  const mask = (c) => { c.moveTo(13.6, 21); c.quadraticCurveTo(13.4, 10.2, 24, 10); c.quadraticCurveTo(34.6, 10.2, 34.4, 21); c.quadraticCurveTo(34.4, 30.2, 24, 32.2); c.quadraticCurveTo(13.6, 30.2, 13.6, 21); };
  path(c, P.red, mask);
  clipped(c, mask, (c) => {
    rect(c, 29.5, 8, 6, 26, P.redDk);       // shaded right side
    ell(c, 24, 31, 8, 2.6, P.redDk);         // jaw
    ell(c, 20, 14.5, 3.6, 1.6, P.redLt);     // sheen on the forehead
  });
  const angles = [];
  for (let i = 0; i < 12; i++) angles.push((i / 12) * TAU + 0.26);
  webbing(c, mask, 24, 19, 16, angles);
  lens(c, 19.4, 22.2, -1, mood);
  lens(c, 28.6, 22.2, 1, mood);
  c.restore();
}

function headBack(c, o) {
  const { dx = 0, dy = 0 } = o;
  c.save(); c.translate(dx, dy);
  rect(c, 21, 27, 6, 7, P.redDk); // neck
  const mask = (c) => { c.moveTo(13.6, 21); c.quadraticCurveTo(13.4, 10.2, 24, 10); c.quadraticCurveTo(34.6, 10.2, 34.4, 21); c.quadraticCurveTo(34.4, 30.8, 24, 32.6); c.quadraticCurveTo(13.6, 30.8, 13.6, 21); };
  path(c, P.red, mask);
  clipped(c, mask, (c) => {
    rect(c, 29.5, 8, 6, 26, P.redDk);
    rect(c, 13, 26, 24, 8, 'rgba(0,0,0,0.16)');
    ell(c, 20, 14.5, 3.6, 1.6, P.redLt);
  });
  const angles = [];
  for (let i = 0; i < 12; i++) angles.push((i / 12) * TAU + 0.26);
  webbing(c, mask, 24, 18, 16, angles);
  c.restore();
}

/** Facing left; the caller mirrors it for right. */
function headSide(c, o) {
  const { dx = 0, dy = 0, mood = 'calm' } = o;
  c.save(); c.translate(dx, dy);
  const mask = (c) => { c.moveTo(12.4, 22); c.quadraticCurveTo(12.6, 10.4, 24, 10); c.quadraticCurveTo(35.4, 10.2, 35.2, 21); c.quadraticCurveTo(35.4, 30.6, 26, 32.4); c.quadraticCurveTo(16.4, 32.4, 13.2, 27.6); c.quadraticCurveTo(11.6, 25.2, 12.4, 22); };
  path(c, P.red, mask);
  clipped(c, mask, (c) => {
    rect(c, 28, 8, 9, 28, P.redDk);
    ell(c, 22, 31, 8, 2.4, P.redDk);
    ell(c, 18, 14.5, 3.2, 1.5, P.redLt);
  });
  const angles = [];
  for (let i = 0; i < 12; i++) angles.push((i / 12) * TAU + 0.26);
  webbing(c, mask, 19, 19, 18, angles);
  // one lens, seen in three-quarter: narrower, leaning forward
  const ry = (mood === 'focus' ? 2.4 : mood === 'wide' ? 4.6 : 3.9);
  const shape = (c) => { c.moveTo(13.6, 23.2); c.quadraticCurveTo(15, 23.2 - ry * 1.3, 19.6, 23.2 - ry * 0.75); c.quadraticCurveTo(21.6, 23.2, 19.4, 23.2 + ry * 0.9); c.quadraticCurveTo(16, 23.2 + ry * 1.1, 13.6, 23.2); };
  if (mood === 'joy') {
    stroke(c, P.lensRim, 2.4, (c) => c.arc(17, 24, 3, Math.PI * 1.05, Math.PI * 1.95));
    stroke(c, P.lens, 1.3, (c) => c.arc(17, 24, 3, Math.PI * 1.05, Math.PI * 1.95));
  } else {
    stroke(c, P.lensRim, 2.2, (c) => { shape(c); c.closePath(); });
    path(c, P.lens, shape);
    clipped(c, shape, (c) => ell(c, 17.5, 23.2 + ry * 0.5, 3, ry * 0.5, P.lensSh));
  }
  c.restore();
}

// -------------------------------------------------------- bodies (front/back)
function bootFB(c, x, y) {
  // boot top at y-6 (red over the blue tights), foot at y..y+4
  rect(c, x - 0.5, y - 6, 7, 6, P.red);
  rect(c, x + 5, y - 6, 1.5, 6, P.redDk);
  poly(c, [[x - 0.5, y - 6], [x + 6.5, y - 6], [x + 6.5, y - 4.6], [x + 3, y - 3.4], [x - 0.5, y - 4.6]], P.redDk);
  rect(c, x - 1, y, 8, 4, P.red);
  rect(c, x + 6, y, 1, 4, P.redDk);
  rect(c, x - 1, y + 3.2, 8, 0.8, P.redDk);
  rect(c, x - 1, y + 4, 8, 1, P.line);
}
function legsFB(c, s, by, o = {}) {
  const sp = o.spread || 0;
  const leg = (x, lift, side) => {
    const top = 46 + by, footY = 58 - lift;
    rect(c, x, top, 6, footY - top, P.blue);
    rect(c, x + (side > 0 ? 4.5 : 0), top, 1.5, footY - top, P.blueDk);
    if (side < 0) rect(c, x + 1.5, top, 0.8, footY - top, P.blueLt);
    bootFB(c, x, footY);
  };
  leg(17 - sp, s < 0 ? 2 : 0, -1);
  leg(25 + sp, s > 0 ? 2 : 0, 1);
}
function crouchLegsFB(c) {
  // knees out wide, thighs nearly horizontal, boots planted
  for (const k of [-1, 1]) {
    const cx = 24 + k * 9;
    stroke(c, P.blue, 6, (c) => { c.moveTo(24 + k * 3, 50); c.lineTo(cx, 53.5); });
    stroke(c, P.blueDk, 1.2, (c) => { c.moveTo(24 + k * 3, 52.6); c.lineTo(cx, 56); });
    bootFB(c, cx - 3, 58);
  }
}

/** Black spider emblem centred at (x,y); `r` scales it. */
function spider(c, x, y, r, fill = P.spider) {
  ell(c, x, y + r * 0.4, r * 0.55, r * 1.05, fill);
  ell(c, x, y - r * 0.7, r * 0.42, r * 0.42, fill);
  for (const k of [-1, 1]) {
    stroke(c, fill, Math.max(0.8, r * 0.28), (c) => { c.moveTo(x, y - r * 0.4); c.lineTo(x + k * r * 1.4, y - r * 1.5); });
    stroke(c, fill, Math.max(0.8, r * 0.28), (c) => { c.moveTo(x, y - r * 0.1); c.lineTo(x + k * r * 1.7, y - r * 0.5); });
    stroke(c, fill, Math.max(0.8, r * 0.28), (c) => { c.moveTo(x, y + r * 0.3); c.lineTo(x + k * r * 1.6, y + r * 0.6); });
    stroke(c, fill, Math.max(0.8, r * 0.28), (c) => { c.moveTo(x, y + r * 0.7); c.lineTo(x + k * r * 1.2, y + r * 1.7); });
  }
}

function torsoFB(c, back) {
  const body = (c) => { c.moveTo(15.5, 35); c.quadraticCurveTo(15.5, 33, 17.5, 33); c.lineTo(30.5, 33); c.quadraticCurveTo(32.5, 33, 32.5, 35); c.lineTo(33, 47.5); c.lineTo(15, 47.5); };
  path(c, P.red, body);
  clipped(c, body, (c) => {
    rect(c, 28.5, 33, 6, 15, P.redDk);
    rect(c, 15, 33, 2.2, 15, P.redLt);
    // blue side panels under the arms, curving in toward the waist
    path(c, P.blue, (c) => { c.moveTo(14, 38.5); c.quadraticCurveTo(18.5, 39.5, 19, 47.5); c.lineTo(14, 47.5); });
    path(c, P.blueDk, (c) => { c.moveTo(34, 38.5); c.quadraticCurveTo(29.5, 39.5, 29, 47.5); c.lineTo(34, 47.5); });
    // belt line where the blue begins
    rect(c, 15, 46.6, 18, 0.9, P.blueDk);
    // web pattern over the red chest / back, radiating from the collar
    const fx = 24, fy = back ? 31 : 32;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.18 + (i / 8) * Math.PI * 0.64;
      stroke(c, P.redWeb, 1, (c) => { c.moveTo(fx, fy); c.lineTo(fx + Math.cos(a) * 20, fy + Math.sin(a) * 20); });
    }
    for (const r of [4.5, 8.5, 12.5]) stroke(c, P.redWeb, 1, (c) => c.arc(fx, fy, r, Math.PI * 0.12, Math.PI * 0.88));
  });
  if (back) spider(c, 24, 40, 3.2);
  else spider(c, 24, 38.5, 1.9);
}
function neckFB(c) { rect(c, 21.5, 29, 5, 5, P.redDk); rect(c, 21.5, 29, 1.2, 5, P.red); }

function hangingArm(side, sw) {
  const m = (x) => (side < 0 ? x : 48 - x);
  return { h: [m(12.8 + sw * 0.6), 46.8 - sw * 1.5], fist: true };
}

// --------------------------------------------------------------- side body
function bootSide(c, x, y, lifted) {
  const t = lifted ? 1 : 0;
  // boot shaft over the ankle
  rect(c, x - 2.8, y - 6, 5.6, 6, P.red);
  rect(c, x + 1.6, y - 6, 1.2, 6, P.redDk);
  poly(c, [[x - 2.8, y - 6], [x + 2.8, y - 6], [x + 2.8, y - 4.4], [x, y - 3.2], [x - 2.8, y - 4.4]], P.redDk);
  const shape = (c) => { c.moveTo(x + 3, y); c.lineTo(x + 3, y + 4); c.lineTo(x - 5, y + 4 + t); c.quadraticCurveTo(x - 6.8, y + 3.6 + t, x - 5.6, y + 1.6 + t); c.quadraticCurveTo(x - 4, y + t * 0.6, x - 2.4, y + t * 0.5); };
  path(c, P.red, shape);
  clipped(c, shape, (c) => { rect(c, x + 1.6, y, 1.4, 4, P.redDk); stroke(c, P.redDk, 0.8, (c) => { c.moveTo(x - 5, y + 3 + t); c.lineTo(x + 3, y + 3); }); });
  poly(c, [[x - 5.8, y + 4 + t], [x + 3, y + 4], [x + 3, y + 5], [x - 5.8, y + 5 + t]], P.line);
}
function legsSide(c, s, by) {
  const leg = (x, lift, near) => {
    const top = 46 + by, footY = 58 - lift;
    const col = near ? P.blue : P.blueDk;
    const knee = lift ? [x + 2.5, top + 6] : null;
    stroke(c, col, 5.6, (c) => { c.moveTo(24 + (near ? -0.5 : 0.5), top + 1.5); if (knee) c.quadraticCurveTo(knee[0], knee[1], x, footY - 1); else c.lineTo(x, footY - 1); });
    if (near) stroke(c, P.blueDk, 1.1, (c) => { c.moveTo(25.5, top + 2); if (knee) c.quadraticCurveTo(knee[0] + 2, knee[1], x + 2.2, footY - 1); else c.lineTo(x + 2.2, footY - 1); });
    bootSide(c, x, footY, lift > 0);
  };
  leg(24 + 3.5 * s, s > 0 ? 2 : 0, false);
  leg(22 - 3.5 * s, s < 0 ? 2 : 0, true);
}
function torsoSide(c) {
  const body = (c) => { c.moveTo(18, 33); c.lineTo(30, 33); c.quadraticCurveTo(31.8, 33, 31.8, 35); c.lineTo(32.2, 47.5); c.lineTo(16.4, 47.5); c.lineTo(16.8, 35); c.quadraticCurveTo(16.8, 33, 18, 33); };
  path(c, P.red, body);
  clipped(c, body, (c) => {
    rect(c, 27, 33, 6, 15, P.redDk);
    rect(c, 16, 33, 2.4, 15, P.redLt);
    // the blue side panel shows at the back of the torso
    path(c, P.blue, (c) => { c.moveTo(33, 38.5); c.quadraticCurveTo(28, 39.5, 27.5, 47.5); c.lineTo(33, 47.5); });
    rect(c, 16, 46.6, 17, 0.9, P.blueDk);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * 0.2 + (i / 6) * Math.PI * 0.6;
      stroke(c, P.redWeb, 1, (c) => { c.moveTo(20, 32); c.lineTo(20 + Math.cos(a) * 18, 32 + Math.sin(a) * 18); });
    }
    for (const r of [4.5, 8.5, 12.5]) stroke(c, P.redWeb, 1, (c) => c.arc(20, 32, r, Math.PI * 0.1, Math.PI * 0.9));
  });
  rect(c, 21, 29, 5, 5, P.redDk); // neck
}

// ---------------------------------------------------------------- frames
function drawDown(c, p, f) {
  const { s, by } = p;
  if (p.crouch) crouchLegsFB(c); else legsFB(c, s, by, { spread: p.spread });
  c.save(); c.translate(0, by);
  neckFB(c);
  torsoFB(c, false);
  const L = p.L ?? hangingArm(-1, -s);
  const R = p.R ?? hangingArm(1, s);
  arm(c, [15.4, 36], L);
  arm(c, [32.6, 36], R);
  headFront(c, { dx: p.headDx, dy: p.headDy, mood: p.mood });
  if (L.spark) impact(c, L.spark[0], L.spark[1], f.rand);
  if (R.spark) impact(c, R.spark[0], R.spark[1], f.rand);
  if (R.silk) thwip(c, R.silk[0], R.silk[1], f.rand);
  if (p.sparkles) {
    const r = f.rand;
    for (const [x, y] of [[6.5 + r() * 3, 10 + r() * 4], [39 + r() * 3, 9 + r() * 4], [20 + r() * 2, 5 + r() * 2]]) sparkStar(c, x, y, 1.8, P.spark);
  }
  c.restore();
}
function drawUp(c, p, f) {
  const { s, by } = p;
  legsFB(c, -s, by, { spread: p.spread });
  c.save(); c.translate(0, by);
  neckFB(c);
  torsoFB(c, true);
  const L = p.L ?? hangingArm(-1, s);
  const R = p.R ?? hangingArm(1, -s);
  arm(c, [15.4, 36], L);
  arm(c, [32.6, 36], R);
  headBack(c, { dx: p.headDx, dy: p.headDy });
  if (R.spark) impact(c, R.spark[0], R.spark[1], f.rand);
  if (R.silk) thwip(c, R.silk[0], R.silk[1], f.rand);
  c.restore();
}
function drawSide(c, p, f) {
  const { s, by } = p;
  const lean = p.lean || 0;
  c.save(); c.translate(lean, by);
  const far = p.far ?? { h: [28.4 - 2.4 * s, 46.6 + (s > 0 ? -0.5 : 0)], fist: true };
  arm(c, [26.5, 36], { ...far, far: true, w: 4.4 });
  c.restore();
  legsSide(c, s, by);
  c.save(); c.translate(lean, by);
  torsoSide(c);
  const near = p.near ?? { h: [21.6 + 2.6 * s, 46.8 - (s > 0 ? 1.4 : 0)], fist: true };
  arm(c, [23.5, 36.5], near);
  headSide(c, { dx: p.headDx, dy: p.headDy, mood: p.mood });
  if (near.spark) impact(c, near.spark[0], near.spark[1], f.rand);
  if (near.silk) thwip(c, near.silk[0], near.silk[1], f.rand);
  c.restore();
}

// -------------------------------------------------------------- portrait
function drawPortrait(ctx, size) {
  const k = size / 256;
  ctx.save();
  ctx.scale(k, k);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const O = (fill, fn, lw = 3, strokeCol = P.line) => {
    ctx.beginPath(); fn(ctx); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (lw > 0) { ctx.strokeStyle = strokeCol; ctx.lineWidth = lw; ctx.stroke(); }
  };
  const S = (color, w, fn) => { ctx.beginPath(); fn(ctx); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); };
  // shoulders: red chest between blue sides, the spider emblem at the collarbone
  const torso = (c) => { c.moveTo(6, 262); c.quadraticCurveTo(14, 218, 64, 202); c.lineTo(104, 194); c.lineTo(128, 214); c.lineTo(152, 194); c.lineTo(192, 202); c.quadraticCurveTo(242, 218, 250, 262); };
  O(P.red, torso, 3);
  clipped(ctx, torso, (c) => {
    O(P.blue, (c) => { c.moveTo(0, 262); c.quadraticCurveTo(20, 226, 70, 226); c.quadraticCurveTo(84, 240, 82, 262); }, 0);
    O(P.blueDk, (c) => { c.moveTo(256, 262); c.quadraticCurveTo(236, 226, 186, 226); c.quadraticCurveTo(172, 240, 174, 262); }, 0);
    rect(c, 170, 190, 60, 80, 'rgba(0,0,0,0.18)');
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7;
      S(P.redWeb, 2.5, (c) => { c.moveTo(128, 196); c.lineTo(128 + Math.cos(a) * 110, 196 + Math.sin(a) * 110); });
    }
    for (const r of [22, 44, 66]) S(P.redWeb, 2.5, (c) => c.arc(128, 196, r, Math.PI * 0.1, Math.PI * 0.9));
  });
  spider(ctx, 128, 236, 11);
  // neck
  O(P.redDk, (c) => { c.moveTo(108, 172); c.lineTo(148, 172); c.lineTo(152, 212); c.lineTo(104, 212); }, 3);
  // mask
  const mask = (c) => { c.moveTo(62, 116); c.quadraticCurveTo(60, 28, 128, 26); c.quadraticCurveTo(196, 28, 194, 116); c.quadraticCurveTo(194, 176, 128, 192); c.quadraticCurveTo(62, 176, 62, 116); };
  O(P.red, mask, 3);
  clipped(ctx, mask, (c) => {
    rect(c, 166, 20, 40, 190, 'rgba(0,0,0,0.2)');
    ell(c, 104, 60, 26, 10, P.redLt);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + 0.2;
      S(P.redWeb, 2.6, (c) => { c.moveTo(128, 96); c.lineTo(128 + Math.cos(a) * 120, 96 + Math.sin(a) * 120); });
    }
    for (const r of [18, 36, 54, 72, 90]) {
      S(P.redWeb, 2.6, (c) => {
        const n = 32;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TAU;
          const rr = r - (i % 2 ? 3 : 0);
          const x = 128 + Math.cos(a) * rr, y = 96 + Math.sin(a) * rr;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
      });
    }
  });
  // lenses
  for (const kx of [-1, 1]) {
    const x = 128 + kx * 30, y = 118;
    const shape = (c) => {
      c.moveTo(x - kx * 34, y + 14);
      c.quadraticCurveTo(x - kx * 8, y - 44, x + kx * 26, y - 22);
      c.quadraticCurveTo(x + kx * 40, y + 6, x + kx * 16, y + 30);
      c.quadraticCurveTo(x - kx * 10, y + 38, x - kx * 34, y + 14);
    };
    O(P.lens, shape, 7, P.lensRim);
    clipped(ctx, shape, (c) => { ell(c, x + kx * 6, y + 14, 26, 14, P.lensSh); ell(c, x - kx * 10, y - 6, 8, 5, '#FFFFFF'); });
  }
  ctx.restore();
}

// -------------------------------------------------------------- export
export default {
  id: 'chr_spidey',
  name: 'Spidey',
  role: 'player',
  assetId: 'ast_web_spidey',
  file: 'spidey.png',
  frameWidth: W,
  frameHeight: H,
  collider: { width: 24, height: 16, offsetX: 12, offsetY: 48 },
  walkFrameRate: 9,
  attackFrameRate: 12,
  portrait: { assetId: 'ast_web_spidey_portrait', file: 'spidey_portrait.png', size: 256 },
  /** Directional set: web_down / web_left / web_right / web_up, played by the runtime when the web ability fires. */
  sets: [{ name: 'web', frames: 3, frameRate: 14, loop: false }],
  emotes: [
    { name: 'celebrate', frames: 3, frameRate: 6, loop: false },
    { name: 'point', frames: 1 },
    { name: 'crouch', frames: 1 },
  ],

  draw(ctx, f) {
    const p = pose(f);
    ell(ctx, 24 + (p.lean || 0) * 0.5, 61.6, 10.5 + (p.by < 0 ? 0.5 : 0), 2.6, P.shadow);
    const A = document.createElement('canvas'); A.width = W; A.height = H;
    const c = A.getContext('2d');
    if (f.dir === 'down') drawDown(c, p, f);
    else if (f.dir === 'up') drawUp(c, p, f);
    else if (f.dir === 'left') drawSide(c, p, f);
    else { c.save(); c.translate(W, 0); c.scale(-1, 1); drawSide(c, p, f); c.restore(); }
    crisp(A);
    ctx.drawImage(outlined(A, P.line), 0, 0);
  },

  drawPortrait,
};
