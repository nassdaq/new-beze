/**
 * Baraka — the football kid NPC (Hacho).
 *
 * A small boy, about 44 px tall inside the 48x64 frame: big head with tight black curls,
 * brown skin, a huge toothy grin, a green football shirt with white trim (number 7 on the back),
 * white shorts, thin legs and rubber sandals. He carries a black-and-white football under his
 * right arm. He has no weapon, so the "attack" rows are a kick: wind-up with the ball at his
 * feet, the strike (ball launched with speed lines), and the follow-through with the leg high.
 *
 * Drawing approach (same as villager.mjs): paths into an offscreen canvas, alpha thresholded
 * to whole pixels, a 1 px dark outline grown around the silhouette. Deterministic (f.rand only).
 */

const W = 48;
const H = 64;
const TAU = Math.PI * 2;

const P = {
  line: '#22160F',
  skin: '#8E5C3B', skinSh: '#6E4327', skinDk: '#4C2B18', skinHi: '#AA7452',
  hair: '#1A100C', hairHi: '#3E2A22',
  eyeW: '#FFFFFF', iris: '#3E2414', irisLt: '#6B3F22', pupil: '#120805',
  blush: 'rgba(220,100,80,0.4)',
  mouthIn: '#5A1E1A', teeth: '#FFFCF5', tongue: '#DE6A62',
  shirt: '#2E9E4A', shirtDk: '#1E6E33', shirtLt: '#5FC672', trim: '#F6F6EE', trimSh: '#CFD3C6', number: '#F6E24A',
  shorts: '#F4F4EE', shortsSh: '#C9CBC0', shortsDk: '#A9AB9F',
  sandal: '#2C6FCF', sandalLt: '#6FA3EA', strap: '#1D4A8C',
  ball: '#F7F7F2', ballSh: '#C9CBC6', ballDk: '#1F2024', ballHi: '#FFFFFF',
  speed: 'rgba(255,255,255,0.85)',
  shadow: 'rgba(20,10,10,0.28)',
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
    return { s, by: f.index % 2 ? -1 : 0, kick: -1, mood: 'grin', lag: f.index % 2 ? 1 : 0 };
  }
  // kick: 0 wind-up (ball at the feet), 1 strike (ball launched), 2 follow-through
  return { s: 0, by: [0, -1, 0][f.index], kick: f.index, mood: ['focus', 'shout', 'grin'][f.index], lag: 0 };
}

// ------------------------------------------------------------- shared bits
function eye(c, ex, ey, mood, look = 0, rx = 2.4) {
  if (mood === 'shout') {
    // wide open, brows up
    ell(c, ex, ey, rx, 3.2, P.eyeW);
    ell(c, ex + look * 0.4, ey + 0.6, 1.7, 2.3, P.iris);
    ell(c, ex + look * 0.4, ey + 0.5, 0.9, 1.3, P.pupil);
    rect(c, ex - 1.4 + look * 0.3, ey - 1.6, 1.2, 1.2, '#FFFFFF');
    stroke(c, P.line, 1.4, (c) => { c.moveTo(ex - rx - 0.3, ey - 1.6); c.quadraticCurveTo(ex + look * 0.3, ey - 5, ex + rx + 0.3, ey - 1.8); });
    return;
  }
  const n = mood === 'focus' ? 0.75 : 1;
  ell(c, ex, ey, rx, 3 * n, P.eyeW);
  const g = grad(c, 0, ey - 2.6, 0, ey + 2.8, [[0, P.iris], [1, P.irisLt]]);
  ell(c, ex + look * 0.4, ey + 0.5, 1.8, 2.4 * n, g);
  ell(c, ex + look * 0.4, ey + 0.4, 0.9, 1.4 * n, P.pupil);
  rect(c, ex - 1.5 + look * 0.3, ey - 1.5 * n, 1.2, 1.2, '#FFFFFF');
  rect(c, ex + 0.6, ey + 1.4 * n, 0.8, 0.8, '#FFFFFF');
  stroke(c, P.line, 1.4, (c) => { c.moveTo(ex - rx - 0.3, ey - 1.2 * n); c.quadraticCurveTo(ex + look * 0.3, ey - 4.4 * n, ex + rx + 0.3, ey - 1.4 * n); });
  if (mood === 'focus') stroke(c, P.line, 1.1, (c) => { c.moveTo(ex - rx, ey - 3.2); c.lineTo(ex + rx, ey - 2.2); });
}

function mouth(c, x, y, mood) {
  if (mood === 'shout') {
    ell(c, x, y + 0.6, 2, 2.2, P.mouthIn);
    rect(c, x - 1.4, y - 1.4, 2.8, 1, P.teeth);
    ell(c, x, y + 1.8, 1.1, 0.7, P.tongue);
    return;
  }
  if (mood === 'focus') { stroke(c, P.line, 1.1, (c) => { c.moveTo(x - 1.6, y + 0.2); c.lineTo(x + 1.6, y); }); return; }
  // the big grin: a wide open smile full of teeth
  const g = (c) => { c.moveTo(x - 3.8, y - 1); c.quadraticCurveTo(x, y + 0.2, x + 3.8, y - 1); c.quadraticCurveTo(x + 2.6, y + 3.2, x, y + 3.4); c.quadraticCurveTo(x - 2.6, y + 3.2, x - 3.8, y - 1); };
  path(c, P.mouthIn, g);
  clipped(c, g, (c) => {
    rect(c, x - 4, y - 1.5, 8, 2.2, P.teeth);
    stroke(c, P.trimSh, 0.5, (c) => { c.moveTo(x - 1.2, y - 1.4); c.lineTo(x - 1.2, y + 0.6); c.moveTo(x + 1.2, y - 1.4); c.lineTo(x + 1.2, y + 0.6); });
    ell(c, x, y + 3, 1.6, 0.9, P.tongue);
  });
}

function speedLines(c, x, y, dx, dy, r) {
  // three short streaks trailing the ball opposite its motion
  for (const o of [-1, 0, 1]) {
    const nx = -dy * o * 1.6, ny = dx * o * 1.6;
    const len = o === 0 ? 5 : 3.5;
    stroke(c, P.speed, 1, (c) => { c.moveTo(x - dx * (r + 1.5) + nx, y - dy * (r + 1.5) + ny); c.lineTo(x - dx * (r + 1.5 + len) + nx, y - dy * (r + 1.5 + len) + ny); });
  }
}

/** Classic black-and-white football, radius r, centred at (x,y). */
function football(c, x, y, r, rand) {
  ell(c, x, y, r, r, P.ball);
  clipped(c, (c) => c.ellipse(x, y, r, r, 0, 0, TAU), (c) => {
    ell(c, x + r * 0.3, y + r * 0.35, r, r, P.ballSh);
    ell(c, x - r * 0.15, y - r * 0.15, r * 0.75, r * 0.75, P.ball);
    // central pentagon + four around it
    const pent = (cx, cy, s, rot) => {
      const pts = []; for (let i = 0; i < 5; i++) { const a = rot + (i / 5) * TAU; pts.push([cx + Math.cos(a) * s, cy + Math.sin(a) * s]); }
      poly(c, pts, P.ballDk);
    };
    pent(x, y - r * 0.1, r * 0.4, -Math.PI / 2);
    pent(x - r * 0.85, y - r * 0.55, r * 0.38, 0.3);
    pent(x + r * 0.85, y - r * 0.55, r * 0.38, -0.3);
    pent(x - r * 0.6, y + r * 0.8, r * 0.38, 0.9);
    pent(x + r * 0.6, y + r * 0.8, r * 0.38, -0.9);
    ell(c, x - r * 0.42, y - r * 0.5, r * 0.22, r * 0.16, P.ballHi, -0.6);
  });
  void rand;
}

// -------------------------------------------------------- front/back bodies
function sandalFB(c, x, y) {
  rect(c, x, y, 5, 2, P.skin);
  rect(c, x + 4, y, 1, 2, P.skinSh);
  rect(c, x + 2, y, 1, 1, P.strap); rect(c, x + 1, y + 1, 1, 1, P.strap); rect(c, x + 3, y + 1, 1, 1, P.strap);
  rect(c, x, y + 2, 5, 1, P.sandalLt);
  rect(c, x, y + 3, 5, 1, P.sandal);
}
function legFB(c, x, top, footY, side) {
  rect(c, x, top, 4, footY - top, P.skin);
  rect(c, x + (side > 0 ? 3 : 0), top, 1, footY - top, P.skinSh);
  sandalFB(c, x - 0.5, footY);
}
function legsFB(c, s, by) {
  legFB(c, 19.5, 52 + by, 59 - (s < 0 ? 2 : 0), -1);
  legFB(c, 24.5, 52 + by, 59 - (s > 0 ? 2 : 0), 1);
}

function shirtFB(c, back) {
  const shape = (c) => {
    c.moveTo(17.5, 39); c.lineTo(30.5, 39);
    c.quadraticCurveTo(32, 40, 32, 43);
    c.lineTo(31.5, 50.5); c.lineTo(16.5, 50.5); c.lineTo(16, 43);
    c.quadraticCurveTo(16, 40, 17.5, 39);
  };
  const g = grad(c, 16, 0, 32, 0, [[0, P.shirtLt], [0.3, P.shirt], [0.75, P.shirt], [1, P.shirtDk]]);
  path(c, g, shape);
  clipped(c, shape, (c) => {
    // side panels + hem
    rect(c, 16, 39, 1.6, 12, P.trim); rect(c, 30.4, 39, 1.6, 12, P.trim);
    rect(c, 16, 49.6, 16, 1, P.trimSh);
    if (back) {
      // number 7
      rect(c, 21.5, 41.5, 5, 1.4, P.number);
      poly(c, [[25.2, 41.5], [26.5, 41.5], [24, 48], [22.7, 48]], P.number);
    } else {
      // little club crest
      poly(c, [[19.5, 41.5], [22.5, 41.5], [22.5, 43.5], [21, 44.8], [19.5, 43.5]], P.trim);
      rect(c, 20.3, 42.2, 1.4, 1.4, P.number);
    }
  });
  // collar
  if (back) rect(c, 20.5, 38.5, 7, 1.2, P.trim);
  else { poly(c, [[20, 39], [24, 39], [24, 41.6]], P.trim); poly(c, [[24, 39], [28, 39], [24, 41.6]], P.trimSh); }
  // shorts
  const sh = (c) => { c.moveTo(17, 50); c.lineTo(31, 50); c.lineTo(31.5, 54.5); c.lineTo(24.6, 54.5); c.lineTo(24, 53.4); c.lineTo(23.4, 54.5); c.lineTo(16.5, 54.5); };
  path(c, P.shorts, sh);
  clipped(c, sh, (c) => { rect(c, 27, 50, 5, 5, P.shortsSh); rect(c, 16, 53.6, 16, 1, P.shortsSh); rect(c, 17, 50, 14, 0.9, P.shortsDk); });
}

/** Short sleeve at the shoulder. */
function sleeveFB(c, x, y, side) {
  path(c, P.shirt, (c) => { c.moveTo(x - side * 1.5, y - 1); c.quadraticCurveTo(x + side * 2.6, y - 1.4, x + side * 3.4, y + 1.6); c.lineTo(x + side * 2.8, y + 4.6); c.lineTo(x - side * 1.5, y + 4.2); });
  poly(c, [[x + side * 1.2, y + 2.4], [x + side * 2.8, y + 1.4], [x + side * 2.8, y + 4.6], [x + side * 1.2, y + 4.2]], P.shirtDk);
  stroke(c, P.trim, 1, (c) => { c.moveTo(x + side * 3.4, y + 1.8); c.lineTo(x + side * 2.8, y + 4.8); });
}
function armSeg(c, sx, sy, hx, hy, via, w = 3.4, shade = false) {
  const seg = (c, dx, dy) => { c.moveTo(sx + dx, sy + dy); if (via) c.quadraticCurveTo(via[0] + dx, via[1] + dy, hx + dx, hy + dy); else c.lineTo(hx + dx, hy + dy); };
  stroke(c, P.skinSh, w, (c) => seg(c, 0.7, 0.7));
  stroke(c, shade ? P.skinSh : P.skin, w, (c) => seg(c, 0, 0));
}
function hand(c, x, y, side = 1) {
  ell(c, x, y, 1.8, 2, P.skin);
  ell(c, x + side * 0.3, y + 1, 1.2, 0.7, P.skinSh);
}

/** Arms out for balance during the kick: elbows out, forearms angled down and back up. */
function balanceArms(c, kick) {
  const lift = kick === 1 ? 2.5 : kick === 2 ? 1 : 0;
  for (const side of [-1, 1]) {
    const m = (x) => 24 - side * (x - 24);
    armSeg(c, m(17.5), 41, m(10.5), 43.5 - lift, [m(12.5), 46.5 - lift * 0.5], 3.4);
    hand(c, m(10.2), 43 - lift, side);
    sleeveFB(c, m(18), 40, -side);
  }
}

/** Hanging/swinging arm for front/back. side -1 = viewer-left, +1 = viewer-right. */
function armFB(c, side, sw, opts = {}) {
  const m = (x) => 24 - side * (x - 24);
  const o = -sw * 1.4, ix = sw * 0.6;
  if (opts.ball) {
    // arm wraps over the ball tucked against the hip
    const bx = m(12.6), byy = 46.8;
    football(c, bx, byy, 4.6, opts.rand);
    armSeg(c, m(17.5), 41, m(14.2), 45.4, [m(12), 41], 3.4);
    hand(c, m(14.6), 46.8, side);
  } else {
    armSeg(c, m(17.5), 41, m(14.4 + ix), 50.2 + o, null, 3.4);
    hand(c, m(14.4 + ix), 50.6 + o, side);
  }
  sleeveFB(c, m(18), 40, -side);
}

// ------------------------------------------------------------------ heads
function curlsFront(c, lag, back = false) {
  // tight curls: a dome with a bobbly edge
  const dome = (c) => {
    c.moveTo(14.6, 27);
    c.quadraticCurveTo(13.6, 17.6, 24, 17.6);
    c.quadraticCurveTo(34.4, 17.6, 33.4, 27);
    if (back) { c.quadraticCurveTo(33, 33 + lag * 0.5, 24, 34 + lag * 0.5); c.quadraticCurveTo(15, 33 + lag * 0.5, 14.6, 27); }
    else c.quadraticCurveTo(24, 24.6 + lag * 0.4, 14.6, 27);
  };
  path(c, P.hair, dome);
  for (const [x, y] of [[15.2, 21.4], [17, 19.2], [20.4, 18], [24, 17.4], [27.6, 18], [31, 19.2], [32.8, 21.4], [34, 25], [14, 25]]) ell(c, x, y, 1.6, 1.5, P.hair);
  if (!back) for (const [x, y, r] of [[15.6, 27.2, 1.6], [18.6, 26.8, 2], [22, 26.4, 2.1], [26, 26.6, 2], [29.6, 26.8, 2], [32.6, 27.2, 1.5]]) ell(c, x, y + lag * 0.3, r, r * 0.85, P.hair);
  clipped(c, dome, (c) => {
    stroke(c, P.hairHi, 1.3, (c) => { c.moveTo(17, 22); c.quadraticCurveTo(23, 18.4, 29, 20.4); });
    rect(c, 30, 15, 6, 22, 'rgba(0,0,0,0.25)');
  });
  for (const [x, y] of [[18.5, 20.4], [22, 19.4], [26.6, 19.8]]) ell(c, x, y, 0.9, 0.7, P.hairHi);
}
function headFront(c, o) {
  const { dx = 0, mood = 'grin', lag = 0 } = o;
  c.save(); c.translate(dx, 0);
  ell(c, 15, 31, 1.6, 2.1, P.skin); ell(c, 33, 31, 1.6, 2.1, P.skin);
  const face = (c) => c.ellipse(24, 29.5, 9, 8.4, 0, 0, TAU);
  path(c, P.skin, face);
  clipped(c, face, (c) => {
    rect(c, 14, 18, 20, 8.5, P.skinSh);
    ell(c, 24, 39, 8.6, 2.8, P.skinSh);
    ell(c, 20, 27.5, 3.2, 2.2, P.skinHi);
  });
  eye(c, 19.8, 31, mood, 0); eye(c, 28.2, 31, mood, 0);
  const brow = mood === 'shout' ? -1.2 : mood === 'focus' ? 0.6 : 0;
  stroke(c, P.hair, 1, (c) => { c.moveTo(17, 27.2 + brow); c.quadraticCurveTo(19.6, 26 + brow * 0.5, 22.4, 27); });
  stroke(c, P.hair, 1, (c) => { c.moveTo(25.6, 27); c.quadraticCurveTo(28.4, 26 + brow * 0.5, 31, 27.2 + brow); });
  ell(c, 17.2, 34.4, 1.9, 1.1, P.blush); ell(c, 30.8, 34.4, 1.9, 1.1, P.blush);
  rect(c, 23.6, 33.4, 1, 0.9, P.skinDk);
  mouth(c, 24, 36, mood);
  curlsFront(c, lag);
  c.restore();
}
function headBack(c, o) {
  const { dx = 0, lag = 0 } = o;
  c.save(); c.translate(dx, 0);
  ell(c, 15, 31, 1.6, 2.1, P.skin); ell(c, 33, 31, 1.6, 2.1, P.skin);
  path(c, P.skinSh, (c) => c.ellipse(24, 29.5, 9, 8.4, 0, 0, TAU));
  rect(c, 21, 36, 6, 4, P.skinSh);
  curlsFront(c, lag, true);
  c.restore();
}
/** Facing left. Mirrored by the caller for right. */
function headSide(c, o) {
  const { dx = 0, mood = 'grin', lag = 0 } = o;
  c.save(); c.translate(dx, 0);
  const face = (c) => c.ellipse(21, 30, 8.8, 8.2, 0, 0, TAU);
  path(c, P.skin, face);
  clipped(c, face, (c) => { rect(c, 10, 18, 22, 8.5, P.skinSh); ell(c, 21.5, 39.5, 8, 2.8, P.skinSh); ell(c, 15.5, 28, 3, 2.2, P.skinHi); });
  poly(c, [[12.6, 31], [10.8, 33], [12.8, 34.2]], P.skin);
  eye(c, 16.4, 31.2, mood, -1, 2);
  const brow = mood === 'shout' ? -1.2 : mood === 'focus' ? 0.6 : 0;
  stroke(c, P.hair, 1, (c) => { c.moveTo(13.8, 27.6 + brow); c.quadraticCurveTo(16.4, 26.2 + brow * 0.5, 19.2, 27.2); });
  ell(c, 14.8, 34.8, 1.8, 1.1, P.blush);
  if (mood === 'shout') { ell(c, 13.2, 36.6, 1.6, 1.8, P.mouthIn); rect(c, 12, 35.4, 2.4, 0.9, P.teeth); }
  else if (mood === 'focus') stroke(c, P.line, 1.1, (c) => { c.moveTo(12.2, 36.4); c.lineTo(14.6, 36.2); });
  else {
    const g = (c) => { c.moveTo(11.6, 35); c.quadraticCurveTo(14, 35.6, 17, 34.6); c.quadraticCurveTo(16.4, 38, 13.4, 38.2); c.quadraticCurveTo(12, 37.6, 11.6, 35); };
    path(c, P.mouthIn, g);
    clipped(c, g, (c) => { rect(c, 11, 34.4, 7, 1.8, P.teeth); ell(c, 14, 38, 1.4, 0.8, P.tongue); });
  }
  ell(c, 27.4, 31.4, 1.7, 2.2, P.skin); ell(c, 27.6, 31.6, 0.8, 1.1, P.skinSh);
  const dome = (c) => {
    c.moveTo(11.8, 27.5); c.quadraticCurveTo(11, 17.6, 22, 17.6);
    c.quadraticCurveTo(33.6, 17.2, 34, 27); c.quadraticCurveTo(34.4, 33 + lag * 0.5, 30, 34.5 + lag * 0.5);
    c.quadraticCurveTo(29.2, 28.4, 26.4, 26.6); c.quadraticCurveTo(19, 24.4 + lag * 0.4, 11.8, 27.5);
  };
  path(c, P.hair, dome);
  for (const [x, y] of [[12.6, 22], [14.6, 19.4], [18, 18], [22, 17.4], [26, 17.8], [30, 19.2], [33, 22], [34.4, 26], [33.4, 30.5], [31, 34 + lag * 0.5]]) ell(c, x, y, 1.6, 1.5, P.hair);
  for (const [x, y, r] of [[12.6, 28, 1.6], [15.6, 27.6, 2], [19, 27, 2.1], [22.6, 27, 2], [26, 27.6, 1.8]]) ell(c, x, y + lag * 0.3, r, r * 0.85, P.hair);
  clipped(c, dome, (c) => {
    stroke(c, P.hairHi, 1.3, (c) => { c.moveTo(15, 22.4); c.quadraticCurveTo(21, 18.4, 28, 20.6); });
    rect(c, 28, 15, 8, 24, 'rgba(0,0,0,0.25)');
  });
  for (const [x, y] of [[16.5, 20.8], [20.4, 19.6], [25, 20]]) ell(c, x, y, 0.9, 0.7, P.hairHi);
  c.restore();
}

// --------------------------------------------------------------- side body
function sandalSide(c, x, y, lifted, tilt = 0) {
  const t = lifted ? 1 : 0;
  c.save(); c.translate(x, y); c.rotate(tilt); c.translate(-x, -y);
  path(c, P.skin, (c) => { c.moveTo(x - 4.2, y + 1.2 + t); c.quadraticCurveTo(x - 3.8, y - 0.6 + t, x - 1.8, y + t * 0.5); c.lineTo(x + 2.2, y); c.lineTo(x + 2.2, y + 2); c.lineTo(x - 4.2, y + 2 + t); });
  rect(c, x - 1, y + t * 0.3, 1, 2, P.strap);
  poly(c, [[x - 4.2, y + 2 + t], [x + 2.2, y + 2], [x + 2.2, y + 3], [x - 4.2, y + 3 + t]], P.sandalLt);
  poly(c, [[x - 4.2, y + 3 + t], [x + 2.2, y + 3], [x + 2.2, y + 4], [x - 4.2, y + 4 + t]], P.sandal);
  c.restore();
}
function legSideTo(c, hx, hy, fx, fy, near, tilt = 0) {
  // hip (hx,hy) to ankle (fx,fy); the sandal hangs below the ankle
  stroke(c, P.skinSh, 4.2, (c) => { c.moveTo(hx + 0.6, hy + 0.6); c.lineTo(fx + 0.6, fy + 0.6); });
  stroke(c, near ? P.skin : P.skinSh, 4.2, (c) => { c.moveTo(hx, hy); c.lineTo(fx, fy); });
  sandalSide(c, fx, fy, fy < 59, tilt);
}
function legsSide(c, s, by) {
  const top = 52 + by;
  legSideTo(c, 25, top, 24 + 3 * s, 59 - (s > 0 ? 2 : 0), false);
  legSideTo(c, 22, top, 22 - 3 * s, 59 - (s < 0 ? 2 : 0), true);
}
function shirtSide(c) {
  const shape = (c) => {
    c.moveTo(18, 39); c.lineTo(30, 39);
    c.quadraticCurveTo(32, 40, 31.8, 43); c.lineTo(31.4, 50.5); c.lineTo(16.6, 50.5); c.lineTo(16.2, 43);
    c.quadraticCurveTo(16, 40, 18, 39);
  };
  const g = grad(c, 16, 0, 32, 0, [[0, P.shirtLt], [0.3, P.shirt], [0.75, P.shirt], [1, P.shirtDk]]);
  path(c, g, shape);
  clipped(c, shape, (c) => { rect(c, 22, 39, 1.6, 12, P.trim); rect(c, 16, 49.6, 16, 1, P.trimSh); });
  rect(c, 18.5, 38.5, 9, 1.2, P.trim);
  const sh = (c) => { c.moveTo(17, 50); c.lineTo(31, 50); c.lineTo(31.6, 54.5); c.lineTo(16.6, 54.5); };
  path(c, P.shorts, sh);
  clipped(c, sh, (c) => { rect(c, 27, 50, 5, 5, P.shortsSh); rect(c, 16, 53.6, 16, 1, P.shortsSh); rect(c, 17, 50, 14, 0.9, P.shortsDk); });
}
function farArmSide(c, s, opts = {}) {
  const fx = 29 - 2 * s;
  if (opts.ball) {
    football(c, 30.5, 47, 4.4, opts.rand);
    armSeg(c, 27.5, 41, 29.5, 46.5, [32, 41.5], 3.4, true);
    ell(c, 29.6, 47.6, 1.8, 2, P.skinSh);
    return;
  }
  armSeg(c, 27.5, 41, fx + 1, 49.6, null, 3.4, true);
  ell(c, fx + 1.2, 50, 1.8, 2, P.skinSh);
}
function nearArmSide(c, s, opts = {}) {
  const hx = 22 + 2.4 * s;
  if (opts.pose) {
    const [px, py, via] = opts.pose;
    armSeg(c, 20.5, 41, px, py, via, 3.4);
    hand(c, px, py + 0.4, -1);
  } else {
    armSeg(c, 20.5, 41, hx, 50, null, 3.4);
    hand(c, hx, 50.4, -1);
  }
  sleeveFB(c, 21, 40, -1);
}

// ---------------------------------------------------------------- frames
function drawDown(c, p, f) {
  const { s, by, kick, mood, lag } = p;
  if (kick < 0) {
    legsFB(c, s, by);
  } else if (kick === 0) {
    // wind-up: right leg (viewer left) drawn back and up; the ball waits in front of the left foot
    legFB(c, 24.5, 52 + by, 59, 1);
    legFB(c, 18.5, 52 + by, 55.5, -1);
  } else if (kick === 1) {
    // strike: the kicking leg swings toward the camera (foreshortened, sole showing)
    legFB(c, 24.5, 52 + by, 59, 1);
    rect(c, 19, 52 + by, 4, 4, P.skin);
    ell(c, 20.5, 57.5, 3.2, 2.6, P.sandal);
    ell(c, 20.5, 57.2, 2.4, 1.9, P.sandalLt);
    rect(c, 19.8, 56.6, 1.4, 0.8, P.strap);
  } else {
    // follow-through: the leg high, sole toward the camera
    legFB(c, 24.5, 52 + by, 59, 1);
    rect(c, 19, 52 + by, 4, 2, P.skin);
    ell(c, 19.6, 54, 3.4, 2.8, P.sandal);
    ell(c, 19.6, 53.6, 2.6, 2, P.sandalLt);
    rect(c, 18.8, 53, 1.4, 0.8, P.strap);
  }
  c.save(); c.translate(0, by);
  shirtFB(c, false);
  if (kick < 0) {
    armFB(c, -1, -s, { ball: true, rand: f.rand });    // his right arm (viewer left) carries the ball
    armFB(c, 1, s, {});
  } else {
    // arms out for balance
    balanceArms(c, kick);
  }
  headFront(c, { dx: kick === 0 ? 0.5 : 0, mood, lag });
  c.restore();
  // the ball, in front of everything, rolling toward the camera
  if (kick === 0) football(c, 30.5, 58.5, 3.6, f.rand);
  else if (kick === 1) { football(c, 27, 59.5, 4.6, f.rand); speedLines(c, 27, 59.5, 0, 1, 4.6); }
  else if (kick === 2) { football(c, 24, 63.5, 5.6, f.rand); speedLines(c, 24, 63.5, 0, 1, 5.6); }
}
function drawUp(c, p, f) {
  const { s, by, kick, lag } = p;
  // ball ahead of him (further up the screen), drawn behind the body
  if (kick === 0) football(c, 34.5, 56.5, 3.6, f.rand);
  else if (kick === 1) { football(c, 36.5, 22, 4, f.rand); speedLines(c, 36.5, 22, 0.2, -1, 4); }
  else if (kick === 2) { football(c, 37, 8, 3, f.rand); speedLines(c, 37, 8, 0.1, -1, 3); }
  if (kick < 0) legsFB(c, -s, by);
  else if (kick === 0) { legFB(c, 19.5, 52 + by, 59, -1); legFB(c, 25.5, 52 + by, 61, 1); }
  else if (kick === 1) { legFB(c, 19.5, 52 + by, 59, -1); legFB(c, 25.5, 52 + by, 54, 1); }
  else { legFB(c, 19.5, 52 + by, 59, -1); rect(c, 25.5, 52 + by, 4, 3, P.skin); }
  c.save(); c.translate(0, by);
  shirtFB(c, true);
  if (kick < 0) {
    armFB(c, 1, -s, { ball: true, rand: f.rand });     // his right arm is on the viewer's right from behind
    armFB(c, -1, s, {});
  } else {
    balanceArms(c, kick);
  }
  headBack(c, { lag });
  c.restore();
}
function drawSide(c, p, f, ballNear) {
  const { s, by, kick, mood, lag } = p;
  // ball behind the body when it is under the far arm
  c.save(); c.translate(0, by);
  if (kick < 0) farArmSide(c, s, { ball: !ballNear, rand: f.rand });
  else farArmSide(c, kick === 1 ? -1 : 0.5, {});
  c.restore();
  if (kick < 0) legsSide(c, s, by);
  else if (kick === 0) {
    // wind-up: near leg swung back, ball waiting in front of the standing foot
    legSideTo(c, 25, 52 + by, 25, 59, false);
    legSideTo(c, 22, 52 + by, 31, 55, true, 0.5);
  } else if (kick === 1) {
    legSideTo(c, 25, 52 + by, 26, 59, false);
    legSideTo(c, 22, 52 + by, 12, 55, true, -0.6);
  } else {
    legSideTo(c, 25, 52 + by, 26, 59, false);
    legSideTo(c, 22, 52 + by, 13, 47, true, -1.1);
  }
  c.save(); c.translate(0, by);
  shirtSide(c);
  if (kick < 0) {
    nearArmSide(c, s, ballNear ? { pose: [16, 46.5, [14, 41.5]] } : {});
    if (ballNear) { football(c, 15.5, 47, 4.4, f.rand); armSeg(c, 20.5, 41, 16.5, 46, [14.5, 41.5], 3.4); hand(c, 16.4, 47.2, -1); sleeveFB(c, 21, 40, -1); }
  } else {
    nearArmSide(c, 0, { pose: kick === 1 ? [30, 38, [27, 44]] : [29, 42, [26, 46]] });
  }
  headSide(c, { dx: kick === 0 ? 1.5 : kick === 1 ? -1 : 0, mood, lag });
  c.restore();
  if (kick === 0) football(c, 9.5, 59, 3.8, f.rand);
  else if (kick === 1) { football(c, 5.5, 52, 4, f.rand); speedLines(c, 5.5, 52, -0.8, -0.6, 4); }
  else if (kick === 2) { football(c, 3, 40, 3.6, f.rand); speedLines(c, 3, 40, -0.6, -0.8, 3.6); }
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

  // neck + shirt
  O(P.skinSh, (c) => { c.moveTo(108, 184); c.lineTo(148, 184); c.lineTo(152, 218); c.lineTo(104, 218); });
  const sg = grad(ctx, 20, 0, 236, 0, [[0, P.shirtLt], [0.3, P.shirt], [0.8, P.shirt], [1, P.shirtDk]]);
  const shirt = (c) => {
    c.moveTo(102, 208); c.quadraticCurveTo(56, 214, 26, 240); c.quadraticCurveTo(14, 250, 10, 262);
    c.lineTo(246, 262); c.quadraticCurveTo(242, 250, 230, 240); c.quadraticCurveTo(200, 214, 154, 208);
    c.lineTo(128, 236);
  };
  O(sg, shirt, 3);
  clipped(ctx, shirt, (c) => { rect(c, 0, 206, 46, 60, P.trim); rect(c, 210, 206, 46, 60, P.trim); });
  O(P.trim, (c) => { c.moveTo(100, 204); c.lineTo(128, 240); c.lineTo(156, 204); c.lineTo(148, 200); c.lineTo(128, 226); c.lineTo(108, 200); }, 3);
  // ears
  E(58, 150, 11, 14, P.skin, 0, 3); E(198, 150, 11, 14, P.skin, 0, 3);
  // face: round and chubby
  const face = (c) => {
    c.moveTo(60, 128);
    c.quadraticCurveTo(58, 190, 96, 208);
    c.quadraticCurveTo(128, 222, 160, 208);
    c.quadraticCurveTo(198, 190, 196, 128);
    c.quadraticCurveTo(192, 80, 128, 78);
    c.quadraticCurveTo(64, 80, 60, 128);
  };
  O(P.skin, face, 3);
  clipped(ctx, face, (c) => {
    rect(c, 54, 66, 150, 54, P.skinSh);
    ell(c, 128, 218, 60, 16, P.skinSh);
    ell(c, 96, 128, 22, 12, P.skinHi);
  });
  const blushG = (x) => { const g = ctx.createRadialGradient(x, 176, 2, x, 176, 22); g.addColorStop(0, 'rgba(220,100,80,0.55)'); g.addColorStop(1, 'rgba(220,100,80,0)'); return g; };
  ell(ctx, 84, 176, 22, 12, blushG(84)); ell(ctx, 172, 176, 22, 12, blushG(172));
  // big bright eyes
  const bigEye = (ex, ey, look) => {
    E(ex, ey, 18, 22, P.eyeW, 0, 2.5);
    const g = grad(ctx, 0, ey - 18, 0, ey + 20, [[0, P.iris], [1, P.irisLt]]);
    ctx.beginPath(); ctx.ellipse(ex + look, ey + 3, 13, 16, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ell(ctx, ex + look, ey + 4, 6, 8, P.pupil);
    ell(ctx, ex - 6 + look, ey - 6, 5.6, 6, '#FFFFFF');
    ell(ctx, ex + 6 + look, ey + 10, 3, 3.2, '#FFFFFF');
    O(P.line, (c) => {
      c.moveTo(ex - 19, ey - 4);
      c.quadraticCurveTo(ex - 8, ey - 30, ex + 10, ey - 28);
      c.quadraticCurveTo(ex + 19, ey - 26, ex + 22, ey - 10);
      c.quadraticCurveTo(ex + 14, ey - 23, ex, ey - 23);
      c.quadraticCurveTo(ex - 10, ey - 23, ex - 19, ey - 4);
    }, 1.5);
    S(P.line, 2.2, (c) => { c.moveTo(ex - 12, ey + 19); c.quadraticCurveTo(ex, ey + 24, ex + 12, ey + 19); });
  };
  bigEye(98, 152, 1); bigEye(158, 152, -1);
  S(P.hair, 4, (c) => { c.moveTo(78, 118); c.quadraticCurveTo(98, 108, 118, 116); });
  S(P.hair, 4, (c) => { c.moveTo(138, 116); c.quadraticCurveTo(158, 108, 178, 118); });
  // nose + huge grin
  S(P.skinDk, 3, (c) => { c.moveTo(122, 180); c.quadraticCurveTo(128, 184, 134, 180); });
  const grin = (c) => { c.moveTo(94, 190); c.quadraticCurveTo(128, 196, 162, 190); c.quadraticCurveTo(156, 218, 128, 220); c.quadraticCurveTo(100, 218, 94, 190); };
  O(P.mouthIn, grin, 2.5);
  clipped(ctx, grin, (c) => {
    rect(c, 90, 186, 76, 14, P.teeth);
    for (const x of [108, 120, 136, 148]) rect(c, x, 188, 1.6, 12, P.trimSh);
    ell(c, 128, 218, 16, 8, P.tongue);
  });
  S(P.line, 2.5, (c) => { c.moveTo(92, 190); c.quadraticCurveTo(128, 197, 164, 190); });
  // curls: dome with a bobbly edge
  const dome = (c) => { c.moveTo(56, 128); c.quadraticCurveTo(50, 44, 128, 42); c.quadraticCurveTo(206, 44, 200, 128); c.quadraticCurveTo(128, 104, 56, 128); };
  O(P.hair, dome, 3);
  const bumps = [[60, 96], [70, 74], [88, 58], [110, 48], [128, 46], [146, 48], [168, 58], [186, 74], [196, 96], [200, 120], [56, 120], [64, 124], [84, 116], [106, 110], [128, 108], [150, 110], [172, 116], [192, 124]];
  for (const [x, y] of bumps) E(x, y, 14, 12, P.hair, 0, 3);
  for (const [x, y] of bumps) E(x, y, 14, 12, P.hair, 0, 0);
  clipped(ctx, dome, (c) => { S(P.hairHi, 9, (c) => { c.moveTo(78, 84); c.quadraticCurveTo(122, 56, 176, 70); }); rect(c, 168, 30, 50, 120, 'rgba(0,0,0,0.25)'); });
  for (const [x, y] of [[84, 78], [110, 66], [140, 68]]) E(x, y, 7, 5, P.hairHi, -0.3);
  ctx.restore();
}

// -------------------------------------------------------------- export
export default {
  id: 'chr_kid',
  name: 'Baraka',
  role: 'npc',
  assetId: 'ast_starter_kid',
  file: 'kid.png',
  frameWidth: W,
  frameHeight: H,
  collider: { width: 24, height: 16, offsetX: 12, offsetY: 48 },
  walkFrameRate: 8,
  attackFrameRate: 10,
  portrait: { assetId: 'ast_starter_kid_portrait', file: 'kid_portrait.png', size: 256 },

  draw(ctx, f) {
    const p = pose(f);
    ell(ctx, 24, 61.6, 9 + (p.by ? 0.5 : 0), 2.3, P.shadow);
    const A = document.createElement('canvas'); A.width = W; A.height = H;
    const c = A.getContext('2d');
    if (f.dir === 'down') drawDown(c, p, f);
    else if (f.dir === 'up') drawUp(c, p, f);
    else if (f.dir === 'left') drawSide(c, p, f, false);
    else { c.save(); c.translate(W, 0); c.scale(-1, 1); drawSide(c, p, f, true); c.restore(); }
    crisp(A);
    ctx.drawImage(outlined(A, P.line), 0, 0);
  },

  drawPortrait,
};
