/**
 * Hacho — the player of the "Hacho" city game.
 *
 * A cheerful anime boy: dark brown skin, short tightly-curled black hair with a clean edge, big
 * friendly dark eyes with highlights and a small confident smile. He wears a red and navy
 * colour-blocked hooded bomber jacket (red body panels, navy sleeves, hood, collar and ribbed
 * hem, white zip tape), a cream t-shirt, a black crossbody bag (strap across the chest, bag on his
 * left hip), navy cargo trousers with a thigh pocket and white sneakers with blue and red accents.
 *
 * Rows: walk (stride, arm counter-swing, 1 px bob, the bag swings), attack = a quick punch
 * (wind-up, strike with the fist in the facing direction + impact spark, recovery), then the
 * emote rows: celebrate, map, point, phone, interact (all drawn facing down).
 *
 * Drawing approach (same as villager.mjs): paths into an offscreen canvas, alpha thresholded to
 * whole pixels, a 1 px dark outline grown around the silhouette. Deterministic (f.rand only).
 */

const W = 48;
const H = 64;
const TAU = Math.PI * 2;

const P = {
  line: '#1C1219',
  skin: '#7E4F31', skinSh: '#5F381F', skinDk: '#3F2213', skinHi: '#9B6846',
  hair: '#17110F', hairHi: '#3A2C2E', hairLt: '#261C1E',
  eyeW: '#FFFFFF', iris: '#3A2216', irisLt: '#6E432A', pupil: '#0F0806',
  mouthIn: '#4A1A18', teeth: '#FFF8F0', tongue: '#D9625C',
  red: '#C9312F', redDk: '#8C1E22', redLt: '#E6554C',
  navy: '#253A78', navyDk: '#172552', navyLt: '#3B55A0',
  zip: '#F4F4F0', zipSh: '#C8C8C4',
  cream: '#F5EDD9', creamSh: '#D8CBAD',
  bag: '#221E25', bagLt: '#3B3540', bagHi: '#554E5C', buckle: '#C9C2B0',
  pants: '#2B3358', pantsDk: '#1C2340', pantsLt: '#3E4A78',
  shoe: '#F7F7F3', shoeSh: '#D2D3CE', sole: '#B9BBB6', shoeBlue: '#2F6BD3', shoeRed: '#D8342F',
  spark: '#FFE86A', sparkHi: '#FFFFFF',
  map: '#F1E7C8', mapSh: '#D6C9A0', mapRoad: '#E5A23A', mapGreen: '#7FBF5A', mapWater: '#6FB3E0', mapPin: '#E0392F',
  phone: '#1D1B22', phoneLt: '#3A3742', screen: '#8FD5FF', screenHi: '#DFF5FF',
  shadow: 'rgba(20,10,20,0.28)',
};

// ---------------------------------------------------------------- primitives
function ell(c, x, y, rx, ry, fill, rot = 0) {
  c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fillStyle = fill; c.fill();
}
function poly(c, pts, fill) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = fill; c.fill();
}
function rect(c, x, y, w, h, fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
function path(c, fill, fn) { c.beginPath(); fn(c); c.closePath(); c.fillStyle = fill; c.fill(); }
function stroke(c, color, w, fn) {
  c.beginPath(); fn(c); c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
}
function grad(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g;
}
function clipped(c, fn, body) { c.save(); c.beginPath(); fn(c); c.closePath(); c.clip(); body(c); c.restore(); }

// ------------------------------------------------------------ post-process
/** Snap anti-aliased alpha to 0/255 so the sprite is made of whole pixels. */
function crisp(canvas, threshold = 110) {
  const c = canvas.getContext('2d');
  const img = c.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < threshold) { d[i - 3] = 0; d[i - 2] = 0; d[i - 1] = 0; d[i] = 0; } else d[i] = 255;
  }
  c.putImageData(img, 0, 0);
}
/** Grow a 1 px outline of `color` around every opaque pixel of `src`. */
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
 * Arm descriptors are in viewer coordinates of the frame: { h: hand, via: elbow, fist, big, small,
 * point, thumb, open }. L = viewer-left arm, R = viewer-right arm. `s` is the stride (-1..1),
 * `by` the upper-body bob (negative = up), `mood` the face, `look` the gaze (-1 left, 1 right, 2 down).
 */
function pose(f) {
  const base = { s: 0, by: 0, lag: 0, mood: 'smile', look: 0, bagSway: 0, headDx: 0, headDy: 0, spread: 0 };
  if (f.anim === 'walk') {
    const s = [0, 1, 0, -1][f.index];
    return { ...base, s, by: f.index % 2 ? -1 : 0, lag: f.index % 2 ? 1 : 0, bagSway: s };
  }
  if (f.anim === 'attack') {
    const k = f.index;
    const side = f.dir === 'left' || f.dir === 'right';
    const p = { ...base, punch: k, mood: ['focus', 'shout', 'smile'][k], by: [0, 1, 0][k], spread: [1, 2, 1][k] };
    if (f.dir === 'down') {
      p.L = [
        { via: [12, 42.5], h: [13.5, 37.5], fist: true },
        { via: [14, 42], h: [19.5, 45.5], fist: true, big: true, spark: [16, 51] },
        { via: [12.5, 41], h: [14, 45], fist: true },
      ][k];
      p.R = [
        { via: [35, 42.5], h: [30.5, 40], fist: true },
        { via: [35, 41], h: [31.5, 43], fist: true },
        { h: [33.5, 46.5] },
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
        { h: [14, 46.5] },
      ][k];
      p.by = [0, -1, 0][k];
    } else if (side) {
      // drawn facing left; the near arm throws the punch
      p.near = [
        { via: [30, 41], h: [29.5, 37.5], fist: true },
        { via: [16.5, 37.5], h: [11.5, 37.5], fist: true, spark: [9.5, 37.5] },
        { via: [18.5, 41], h: [14.5, 41.5], fist: true },
      ][k];
      p.far = [
        { via: [21, 41], h: [17, 39.5], fist: true },
        { via: [30, 41], h: [30, 44], fist: true },
        { h: [27, 46] },
      ][k];
      p.lean = [1, -2, 0][k];
      p.headDx = [0.5, -1, 0][k];
    }
    return p;
  }
  // emotes (facing down)
  const k = f.index;
  const p = { ...base, emote: f.anim, k };
  if (f.anim === 'celebrate') {
    p.mood = ['grin', 'joy', 'grin'][k];
    p.by = [0, -2, 0][k];
    p.spread = [1, 0, 2][k];
    p.L = [
      { via: [11.5, 40.5], h: [12.5, 31], fist: true },
      { via: [11, 28], h: [10.5, 16.5], fist: true },
      { via: [11.5, 33.5], h: [7.5, 34.5], open: true },
    ][k];
    p.R = [
      { via: [36.5, 40.5], h: [35.5, 31], fist: true },
      { via: [37, 28], h: [37.5, 16.5], fist: true },
      { via: [36.5, 33.5], h: [40.5, 34.5], open: true },
    ][k];
    p.sparkles = k === 1;
  } else if (f.anim === 'map') {
    p.mood = 'smile'; p.look = 2; p.headDy = 1;
    p.L = { via: [12.5, 40.5], h: [15, 44], grip: true };
    p.R = { via: [35.5, 40.5], h: [33, 44], grip: true };
    p.map = true;
  } else if (f.anim === 'point') {
    p.mood = 'smile'; p.look = 1; p.headDx = 1;
    p.L = { via: [12, 42], h: [16, 44.5], fist: true };
    p.R = { h: [39, 36.5], point: true };
  } else if (f.anim === 'phone') {
    p.mood = 'smile'; p.look = 2; p.headDx = 1; p.headDy = 1;
    p.L = { h: [14, 46.5] };
    p.R = { via: [37.5, 43], h: [33.5, 38.5], grip: true };
    p.phone = true;
  } else if (f.anim === 'interact') {
    p.mood = 'grin';
    p.L = { h: [14, 46.5] };
    p.R = [
      { via: [36.5, 41.5], h: [37, 40], fist: true, big: true },
      { via: [37, 41.5], h: [35.5, 35], thumb: true, big: true },
    ][k];
    p.headDx = 0.5;
  }
  return p;
}

// ------------------------------------------------------------- shared bits
function sparkStar(c, x, y, r, fill) {
  poly(c, [[x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28], [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]], fill);
}
/** Impact spark: a yellow burst with a white core and a few flying bits. */
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

/** Hand at (x,y). kind: 'open' | 'fist' | 'grip' | 'point' | 'thumb'; dir = unit vector of the forearm. */
function hand(c, x, y, kind, dir, r = 2.1) {
  const [ux, uy] = dir;
  if (kind === 'fist' || kind === 'point' || kind === 'thumb') {
    ell(c, x, y, r * 1.05, r, P.skin);
    ell(c, x + 0.4, y + r * 0.45, r * 0.75, r * 0.45, P.skinSh);
    // knuckles
    for (const o of [-0.9, 0, 0.9]) rect(c, x + o * r * 0.7 - 0.4, y - r * 0.55, 0.8, 0.8, P.skinDk);
    if (kind === 'point') {
      stroke(c, P.skin, 1.7, (c) => { c.moveTo(x, y - 0.3); c.lineTo(x + ux * (r + 2.2), y - 0.3 + uy * (r + 2.2)); });
    }
    if (kind === 'thumb') {
      rect(c, x - 0.9, y - r - 3.2, 2.4, 3.8, P.skin);
      ell(c, x + 0.3, y - r - 3.2, 1.2, 1.2, P.skin);
      rect(c, x + 0.6, y - r - 2.4, 0.9, 2.6, P.skinSh);
      rect(c, x - 0.6, y - r - 3.4, 1, 1, P.skinHi);
    }
    return;
  }
  if (kind === 'grip') {
    ell(c, x, y, r, r * 1.05, P.skin);
    ell(c, x + 0.3, y + r * 0.5, r * 0.7, r * 0.4, P.skinSh);
    rect(c, x - 1.2, y - 0.5, 0.8, 0.8, P.skinDk); rect(c, x + 0.4, y - 0.5, 0.8, 0.8, P.skinDk);
    return;
  }
  ell(c, x, y, r, r * 1.1, P.skin);
  ell(c, x + 0.4, y + r * 0.55, r * 0.7, r * 0.4, P.skinSh);
  if (kind === 'open') for (const o of [-1.3, 0, 1.3]) ell(c, x + o, y - r * 0.9, 0.55, 1.1, P.skin);
}

/** Navy bomber sleeve from shoulder `s` to hand `h` (optionally via an elbow). */
function arm(c, s, a) {
  const h = a.h, via = a.via ?? null;
  const w = a.w ?? 4.6;
  const base = a.far ? P.navyDk : P.navy;
  const seg = (c, dx, dy) => {
    c.moveTo(s[0] + dx, s[1] + dy);
    if (via) c.quadraticCurveTo(via[0] + dx, via[1] + dy, h[0] + dx, h[1] + dy);
    else c.lineTo(h[0] + dx, h[1] + dy);
  };
  if (!a.far) stroke(c, P.navyDk, w, (c) => seg(c, 0.9, 0.9));
  stroke(c, base, w, (c) => seg(c, 0, 0));
  const px = via ? via[0] : s[0], py = via ? via[1] : s[1];
  let ux = h[0] - px, uy = h[1] - py; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
  // ribbed cuff + a light fold along the upper sleeve
  stroke(c, a.far ? P.navyDk : P.navyLt, 0.9, (c) => { c.moveTo(s[0] - uy * 1.2, s[1] + ux * 1.2); c.lineTo(px + (h[0] - px) * 0.5 - uy * 1.2, py + (h[1] - py) * 0.5 + ux * 1.2); });
  stroke(c, P.navyDk, w + 0.4, (c) => { c.moveTo(h[0] - ux * 2.6, h[1] - uy * 2.6); c.lineTo(h[0] - ux * 0.8, h[1] - uy * 0.8); });
  stroke(c, P.navyLt, 0.7, (c) => { c.moveTo(h[0] - ux * 1.7 - uy * 1.6, h[1] - uy * 1.7 + ux * 1.6); c.lineTo(h[0] - ux * 1.7 + uy * 1.6, h[1] - uy * 1.7 - ux * 1.6); });
  const r = a.big ? 3.2 : a.small ? 1.7 : 2.1;
  const kind = a.fist ? 'fist' : a.point ? 'point' : a.thumb ? 'thumb' : a.grip ? 'grip' : a.open ? 'open' : 'hand';
  const hx = h[0] + ux * (r * 0.6), hy = h[1] + uy * (r * 0.6);
  hand(c, hx, hy, kind, [ux, uy], r);
  return [hx, hy];
}

function eye(c, ex, ey, mood, look = 0, rx = 2.5) {
  if (mood === 'joy') {
    stroke(c, P.line, 1.5, (c) => c.arc(ex, ey + 1.4, 2.5, Math.PI * 1.12, Math.PI * 1.88));
    return;
  }
  const n = mood === 'focus' ? 0.72 : mood === 'shout' ? 1.1 : 1;
  const dx = look === 2 ? 0 : look * 0.7, dy = look === 2 ? 0.9 : 0.3;
  ell(c, ex, ey, rx, 3 * n, P.eyeW);
  const g = grad(c, 0, ey - 2.5, 0, ey + 2.8, [[0, P.iris], [0.55, P.iris], [1, P.irisLt]]);
  ell(c, ex + dx, ey + dy, Math.min(rx - 0.4, 2), 2.5 * n, g);
  ell(c, ex + dx, ey + dy - 0.1, 1, 1.5 * n, P.pupil);
  rect(c, ex - 1.6 + dx * 0.5, ey - 1.7 + dy * 0.5, 1.3, 1.3, '#FFFFFF');
  rect(c, ex + 0.6 + dx * 0.5, ey + 1.3, 0.9, 0.9, '#FFFFFF');
  stroke(c, P.line, 1.5, (c) => { c.moveTo(ex - rx - 0.3, ey - 1.1 * n); c.quadraticCurveTo(ex + dx * 0.3, ey - 4.4 * n, ex + rx + 0.3, ey - 1.3 * n); });
  if (look === 2) stroke(c, P.line, 1.2, (c) => { c.moveTo(ex - rx + 0.3, ey - 1.6); c.quadraticCurveTo(ex, ey - 2.4, ex + rx - 0.3, ey - 1.6); });
  rect(c, ex - 1.3, ey + 3.1 * n, 2.6, 0.8, P.skinDk);
}
function brow(c, x0, y0, x1, y1, mood) {
  const lift = mood === 'shout' ? -1.2 : mood === 'focus' ? 0.6 : 0;
  stroke(c, P.hair, 1.3, (c) => { c.moveTo(x0, y0 + lift * 0.4); c.lineTo(x1, y1 + lift); });
}
function mouth(c, x, y, mood) {
  if (mood === 'grin' || mood === 'joy') {
    const g = (c) => { c.moveTo(x - 3.2, y - 0.8); c.quadraticCurveTo(x, y + 0.4, x + 3.2, y - 0.8); c.quadraticCurveTo(x + 2.2, y + 3, x, y + 3.2); c.quadraticCurveTo(x - 2.2, y + 3, x - 3.2, y - 0.8); };
    path(c, P.mouthIn, g);
    clipped(c, g, (c) => { rect(c, x - 3.4, y - 1.2, 6.8, 1.8, P.teeth); ell(c, x, y + 2.8, 1.5, 0.9, P.tongue); });
    return;
  }
  if (mood === 'shout') { ell(c, x, y + 0.6, 1.9, 2.1, P.mouthIn); rect(c, x - 1.3, y - 1.2, 2.6, 0.9, P.teeth); ell(c, x, y + 1.9, 1, 0.6, P.tongue); return; }
  if (mood === 'focus') { stroke(c, P.line, 1.1, (c) => { c.moveTo(x - 1.8, y + 0.4); c.lineTo(x + 1.6, y); }); return; }
  // the small confident smile: one corner lifted
  stroke(c, P.line, 1.1, (c) => { c.moveTo(x - 2, y - 0.2); c.quadraticCurveTo(x + 0.4, y + 1.6, x + 2.4, y - 0.6); });
  rect(c, x + 2.2, y - 1.4, 0.8, 0.8, P.line);
}

// ------------------------------------------------------------------ heads
/** Curl rim: small bumps along the dome so the silhouette reads as tight curls. */
function curlRim(c, cx, top, pts, fill) {
  for (const [x, y, r] of pts) ell(c, cx + x, top + y, r, r, fill);
}
function curlTexture(c, pts) {
  // small crescent glints on the curls (light from the upper-left)
  for (const [x, y, r] of pts) { ell(c, x, y, r, r, P.hairHi); ell(c, x + 0.5, y + 0.5, r, r, P.hair); }
}

function headFront(c, o) {
  const { dx = 0, dy = 0, mood = 'smile', look = 0, lag = 0 } = o;
  c.save(); c.translate(dx, dy);
  // ears
  ell(c, 14.4, 23.2 + lag * 0.3, 1.9, 2.4, P.skin); ell(c, 33.6, 23.2 + lag * 0.3, 1.9, 2.4, P.skin);
  rect(c, 13.9, 23, 1, 1.4, P.skinSh); rect(c, 33.1, 23, 1, 1.4, P.skinSh);
  // hair dome behind the face
  const dome = (c) => { c.moveTo(12.2, 19); c.quadraticCurveTo(12, 6.4, 24, 6.4); c.quadraticCurveTo(36, 6.4, 35.8, 19); c.quadraticCurveTo(36, 25, 33, 26); c.lineTo(15, 26); c.quadraticCurveTo(12, 25, 12.2, 19); };
  path(c, P.hair, dome);
  // face
  const face = (c) => c.ellipse(24, 22.6, 9.3, 8.8, 0, 0, TAU);
  path(c, P.skin, face);
  clipped(c, face, (c) => {
    rect(c, 14, 13, 20, 4.2, P.skinSh);            // hair shadow on the forehead
    ell(c, 24, 32.5, 8.8, 3.2, P.skinSh);          // jaw
    rect(c, 30.5, 14, 4, 20, P.skinSh);            // shaded right side
    ell(c, 20, 19.5, 3.5, 1.6, P.skinHi);          // forehead sheen
  });
  // hair front: clean straight edge with sideburns
  const front = (c) => { c.moveTo(12.2, 19); c.quadraticCurveTo(12, 6.4, 24, 6.4); c.quadraticCurveTo(36, 6.4, 35.8, 19); c.lineTo(35.2, 21.5); c.lineTo(33.2, 21.5); c.lineTo(33.2, 16.2); c.lineTo(14.8, 16.2); c.lineTo(14.8, 21.5); c.lineTo(12.8, 21.5); };
  path(c, P.hair, front);
  curlRim(c, 24, 6.4, [[-11.3, 6, 1.3], [-9.2, 2.4, 1.3], [-5.6, 0.6, 1.3], [-1.6, -0.3, 1.3], [2.6, -0.3, 1.3], [6.6, 0.8, 1.3], [9.6, 2.8, 1.3], [11.5, 6.2, 1.3]], P.hair);
  clipped(c, front, (c) => {
    rect(c, 30, 5, 7, 18, 'rgba(0,0,0,0.25)');
    curlTexture(c, [[17.5, 11.5, 1.1], [21, 9.2, 1.1], [25, 8.6, 1.1], [29, 9.8, 1.1], [15.5, 15, 0.9], [19.5, 14.2, 0.9], [23.5, 13, 0.9], [27.5, 13.6, 0.9], [32, 14.5, 0.9], [14, 19, 0.8], [34, 19, 0.8]]);
    stroke(c, P.hairHi, 1.4, (c) => c.arc(23, 12, 8.5, Math.PI * 1.18, Math.PI * 1.55));
  });
  // brows, eyes, nose, mouth
  brow(c, 16.8, 19.6, 21.6, 19, mood); brow(c, 31.2, 19.6, 26.4, 19, mood);
  eye(c, 19.6, 23.4, mood, look); eye(c, 28.4, 23.4, mood, look);
  rect(c, 24.2, 26.2, 1, 1, P.skinDk);
  mouth(c, 24.3, 28.6, mood);
  c.restore();
}

function headBack(c, o) {
  const { dx = 0, dy = 0, lag = 0 } = o;
  c.save(); c.translate(dx, dy);
  rect(c, 21, 26, 6, 8, P.skinSh);
  const dome = (c) => { c.moveTo(12.2, 19); c.quadraticCurveTo(12, 6.4, 24, 6.4); c.quadraticCurveTo(36, 6.4, 35.8, 19); c.quadraticCurveTo(36.2, 26.5 + lag * 0.4, 32, 27.6 + lag * 0.4); c.lineTo(16, 27.6 + lag * 0.4); c.quadraticCurveTo(11.8, 26.5 + lag * 0.4, 12.2, 19); };
  path(c, P.hair, dome);
  curlRim(c, 24, 6.4, [[-11.3, 6, 1.3], [-9.2, 2.4, 1.3], [-5.6, 0.6, 1.3], [-1.6, -0.3, 1.3], [2.6, -0.3, 1.3], [6.6, 0.8, 1.3], [9.6, 2.8, 1.3], [11.5, 6.2, 1.3]], P.hair);
  clipped(c, dome, (c) => {
    rect(c, 30, 5, 7, 24, 'rgba(0,0,0,0.25)');
    rect(c, 12, 23, 24, 6, 'rgba(0,0,0,0.18)');
    curlTexture(c, [[17.5, 11.5, 1.1], [21, 9.2, 1.1], [25, 8.6, 1.1], [29, 9.8, 1.1], [15.5, 15, 0.9], [19.5, 14.5, 0.9], [23.5, 13.5, 0.9], [27.5, 14, 0.9], [31.5, 15, 0.9], [17, 19.5, 0.9], [21, 18.5, 0.9], [25.5, 18.8, 0.9], [30, 19.5, 0.9], [19, 23, 0.8], [24, 23.5, 0.8], [29, 23.2, 0.8]]);
    stroke(c, P.hairHi, 1.4, (c) => c.arc(23, 12, 8.5, Math.PI * 1.18, Math.PI * 1.55));
  });
  // ears peeking out
  ell(c, 13.6, 22.5, 1.5, 2.1, P.skinSh); ell(c, 34.4, 22.5, 1.5, 2.1, P.skinSh);
  c.restore();
}

/** Facing left. Mirrored by the caller for right. */
function headSide(c, o) {
  const { dx = 0, dy = 0, mood = 'smile', lag = 0 } = o;
  c.save(); c.translate(dx, dy);
  // back of the head hair (curls at the nape)
  const dome = (c) => { c.moveTo(12.6, 19); c.quadraticCurveTo(12, 6.4, 24.5, 6.4); c.quadraticCurveTo(37, 6.4, 36.6, 19); c.quadraticCurveTo(37, 25.5 + lag * 0.4, 33.5, 27 + lag * 0.4); c.lineTo(28, 27 + lag * 0.4); c.lineTo(28, 16); c.lineTo(13.5, 16); };
  path(c, P.hair, dome);
  // face in profile
  const face = (c) => c.ellipse(21.5, 22.8, 9, 8.8, 0, 0, TAU);
  path(c, P.skin, face);
  clipped(c, face, (c) => {
    rect(c, 10, 13, 22, 4, P.skinSh);
    ell(c, 21, 32.5, 8.5, 3, P.skinSh);
    rect(c, 26, 14, 6, 20, P.skinSh);
    ell(c, 17.5, 19.5, 3, 1.5, P.skinHi);
  });
  poly(c, [[12.9, 23.4], [10.9, 25.6], [12.9, 27.2]], P.skin);       // nose
  rect(c, 11.4, 25.8, 1, 1, P.skinDk);
  // hair front with the clean edge
  const front = (c) => { c.moveTo(12.6, 19); c.quadraticCurveTo(12, 6.4, 24.5, 6.4); c.quadraticCurveTo(37, 6.4, 36.6, 19); c.lineTo(36, 22); c.lineTo(31, 22); c.lineTo(30, 16.2); c.lineTo(13.6, 16.2); c.lineTo(13.2, 20); };
  path(c, P.hair, front);
  curlRim(c, 24.5, 6.4, [[-11.6, 6.2, 1.3], [-9.4, 2.4, 1.3], [-5.6, 0.6, 1.3], [-1.6, -0.3, 1.3], [2.6, -0.3, 1.3], [6.6, 0.8, 1.3], [9.6, 2.8, 1.3], [11.8, 6.4, 1.3], [12.4, 12, 1.2], [11.6, 17.5, 1.2], [9.8, 21.5 + lag * 0.3, 1.2]], P.hair);
  clipped(c, dome, (c) => {
    rect(c, 30, 5, 8, 24, 'rgba(0,0,0,0.25)');
    curlTexture(c, [[17.5, 11.5, 1.1], [21.5, 9.2, 1.1], [25.5, 8.6, 1.1], [29.5, 9.8, 1.1], [15.5, 14.8, 0.9], [19.5, 14, 0.9], [23.5, 13, 0.9], [27.5, 13.4, 0.9], [32, 13.5, 0.9], [33.5, 18, 0.9], [31.5, 22.5, 0.9], [30, 25.5, 0.8]]);
    stroke(c, P.hairHi, 1.4, (c) => c.arc(23.5, 12, 8.5, Math.PI * 1.18, Math.PI * 1.55));
  });
  // ear in front of the sideburn
  ell(c, 28.6, 23.4 + lag * 0.3, 1.9, 2.4, P.skin);
  rect(c, 28.2, 23, 1, 1.4, P.skinSh);
  brow(c, 13.8, 19.6, 19, 19.1, mood);
  eye(c, 16.4, 23.5, mood, -1, 2.1);
  if (mood === 'grin' || mood === 'joy') { ell(c, 13.6, 28.8, 1.6, 1.4, P.mouthIn); rect(c, 12.6, 27.8, 2.2, 0.8, P.teeth); }
  else if (mood === 'shout') { ell(c, 13.6, 29, 1.4, 1.8, P.mouthIn); }
  else if (mood === 'focus') stroke(c, P.line, 1, (c) => { c.moveTo(12.6, 28.6); c.lineTo(15.2, 28.6); });
  else stroke(c, P.line, 1.1, (c) => { c.moveTo(12.6, 28.2); c.quadraticCurveTo(13.8, 29.6, 15.6, 28.4); });
  c.restore();
}

// -------------------------------------------------------- front/back bodies
function sneakerFB(c, x, y) {
  // 7 wide, rows y..y+4: white upper, navy tongue, red side tabs, blue midsole stripe, grey sole
  rect(c, x, y, 7, 4, P.shoe);
  rect(c, x + 6, y, 1, 4, P.shoeSh);
  rect(c, x + 2, y, 3, 1.5, P.shoeBlue);
  rect(c, x + 3, y + 1.5, 1, 0.8, P.shoeSh);
  rect(c, x, y + 2, 1.5, 1, P.shoeRed); rect(c, x + 5.5, y + 2, 1.5, 1, P.shoeRed);
  rect(c, x, y + 3.2, 7, 0.8, P.shoeBlue);
  rect(c, x, y + 4, 7, 1, P.sole);
}
function legsFB(c, s, by, o = {}) {
  const sp = o.spread || 0;
  const leg = (x, lift, side) => {
    const top = 46 + by, footY = 58 - lift;
    rect(c, x, top, 6, footY - top, P.pants);
    rect(c, x + (side > 0 ? 4.5 : 0), top, 1.5, footY - top, P.pantsDk);
    if (side < 0) rect(c, x + 1.5, top, 0.8, footY - top, P.pantsLt);
    // cargo pocket on the near thigh (his right leg from the front, his left from the back)
    if (o.pocket === side) { rect(c, x + 1.2, 50.5, 3.6, 3.2, P.pantsDk); rect(c, x + 1.2, 50.5, 3.6, 1, P.pantsLt); rect(c, x + 2.6, 51.8, 0.8, 0.8, P.pantsLt); }
    stroke(c, P.pantsDk, 0.8, (c) => { c.moveTo(x + 0.5, footY - 0.6); c.lineTo(x + 5.5, footY - 0.6); }); // cuff
    sneakerFB(c, x - 1, footY);
  };
  leg(17 - sp, s < 0 ? 2 : 0, -1);
  leg(25 + sp, s > 0 ? 2 : 0, 1);
}

function jacketFB(c, back) {
  const body = (c) => { c.moveTo(15.5, 35); c.quadraticCurveTo(15.5, 33, 17.5, 33); c.lineTo(30.5, 33); c.quadraticCurveTo(32.5, 33, 32.5, 35); c.lineTo(33.2, 47.5); c.lineTo(14.8, 47.5); };
  path(c, P.red, body);
  clipped(c, body, (c) => {
    rect(c, 28.5, 33, 6, 15, P.redDk);
    rect(c, 15, 33, 2.2, 15, P.redLt);
    if (!back) {
      // open front showing the cream tee
      poly(c, [[21.2, 33], [26.8, 33], [27.4, 47.5], [20.6, 47.5]], P.cream);
      rect(c, 25.4, 33, 2.2, 15, P.creamSh);
      stroke(c, P.zip, 1, (c) => { c.moveTo(21.2, 33.5); c.lineTo(20.7, 47.5); });
      stroke(c, P.zip, 1, (c) => { c.moveTo(26.8, 33.5); c.lineTo(27.3, 47.5); });
      stroke(c, P.zipSh, 0.6, (c) => { c.moveTo(21.7, 34); c.lineTo(21.2, 47); });
      // chest pocket welt
      rect(c, 16.6, 38, 3.4, 0.9, P.redDk);
    } else {
      stroke(c, P.redDk, 0.9, (c) => { c.moveTo(24, 33); c.lineTo(24, 47.5); });
      stroke(c, P.redDk, 0.8, (c) => { c.moveTo(17, 36); c.quadraticCurveTo(24, 38.5, 31, 36); });
    }
  });
  // ribbed navy hem
  poly(c, [[14.6, 47.5], [33.4, 47.5], [33.2, 50], [14.8, 50]], P.navy);
  rect(c, 15, 47.5, 18, 0.8, P.navyLt);
  for (let x = 16; x < 33; x += 2.5) rect(c, x, 48.3, 0.8, 1.7, P.navyDk);
}
function collarFB(c, back) {
  // ribbed navy collar; the hood is bunched behind the neck
  poly(c, [[18.6, 31.5], [29.4, 31.5], [30, 34.2], [18, 34.2]], P.navy);
  rect(c, 19, 31.5, 10, 0.8, P.navyLt);
  if (!back) { poly(c, [[21, 31.5], [27, 31.5], [24, 34]], P.navyDk); }
}
function hoodBehind(c) {
  ell(c, 24, 30, 10.4, 4.8, P.navy);
  clipped(c, (c) => c.ellipse(24, 30, 10.4, 4.8, 0, 0, TAU), (c) => {
    rect(c, 12, 31.2, 24, 6, P.navyDk);
    ell(c, 18.5, 27.4, 3.6, 1.2, P.navyLt);
  });
}
function hoodBack(c) {
  const hood = (c) => { c.moveTo(17.2, 32.5); c.lineTo(30.8, 32.5); c.quadraticCurveTo(31.8, 38.5, 29.6, 43.5); c.quadraticCurveTo(24, 46, 18.4, 43.5); c.quadraticCurveTo(16.2, 38.5, 17.2, 32.5); };
  path(c, P.navy, hood);
  clipped(c, hood, (c) => {
    rect(c, 26.5, 32, 6, 15, P.navyDk);
    stroke(c, P.navyDk, 0.9, (c) => { c.moveTo(24, 33); c.quadraticCurveTo(23, 39, 24, 45.5); });
    stroke(c, P.navyLt, 0.9, (c) => { c.moveTo(18.5, 34); c.quadraticCurveTo(18, 39, 19.5, 43); });
    stroke(c, P.navyLt, 0.8, (c) => { c.moveTo(18.5, 43.6); c.quadraticCurveTo(24, 45.6, 29.5, 43.6); });
  });
}
function strapFB(c, x0, y0, x1, y1) {
  stroke(c, P.bag, 2.6, (c) => { c.moveTo(x0, y0); c.lineTo(x1, y1); });
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  stroke(c, P.bagHi, 0.7, (c) => { c.moveTo(x0 + nx * 0.9, y0 + ny * 0.9); c.lineTo(x1 + nx * 0.9, y1 + ny * 0.9); });
}
/** The crossbody bag body, 7x7.5 with its top-left at (x,y). */
function bagBody(c, x, y, sway = 0) {
  x += sway * 0.6;
  const shape = (c) => { c.moveTo(x, y + 1); c.quadraticCurveTo(x, y, x + 1, y); c.lineTo(x + 6, y); c.quadraticCurveTo(x + 7, y, x + 7, y + 1); c.lineTo(x + 7, y + 6.5); c.quadraticCurveTo(x + 7, y + 7.5, x + 6, y + 7.5); c.lineTo(x + 1, y + 7.5); c.quadraticCurveTo(x, y + 7.5, x, y + 6.5); };
  path(c, P.bag, shape);
  clipped(c, shape, (c) => {
    rect(c, x, y, 7, 3.2, P.bagLt);
    rect(c, x + 0.6, y + 3.2, 5.8, 0.8, P.bagHi);
    rect(c, x + 5.6, y + 3.8, 1.4, 4, P.bagLt);
    rect(c, x + 0.6, y + 0.6, 1.2, 0.9, P.bagHi);
  });
  rect(c, x + 2.8, y + 2.2, 1.6, 2.2, P.buckle);
  rect(c, x + 2.8, y + 2.2, 1.6, 0.7, '#FFFFFF');
}

function neckFB(c) { rect(c, 21.5, 28, 5, 6, P.skinSh); rect(c, 21.5, 28, 1.2, 6, P.skin); }

function hangingArm(side, sw) {
  // side -1 viewer-left, +1 viewer-right; sw>0 = this arm swings forward (rises a little and tucks in)
  const m = (x) => (side < 0 ? x : 48 - x);
  return { h: [m(12.8 + sw * 0.6), 46.8 - sw * 1.5] };
}

function unfoldedMap(c) {
  const shape = (c) => { c.moveTo(15.2, 38.8); c.lineTo(33, 37.8); c.lineTo(33.6, 48.4); c.lineTo(14.6, 49.4); };
  path(c, P.map, shape);
  clipped(c, shape, (c) => {
    rect(c, 21, 38, 6, 11, P.mapSh);
    rect(c, 22, 38, 4, 11, P.map);
    ell(c, 19, 44, 2.6, 1.8, P.mapGreen);
    ell(c, 29.5, 41.5, 2.4, 1.6, P.mapWater);
    stroke(c, P.mapRoad, 1, (c) => { c.moveTo(16, 41.5); c.quadraticCurveTo(24, 40.5, 32.6, 44.5); });
    stroke(c, P.mapRoad, 0.8, (c) => { c.moveTo(24.5, 39); c.lineTo(25.5, 47.5); });
    stroke(c, P.mapSh, 0.6, (c) => { c.moveTo(21, 38.8); c.lineTo(20.6, 48); c.moveTo(27, 38.5); c.lineTo(27.6, 47.6); });
    ell(c, 27.8, 43.2, 1, 1, P.mapPin); rect(c, 27.4, 43.6, 0.8, 1.6, P.mapPin);
  });
}
function smartphone(c, x, y) {
  // held upright, 5 x 9 with its top-left at (x,y)
  const body = (c) => { c.moveTo(x, y + 0.8); c.quadraticCurveTo(x, y, x + 0.8, y); c.lineTo(x + 4.2, y); c.quadraticCurveTo(x + 5, y, x + 5, y + 0.8); c.lineTo(x + 5, y + 8.2); c.quadraticCurveTo(x + 5, y + 9, x + 4.2, y + 9); c.lineTo(x + 0.8, y + 9); c.quadraticCurveTo(x, y + 9, x, y + 8.2); };
  path(c, P.phone, body);
  rect(c, x + 0.7, y + 0.8, 3.6, 7.2, P.screen);
  rect(c, x + 0.7, y + 0.8, 3.6, 1.3, P.screenHi);
  rect(c, x + 1.2, y + 2.8, 2.6, 0.8, P.phoneLt); rect(c, x + 1.2, y + 4.3, 2, 0.8, P.phoneLt); rect(c, x + 1.2, y + 5.8, 2.4, 0.8, P.phoneLt);
  rect(c, x + 1.2, y + 7.2, 1.2, 0.6, P.screenHi);
}

// --------------------------------------------------------------- side body
function sneakerSide(c, x, y, lifted) {
  // ankle at x, rows y..y+4, toe pointing left
  const t = lifted ? 1 : 0;
  const shape = (c) => { c.moveTo(x + 3, y); c.lineTo(x + 3, y + 4); c.lineTo(x - 5, y + 4 + t); c.quadraticCurveTo(x - 6.8, y + 3.6 + t, x - 5.6, y + 1.6 + t); c.quadraticCurveTo(x - 4, y + t * 0.6, x - 2.4, y + t * 0.5); };
  path(c, P.shoe, shape);
  clipped(c, shape, (c) => {
    rect(c, x - 1.6, y, 2.2, 1.6, P.shoeBlue);                                                   // tongue
    stroke(c, P.shoeBlue, 1.1, (c) => { c.moveTo(x - 4.8, y + 3.2 + t); c.quadraticCurveTo(x - 1, y + 3.4, x + 2.6, y + 1.8); }); // swoosh
    rect(c, x + 1.6, y + 0.4, 1.4, 2.4, P.shoeRed);                                              // heel tab
    stroke(c, P.shoeSh, 0.6, (c) => { c.moveTo(x - 1.5, y + 1.8); c.lineTo(x + 0.6, y + 1.8); });
  });
  poly(c, [[x - 5.8, y + 4 + t], [x + 3, y + 4], [x + 3, y + 5], [x - 5.8, y + 5 + t]], P.sole);
}
function legsSide(c, s, by, o = {}) {
  const leg = (x, lift, near) => {
    const top = 46 + by, footY = 58 - lift;
    const col = near ? P.pants : P.pantsDk;
    const knee = lift ? [x + 2.5, top + 6] : null;
    stroke(c, col, 5.6, (c) => { c.moveTo(24 + (near ? -0.5 : 0.5), top + 1.5); if (knee) c.quadraticCurveTo(knee[0], knee[1], x, footY - 1); else c.lineTo(x, footY - 1); });
    if (near) {
      stroke(c, P.pantsDk, 1.1, (c) => { c.moveTo(25.5, top + 2); if (knee) c.quadraticCurveTo(knee[0] + 2, knee[1], x + 2.2, footY - 1); else c.lineTo(x + 2.2, footY - 1); });
      if (o.pocket) { const px = (24 + x) / 2 - 1.6, py = top + 4.5; rect(c, px, py, 3.4, 3, P.pantsDk); rect(c, px, py, 3.4, 1, P.pantsLt); }
    }
    stroke(c, P.pantsDk, 0.8, (c) => { c.moveTo(x - 2.4, footY - 0.8); c.lineTo(x + 2.4, footY - 0.8); });
    sneakerSide(c, x, footY, lift > 0);
  };
  leg(24 + 3.5 * s, s > 0 ? 2 : 0, false);   // far leg
  leg(22 - 3.5 * s, s < 0 ? 2 : 0, true);    // near leg
}
function jacketSide(c) {
  const body = (c) => { c.moveTo(18, 33); c.lineTo(30, 33); c.quadraticCurveTo(31.8, 33, 31.8, 35); c.lineTo(32.2, 47.5); c.lineTo(16.4, 47.5); c.lineTo(16.8, 35); c.quadraticCurveTo(16.8, 33, 18, 33); };
  path(c, P.red, body);
  clipped(c, body, (c) => {
    rect(c, 27, 33, 6, 15, P.redDk);
    rect(c, 16, 33, 2.4, 15, P.redLt);
    // the open front shows a wedge of the tee; white zip tape down the front edge
    poly(c, [[16.8, 33], [22, 33], [20.5, 41], [17, 41]], P.cream);
    poly(c, [[20.4, 33], [22, 33], [20.5, 41], [19.4, 41]], P.creamSh);
    stroke(c, P.zip, 1, (c) => { c.moveTo(17.6, 35); c.lineTo(17.4, 47.5); });
    rect(c, 19, 39, 3, 0.9, P.redDk);
  });
  poly(c, [[16.2, 47.5], [32.4, 47.5], [32.2, 50], [16.4, 50]], P.navy);
  rect(c, 16.6, 47.5, 15.6, 0.8, P.navyLt);
  for (let x = 17.5; x < 32; x += 2.5) rect(c, x, 48.3, 0.8, 1.7, P.navyDk);
  // collar
  poly(c, [[18.4, 31.5], [29.6, 31], [30.6, 34.5], [17.6, 34.5]], P.navy);
  rect(c, 18.6, 31.5, 10.6, 0.8, P.navyLt);
}
function hoodSide(c) {
  // the hood bunched at the back of the neck
  const hood = (c) => c.ellipse(30.5, 31, 7.4, 5.6, -0.25, 0, TAU);
  path(c, P.navy, hood);
  clipped(c, hood, (c) => { rect(c, 22, 32, 18, 6, P.navyDk); ell(c, 29, 28, 3.4, 1.3, P.navyLt); });
}

// ---------------------------------------------------------------- frames
function drawDown(c, p, f) {
  const { s, by, lag } = p;
  legsFB(c, s, by, { pocket: -1, spread: p.spread });
  c.save(); c.translate(0, by);
  hoodBehind(c);
  neckFB(c);
  jacketFB(c, false);
  collarFB(c, false);
  strapFB(c, 18.6, 33.6, 31.2, 47);
  bagBody(c, 27.6, 44.6, p.bagSway);
  if (p.map) unfoldedMap(c);
  const L = p.L ?? hangingArm(-1, -s);   // his right arm swings opposite the viewer-left (his right) leg
  const R = p.R ?? hangingArm(1, s);
  const hL = arm(c, [15.4, 36], L);
  const hR = arm(c, [32.6, 36], R);
  void hL;
  headFront(c, { dx: p.headDx, dy: p.headDy, mood: p.mood, look: p.look, lag });
  if (p.phone) smartphone(c, hR[0] - 2.6, hR[1] - 9.6);
  if (L.spark) impact(c, L.spark[0], L.spark[1], f.rand);
  if (R.spark) impact(c, R.spark[0], R.spark[1], f.rand);
  if (p.sparkles) {
    const r = f.rand;
    for (const [x, y] of [[6.5 + r() * 3, 10 + r() * 4], [39 + r() * 3, 9 + r() * 4], [20 + r() * 2, 5 + r() * 2]]) sparkStar(c, x, y, 1.8, P.spark);
  }
  c.restore();
}
function drawUp(c, p, f) {
  const { s, by, lag } = p;
  legsFB(c, -s, by, { pocket: 1 });
  c.save(); c.translate(0, by);
  neckFB(c);
  jacketFB(c, true);
  strapFB(c, 30.2, 33, 17, 47);
  collarFB(c, true);
  hoodBack(c);
  bagBody(c, 12.8, 47.6, -p.bagSway);
  const L = p.L ?? hangingArm(-1, s);    // from behind, his left arm is on the viewer's left
  const R = p.R ?? hangingArm(1, -s);
  arm(c, [15.4, 36], L);
  arm(c, [32.6, 36], R);
  headBack(c, { dx: p.headDx, dy: p.headDy, lag });
  if (R.spark) impact(c, R.spark[0], R.spark[1], f.rand);
  c.restore();
}
function drawSide(c, p, f, bagNear) {
  const { s, by, lag } = p;
  const lean = p.lean || 0;
  c.save(); c.translate(lean, by);
  hoodSide(c);
  if (!bagNear) bagBody(c, 29.2, 43.8, p.bagSway * 0.5);   // far hip: the bag peeks out behind the back
  const far = p.far ?? { h: [28.4 - 2.4 * s, 46.6 + (s > 0 ? -0.5 : 0)], far: true };
  arm(c, [26.5, 36], { ...far, far: true, w: 4.6 });
  c.restore();
  legsSide(c, s, by, { pocket: true });
  c.save(); c.translate(lean, by);
  jacketSide(c);
  // strap over the chest toward the near hip
  stroke(c, P.bag, 2.4, (c) => { c.moveTo(19, 35.5); c.quadraticCurveTo(23, 41, 30, 45.5); });
  stroke(c, P.bagHi, 0.6, (c) => { c.moveTo(19.6, 34.8); c.quadraticCurveTo(23.6, 40.2, 30.4, 44.6); });
  if (bagNear) bagBody(c, 26.6, 44.4, p.bagSway * 0.8);
  const near = p.near ?? { h: [21.6 + 2.6 * s, 46.8 - (s > 0 ? 1.4 : 0)] };
  arm(c, [23.5, 36.5], near);
  headSide(c, { dx: p.headDx, dy: p.headDy, mood: p.mood, lag });
  if (near.spark) impact(c, near.spark[0], near.spark[1], f.rand);
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

  // hood: hanging behind the head, its opening rolled around the shoulders
  const hood = (c) => { c.moveTo(34, 262); c.quadraticCurveTo(26, 176, 72, 128); c.quadraticCurveTo(100, 104, 128, 104); c.quadraticCurveTo(156, 104, 184, 128); c.quadraticCurveTo(230, 176, 222, 262); };
  O(P.navy, hood, 3);
  clipped(ctx, hood, (c) => {
    rect(c, 160, 100, 80, 170, 'rgba(0,0,0,0.22)');
    S(P.navyLt, 5, (c) => { c.moveTo(56, 210); c.quadraticCurveTo(70, 150, 100, 130); });
    S(P.navyDk, 4, (c) => { c.moveTo(60, 236); c.quadraticCurveTo(90, 214, 110, 212); c.moveTo(196, 236); c.quadraticCurveTo(166, 214, 146, 212); });
  });
  // neck
  O(P.skinSh, (c) => { c.moveTo(108, 176); c.lineTo(148, 176); c.lineTo(152, 214); c.lineTo(104, 214); }, 3);
  // jacket shoulders: red panels with the cream tee in the open front
  const jacket = (c) => { c.moveTo(6, 262); c.quadraticCurveTo(14, 224, 60, 206); c.lineTo(104, 196); c.lineTo(128, 232); c.lineTo(152, 196); c.lineTo(196, 206); c.quadraticCurveTo(242, 224, 250, 262); };
  O(grad(ctx, 0, 0, 256, 0, [[0, P.redLt], [0.25, P.red], [0.75, P.red], [1, P.redDk]]), jacket, 3);
  O(P.cream, (c) => { c.moveTo(104, 196); c.lineTo(152, 196); c.lineTo(166, 262); c.lineTo(90, 262); }, 3);
  clipped(ctx, (c) => { c.moveTo(104, 196); c.lineTo(152, 196); c.lineTo(166, 262); c.lineTo(90, 262); }, (c) => rect(c, 140, 190, 40, 80, P.creamSh));
  S(P.zip, 4, (c) => { c.moveTo(104, 198); c.lineTo(90, 262); });
  S(P.zip, 4, (c) => { c.moveTo(152, 198); c.lineTo(166, 262); });
  S(P.zipSh, 1.5, (c) => { c.moveTo(108, 202); c.lineTo(95, 258); });
  // ribbed collar
  O(P.navy, (c) => { c.moveTo(72, 208); c.quadraticCurveTo(100, 186, 128, 232); c.quadraticCurveTo(156, 186, 184, 208); c.quadraticCurveTo(170, 214, 152, 196); c.lineTo(104, 196); c.quadraticCurveTo(86, 214, 72, 208); }, 3);
  // bag strap across the chest (his right shoulder -> his left hip): a flat webbing band with a slider
  O(P.bag, (c) => { c.moveTo(70, 204); c.lineTo(84, 198); c.lineTo(188, 256); c.lineTo(180, 268); }, 3);
  S(P.bagHi, 2, (c) => { c.moveTo(82, 202); c.lineTo(184, 259); });
  S(P.bagLt, 1.5, (c) => { c.moveTo(74, 208); c.lineTo(176, 265); });
  O(P.buckle, (c) => { c.moveTo(118, 220); c.lineTo(134, 216); c.lineTo(140, 232); c.lineTo(124, 236); }, 2.5);
  S(P.bag, 2, (c) => { c.moveTo(124, 226); c.lineTo(134, 223); });
  // ears
  O(P.skin, (c) => c.ellipse(66, 132, 12, 16, 0, 0, TAU), 3); O(P.skin, (c) => c.ellipse(190, 132, 12, 16, 0, 0, TAU), 3);
  S(P.skinSh, 3, (c) => { c.moveTo(64, 126); c.quadraticCurveTo(58, 134, 66, 140); }); S(P.skinSh, 3, (c) => { c.moveTo(192, 126); c.quadraticCurveTo(198, 134, 190, 140); });
  // hair dome behind the face
  const dome = (c) => { c.moveTo(56, 120); c.quadraticCurveTo(54, 30, 128, 30); c.quadraticCurveTo(202, 30, 200, 120); c.quadraticCurveTo(202, 150, 186, 158); c.lineTo(70, 158); c.quadraticCurveTo(54, 150, 56, 120); };
  O(P.hair, dome, 3);
  // face
  const face = (c) => { c.moveTo(70, 118); c.quadraticCurveTo(70, 172, 98, 190); c.quadraticCurveTo(128, 206, 158, 190); c.quadraticCurveTo(186, 172, 186, 118); c.quadraticCurveTo(184, 78, 128, 76); c.quadraticCurveTo(72, 78, 70, 118); };
  O(P.skin, face, 3);
  clipped(ctx, face, (c) => {
    rect(c, 60, 60, 140, 46, P.skinSh);
    ell(c, 128, 200, 56, 16, P.skinSh);
    rect(c, 166, 60, 30, 150, P.skinSh);
    ell(c, 104, 122, 22, 8, P.skinHi);
    const g = ctx.createRadialGradient(92, 158, 2, 92, 158, 22); g.addColorStop(0, 'rgba(230,90,80,0.35)'); g.addColorStop(1, 'rgba(230,90,80,0)');
    ell(c, 92, 158, 22, 12, g);
    const g2 = ctx.createRadialGradient(164, 158, 2, 164, 158, 22); g2.addColorStop(0, 'rgba(230,90,80,0.35)'); g2.addColorStop(1, 'rgba(230,90,80,0)');
    ell(c, 164, 158, 22, 12, g2);
  });
  // hair front: clean edge with sideburns, curl rim
  const front = (c) => { c.moveTo(56, 120); c.quadraticCurveTo(54, 30, 128, 30); c.quadraticCurveTo(202, 30, 200, 120); c.lineTo(196, 138); c.lineTo(182, 138); c.lineTo(182, 100); c.lineTo(74, 100); c.lineTo(74, 138); c.lineTo(60, 138); };
  O(P.hair, front, 3);
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI + (i / 14) * Math.PI;
    const x = 128 + Math.cos(a) * 74, y = 96 + Math.sin(a) * 66;
    O(P.hair, (c) => c.ellipse(x, y, 9, 9, 0, 0, TAU), 3);
  }
  O(P.hair, (c) => { c.moveTo(56, 120); c.quadraticCurveTo(54, 30, 128, 30); c.quadraticCurveTo(202, 30, 200, 120); c.lineTo(196, 138); c.lineTo(182, 138); c.lineTo(182, 100); c.lineTo(74, 100); c.lineTo(74, 138); c.lineTo(60, 138); }, 0);
  clipped(ctx, front, (c) => {
    rect(c, 166, 20, 50, 130, 'rgba(0,0,0,0.25)');
    for (let row = 0; row < 4; row++) for (let i = 0; i < 9; i++) {
      const x = 66 + i * 15.5 + (row % 2) * 8, y = 48 + row * 14;
      ell(c, x, y, 6, 6, P.hairHi); ell(c, x + 1, y + 1, 3, 3, P.hair);
    }
    S(P.hairHi, 7, (c) => c.arc(122, 78, 52, Math.PI * 1.15, Math.PI * 1.5));
    S('rgba(255,255,255,0.35)', 3, (c) => c.arc(122, 78, 52, Math.PI * 1.2, Math.PI * 1.42));
  });
  // brows
  S(P.hair, 6, (c) => { c.moveTo(84, 122); c.quadraticCurveTo(100, 112, 116, 118); });
  S(P.hair, 6, (c) => { c.moveTo(172, 122); c.quadraticCurveTo(156, 112, 140, 118); });
  // eyes
  const bigEye = (ex, ey, look) => {
    O(P.eyeW, (c) => c.ellipse(ex, ey, 17, 20, 0, 0, TAU), 2.5);
    const g = grad(ctx, 0, ey - 18, 0, ey + 20, [[0, P.pupil], [0.45, P.iris], [1, P.irisLt]]);
    ctx.beginPath(); ctx.ellipse(ex + look, ey + 3, 12.5, 15, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = P.pupil; ctx.lineWidth = 1.5; ctx.stroke();
    ell(ctx, ex + look, ey + 4, 5.5, 7.5, P.pupil);
    ell(ctx, ex + look, ey + 11, 6, 3, 'rgba(255,230,190,0.5)');
    ell(ctx, ex - 6 + look, ey - 5, 5.4, 5.8, '#FFFFFF');
    ell(ctx, ex + 6 + look, ey + 10, 2.8, 3, '#FFFFFF');
    O(P.line, (c) => {
      c.moveTo(ex - 18, ey - 4); c.quadraticCurveTo(ex - 8, ey - 27, ex + 10, ey - 25); c.quadraticCurveTo(ex + 18, ey - 23, ex + 21, ey - 10);
      c.quadraticCurveTo(ex + 14, ey - 20, ex, ey - 20); c.quadraticCurveTo(ex - 10, ey - 20, ex - 18, ey - 4);
    }, 1.5);
    S(P.line, 2.2, (c) => { c.moveTo(ex - 12, ey + 17); c.quadraticCurveTo(ex, ey + 22, ex + 12, ey + 17); });
  };
  bigEye(100, 146, 1); bigEye(156, 146, -1);
  // nose + confident smile
  S(P.skinDk, 3, (c) => { c.moveTo(126, 170); c.quadraticCurveTo(132, 174, 129, 178); });
  S(P.line, 3.5, (c) => { c.moveTo(112, 188); c.quadraticCurveTo(128, 200, 146, 184); });
  O('#FFFFFF', (c) => { c.moveTo(116, 189); c.quadraticCurveTo(128, 195, 142, 186); c.quadraticCurveTo(130, 191, 116, 189); }, 0);
  S(P.line, 2.5, (c) => { c.moveTo(146, 184); c.lineTo(150, 180); });
  ctx.restore();
}

// -------------------------------------------------------------- export
export default {
  id: 'chr_hacho',
  name: 'Hacho',
  role: 'npc',
  assetId: 'ast_starter_hacho',
  file: 'hacho.png',
  frameWidth: W,
  frameHeight: H,
  collider: { width: 24, height: 16, offsetX: 12, offsetY: 48 },
  walkFrameRate: 8,
  attackFrameRate: 12,
  portrait: { assetId: 'ast_starter_hacho_portrait', file: 'hacho_portrait.png', size: 256 },
  emotes: [
    { name: 'celebrate', frames: 3, frameRate: 6, loop: false },
    { name: 'map', frames: 1 },
    { name: 'point', frames: 1 },
    { name: 'phone', frames: 1 },
    { name: 'interact', frames: 2, frameRate: 4, loop: false },
  ],

  draw(ctx, f) {
    const p = pose(f);
    // ground shadow (not outlined)
    ell(ctx, 24 + (p.lean || 0) * 0.5, 61.6, 10.5 + (p.by < 0 ? 0.5 : 0), 2.6, P.shadow);

    const A = document.createElement('canvas'); A.width = W; A.height = H;
    const c = A.getContext('2d');
    if (f.dir === 'down') drawDown(c, p, f);
    else if (f.dir === 'up') drawUp(c, p, f);
    else if (f.dir === 'left') drawSide(c, p, f, true);
    else { c.save(); c.translate(W, 0); c.scale(-1, 1); drawSide(c, p, f, false); c.restore(); }
    crisp(A);
    ctx.drawImage(outlined(A, P.line), 0, 0);
  },

  drawPortrait,
};
