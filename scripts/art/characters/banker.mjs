/**
 * Mr. Juma — the bank manager NPC (Hacho).
 *
 * A tall, composed man: deep brown skin, short cropped black hair, thin gold-rimmed glasses,
 * a navy two-button suit over a white shirt with a red tie and a pocket square, dark trousers
 * and polished black shoes. He carries a clipboard in his left hand.
 * He has no weapon, so the "attack" rows are his signature gesture: push the glasses up the
 * nose (glint), raise the clipboard and point at it, then tap the line he means.
 *
 * Drawing approach (same as villager.mjs): paths into an offscreen canvas, alpha thresholded
 * to whole pixels, a 1 px dark outline grown around the silhouette. Deterministic (f.rand only).
 */

const W = 48;
const H = 64;
const TAU = Math.PI * 2;

const P = {
  line: '#16121C',
  skin: '#7C5034', skinSh: '#5F3A24', skinDk: '#40251A', skinHi: '#96654A',
  hair: '#1B1311', hairHi: '#3B2B27',
  eyeW: '#F7F3EC', iris: '#3A2214', pupil: '#120905',
  lens: 'rgba(190,225,250,0.38)', lensHi: 'rgba(255,255,255,0.85)',
  frame: '#D8B24A', frameDk: '#9C7A22',
  suit: '#24396A', suitDk: '#172A50', suitLt: '#35508C', suitHi: '#4B67A6',
  shirt: '#F5F5F8', shirtSh: '#CDD0DC',
  tie: '#C9262F', tieDk: '#8B141B', tieLt: '#E4555C',
  pants: '#1E2E55', pantsDk: '#141F3A',
  shoe: '#1A1519', shoeHi: '#3E3640',
  board: '#8C5A2E', boardDk: '#5F3A1B', paper: '#F9F7F0', paperLn: '#A9B0BE', clip: '#B9C0CA', clipDk: '#6F7783',
  mouth: '#5A2A24', teeth: '#F7F2EA',
  shadow: 'rgba(10,8,20,0.28)',
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
function pose(f) {
  if (f.anim === 'walk') {
    const s = [0, 1, 0, -1][f.index];
    return { s, by: f.index % 2 ? -1 : 0, act: -1, mood: 'idle', lag: f.index % 2 ? 1 : 0 };
  }
  // 0 push glasses up (glint), 1 raise clipboard + point, 2 tap the line (slight smile)
  return { s: 0, by: 0, act: f.index, mood: ['stern', 'idle', 'smile'][f.index], lag: 0 };
}

// ------------------------------------------------------------- shared bits
function sparkle(c, x, y, r, fill) {
  poly(c, [[x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]], fill);
}

function eye(c, ex, ey, mood, look = 0, rx = 1.8) {
  const narrow = mood === 'stern' ? 0.7 : 1;
  ell(c, ex, ey + 0.2, rx, 2.1 * narrow, P.eyeW);
  ell(c, ex + look * 0.4, ey + 0.5, 1.2, 1.5 * narrow, P.iris);
  ell(c, ex + look * 0.4, ey + 0.5, 0.6, 0.9 * narrow, P.pupil);
  rect(c, ex - 0.9 + look * 0.3, ey - 0.5, 0.8, 0.8, '#FFFFFF');
  stroke(c, P.line, 1.2, (c) => { c.moveTo(ex - rx - 0.4, ey - 0.6); c.quadraticCurveTo(ex + look * 0.3, ey - 2.6 * narrow, ex + rx + 0.4, ey - 0.8); });
}

/** Thin gold-rimmed rectangular glasses over both eyes (front view). glint: show a lens flash. */
function glassesFront(c, x, y, glint) {
  const lens = (lx) => {
    const r = (c) => { c.moveTo(lx - 3.2, y - 2.3); c.lineTo(lx + 3.2, y - 2.3); c.quadraticCurveTo(lx + 3.6, y - 2.3, lx + 3.6, y - 1.8); c.lineTo(lx + 3.2, y + 2.2); c.quadraticCurveTo(lx + 3, y + 2.6, lx + 2.6, y + 2.6); c.lineTo(lx - 2.6, y + 2.6); c.quadraticCurveTo(lx - 3, y + 2.6, lx - 3.2, y + 2.2); c.lineTo(lx - 3.6, y - 1.8); c.quadraticCurveTo(lx - 3.6, y - 2.3, lx - 3.2, y - 2.3); };
    path(c, P.lens, r);
    stroke(c, P.frame, 0.9, r);
    if (glint) stroke(c, P.lensHi, 1, (c) => { c.moveTo(lx - 2.2, y + 1.6); c.lineTo(lx + 1.4, y - 1.6); });
    else rect(c, lx - 2.6, y - 1.6, 1, 1, P.lensHi);
  };
  lens(x - 4.5); lens(x + 4.5);
  stroke(c, P.frameDk, 1, (c) => { c.moveTo(x - 1, y - 1); c.quadraticCurveTo(x, y - 2, x + 1, y - 1); });
  stroke(c, P.frameDk, 0.9, (c) => { c.moveTo(x - 8.1, y - 1.6); c.lineTo(x - 9.6, y - 1); });
  stroke(c, P.frameDk, 0.9, (c) => { c.moveTo(x + 8.1, y - 1.6); c.lineTo(x + 9.6, y - 1); });
}

function mouthFront(c, x, y, mood) {
  if (mood === 'smile') { stroke(c, P.line, 1.1, (c) => c.arc(x, y - 1.4, 2.2, Math.PI * 0.18, Math.PI * 0.82)); rect(c, x - 1.2, y + 0.2, 2.4, 0.8, P.teeth); return; }
  if (mood === 'stern') { stroke(c, P.line, 1.1, (c) => { c.moveTo(x - 2, y); c.lineTo(x + 2, y); }); return; }
  stroke(c, P.mouth, 1.1, (c) => { c.moveTo(x - 1.8, y); c.quadraticCurveTo(x, y + 0.8, x + 1.8, y); });
}

/** Clipboard: board with a paper and a spring clip. (x,y) top-left, 7x9. `rot` in radians. */
function clipboard(c, x, y, rot = 0) {
  c.save(); c.translate(x + 3.5, y + 4.5); c.rotate(rot); c.translate(-3.5, -4.5);
  rect(c, 0, 0, 7, 9, P.board);
  rect(c, 6, 0, 1, 9, P.boardDk); rect(c, 0, 8, 7, 1, P.boardDk);
  rect(c, 0.8, 1.2, 5.4, 7, P.paper);
  for (let i = 0; i < 3; i++) rect(c, 1.6, 3 + i * 1.6, 3.8 - (i === 2 ? 1.6 : 0), 0.7, P.paperLn);
  rect(c, 2, 0, 3, 2, P.clip);
  rect(c, 2, 1.4, 3, 0.6, P.clipDk);
  rect(c, 2.4, 0, 0.8, 0.8, '#FFFFFF');
  c.restore();
}

function hand(c, x, y, side = 1, opts = {}) {
  ell(c, x, y, 2.3, 2.4, P.skin);
  ell(c, x + side * 0.4, y + 1.2, 1.5, 0.9, P.skinSh);
  if (opts.point) {
    // index finger extended toward `point` direction (dx, dy)
    const [px, py] = opts.point;
    stroke(c, P.skin, 1.6, (c) => { c.moveTo(x, y); c.lineTo(x + px, y + py); });
  }
  if (opts.pinch) {
    // thumb and index pinching (glasses adjust)
    ell(c, x + opts.pinch[0], y + opts.pinch[1], 0.7, 1.2, P.skin, 0.4);
  }
}

/** Suit sleeve from shoulder to wrist, with a white shirt cuff. */
function sleeve(c, sx, sy, hx, hy, via, w = 4.6) {
  const seg = (c, dx, dy) => {
    c.moveTo(sx + dx, sy + dy);
    if (via) c.quadraticCurveTo(via[0] + dx, via[1] + dy, hx + dx, hy + dy);
    else c.lineTo(hx + dx, hy + dy);
  };
  stroke(c, P.suitDk, w, (c) => seg(c, 0.9, 0.8));
  stroke(c, P.suit, w, (c) => seg(c, 0, 0));
  // cuff: a short white band just before the hand
  const dx = hx - (via ? via[0] : sx), dy = hy - (via ? via[1] : sy), L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  stroke(c, P.shirt, w * 0.7, (c) => { c.moveTo(hx - ux * 1.9, hy - uy * 1.9); c.lineTo(hx - ux * 1.3, hy - uy * 1.3); });
}

// -------------------------------------------------------- front/back bodies
function shoeFB(c, x, y) {
  rect(c, x, y, 6, 3, P.shoe);
  rect(c, x + 1, y, 3, 1, P.shoeHi);
  rect(c, x, y + 3, 6, 1, P.line);
}
function legsFB(c, s, by) {
  const leg = (x, lift, side) => {
    const top = 49 + by, footY = 59 - lift;
    rect(c, x, top, 5, footY - top, P.pants);
    rect(c, x + (side > 0 ? 4 : 0), top, 1, footY - top, P.pantsDk);
    stroke(c, P.pantsDk, 0.7, (c) => { c.moveTo(x + 2.5, top + 1); c.lineTo(x + 2.5, footY - 1); });
    shoeFB(c, x - 0.5, footY);
  };
  leg(18, s < 0 ? 2 : 0, -1);
  leg(25, s > 0 ? 2 : 0, 1);
}

function jacketFB(c, back) {
  const shape = (c) => {
    c.moveTo(14, 32); c.lineTo(34, 32);
    c.quadraticCurveTo(36, 33, 35.5, 38);
    c.lineTo(34.5, 50.5); c.lineTo(13.5, 50.5); c.lineTo(12.5, 38);
    c.quadraticCurveTo(12, 33, 14, 32);
  };
  const g = grad(c, 12, 0, 36, 0, [[0, P.suitLt], [0.3, P.suit], [0.75, P.suit], [1, P.suitDk]]);
  path(c, g, shape);
  if (back) {
    stroke(c, P.suitDk, 0.9, (c) => { c.moveTo(24, 34); c.lineTo(24, 50); });
    stroke(c, P.suitDk, 0.8, (c) => { c.moveTo(16, 46); c.lineTo(15.5, 50); });
    stroke(c, P.suitDk, 0.8, (c) => { c.moveTo(32, 46); c.lineTo(32.5, 50); });
    // shirt collar peeking above the jacket
    poly(c, [[19.5, 30], [28.5, 30], [28, 32.6], [20, 32.6]], P.shirt);
    return;
  }
  // shirt V and tie
  poly(c, [[19.5, 32], [28.5, 32], [26, 42.5], [22, 42.5]], P.shirt);
  poly(c, [[19.5, 32], [22, 32], [24, 34.5]], P.shirtSh);
  poly(c, [[26, 32], [28.5, 32], [24, 34.5]], P.shirtSh);
  poly(c, [[22.9, 33.5], [25.1, 33.5], [25.6, 43.5], [24, 45], [22.4, 43.5]], P.tie);
  poly(c, [[24.6, 35], [25.1, 33.5], [25.6, 43.5], [24, 45]], P.tieDk);
  rect(c, 23.2, 33.4, 1.6, 1.4, P.tieLt);
  // lapels: darker navy folding over to the top button
  poly(c, [[14, 32], [21.5, 32], [24.5, 36], [22.6, 43], [19.5, 44.5], [15.5, 40]], P.suitDk);
  poly(c, [[34, 32], [26.5, 32], [23.5, 36], [25.4, 43], [28.5, 44.5], [32.5, 40]], P.suitDk);
  stroke(c, P.suitHi, 0.8, (c) => { c.moveTo(21.5, 32.3); c.lineTo(24.3, 36.2); });
  stroke(c, P.suitHi, 0.8, (c) => { c.moveTo(26.5, 32.3); c.lineTo(23.7, 36.2); });
  // jacket closure + buttons
  stroke(c, P.suitDk, 0.9, (c) => { c.moveTo(24, 44.5); c.lineTo(24, 50.5); });
  rect(c, 23.4, 45, 1.2, 1.2, P.frame); rect(c, 23.4, 48, 1.2, 1.2, P.frame);
  // pocket square (his left = viewer right)
  rect(c, 29, 37.5, 2.6, 1.2, P.shirt);
  poly(c, [[29, 37.5], [30, 36.4], [31.6, 37.5]], P.shirt);
}

/** Hanging arm for front/back. side -1 = viewer-left, +1 = viewer-right. sw = swing (-1..1). */
function armFB(c, side, sw, opts = {}) {
  const m = (x) => 24 - side * (x - 24);
  const o = -sw * 1.6;
  const ix = sw * 0.6;
  const sx = m(14.5), sy = 34, hx = m(12.4 + ix), hy = 48.6 + o;
  sleeve(c, sx, sy, hx, hy, null, 4.6);
  if (opts.clipboard) {
    // held at the side, its face turned out to the viewer; the hand grips its top edge
    clipboard(c, side > 0 ? m(12.4 + ix) - 3.5 : m(12.4 + ix) - 3.5, 47.5 + o, 0);
  }
  hand(c, hx, hy, side);
}

/** Gesture arm, front view. k: 0 glasses, 1 point, 2 tap. side -1 (his right, viewer-left) or +1. */
function actArmFB(c, k, side, f, opts = {}) {
  const m = (x) => 24 - side * (x - 24);
  const sx = m(14.5), sy = 34;
  if (opts.clipboard) {
    // the clipboard arm: hangs at k=0, holds the board up against the chest at k>=1
    if (k === 0) { armFB(c, side, 0, { clipboard: true }); return; }
    const hx = m(15.5), hy = 45.5;
    sleeve(c, sx, sy, hx, hy, [m(10.5), 44], 4.6);
    clipboard(c, m(15) - 3.5, 34.5, 0);
    hand(c, hx, hy, side);
    return;
  }
  if (k === 0) {
    // hand up to the glasses: elbow out, pinched fingers at the bridge
    const hx = m(19.2), hy = 20.4;
    sleeve(c, sx, sy, hx, hy + 1.6, [m(8.5), 30], 4.6);
    hand(c, hx, hy, side, { pinch: [side * -1.2, -1.6] });
    if (opts.glint) {
      const r = f.rand;
      sparkle(c, m(29) + r(), 15.5 + r() * 1.5, 1.7, '#FFFFFF');
    }
    return;
  }
  // pointing at the clipboard held on the other side of the chest
  const hx = m(22.5), hy = k === 1 ? 37.5 : 40.5;
  sleeve(c, sx, sy, hx, hy, [m(11.5), 44], 4.6);
  hand(c, hx, hy, side, { point: [side * -3.2, k === 1 ? 0.6 : 0.2] });
}

// ------------------------------------------------------------------ heads
function hairFront(c, lag) {
  // cropped hair: a low dome with a straight hairline and squared temples
  const dome = (c) => {
    c.moveTo(15.2, 20);
    c.lineTo(14.8, 12.5);
    c.quadraticCurveTo(15, 6.2, 24, 6.2);
    c.quadraticCurveTo(33, 6.2, 33.2, 12.5);
    c.lineTo(32.8, 20);
    c.lineTo(31.6, 20); c.lineTo(31.6, 13.2);
    c.quadraticCurveTo(28, 11.6, 24, 11.9);
    c.quadraticCurveTo(20, 11.6, 16.4, 13.2);
    c.lineTo(16.4, 20);
  };
  path(c, P.hair, dome);
  clipped(c, dome, (c) => {
    stroke(c, P.hairHi, 1.4, (c) => { c.moveTo(17, 10.5); c.quadraticCurveTo(24, 6.8, 30, 9.4); });
    rect(c, 29, 5, 6, 16, 'rgba(0,0,0,0.25)');
  });
  void lag;
}
function headFront(c, o) {
  const { dx = 0, mood = 'idle', lag = 0, glint = false } = o;
  c.save(); c.translate(dx, 0);
  ell(c, 15.4, 20.5, 1.6, 2.2, P.skin); ell(c, 32.6, 20.5, 1.6, 2.2, P.skin);
  const face = (c) => { c.moveTo(15.6, 14); c.quadraticCurveTo(15.2, 26, 20, 28.6); c.quadraticCurveTo(24, 30.4, 28, 28.6); c.quadraticCurveTo(32.8, 26, 32.4, 14); c.quadraticCurveTo(31, 9, 24, 9); c.quadraticCurveTo(17, 9, 15.6, 14); };
  path(c, P.skin, face);
  clipped(c, face, (c) => {
    rect(c, 14, 8, 20, 5, P.skinSh);
    ell(c, 24, 30, 8, 3, P.skinSh);
    ell(c, 20.5, 15.5, 3, 2, P.skinHi);
    // jaw shading + cheekbones
    rect(c, 29, 8, 5, 24, 'rgba(40,20,10,0.18)');
  });
  eye(c, 20, 19.5, mood, 0); eye(c, 28, 19.5, mood, 0);
  // brows: level, slightly raised on the glint frame
  const br = glint ? -0.6 : 0;
  stroke(c, P.hair, 1.1, (c) => { c.moveTo(17.2, 16.2 + br); c.quadraticCurveTo(20, 15 + br, 22.6, 16); });
  stroke(c, P.hair, 1.1, (c) => { c.moveTo(25.4, 16); c.quadraticCurveTo(28, 15 + br, 30.8, 16.2 + br); });
  // nose + moustache-free mouth
  stroke(c, P.skinDk, 1, (c) => { c.moveTo(23, 23.6); c.quadraticCurveTo(24, 24.6, 25, 23.6); });
  mouthFront(c, 24, 26.4, mood);
  glassesFront(c, 24, 19.6, glint);
  hairFront(c, lag);
  c.restore();
}

function headBack(c, o) {
  const { dx = 0 } = o;
  c.save(); c.translate(dx, 0);
  ell(c, 15.4, 20.5, 1.6, 2.2, P.skin); ell(c, 32.6, 20.5, 1.6, 2.2, P.skin);
  path(c, P.skinSh, (c) => { c.moveTo(15.6, 14); c.quadraticCurveTo(15.2, 26, 20, 28.6); c.quadraticCurveTo(24, 30.4, 28, 28.6); c.quadraticCurveTo(32.8, 26, 32.4, 14); c.quadraticCurveTo(31, 9, 24, 9); c.quadraticCurveTo(17, 9, 15.6, 14); });
  rect(c, 21, 27, 6, 5, P.skinSh);
  const dome = (c) => {
    c.moveTo(15.2, 22.5); c.lineTo(14.8, 12.5);
    c.quadraticCurveTo(15, 6.2, 24, 6.2);
    c.quadraticCurveTo(33, 6.2, 33.2, 12.5);
    c.lineTo(32.8, 22.5);
    c.quadraticCurveTo(24, 26.5, 15.2, 22.5);
  };
  path(c, P.hair, dome);
  clipped(c, dome, (c) => {
    stroke(c, P.hairHi, 1.4, (c) => { c.moveTo(17, 10.5); c.quadraticCurveTo(24, 6.8, 30, 9.4); });
    rect(c, 29, 5, 6, 24, 'rgba(0,0,0,0.25)');
  });
  // glasses arms hooked over the ears
  stroke(c, P.frameDk, 0.9, (c) => { c.moveTo(15.2, 19); c.lineTo(14.2, 19.6); });
  stroke(c, P.frameDk, 0.9, (c) => { c.moveTo(32.8, 19); c.lineTo(33.8, 19.6); });
  c.restore();
}

/** Facing left. Mirrored by the caller for right. */
function headSide(c, o) {
  const { dx = 0, mood = 'idle', glint = false } = o;
  c.save(); c.translate(dx, 0);
  const face = (c) => { c.moveTo(12.6, 14.5); c.quadraticCurveTo(11.6, 25, 17, 28.6); c.quadraticCurveTo(22, 30.6, 27, 28); c.quadraticCurveTo(31.4, 25, 30.8, 14); c.quadraticCurveTo(29.6, 9, 22, 9); c.quadraticCurveTo(14, 9, 12.6, 14.5); };
  path(c, P.skin, face);
  clipped(c, face, (c) => { rect(c, 10, 8, 24, 5, P.skinSh); ell(c, 22, 30, 8, 3, P.skinSh); ell(c, 16, 16, 3, 2, P.skinHi); rect(c, 26, 8, 8, 24, 'rgba(40,20,10,0.18)'); });
  // nose + lips in profile
  poly(c, [[12.4, 20.4], [10.4, 23], [12.6, 24.2]], P.skin);
  eye(c, 16.2, 19.8, mood, -1, 1.5);
  stroke(c, P.hair, 1.1, (c) => { c.moveTo(13.4, 16.4 + (glint ? -0.6 : 0)); c.quadraticCurveTo(16, 15.2, 19, 16.2); });
  if (mood === 'smile') stroke(c, P.line, 1.1, (c) => { c.moveTo(12.4, 26); c.quadraticCurveTo(13.6, 27.4, 15.2, 26.4); });
  else if (mood === 'stern') stroke(c, P.line, 1.1, (c) => { c.moveTo(12.4, 26.4); c.lineTo(14.8, 26.4); });
  else stroke(c, P.mouth, 1.1, (c) => { c.moveTo(12.4, 26.2); c.quadraticCurveTo(13.6, 27, 14.8, 26.4); });
  // glasses: one lens + the arm to the ear
  const lens = (c) => { c.moveTo(13.2, 17.8); c.lineTo(19.2, 17.8); c.lineTo(18.8, 21.6); c.lineTo(13.4, 21.6); };
  path(c, P.lens, lens);
  stroke(c, P.frame, 0.7, lens);
  if (glint) stroke(c, P.lensHi, 1, (c) => { c.moveTo(14.2, 21); c.lineTo(17.4, 18.4); }); else rect(c, 14.2, 18.4, 1, 1, P.lensHi);
  stroke(c, P.frameDk, 0.8, (c) => { c.moveTo(19.2, 18.4); c.lineTo(27.6, 19.2); });
  // ear
  ell(c, 27.6, 20.8, 1.7, 2.3, P.skin);
  ell(c, 27.8, 21, 0.8, 1.2, P.skinSh);
  // hair: dome with a squared nape
  const dome = (c) => {
    c.moveTo(11.6, 15); c.quadraticCurveTo(12, 6.2, 22, 6.2);
    c.quadraticCurveTo(32, 6, 32.4, 14); c.lineTo(32, 23); c.lineTo(29.5, 23.5);
    c.quadraticCurveTo(29.8, 15, 25.5, 12.4);
    c.quadraticCurveTo(19, 11.2, 13, 13.6);
  };
  path(c, P.hair, dome);
  clipped(c, dome, (c) => {
    stroke(c, P.hairHi, 1.4, (c) => { c.moveTo(14, 11); c.quadraticCurveTo(21, 6.8, 28, 9.2); });
    rect(c, 27, 5, 8, 24, 'rgba(0,0,0,0.25)');
  });
  c.restore();
}

// --------------------------------------------------------------- side body
function shoeSide(c, x, y, lifted) {
  const tilt = lifted ? 1 : 0;
  path(c, P.shoe, (c) => { c.moveTo(x - 6, y + 1.2 + tilt); c.quadraticCurveTo(x - 6.4, y - 0.2 + tilt, x - 4, y + tilt * 0.5); c.lineTo(x + 2.6, y); c.lineTo(x + 2.6, y + 3); c.lineTo(x - 6, y + 3 + tilt); });
  stroke(c, P.shoeHi, 0.8, (c) => { c.moveTo(x - 4, y + 0.8 + tilt * 0.6); c.lineTo(x + 1.4, y + 0.8); });
  poly(c, [[x - 6, y + 3 + tilt], [x + 2.6, y + 3], [x + 2.6, y + 4], [x - 6, y + 4 + tilt]], P.line);
}
function legsSide(c, s, by) {
  const leg = (x, lift, near) => {
    const top = 49 + by, footY = 59 - lift;
    rect(c, x - 2.5, top, 5, footY - top, near ? P.pants : P.pantsDk);
    if (near) stroke(c, P.pantsDk, 0.7, (c) => { c.moveTo(x, top + 1); c.lineTo(x, footY - 1); });
    shoeSide(c, x, footY, lift > 0);
  };
  leg(24 + 3 * s, s > 0 ? 2 : 0, false);
  leg(22 - 3 * s, s < 0 ? 2 : 0, true);
}
function jacketSide(c) {
  const shape = (c) => {
    c.moveTo(16, 32); c.lineTo(31, 32);
    c.quadraticCurveTo(33.6, 33, 33.4, 38);
    c.lineTo(33, 50.5); c.lineTo(15, 50.5); c.lineTo(14.6, 38);
    c.quadraticCurveTo(14.2, 33, 16, 32);
  };
  const g = grad(c, 14, 0, 34, 0, [[0, P.suitLt], [0.3, P.suit], [0.75, P.suit], [1, P.suitDk]]);
  path(c, g, shape);
  // shirt + tie visible at the front edge, lapel folding back
  poly(c, [[16, 32], [21.5, 32], [20.6, 41], [17.4, 40]], P.shirt);
  poly(c, [[18.2, 33], [20, 33], [19.8, 41], [18.4, 41]], P.tie);
  poly(c, [[19.2, 33.5], [20, 33], [19.8, 41], [19.2, 41]], P.tieDk);
  poly(c, [[20.6, 32], [23, 32], [21.2, 37], [21.4, 44], [18.6, 45.5], [16.2, 39]], P.suitDk);
  stroke(c, P.suitHi, 0.8, (c) => { c.moveTo(22.6, 32.4); c.lineTo(21.2, 37); });
  stroke(c, P.suitDk, 0.9, (c) => { c.moveTo(16.4, 44); c.lineTo(15.8, 50.5); });
  stroke(c, P.suitDk, 0.8, (c) => { c.moveTo(30, 34); c.lineTo(31, 50); });
  rect(c, 16.6, 45.6, 1.2, 1.2, P.frame);
}
function farArmSide(c, s, opts = {}) {
  // his far arm hangs behind the torso and swings opposite the near leg
  const fx = 29 - 2.2 * s;
  stroke(c, P.suitDk, 4.4, (c) => { c.moveTo(28, 35); c.lineTo(fx + 1, 47); });
  ell(c, fx + 1.2, 48.4, 1.9, 2.1, P.skinSh);
  if (opts.clipboard) clipboard(c, fx - 1.5, 46.5, 0);
}
function nearArmSide(c, s, opts = {}) {
  const hx = 22 + 2.6 * s;
  sleeve(c, 21.5, 34.5, hx, 48, null, 4.6);
  if (opts.clipboard) clipboard(c, hx - 3.5, 47.5, 0);
  hand(c, hx, 48.6, 1);
}
function actArmsSide(c, k, f) {
  if (k === 0) {
    // near hand to the glasses
    sleeve(c, 21.5, 34.5, 14.4, 21.4, [12.5, 34], 4.6);
    hand(c, 14, 19.6, -1, { pinch: [-1.2, -1.4] });
    const r = f.rand;
    sparkle(c, 8 + r() * 1.5, 15 + r() * 2, 1.7, '#FFFFFF');
    return;
  }
  // clipboard held up by the chest (the far hand grips its bottom edge), near hand points at it
  stroke(c, P.suitDk, 4.4, (c) => { c.moveTo(27, 35); c.lineTo(22, 44); c.lineTo(15, 46.5); });
  clipboard(c, 10.5, 34.5, 0);
  ell(c, 14.5, 45.5, 2.1, 2.2, P.skinSh);
  const hy = k === 1 ? 36.5 : 40;
  sleeve(c, 21.5, 34.5, 21.5, hy, [25, 44], 4.6);
  hand(c, 20.5, hy, -1, { point: [-3, k === 1 ? 1 : 0.4] });
}

// ---------------------------------------------------------------- frames
function drawDown(c, p, f) {
  const { s, by, act, mood, lag } = p;
  legsFB(c, s, by);
  c.save(); c.translate(0, by);
  rect(c, 21.5, 27, 5, 6, P.skinSh);
  jacketFB(c, false);
  if (act < 0) {
    armFB(c, 1, s, { clipboard: true });          // his left hand (viewer right) carries the clipboard
    armFB(c, -1, -s, {});
  } else {
    actArmFB(c, act, 1, f, { clipboard: true });
  }
  headFront(c, { mood, lag, glint: act === 0 });
  if (act >= 0) actArmFB(c, act, -1, f, { glint: act === 0 });
  c.restore();
}
function drawUp(c, p, f) {
  const { s, by, act, lag } = p;
  legsFB(c, -s, by);
  c.save(); c.translate(0, by);
  rect(c, 21.5, 27, 5, 6, P.skinSh);
  jacketFB(c, true);
  if (act < 0) {
    armFB(c, -1, s, { clipboard: true });         // his left arm is on the viewer's left from behind
    armFB(c, 1, -s, {});
  } else if (act === 0) {
    armFB(c, -1, 0, { clipboard: true });
    actArmFB(c, act, 1, f, {});
  } else {
    // both arms bent to the front: elbows poke out past the jacket
    for (const side of [-1, 1]) {
      const m = (x) => 24 - side * (x - 24);
      stroke(c, P.suitDk, 4.6, (c) => { c.moveTo(m(14.5) + 0.9, 34.8); c.lineTo(m(10.5) + 0.9, 43.8); c.lineTo(m(15) + 0.9, 46.8); });
      stroke(c, P.suit, 4.6, (c) => { c.moveTo(m(14.5), 34); c.lineTo(m(10.5), 43); c.lineTo(m(15), 46); });
    }
  }
  headBack(c, { lag });
  c.restore();
}
function drawSide(c, p, f, clipboardNear) {
  const { s, by, act, mood } = p;
  c.save(); c.translate(0, by);
  farArmSide(c, s, { clipboard: !clipboardNear && act < 0 });
  c.restore();
  legsSide(c, s, by);
  c.save(); c.translate(0, by);
  jacketSide(c);
  rect(c, 19, 27, 5.5, 6, P.skinSh);
  if (act < 0) nearArmSide(c, s, { clipboard: clipboardNear });
  headSide(c, { mood, glint: act === 0 });
  if (act >= 0) actArmsSide(c, act, f);
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
  const E = (x, y, rx, ry, fill, rot = 0, lw = 0) => O(fill, (c) => c.ellipse(x, y, rx, ry, rot, 0, TAU), lw);
  const S = (color, w, fn) => { ctx.beginPath(); fn(ctx); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke(); };

  // neck
  O(P.skinSh, (c) => { c.moveTo(106, 176); c.lineTo(150, 176); c.lineTo(154, 216); c.lineTo(102, 216); });
  // shirt collar + tie
  O(P.shirt, (c) => { c.moveTo(92, 206); c.lineTo(112, 200); c.lineTo(128, 236); c.lineTo(144, 200); c.lineTo(164, 206); c.lineTo(146, 262); c.lineTo(110, 262); });
  O(P.tie, (c) => { c.moveTo(120, 214); c.lineTo(136, 214); c.lineTo(140, 262); c.lineTo(116, 262); }, 3);
  O(P.tieDk, (c) => { c.moveTo(131, 218); c.lineTo(136, 214); c.lineTo(140, 262); c.lineTo(132, 262); }, 0);
  O(P.tieLt, (c) => { c.moveTo(121, 206); c.lineTo(135, 206); c.lineTo(136, 216); c.lineTo(120, 216); }, 3);
  // jacket shoulders + lapels
  const jg = grad(ctx, 0, 0, 256, 0, [[0, P.suitLt], [0.3, P.suit], [0.75, P.suit], [1, P.suitDk]]);
  O(jg, (c) => { c.moveTo(100, 198); c.quadraticCurveTo(50, 206, 24, 236); c.quadraticCurveTo(12, 248, 8, 262); c.lineTo(112, 262); c.lineTo(94, 224); });
  O(jg, (c) => { c.moveTo(156, 198); c.quadraticCurveTo(206, 206, 232, 236); c.quadraticCurveTo(244, 248, 248, 262); c.lineTo(144, 262); c.lineTo(162, 224); });
  O(P.suitDk, (c) => { c.moveTo(100, 198); c.lineTo(126, 244); c.lineTo(112, 262); c.lineTo(96, 236); c.lineTo(86, 214); });
  O(P.suitDk, (c) => { c.moveTo(156, 198); c.lineTo(130, 244); c.lineTo(144, 262); c.lineTo(160, 236); c.lineTo(170, 214); });
  S(P.suitHi, 2, (c) => { c.moveTo(102, 202); c.lineTo(124, 242); });
  S(P.suitHi, 2, (c) => { c.moveTo(154, 202); c.lineTo(132, 242); });
  O(P.shirt, (c) => { c.moveTo(196, 224); c.lineTo(212, 216); c.lineTo(226, 226); c.lineTo(224, 232); c.lineTo(198, 232); }, 2.5);
  // ears
  E(62, 132, 10, 14, P.skin, 0, 3); E(194, 132, 10, 14, P.skin, 0, 3);
  // face: longer, squarer jaw
  const face = (c) => {
    c.moveTo(66, 100);
    c.quadraticCurveTo(62, 176, 96, 200);
    c.quadraticCurveTo(128, 216, 160, 200);
    c.quadraticCurveTo(194, 176, 190, 100);
    c.quadraticCurveTo(186, 56, 128, 54);
    c.quadraticCurveTo(70, 56, 66, 100);
  };
  O(P.skin, face, 3);
  clipped(ctx, face, (c) => {
    rect(c, 56, 40, 144, 46, P.skinSh);
    ell(c, 128, 212, 56, 18, P.skinSh);
    ell(c, 98, 110, 20, 12, P.skinHi);
    rect(c, 166, 40, 40, 200, 'rgba(40,20,10,0.16)');
  });
  // eyes: calm, slightly narrowed behind the lenses
  const calmEye = (ex, ey, look) => {
    E(ex, ey, 14, 11, P.eyeW, 0, 2.5);
    ell(ctx, ex + look, ey + 2, 8.5, 9, P.iris);
    ell(ctx, ex + look, ey + 2.5, 4.2, 4.8, P.pupil);
    ell(ctx, ex - 4 + look, ey - 2, 3.4, 3.6, '#FFFFFF');
    O(P.line, (c) => {
      c.moveTo(ex - 16, ey - 2);
      c.quadraticCurveTo(ex - 6, ey - 18, ex + 10, ey - 16);
      c.quadraticCurveTo(ex + 16, ey - 14, ex + 17, ey - 6);
      c.quadraticCurveTo(ex + 10, ey - 12, ex, ey - 12);
      c.quadraticCurveTo(ex - 8, ey - 12, ex - 16, ey - 2);
    }, 1.5);
    S(P.line, 1.8, (c) => { c.moveTo(ex - 10, ey + 10); c.quadraticCurveTo(ex, ey + 13, ex + 10, ey + 10); });
  };
  calmEye(100, 136, 1); calmEye(156, 136, -1);
  S(P.hair, 4.5, (c) => { c.moveTo(80, 112); c.quadraticCurveTo(100, 104, 118, 110); });
  S(P.hair, 4.5, (c) => { c.moveTo(138, 110); c.quadraticCurveTo(156, 104, 176, 112); });
  // glasses
  const lens = (lx) => {
    const r = (c) => { c.moveTo(lx - 26, 118); c.lineTo(lx + 26, 118); c.quadraticCurveTo(lx + 30, 118, lx + 30, 124); c.lineTo(lx + 26, 154); c.quadraticCurveTo(lx + 24, 158, lx + 20, 158); c.lineTo(lx - 20, 158); c.quadraticCurveTo(lx - 24, 158, lx - 26, 154); c.lineTo(lx - 30, 124); c.quadraticCurveTo(lx - 30, 118, lx - 26, 118); };
    O(P.lens, r, 0);
    S(P.frameDk, 5, r); S(P.frame, 3, r);
    S('rgba(255,255,255,0.45)', 4, (c) => { c.moveTo(lx - 22, 152); c.lineTo(lx - 6, 124); });
    S('rgba(255,255,255,0.35)', 2.5, (c) => { c.moveTo(lx - 14, 154); c.lineTo(lx + 2, 130); });
  };
  lens(100); lens(156);
  S(P.frameDk, 4, (c) => { c.moveTo(126, 126); c.quadraticCurveTo(128, 122, 130, 126); });
  S(P.frameDk, 4, (c) => { c.moveTo(70, 122); c.lineTo(62, 126); });
  S(P.frameDk, 4, (c) => { c.moveTo(186, 122); c.lineTo(194, 126); });
  // nose + mouth
  S(P.skinDk, 3, (c) => { c.moveTo(120, 174); c.quadraticCurveTo(128, 180, 136, 174); });
  S(P.line, 3, (c) => { c.moveTo(108, 192); c.quadraticCurveTo(128, 204, 148, 192); });
  S(P.skinDk, 2, (c) => { c.moveTo(114, 200); c.quadraticCurveTo(128, 206, 142, 200); });
  // hair: cropped, straight hairline, squared temples
  const hair = (c) => {
    c.moveTo(64, 126); c.lineTo(62, 92);
    c.quadraticCurveTo(64, 34, 128, 32);
    c.quadraticCurveTo(192, 34, 194, 92);
    c.lineTo(192, 126); c.lineTo(180, 126); c.lineTo(180, 92);
    c.quadraticCurveTo(160, 80, 128, 82);
    c.quadraticCurveTo(96, 80, 76, 92);
    c.lineTo(76, 126);
  };
  O(P.hair, hair, 3);
  clipped(ctx, hair, (c) => {
    S(P.hairHi, 8, (c) => { c.moveTo(80, 64); c.quadraticCurveTo(128, 40, 174, 58); });
    rect(c, 168, 20, 40, 120, 'rgba(0,0,0,0.25)');
  });
  ctx.restore();
}

// -------------------------------------------------------------- export
export default {
  id: 'chr_banker',
  name: 'Mr. Juma',
  role: 'npc',
  assetId: 'ast_starter_banker',
  file: 'banker.png',
  frameWidth: W,
  frameHeight: H,
  collider: { width: 24, height: 16, offsetX: 12, offsetY: 48 },
  walkFrameRate: 8,
  attackFrameRate: 10,
  portrait: { assetId: 'ast_starter_banker_portrait', file: 'banker_portrait.png', size: 256 },

  draw(ctx, f) {
    const p = pose(f);
    ell(ctx, 24, 61.6, 10.5 + (p.by ? 0.5 : 0), 2.6, P.shadow);
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
