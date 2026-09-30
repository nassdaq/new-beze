/**
 * Mama Neema — the market vendor NPC (Hacho).
 *
 * A warm, middle-aged Tanzanian market woman: deep brown skin, a colourful kanga wrap dress
 * (orange with a teal border and diamond print), a matching tall teal headwrap knotted at the
 * side, gold hoop earrings and a basket of tomatoes hanging from her left forearm.
 * She has no weapon, so the "attack" rows are a welcoming double wave: both hands rise,
 * both wave with open fingers (eyes closed in a big smile), then lower.
 *
 * Drawing approach (same as villager.mjs): every frame is drawn with paths into an offscreen
 * canvas, its alpha is thresholded so edges are crisp pixels, and a 1 px dark outline is grown
 * around the silhouette before the frame is stamped onto the sheet. Only f.rand is used for
 * variation, so re-renders are byte-identical.
 */

const W = 48;
const H = 64;
const TAU = Math.PI * 2;

const P = {
  line: '#2A1810',
  skin: '#8D5B3B', skinSh: '#6F4429', skinDk: '#4F2D18', skinHi: '#A97350',
  eyeW: '#FFF6EA', iris: '#4A2A16', irisLt: '#7A4A2A', pupil: '#1C0E06',
  blush: 'rgba(210,90,70,0.45)',
  lip: '#B0453E', mouthIn: '#5A1E1A', teeth: '#FFF7EE', tongue: '#D9605A',
  dress: '#EA7128', dressDk: '#B94F16', dressLt: '#F79A56',
  teal: '#1F8F8B', tealDk: '#125F5D', tealLt: '#55BDB6',
  wrap: '#1F8F8B', wrapDk: '#125F5D', wrapLt: '#55BDB6', wrapPat: '#F2A24A',
  gold: '#EFC24A', goldDk: '#B4841C', goldLt: '#FFEBA0',
  basket: '#D6A96C', basketDk: '#9A6E3E', basketLt: '#EFCC94',
  tomato: '#D93A2C', tomatoLt: '#F47A62', tomatoDk: '#A52618', calyx: '#4E9C3E',
  sandal: '#7B4A28', sandalLt: '#B98A5A', strap: '#4A2A16',
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
function ring(c, x, y, r, color, w) { stroke(c, color, w, (c) => c.arc(x, y, r, 0, TAU)); }

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
    return { s, by: f.index % 2 ? -1 : 0, wave: -1, mood: 'idle', lag: f.index % 2 ? 1 : 0 };
  }
  // welcome: 0 hands rise, 1 both wave high (joy), 2 lowering (smile)
  return { s: 0, by: f.index === 1 ? -1 : 0, wave: f.index, mood: ['smile', 'joy', 'smile'][f.index], lag: 0 };
}

// ------------------------------------------------------------- shared bits
function eye(c, ex, ey, mood, look = 0, rx = 1.9) {
  if (mood === 'joy') {
    stroke(c, P.line, 1.6, (c) => c.arc(ex, ey + 1.5, 2.2, Math.PI * 1.12, Math.PI * 1.88));
    return;
  }
  // relaxed, kind eyes: the upper lid sits low so only the lower half of the white shows
  const lid = (c) => { c.moveTo(ex - rx - 0.4, ey - 0.6); c.quadraticCurveTo(ex + look * 0.3, ey - 2.2, ex + rx + 0.4, ey - 0.8); c.lineTo(ex + rx + 0.4, ey + 2.6); c.lineTo(ex - rx - 0.4, ey + 2.6); };
  clipped(c, lid, (c) => {
    ell(c, ex, ey + 0.2, rx, 2.2, P.eyeW);
    const g = grad(c, 0, ey - 1.6, 0, ey + 2.2, [[0, P.iris], [1, P.irisLt]]);
    ell(c, ex + look * 0.4, ey + 0.5, 1.4, 1.7, g);
    ell(c, ex + look * 0.4, ey + 0.4, 0.7, 1, P.pupil);
    rect(c, ex - 1 + look * 0.3, ey - 0.6, 0.9, 0.9, '#FFFFFF');
  });
  stroke(c, P.line, 1.3, (c) => { c.moveTo(ex - rx - 0.5, ey - 0.4); c.quadraticCurveTo(ex + look * 0.3, ey - 2.8, ex + rx + 0.5, ey - 0.7); });
  // gentle laugh line under the eye
  stroke(c, P.skinDk, 0.8, (c) => { c.moveTo(ex - 1.2, ey + 2.9); c.quadraticCurveTo(ex, ey + 3.4, ex + 1.2, ey + 2.9); });
}

function mouth(c, x, y, mood) {
  if (mood === 'joy') {
    path(c, P.mouthIn, (c) => { c.moveTo(x - 3, y - 0.8); c.lineTo(x + 3, y - 0.8); c.quadraticCurveTo(x + 2, y + 2.6, x, y + 2.6); c.quadraticCurveTo(x - 2, y + 2.6, x - 3, y - 0.8); });
    rect(c, x - 2.4, y - 0.8, 4.8, 1, P.teeth);
    ell(c, x, y + 1.6, 1.3, 0.7, P.tongue);
    return;
  }
  if (mood === 'smile') {
    stroke(c, P.line, 1.2, (c) => c.arc(x, y - 1.6, 2.5, Math.PI * 0.15, Math.PI * 0.85));
    rect(c, x - 1.5, y + 0.3, 3, 0.9, P.teeth);
    return;
  }
  stroke(c, P.lip, 1.3, (c) => c.arc(x, y - 1, 1.9, Math.PI * 0.18, Math.PI * 0.82));
}

function sparkle(c, x, y, r, fill) {
  poly(c, [[x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]], fill);
}

function hoop(c, x, y, r = 2.1) {
  ring(c, x, y, r, P.goldDk, 1.5);
  ring(c, x, y, r, P.gold, 0.9);
  rect(c, x - r + 0.3, y - 0.8, 0.9, 0.9, P.goldLt);
}

/** Kanga print: rows of small teal diamonds inside `shape`, plus the teal hem border. */
function kangaPrint(c, shape, hemY, sway, x0 = 12, x1 = 36) {
  clipped(c, shape, (c) => {
    for (let r = 0; r < 4; r++) {
      const y = 37.5 + r * 4.2, off = r % 2 ? 2 : 0;
      for (let x = x0 + off; x <= x1; x += 4) {
        const xx = x + sway * (r / 3);
        poly(c, [[xx, y - 1.2], [xx + 1.2, y], [xx, y + 1.2], [xx - 1.2, y]], P.teal);
      }
    }
    // hem border: teal band with orange dots and a thin light rule
    rect(c, 0, hemY, W, 5, P.teal);
    rect(c, 0, hemY, W, 0.9, P.tealLt);
    rect(c, 0, hemY + 4, W, 1.2, P.tealDk);
    for (let x = x0 + 1; x <= x1; x += 3) ell(c, x + sway * 0.8, hemY + 2.4, 0.8, 0.8, P.wrapPat);
  });
}

// -------------------------------------------------------- front/back bodies
function sandalFB(c, x, y) {
  rect(c, x, y, 6, 2, P.skin);
  rect(c, x + 5, y, 1, 2, P.skinSh);
  rect(c, x + 2, y, 2, 1, P.strap); rect(c, x + 1, y + 1, 1, 1, P.strap); rect(c, x + 4, y + 1, 1, 1, P.strap);
  rect(c, x, y + 2, 6, 1, P.sandalLt);
  rect(c, x, y + 3, 6, 1, P.sandal);
}
function legsFB(c, s, by) {
  const leg = (x, lift) => {
    const top = 51 + by, footY = 59 - lift;
    rect(c, x, top, 5, footY - top, P.skin);
    rect(c, x + 4, top, 1, footY - top, P.skinSh);
    sandalFB(c, x - 0.5, footY);
  };
  leg(18, s < 0 ? 2 : 0);
  leg(25, s > 0 ? 2 : 0);
}

function dressFB(c, sway, back) {
  const shape = (c) => {
    c.moveTo(15.5, 34); c.lineTo(32.5, 34);
    c.quadraticCurveTo(34.5, 42, 36.5 + sway, 56);
    c.quadraticCurveTo(24, 58.6, 11.5 + sway, 56);
    c.quadraticCurveTo(13.5, 42, 15.5, 34);
  };
  const g = grad(c, 12, 0, 36, 0, [[0, P.dressLt], [0.3, P.dress], [0.78, P.dress], [1, P.dressDk]]);
  path(c, g, shape);
  kangaPrint(c, shape, 52, sway);
  // folds
  stroke(c, P.dressDk, 1, (c) => { c.moveTo(14 + sway, 46); c.lineTo(13 + sway, 52); });
  stroke(c, P.dressDk, 1.2, (c) => { c.moveTo(34 + sway, 45); c.lineTo(35 + sway, 52); });
  // teal sash tied at the waist, knot on her right hip (viewer left in front, viewer right from the back)
  poly(c, [[14.2, 41], [33.8, 41], [34.4, 44.6], [13.6, 44.6]], P.teal);
  rect(c, 14.4, 41, 19.4, 0.9, P.tealLt);
  rect(c, 13.8, 43.6, 20.6, 1, P.tealDk);
  const kx = back ? 33.5 : 14.5;
  ell(c, kx, 42.8, 2.2, 1.8, P.teal);
  ell(c, kx - (back ? -0.6 : 0.6), 42.4, 0.9, 0.7, P.tealLt);
  poly(c, [[kx - 1, 44], [kx + 1.2, 44], [kx + 1.8 + sway * 0.5, 50], [kx - 0.8 + sway * 0.5, 50.5]], P.tealDk);
  poly(c, [[kx - 1.6, 44], [kx + 0.4, 44], [kx - 0.6 + sway * 0.5, 49.5], [kx - 2.6 + sway * 0.5, 49]], P.teal);
  if (!back) {
    // neckline: teal-bound scoop
    path(c, P.skin, (c) => { c.moveTo(19.5, 34); c.lineTo(28.5, 34); c.quadraticCurveTo(28, 38.5, 24, 39); c.quadraticCurveTo(20, 38.5, 19.5, 34); });
    stroke(c, P.teal, 1.4, (c) => { c.moveTo(19, 34.2); c.quadraticCurveTo(19.8, 39.6, 24, 40); c.quadraticCurveTo(28.2, 39.6, 29, 34.2); });
  } else {
    stroke(c, P.teal, 1.4, (c) => { c.moveTo(19.5, 34.2); c.quadraticCurveTo(24, 36.6, 28.5, 34.2); });
  }
}

/** Tomato basket hanging from a forearm. (x, y) = left edge / rim row of the body, 8x7. */
function basket(c, x, y, side, sway = 0) {
  x += sway * 0.7;
  stroke(c, P.basketDk, 1.6, (c) => { c.moveTo(x + 1, y + 1); c.quadraticCurveTo(x + 4, y - 7.5, x + 7, y + 1); });
  stroke(c, P.basketLt, 0.7, (c) => { c.moveTo(x + 2, y); c.quadraticCurveTo(x + 4, y - 5.2, x + 6, y); });
  // tomatoes heaped over the rim
  ell(c, x + 2.4, y - 0.4, 1.9, 1.7, P.tomato);
  ell(c, x + 5.8, y - 0.2, 1.8, 1.6, P.tomato);
  ell(c, x + 4.1, y - 1.7, 1.7, 1.5, P.tomatoLt);
  rect(c, x + 3.4, y - 2.4, 1, 1, '#FFD9CF');
  rect(c, x + 1.6, y - 1.1, 1, 0.8, P.tomatoLt);
  poly(c, [[x + 3.6, y - 3.2], [x + 4.6, y - 3.4], [x + 4.2, y - 2.4], [x + 5.4, y - 2.6], [x + 4.4, y - 1.8]], P.calyx);
  path(c, P.basket, (c) => { c.moveTo(x, y); c.lineTo(x + 8, y); c.lineTo(x + 7, y + 7); c.lineTo(x + 1, y + 7); });
  for (let r = 0; r < 3; r++) {
    const yy = y + 2 + r * 2, off = r % 2;
    for (let k = 0; k < 3; k++) rect(c, x + 1 + off + k * 2, yy, 1, 1, P.basketDk);
  }
  rect(c, x + 6, y + 1, 1, 6, P.basketDk);
  rect(c, x, y, 8, 1, P.basketLt);
  rect(c, x + 0.5, y + 1, 1, 1, P.basketLt);
  void side;
}

/** Bare arm from shoulder to hand with a short kanga cap sleeve. */
function armSeg(c, sx, sy, hx, hy, via, w = 4.2, shade = false) {
  const seg = (c, dx, dy) => {
    c.moveTo(sx + dx, sy + dy);
    if (via) c.quadraticCurveTo(via[0] + dx, via[1] + dy, hx + dx, hy + dy);
    else c.lineTo(hx + dx, hy + dy);
  };
  stroke(c, P.skinSh, w, (c) => seg(c, 0.8, 0.8));
  stroke(c, shade ? P.skinSh : P.skin, w, (c) => seg(c, 0, 0));
}
function hand(c, x, y, side = 1, fingers = false, rot = 0) {
  ell(c, x, y, 2.2, 2.4, P.skin);
  ell(c, x + side * 0.4, y + 1.2, 1.5, 0.9, P.skinSh);
  if (fingers) {
    for (const [dx, dy] of [[-1.7, -3.1], [0, -3.6], [1.7, -3.1]]) ell(c, x + dx, y + dy, 0.66, 1.3, P.skin);
    ell(c, x - side * 2.7, y - 1, 1.2, 0.66, P.skin, side * 0.5);
  }
  void rot;
}
function capSleeve(c, x, y, side) {
  // a short tab of kanga over the shoulder; the outer edge is bound in teal
  path(c, P.dress, (c) => { c.moveTo(x - side * 1.5, y - 1.2); c.quadraticCurveTo(x + side * 2.6, y - 1.6, x + side * 3.4, y + 1.4); c.lineTo(x + side * 2.8, y + 4.6); c.lineTo(x - side * 1.5, y + 4.2); });
  poly(c, [[x + side * 1.2, y + 2.4], [x + side * 2.8, y + 1.2], [x + side * 2.8, y + 4.6], [x + side * 1.2, y + 4.2]], P.dressDk);
  stroke(c, P.teal, 1, (c) => { c.moveTo(x + side * 3.4, y + 1.6); c.lineTo(x + side * 2.8, y + 4.8); });
}

/** Hanging arm for front/back. side -1 = viewer-left, +1 = viewer-right. sw = swing (-1..1). */
function armFB(c, side, sw, opts = {}) {
  const m = (x) => 24 - side * (x - 24);
  const o = -sw * 1.4;
  const ix = sw * 0.7;
  const sx = m(16.5), sy = 37, hx = m(13.2 + ix), hy = 48.6 + o;
  armSeg(c, sx, sy, hx, hy, null, 4.2);
  hand(c, hx, hy, side);
  if (opts.basket) basket(c, m(13.2 + ix) + (side > 0 ? 2 : -10), 45.5 + o, side, opts.sway);
  capSleeve(c, m(17.2), 36, -side);
}

/** Welcome-wave arm for front/back. k: 0 rise, 1 wave high, 2 lowering. side -1/+1 (viewer). */
function waveArmFB(c, k, side, f, opts = {}) {
  const m = (x) => 24 - side * (x - 24);
  const sx = m(16.5), sy = 37;
  const poses = [
    { hand: [12.4, 38.6], via: [12.6, 44], fingers: false },
    { hand: [10.6, 17.8], via: [10.8, 28], fingers: true },
    { hand: [9.8, 29.4], via: [12, 36], fingers: false },
  ];
  const { hand: hp, via, fingers } = poses[k];
  const hx = m(hp[0]), hy = hp[1];
  armSeg(c, sx, sy, hx, hy + 2, [m(via[0]), via[1]], 4.2);
  if (opts.basket) {
    // the basket stays on the forearm and swings up with it
    const bx = k === 1 ? m(9.5) : m(11.5);
    const byy = k === 1 ? 31.5 : k === 0 ? 45.5 : 40.5;
    basket(c, side > 0 ? bx : bx - 8, byy, side, 0);
  }
  hand(c, hx, hy, side, fingers);
  capSleeve(c, m(17.2), 36, -side);
  if (fingers && !opts.noSparkle) {
    const r = f.rand;
    sparkle(c, m(hp[0] + 4.5 + r() * 2), hy - 3 - r() * 3, 1.8, '#FFF3B0');
    sparkle(c, m(hp[0] - 3.5 + r()), hy + 4 + r() * 2, 1.2, '#FFF3B0');
  }
}

// ------------------------------------------------------------------ heads
/** Tall kanga headwrap seen from the front. Knot on her right (viewer-left). */
function headwrapFront(c, lag, back = false) {
  const dome = (c) => {
    c.moveTo(12.6, 22.5);
    c.quadraticCurveTo(12, 14, 15.5, 9.6);
    c.quadraticCurveTo(24, 5.2, 32.5, 9.6);
    c.quadraticCurveTo(36, 14, 35.4, 22.5);
    c.quadraticCurveTo(24, 20.5 + lag * 0.4, 12.6, 22.5);
  };
  path(c, P.wrap, dome);
  clipped(c, dome, (c) => {
    rect(c, 30, 4, 8, 22, 'rgba(10,50,50,0.35)');
    // wrapped folds: diagonal bands catching the light
    stroke(c, P.wrapLt, 1.6, (c) => { c.moveTo(14, 18); c.quadraticCurveTo(22, 9, 31, 12); });
    stroke(c, P.wrapDk, 1, (c) => { c.moveTo(13, 20.5); c.quadraticCurveTo(22, 12, 33, 15); });
    stroke(c, P.wrapLt, 1.2, (c) => { c.moveTo(18, 22); c.quadraticCurveTo(27, 15, 35, 19); });
    // print
    for (const [x, y] of [[17, 12.5], [22, 9.8], [27, 11], [31, 16.5], [16, 16.5], [24, 15], [20, 19], [29, 20]]) {
      poly(c, [[x, y - 1.1], [x + 1.1, y], [x, y + 1.1], [x - 1.1, y]], P.wrapPat);
    }
  });
  // headband edge across the forehead
  if (!back) {
    stroke(c, P.wrapDk, 1.2, (c) => { c.moveTo(12.8, 22.2); c.quadraticCurveTo(24, 20.2 + lag * 0.4, 35.2, 22.2); });
    stroke(c, P.wrapLt, 0.9, (c) => { c.moveTo(14, 21.2); c.quadraticCurveTo(24, 19.2 + lag * 0.4, 34, 21.2); });
  }
  // knot: two cloth loops flaring on her right (viewer left) unless seen from the back
  const kx = back ? 33.5 : 14.5, dir = back ? 1 : -1;
  ell(c, kx + dir * 2.4, 13, 3.2, 2.2, P.wrap, dir * -0.5);
  ell(c, kx + dir * 1.2, 9.2, 2.1, 3, P.wrap, dir * 0.35);
  ell(c, kx + dir * 3, 12.4, 1.4, 0.8, P.wrapLt, dir * -0.5);
  ell(c, kx + dir * 1, 8.4, 0.8, 1.3, P.wrapLt, dir * 0.35);
  rect(c, kx + dir * 2.6 - 0.5, 12.6, 1, 1, P.wrapPat);
  ell(c, kx, 13.6, 1.6, 1.5, P.wrapDk);
}

function headFront(c, o) {
  const { dx = 0, mood = 'idle', lag = 0 } = o;
  c.save(); c.translate(dx, 0);
  // ears + hoops behind the face
  ell(c, 14.2, 27.5, 1.8, 2.4, P.skin); ell(c, 33.8, 27.5, 1.8, 2.4, P.skin);
  const face = (c) => c.ellipse(24, 24.5, 9.2, 8.8, 0, 0, TAU);
  path(c, P.skin, face);
  clipped(c, face, (c) => {
    rect(c, 14, 14, 20, 8, P.skinSh);
    ell(c, 24, 34.5, 8.8, 2.8, P.skinSh);
    ell(c, 20, 23, 3.4, 2.4, P.skinHi);
  });
  eye(c, 19.6, 26.4, mood, 0); eye(c, 28.4, 26.4, mood, 0);
  // brows
  stroke(c, P.skinDk, 1, (c) => { c.moveTo(16.8, 22.6); c.quadraticCurveTo(19.6, 21.2, 22.2, 22.4); });
  stroke(c, P.skinDk, 1, (c) => { c.moveTo(25.8, 22.4); c.quadraticCurveTo(28.4, 21.2, 31.2, 22.6); });
  ell(c, 17, 30, 2, 1.1, P.blush); ell(c, 31, 30, 2, 1.1, P.blush);
  // nose
  stroke(c, P.skinDk, 1, (c) => { c.moveTo(23, 29.2); c.quadraticCurveTo(24, 30.2, 25, 29.2); });
  mouth(c, 24, 31.6, mood);
  headwrapFront(c, lag);
  hoop(c, 14.2, 31.2, 1.8); hoop(c, 33.8, 31.2, 1.8);
  c.restore();
}

function headBack(c, o) {
  const { dx = 0, lag = 0 } = o;
  c.save(); c.translate(dx, 0);
  ell(c, 14.4, 27.5, 1.8, 2.4, P.skin); ell(c, 33.6, 27.5, 1.8, 2.4, P.skin);
  path(c, P.skinSh, (c) => c.ellipse(24, 24.5, 9.2, 8.8, 0, 0, TAU));
  ell(c, 24, 29, 8, 5, P.skinSh);
  rect(c, 21, 28, 6, 7, P.skinSh);
  headwrapFront(c, lag, true);
  // the wrap continues lower at the back of the head
  path(c, P.wrap, (c) => { c.moveTo(13, 21.5); c.quadraticCurveTo(24, 31 + lag * 0.5, 35, 21.5); c.lineTo(35, 19); c.lineTo(13, 19); });
  stroke(c, P.wrapDk, 1, (c) => { c.moveTo(14, 23.5); c.quadraticCurveTo(24, 29.5 + lag * 0.5, 34, 23.5); });
  stroke(c, P.wrapLt, 0.9, (c) => { c.moveTo(16, 21.5); c.quadraticCurveTo(24, 26.5 + lag * 0.5, 32, 21.5); });
  hoop(c, 14.4, 31.2, 1.8); hoop(c, 33.6, 31.2, 1.8);
  c.restore();
}

/** Facing left. Mirrored by the caller for right. knotNear: the headwrap knot is on this side. */
function headSide(c, o) {
  const { dx = 0, mood = 'idle', lag = 0, knotNear = false } = o;
  c.save(); c.translate(dx, 0);
  const face = (c) => c.ellipse(21, 25, 9, 8.6, 0, 0, TAU);
  path(c, P.skin, face);
  clipped(c, face, (c) => { rect(c, 10, 14, 22, 8, P.skinSh); ell(c, 21.5, 35, 8, 2.8, P.skinSh); ell(c, 15.5, 23.5, 3, 2.2, P.skinHi); });
  // nose + lips in profile
  poly(c, [[12.4, 25.6], [10.6, 27.6], [12.6, 29]], P.skin);
  eye(c, 16.6, 26.6, mood, -1, 2);
  stroke(c, P.skinDk, 1, (c) => { c.moveTo(14.4, 22.8); c.quadraticCurveTo(17, 21.4, 19.6, 22.4); });
  ell(c, 15, 30.4, 1.9, 1.1, P.blush);
  if (mood === 'joy') { ell(c, 13.4, 31.6, 1.7, 1.4, P.mouthIn); rect(c, 12.2, 30.6, 2.6, 0.9, P.teeth); ell(c, 13.2, 32.2, 0.9, 0.5, P.tongue); }
  else if (mood === 'smile') { stroke(c, P.line, 1.2, (c) => { c.moveTo(12.2, 30.6); c.quadraticCurveTo(13.8, 32.6, 15.6, 31); }); }
  else stroke(c, P.lip, 1.2, (c) => { c.moveTo(12.4, 30.8); c.quadraticCurveTo(13.6, 32, 14.8, 31.2); });
  // ear + hoop
  ell(c, 27.6, 27.6, 1.9, 2.5, P.skin);
  ell(c, 27.8, 27.8, 0.9, 1.3, P.skinSh);
  // headwrap in profile: tall dome, band across the brow, knot at the back or front
  const dome = (c) => {
    c.moveTo(11.4, 22.6);
    c.quadraticCurveTo(10.6, 13.5, 15, 9.6);
    c.quadraticCurveTo(24, 5, 32.5, 10);
    c.quadraticCurveTo(36.4, 15, 35.6, 24);
    c.quadraticCurveTo(34.5, 29 + lag * 0.5, 30.5, 29 + lag * 0.5);
    c.quadraticCurveTo(29.5, 23.5, 27, 22);
    c.quadraticCurveTo(20, 20.6 + lag * 0.4, 11.4, 22.6);
  };
  path(c, P.wrap, dome);
  clipped(c, dome, (c) => {
    rect(c, 30, 4, 8, 30, 'rgba(10,50,50,0.35)');
    stroke(c, P.wrapLt, 1.6, (c) => { c.moveTo(13, 18); c.quadraticCurveTo(21, 9, 31, 12); });
    stroke(c, P.wrapDk, 1, (c) => { c.moveTo(12, 21); c.quadraticCurveTo(22, 12.5, 33, 16); });
    stroke(c, P.wrapLt, 1.2, (c) => { c.moveTo(20, 21.4); c.quadraticCurveTo(28, 17, 34, 22); });
    for (const [x, y] of [[16, 13], [21, 10], [26, 11.5], [31, 17], [15, 17.5], [23, 15.5], [19, 19.5], [29, 21]]) {
      poly(c, [[x, y - 1.1], [x + 1.1, y], [x, y + 1.1], [x - 1.1, y]], P.wrapPat);
    }
  });
  stroke(c, P.wrapDk, 1.2, (c) => { c.moveTo(11.6, 22.4); c.quadraticCurveTo(20, 20.2 + lag * 0.4, 27.6, 22.2); });
  stroke(c, P.wrapLt, 0.9, (c) => { c.moveTo(13, 21.4); c.quadraticCurveTo(20, 19.4 + lag * 0.4, 26.4, 21.4); });
  if (knotNear) {
    ell(c, 12.2, 13, 3.2, 2.2, P.wrap, 0.5);
    ell(c, 13.6, 9.2, 2.1, 3, P.wrap, -0.35);
    ell(c, 11.8, 12.4, 1.4, 0.8, P.wrapLt, 0.5);
    ell(c, 13.4, 8.4, 0.8, 1.3, P.wrapLt, -0.35);
    ell(c, 14.6, 13.6, 1.6, 1.5, P.wrapDk);
  } else {
    ell(c, 34.8, 13.6, 2.6, 2, P.wrap, -0.6);
    ell(c, 33.4, 10.2, 1.6, 2.4, P.wrap, 0.3);
    ell(c, 35, 13, 1.1, 0.7, P.wrapLt, -0.6);
    ell(c, 33, 13.8, 1.4, 1.3, P.wrapDk);
  }
  hoop(c, 27.6, 31.4, 1.8);
  c.restore();
}

// --------------------------------------------------------------- side body
function sandalSide(c, x, y, lifted) {
  const tilt = lifted ? 1 : 0;
  path(c, P.skin, (c) => { c.moveTo(x - 4.8, y + 1.4 + tilt); c.quadraticCurveTo(x - 4.4, y - 0.6 + tilt, x - 2, y + tilt * 0.5); c.lineTo(x + 2.8, y); c.lineTo(x + 2.8, y + 2); c.lineTo(x - 4.8, y + 2 + tilt); });
  rect(c, x - 1.2, y + tilt * 0.3, 1, 2, P.strap);
  poly(c, [[x - 4.8, y + 2 + tilt], [x + 2.8, y + 2], [x + 2.8, y + 3], [x - 4.8, y + 3 + tilt]], P.sandalLt);
  poly(c, [[x - 4.8, y + 3 + tilt], [x + 2.8, y + 3], [x + 2.8, y + 4], [x - 4.8, y + 4 + tilt]], P.sandal);
}
function legsSide(c, s, by) {
  const leg = (x, lift, near) => {
    const top = 51 + by, footY = 59 - lift;
    rect(c, x - 2.5, top, 5, footY - top, near ? P.skin : P.skinSh);
    if (near) rect(c, x + 1.5, top, 1, footY - top, P.skinSh);
    sandalSide(c, x, footY, lift > 0);
  };
  leg(24 + 3 * s, s > 0 ? 2 : 0, false);
  leg(22 - 3 * s, s < 0 ? 2 : 0, true);
}
function dressSide(c, sway) {
  const shape = (c) => {
    c.moveTo(17, 34); c.lineTo(31, 34);
    c.quadraticCurveTo(34, 43, 35.5 + sway * 0.5, 56);
    c.quadraticCurveTo(24, 58.6, 12.5 - sway, 56);
    c.quadraticCurveTo(14, 43, 17, 34);
  };
  const g = grad(c, 13, 0, 35, 0, [[0, P.dressLt], [0.25, P.dress], [0.72, P.dress], [1, P.dressDk]]);
  path(c, g, shape);
  kangaPrint(c, shape, 52, sway * 0.5, 13, 35);
  stroke(c, P.dressDk, 1.2, (c) => { c.moveTo(32, 46); c.lineTo(33.5 + sway * 0.5, 52); });
  // sash with the knot at the back hip
  poly(c, [[15.4, 41], [32.6, 41], [33.4, 44.6], [14.6, 44.6]], P.teal);
  rect(c, 15.6, 41, 17, 0.9, P.tealLt);
  rect(c, 14.8, 43.6, 18.6, 1, P.tealDk);
  ell(c, 33.4, 42.6, 2, 1.9, P.teal);
  ell(c, 34, 42, 0.8, 0.7, P.tealLt);
  poly(c, [[32.6, 44], [34.6, 44], [35.6, 50], [33.4, 50.5]], P.tealDk);
  // neckline bound in teal
  path(c, P.skin, (c) => { c.moveTo(17.5, 34); c.lineTo(24, 34); c.quadraticCurveTo(23.6, 38.5, 19.5, 39); c.quadraticCurveTo(17.6, 37.5, 17.5, 34); });
  stroke(c, P.teal, 1.4, (c) => { c.moveTo(17.2, 34.4); c.quadraticCurveTo(17.6, 39.6, 20, 40); c.quadraticCurveTo(23.8, 39.4, 24.6, 34.4); });
}
function farArmSide(c, s, sway, raise = 0) {
  const fx = 30 - 2.2 * s;
  const hy = 47.4 - raise;
  armSeg(c, 28.5, 37, fx + 1, hy - 0.4, raise ? [fx + 6, 44 - raise * 0.5] : null, 4.2, true);
  ell(c, fx + 1.2, hy, 2, 2.2, P.skinSh);
  basket(c, fx - 0.5, 45.5 - raise, 1, sway);
  capSleeve(c, 28, 36, 1);
}
function nearArmSide(c, s) {
  const hx = 23 + 2.6 * s;
  armSeg(c, 21.5, 37, hx, 48.2, null, 4.2);
  hand(c, hx, 48.6, 1);
  capSleeve(c, 21, 36, -1);
}
function waveArmSide(c, k, f) {
  const sx = 21.5, sy = 37;
  const poses = [
    { hand: [13.4, 39.8], via: [16.5, 42], fingers: false },
    { hand: [7.8, 19.6], via: [6.6, 37], fingers: true },
    { hand: [11.2, 31.4], via: [15, 37], fingers: false },
  ];
  const { hand: hp, via, fingers } = poses[k];
  const [hx, hy] = hp;
  armSeg(c, sx, sy, hx, hy + 2, via, 4.2);
  hand(c, hx, hy, -1, fingers);
  capSleeve(c, 21, 36, -1);
  if (fingers) {
    const r = f.rand;
    sparkle(c, hx + 1 + r() * 1.5, hy - 7 - r() * 2, 1.8, '#FFF3B0');
    sparkle(c, hx + 7 + r(), hy - 3 - r() * 1.5, 1.2, '#FFF3B0');
  }
}

// ---------------------------------------------------------------- frames
function drawDown(c, p, f) {
  const { s, by, wave, mood, lag } = p;
  const sway = s;
  legsFB(c, s, by);
  c.save(); c.translate(0, by);
  dressFB(c, sway, false);
  if (wave < 0) {
    armFB(c, 1, s, { basket: true, sway });        // her left arm (viewer right) carries the basket
    armFB(c, -1, -s, {});
  }
  const lean = wave === 1 ? 0 : wave === 0 ? 0 : 0;
  headFront(c, { dx: lean, mood, lag });
  if (wave >= 0) {
    waveArmFB(c, wave, 1, f, { basket: true, noSparkle: true });
    waveArmFB(c, wave, -1, f, {});
  }
  c.restore();
}
function drawUp(c, p, f) {
  const { s, by, wave, lag } = p;
  const sway = -s;
  legsFB(c, -s, by);
  c.save(); c.translate(0, by);
  dressFB(c, sway, true);
  if (wave < 0) {
    armFB(c, -1, s, { basket: true, sway });       // her left arm is on the viewer's left from behind
    armFB(c, 1, -s, {});
  }
  headBack(c, { dx: 0, lag });
  if (wave >= 0) {
    waveArmFB(c, wave, -1, f, { basket: true, noSparkle: true });
    waveArmFB(c, wave, 1, f, {});
  }
  c.restore();
}
function drawSide(c, p, f, knotNear) {
  const { s, by, wave, mood, lag } = p;
  const sway = s;
  c.save(); c.translate(0, by);
  farArmSide(c, s, sway, wave === 1 ? 6 : wave === 2 ? 3 : 0);
  c.restore();
  legsSide(c, s, by);
  c.save(); c.translate(0, by);
  dressSide(c, sway);
  if (wave < 0) nearArmSide(c, s);
  const lean = wave === 1 ? -1 : wave === 0 ? -0.5 : 0;
  headSide(c, { dx: lean, mood, lag, knotNear });
  if (wave >= 0) waveArmSide(c, wave, f);
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
  const diamond = (x, y, r, fill) => O(fill, (c) => { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); }, 0);

  // neck
  O(P.skinSh, (c) => { c.moveTo(104, 170); c.lineTo(152, 170); c.lineTo(156, 214); c.lineTo(100, 214); });
  // shoulders / kanga dress
  const dg = grad(ctx, 20, 0, 236, 0, [[0, P.dressLt], [0.3, P.dress], [0.8, P.dress], [1, P.dressDk]]);
  const body = (c) => {
    c.moveTo(100, 204); c.quadraticCurveTo(56, 210, 26, 238); c.quadraticCurveTo(14, 250, 10, 262);
    c.lineTo(246, 262); c.quadraticCurveTo(242, 250, 230, 238); c.quadraticCurveTo(200, 210, 156, 204);
    c.quadraticCurveTo(150, 236, 128, 238); c.quadraticCurveTo(106, 236, 100, 204);
  };
  O(dg, body, 3);
  clipped(ctx, body, (c) => {
    for (let r = 0; r < 3; r++) for (let x = 20 + (r % 2) * 16; x < 240; x += 32) diamond(x, 222 + r * 16, 6, P.teal);
  });
  // neckline binding
  S(P.teal, 7, (c) => { c.moveTo(98, 200); c.quadraticCurveTo(104, 242, 128, 244); c.quadraticCurveTo(152, 242, 158, 200); });
  S(P.tealLt, 2, (c) => { c.moveTo(102, 204); c.quadraticCurveTo(108, 236, 128, 238); });
  // ears + hoops (behind the face)
  E(64, 138, 10, 13, P.skin, 0, 3); E(192, 138, 10, 13, P.skin, 0, 3);
  // face: round, soft cheeks, full chin
  const face = (c) => {
    c.moveTo(62, 118);
    c.quadraticCurveTo(62, 178, 94, 198);
    c.quadraticCurveTo(128, 214, 162, 198);
    c.quadraticCurveTo(194, 178, 194, 118);
    c.quadraticCurveTo(190, 70, 128, 68);
    c.quadraticCurveTo(66, 70, 62, 118);
  };
  O(P.skin, face, 3);
  clipped(ctx, face, (c) => {
    rect(c, 56, 56, 144, 54, P.skinSh);
    ell(c, 128, 208, 60, 16, P.skinSh);
    ell(c, 96, 118, 22, 12, P.skinHi);
    ell(c, 160, 122, 14, 8, P.skinHi);
  });
  // blush
  const blushG = (x) => { const g = ctx.createRadialGradient(x, 166, 2, x, 166, 22); g.addColorStop(0, 'rgba(220,90,70,0.6)'); g.addColorStop(1, 'rgba(220,90,70,0)'); return g; };
  ell(ctx, 88, 166, 22, 12, blushG(88)); ell(ctx, 168, 166, 22, 12, blushG(168));
  // eyes: warm, half-lidded happy eyes with laugh lines
  const warmEye = (ex, ey, look) => {
    E(ex, ey, 15, 15, P.eyeW, 0, 2.5);
    const g = grad(ctx, 0, ey - 14, 0, ey + 16, [[0, P.iris], [1, P.irisLt]]);
    ctx.beginPath(); ctx.ellipse(ex + look, ey + 3, 10.5, 12, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ell(ctx, ex + look, ey + 4, 5, 6, P.pupil);
    ell(ctx, ex - 5 + look, ey - 3, 4.4, 4.6, '#FFFFFF');
    ell(ctx, ex + 5 + look, ey + 9, 2.2, 2.4, '#FFFFFF');
    // heavy upper lid cover
    O(P.skin, (c) => { c.moveTo(ex - 18, ey - 10); c.quadraticCurveTo(ex, ey - 2, ex + 20, ey - 12); c.lineTo(ex + 20, ey - 30); c.lineTo(ex - 18, ey - 30); }, 0);
    // upper lid: heavier, kind
    O(P.line, (c) => {
      c.moveTo(ex - 16, ey - 2);
      c.quadraticCurveTo(ex - 6, ey - 24, ex + 10, ey - 22);
      c.quadraticCurveTo(ex + 17, ey - 20, ex + 19, ey - 8);
      c.quadraticCurveTo(ex + 12, ey - 17, ex, ey - 17);
      c.quadraticCurveTo(ex - 9, ey - 17, ex - 16, ey - 2);
    }, 1.5);
    S(P.line, 2, (c) => { c.moveTo(ex - 11, ey + 15); c.quadraticCurveTo(ex, ey + 19, ex + 11, ey + 15); });
    S('rgba(79,45,24,0.8)', 2.4, (c) => { c.moveTo(ex - 12, ey + 22); c.quadraticCurveTo(ex, ey + 26, ex + 12, ey + 22); });
  };
  warmEye(100, 146, 1); warmEye(156, 146, -1);
  // brows
  S(P.skinDk, 4, (c) => { c.moveTo(80, 118); c.quadraticCurveTo(100, 108, 118, 116); });
  S(P.skinDk, 4, (c) => { c.moveTo(138, 116); c.quadraticCurveTo(156, 108, 176, 118); });
  // nose
  S(P.skinDk, 3, (c) => { c.moveTo(118, 176); c.quadraticCurveTo(128, 182, 138, 176); });
  // wide happy smile with teeth
  O(P.mouthIn, (c) => { c.moveTo(104, 188); c.quadraticCurveTo(128, 184, 152, 188); c.quadraticCurveTo(146, 206, 128, 207); c.quadraticCurveTo(110, 206, 104, 188); }, 2.5);
  clipped(ctx, (c) => { c.moveTo(104, 188); c.quadraticCurveTo(128, 184, 152, 188); c.quadraticCurveTo(146, 206, 128, 207); c.quadraticCurveTo(110, 206, 104, 188); }, (c) => {
    rect(c, 100, 184, 56, 8, P.teeth);
    ell(c, 128, 206, 12, 6, P.tongue);
  });
  S(P.lip, 2.5, (c) => { c.moveTo(102, 188); c.quadraticCurveTo(128, 183, 154, 188); });
  // hoops
  const bigHoop = (x, y) => { S(P.goldDk, 7, (c) => c.arc(x, y, 14, 0, TAU)); S(P.gold, 4, (c) => c.arc(x, y, 14, 0, TAU)); S(P.goldLt, 2, (c) => c.arc(x, y, 14, Math.PI * 0.9, Math.PI * 1.4)); };
  bigHoop(64, 166); bigHoop(192, 166);
  // headwrap: tall dome with folds and print, knot on her right (viewer-left)
  const dome = (c) => {
    c.moveTo(52, 118);
    c.quadraticCurveTo(46, 60, 78, 34);
    c.quadraticCurveTo(128, 6, 178, 34);
    c.quadraticCurveTo(212, 58, 204, 118);
    c.quadraticCurveTo(128, 100, 52, 118);
  };
  O(P.wrap, dome, 3);
  clipped(ctx, dome, (c) => {
    rect(c, 170, 0, 60, 130, 'rgba(10,50,50,0.35)');
    S(P.wrapLt, 10, (c) => { c.moveTo(60, 96); c.quadraticCurveTo(110, 40, 186, 58); });
    S(P.wrapDk, 5, (c) => { c.moveTo(54, 112); c.quadraticCurveTo(116, 60, 198, 84); });
    S(P.wrapLt, 7, (c) => { c.moveTo(94, 114); c.quadraticCurveTo(150, 84, 200, 106); });
    for (const [x, y] of [[80, 66], [112, 44], [142, 52], [172, 78], [72, 90], [128, 78], [100, 100], [160, 104]]) diamond(x, y, 7, P.wrapPat);
  });
  S(P.wrapDk, 4, (c) => { c.moveTo(54, 116); c.quadraticCurveTo(128, 98, 202, 116); });
  S(P.wrapLt, 3, (c) => { c.moveTo(62, 110); c.quadraticCurveTo(128, 94, 194, 110); });
  // knot: a twisted tuck of cloth with two short tails at her right temple
  O(P.wrap, (c) => { c.moveTo(60, 88); c.quadraticCurveTo(30, 80, 30, 58); c.quadraticCurveTo(34, 44, 52, 50); c.quadraticCurveTo(62, 60, 72, 70); }, 3);
  O(P.wrap, (c) => { c.moveTo(62, 74); c.quadraticCurveTo(52, 40, 76, 30); c.quadraticCurveTo(92, 30, 84, 54); c.quadraticCurveTo(80, 66, 74, 76); }, 3);
  S(P.wrapLt, 4, (c) => { c.moveTo(36, 60); c.quadraticCurveTo(40, 50, 50, 54); });
  S(P.wrapLt, 4, (c) => { c.moveTo(70, 40); c.quadraticCurveTo(78, 34, 82, 44); });
  S(P.wrapDk, 3, (c) => { c.moveTo(44, 74); c.quadraticCurveTo(54, 64, 64, 72); });
  diamond(42, 66, 4, P.wrapPat); diamond(78, 46, 4, P.wrapPat);
  O(P.wrapDk, (c) => { c.moveTo(60, 66); c.quadraticCurveTo(68, 58, 78, 66); c.quadraticCurveTo(76, 82, 66, 82); c.quadraticCurveTo(56, 78, 60, 66); }, 3);
  S(P.wrapLt, 2.5, (c) => { c.moveTo(64, 70); c.lineTo(72, 70); });
  ctx.restore();
}

// -------------------------------------------------------------- export
export default {
  id: 'chr_vendor',
  name: 'Mama Neema',
  role: 'npc',
  assetId: 'ast_starter_vendor',
  file: 'vendor.png',
  frameWidth: W,
  frameHeight: H,
  collider: { width: 24, height: 16, offsetX: 12, offsetY: 48 },
  walkFrameRate: 8,
  attackFrameRate: 10,
  portrait: { assetId: 'ast_starter_vendor_portrait', file: 'vendor_portrait.png', size: 256 },

  draw(ctx, f) {
    const p = pose(f);
    ell(ctx, 24, 61.6, 11 + (p.by ? 0.5 : 0), 2.6, P.shadow);
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
