/**
 * Aiko — the village NPC.
 *
 * A warm, friendly teenage girl: chestnut bob with a red ribbon, big amber eyes, rosy cheeks,
 * a rose-red kimono dress with a cream apron and yellow obi, sandals, and a basket on one arm.
 * She has no weapon, so the "attack" rows are a greeting: raise hand, wave, lower.
 *
 * Drawing approach: every frame is drawn with paths (ellipses, quadratic curves, polygons,
 * gradients) into an offscreen canvas, its alpha is thresholded so edges are crisp pixels, and a
 * 1 px dark outline is grown around the silhouette before the frame is stamped onto the sheet.
 * Only f.rand is used for variation, so re-renders are byte-identical.
 */

const W = 48;
const H = 64;
const TAU = Math.PI * 2;

const P = {
  line: '#2E1A22',
  skin: '#FBE0C6', skinSh: '#EDBE9C', skinDk: '#D69A78',
  hair: '#80502E', hairDk: '#5A331B', hairLt: '#A46A3E', hairHi: '#D9A26C',
  eyeW: '#FFFFFF', iris: '#E39A2E', irisDk: '#8E4E12', irisLt: '#F8CE6A', pupil: '#40200A',
  blush: 'rgba(240,118,128,0.78)',
  ribbon: '#E0393F', ribbonDk: '#A5232A', ribbonLt: '#F27C7A',
  dress: '#D2445A', dressDk: '#9E2C40', dressLt: '#EB6F80',
  cream: '#F9F0DE', creamSh: '#E2D2B2', creamDk: '#C4AD86',
  obi: '#F5C842', obiDk: '#C89620', obiLt: '#FCE48F',
  basket: '#D6A96C', basketDk: '#9A6E3E', basketLt: '#EFCC94',
  apple: '#D8323A', appleLt: '#F26B6B', pear: '#E8B23A', leaf: '#5EA24A',
  sandal: '#8E5B34', sandalLt: '#C99D68', strap: '#5B3822',
  mouthIn: '#7A2A32', tongue: '#EE7A82',
  hairShade: 'rgba(58,30,16,0.32)',
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
function pose(f) {
  if (f.anim === 'walk') {
    const s = [0, 1, 0, -1][f.index]; // stride: 0 contact-neutral, ±1 extended
    return { s, by: f.index % 2 ? -1 : 0, wave: -1, mood: 'idle', lag: f.index % 2 ? 1 : 0 };
  }
  // greeting: 0 anticipation (hand tucks in), 1 wave (biggest), 2 recovery (lowering)
  return { s: 0, by: f.index === 1 ? -1 : 0, wave: f.index, mood: ['idle', 'joy', 'smile'][f.index], lag: 0 };
}

// ------------------------------------------------------------- shared bits
function hiBand(c, x0, y, w, fill, thick, rise = 2.5, step = 3) {
  // anime hair shine: a zigzag ribbon of light across the crown
  const top = [], bot = [];
  for (let i = 0, x = x0; x <= x0 + w + 0.01; i++, x += step) {
    const yy = y + (i % 2 ? 0 : -rise);
    top.push([x, yy]); bot.push([x, yy + thick]);
  }
  poly(c, [...top, ...bot.reverse()], fill);
}

function ribbon(c, x, y, side, swing = 0) {
  // knot at (x,y); loops fan up and outward on `side`, tails hang down and drift with swing
  poly(c, [[x - 1.2, y + 0.8], [x + 1.2, y + 0.8], [x + 0.8 + side * 1.6 + swing, y + 6.2], [x - 1.4 + side * 1.4 + swing, y + 5.6]], P.ribbonDk);
  poly(c, [[x - 1.4, y + 0.8], [x + 0.6, y + 0.8], [x - 1.8 + side * 2.6 + swing, y + 5.4], [x - 3.2 + side * 2.2 + swing, y + 4.4]], P.ribbon);
  ell(c, x + side * 3.1, y - 0.6, 3.1, 2.1, P.ribbon, side * -0.35);
  ell(c, x - side * 0.4, y - 3.3, 2.1, 2.9, P.ribbon, side * 0.3);
  ell(c, x + side * 3.4, y - 1.1, 1.5, 0.8, P.ribbonLt, side * -0.35);
  ell(c, x - side * 0.7, y - 4, 0.8, 1.4, P.ribbonLt, side * 0.3);
  ell(c, x, y, 1.5, 1.5, P.ribbonDk);
}

function eye(c, ex, ey, mood, look = 0, rx = 2.5) {
  if (mood === 'joy') {
    stroke(c, P.line, 1.6, (c) => c.arc(ex, ey + 1.6, 2.6, Math.PI * 1.12, Math.PI * 1.88));
    return;
  }
  ell(c, ex, ey, rx, 3.1, P.eyeW);
  const g = grad(c, 0, ey - 2.6, 0, ey + 2.8, [[0, P.irisDk], [0.42, P.iris], [1, P.irisLt]]);
  ell(c, ex + look * 0.4, ey + 0.5, Math.min(rx - 0.5, 1.9), 2.5, g);
  ell(c, ex + look * 0.4, ey + 0.3, 0.9, 1.4, P.pupil);
  rect(c, ex - 1.7 + look * 0.3, ey - 1.7, 1.3, 1.3, '#FFFFFF');
  rect(c, ex + 0.6, ey + 1.5, 0.9, 0.9, '#FFFFFF');
  stroke(c, P.line, 1.5, (c) => { c.moveTo(ex - rx - 0.4, ey - 1.2); c.quadraticCurveTo(ex + look * 0.3, ey - 4.6, ex + rx + 0.3, ey - 1.5); });
  rect(c, ex - 1.4, ey + 3.2, 2.8, 0.8, P.skinDk);
}

function mouth(c, x, y, mood) {
  if (mood === 'joy') { ell(c, x, y + 0.4, 1.9, 1.6, P.mouthIn); ell(c, x, y + 1.1, 1.1, 0.7, P.tongue); return; }
  if (mood === 'smile') { stroke(c, P.line, 1.2, (c) => c.arc(x, y - 1.4, 2.3, Math.PI * 0.15, Math.PI * 0.85)); return; }
  stroke(c, P.line, 1.1, (c) => c.arc(x, y - 0.9, 1.6, Math.PI * 0.2, Math.PI * 0.8));
}

function sparkle(c, x, y, r, fill) {
  poly(c, [[x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]], fill);
}

// -------------------------------------------------------- front/back bodies
function sandalFB(c, x, y) {
  // 6x4 block: foot skin with thong strap, then light + dark sole. rows y..y+3
  rect(c, x, y, 6, 2, P.skin);
  rect(c, x + 5, y, 1, 2, P.skinSh);
  rect(c, x + 2, y, 2, 1, P.strap); rect(c, x + 1, y + 1, 1, 1, P.strap); rect(c, x + 4, y + 1, 1, 1, P.strap);
  rect(c, x, y + 2, 6, 1, P.sandalLt);
  rect(c, x, y + 3, 6, 1, P.sandal);
}
function legsFB(c, s, by) {
  // s>0: viewer-left leg planted forward, viewer-right leg lifted (toe-off); s<0 the reverse
  const leg = (x, lift) => {
    const top = 51 + by, footY = 59 - lift;
    rect(c, x, top, 4, footY - top, P.skin);
    rect(c, x + 3, top, 1, footY - top, P.skinSh);
    sandalFB(c, x - 1, footY);
  };
  leg(19, s < 0 ? 2 : 0);
  leg(25, s > 0 ? 2 : 0);
}

function dressFB(c, sway) {
  const g = grad(c, 13, 0, 35, 0, [[0, P.dressLt], [0.28, P.dress], [0.78, P.dress], [1, P.dressDk]]);
  path(c, g, (c) => {
    c.moveTo(17.5, 34); c.lineTo(30.5, 34);
    c.quadraticCurveTo(33, 44, 35 + sway, 55.5);
    c.quadraticCurveTo(24, 58.5, 13 + sway, 55.5);
    c.quadraticCurveTo(15, 44, 17.5, 34);
  });
  // skirt folds
  stroke(c, P.dressDk, 1, (c) => { c.moveTo(15.5 + sway, 46); c.lineTo(14.5 + sway, 55); });
  stroke(c, P.dressDk, 1.3, (c) => { c.moveTo(32.5 + sway, 45); c.lineTo(33.6 + sway, 55); });
  stroke(c, P.dressDk, 1, (c) => { c.moveTo(13.5 + sway, 56); c.quadraticCurveTo(24, 58.8, 34.5 + sway, 56); });
}
function collarFront(c) {
  poly(c, [[22, 34], [26, 34], [24, 38.5]], P.skin);
  poly(c, [[19.3, 34], [22.3, 34], [25.2, 41], [23.3, 41.5]], P.cream);
  poly(c, [[25.7, 34], [28.7, 34], [24.7, 41.5], [22.8, 41]], P.creamSh);
  stroke(c, P.creamDk, 0.9, (c) => { c.moveTo(22.3, 34.5); c.lineTo(24.6, 40.6); });
}
function obiFront(c) {
  poly(c, [[15.8, 40], [32.2, 40], [32.8, 44.5], [15.2, 44.5]], P.obi);
  rect(c, 16, 40, 16, 1, P.obiLt);
  rect(c, 15.3, 43.5, 17.5, 1, P.obiDk);
  rect(c, 15.6, 42, 16.8, 0.9, P.obiDk);
}
function apronFront(c, sway) {
  const shape = (c) => {
    c.moveTo(18.5, 44); c.lineTo(29.5, 44);
    c.lineTo(32.5 + sway, 54);
    c.quadraticCurveTo(30.5 + sway, 57.6, 27.6 + sway, 54.6);
    c.quadraticCurveTo(24 + sway, 58.2, 20.4 + sway, 54.6);
    c.quadraticCurveTo(17.5 + sway, 57.6, 15.5 + sway, 54);
  };
  path(c, P.cream, shape);
  clipped(c, shape, (c) => {
    rect(c, 29 + sway, 44, 6, 14, P.creamSh);
    rect(c, 14, 44, 22, 1.2, P.creamSh);
    stroke(c, P.creamSh, 1, (c) => { c.moveTo(19.5 + sway * 0.5, 47); c.lineTo(18.5 + sway, 55); });
  });
  rect(c, 25.5, 48, 4, 3, P.creamSh);
  rect(c, 25.5, 48, 4, 1, P.creamDk);
}
function obiBowBack(c, sway) {
  ell(c, 19.6, 42.2, 3.8, 2.7, P.obi, -0.2);
  ell(c, 28.4, 42.2, 3.8, 2.7, P.obi, 0.2);
  ell(c, 19, 41.6, 2, 1.1, P.obiLt, -0.2);
  ell(c, 29, 41.6, 2, 1.1, P.obiLt, 0.2);
  ell(c, 19.4, 43.6, 3, 0.9, P.obiDk, -0.2);
  ell(c, 28.6, 43.6, 3, 0.9, P.obiDk, 0.2);
  poly(c, [[22.3, 44.5], [24, 44.5], [23.2 + sway, 51.5], [20.6 + sway, 50.8]], P.obi);
  poly(c, [[24, 44.5], [25.7, 44.5], [27.4 + sway, 50.8], [24.8 + sway, 51.5]], P.obiDk);
  rect(c, 22.5, 40.5, 3, 3.6, P.obiDk);
  rect(c, 23, 41, 2, 1, P.obi);
}

/** Hanging kimono sleeve + hand. side -1 = viewer-left, +1 = viewer-right. sw = swing (-1..1). */
function armFB(c, side, sw, opts = {}) {
  const m = (x) => 24 - side * (x - 24);
  const o = -sw * 1.2;                     // forward arm rises a little, back arm drops
  const ix = sw * 0.6;                     // forward arm tucks in toward the body
  poly(c, [[m(16), 35], [m(20.5), 36], [m(19.5 + ix), 47 + o], [m(12.5 + ix), 46.5 + o]], P.dress);
  poly(c, [[m(18), 37], [m(20.5), 36], [m(19.5 + ix), 47 + o], [m(17.5 + ix), 47 + o]], P.dressDk);
  stroke(c, P.dressLt, 0.9, (c) => { c.moveTo(m(13 + ix), 46.5 + o); c.lineTo(m(19 + ix), 47 + o); });
  const hx = m(16 + ix), hy = 48.6 + o;
  ell(c, hx, hy, 2.1, 2.3, P.skin);
  ell(c, hx + side * 0.5, hy + 1.2, 1.6, 0.9, P.skinSh);
  if (opts.basket) basket(c, m(16 + ix) + side * 2.5 - (side < 0 ? 8 : 0), 45.5 + o, side, opts.sway);
}

/** Wicker basket hanging from a forearm. (x, y) = left edge / rim row of the body, 8x7. */
function basket(c, x, y, side, sway = 0) {
  x += sway * 0.7;
  const hx0 = side > 0 ? x + 1 : x + 7;    // handle spans body, drawn so it overlaps the forearm
  stroke(c, P.basketDk, 1.6, (c) => { c.moveTo(x + 1, y + 1); c.quadraticCurveTo(x + 4, y - 7.5, x + 7, y + 1); });
  stroke(c, P.basketLt, 0.7, (c) => { c.moveTo(x + 2, y); c.quadraticCurveTo(x + 4, y - 5.2, x + 6, y); });
  // contents peeking over the rim
  ell(c, x + 2.8, y - 0.3, 1.7, 1.5, P.apple);
  rect(c, x + 2, y - 1.2, 1, 1, P.appleLt);
  ell(c, x + 5.6, y, 1.5, 1.3, P.pear);
  poly(c, [[x + 4, y - 1.6], [x + 6.2, y - 2.6], [x + 5.6, y - 0.6]], P.leaf);
  path(c, P.basket, (c) => { c.moveTo(x, y); c.lineTo(x + 8, y); c.lineTo(x + 7, y + 7); c.lineTo(x + 1, y + 7); });
  for (let r = 0; r < 3; r++) {
    const yy = y + 2 + r * 2, off = r % 2;
    for (let k = 0; k < 3; k++) rect(c, x + 1 + off + k * 2, yy, 1, 1, P.basketDk);
  }
  rect(c, x + 6, y + 1, 1, 6, P.basketDk);
  rect(c, x, y, 8, 1, P.basketLt);
  rect(c, x + 0.5, y + 1, 1, 1, P.basketLt);
  void hx0;
}

/** Greeting arm for the front/back views. k: 0 anticipation, 1 wave, 2 lowering. side -1/+1. */
function waveArmFB(c, k, side, f, fromBack = false) {
  const m = (x) => 24 - side * (x - 24);
  const sx = 17.5, sy = 36.5;
  const poses = [
    { hand: [12.2, 40.2], via: null, fingers: false },
    { hand: [10.4, 17.2], via: [11.8, 27], fingers: true, tamoto: true },
    { hand: [10.8, 30.2], via: [12.5, 34.5], fingers: false },
  ];
  const { hand, via, fingers, tamoto } = poses[k];
  const [hx, hy] = hand;
  const seg = (c, dx, dy) => {
    c.moveTo(m(sx) + dx, sy + dy);
    if (via) c.quadraticCurveTo(m(via[0]) + dx, via[1] + dy, m(hx) + dx, hy + 2.2 + dy);
    else c.lineTo(m(hx) + dx, hy + 2 + dy);
  };
  if (tamoto) {
    // the wide kimono sleeve pocket hangs from the raised forearm
    poly(c, [[m(11.4), 23], [m(15.6), 24.4], [m(16.2), 35], [m(10.6), 34]], P.dress);
    poly(c, [[m(13.8), 23.8], [m(15.6), 24.4], [m(16.2), 35], [m(14.4), 35]], P.dressDk);
    stroke(c, P.dressLt, 0.9, (c) => { c.moveTo(m(11), 34); c.lineTo(m(16), 35); });
  }
  stroke(c, P.dressDk, 5, (c) => seg(c, side * -0.9, 0.9));
  stroke(c, P.dress, 5, (c) => seg(c, 0, 0));
  ell(c, m(hx), hy, 2.2, 2.4, P.skin);
  ell(c, m(hx) + side * -0.4, hy + 1.2, 1.5, 0.9, P.skinSh);
  if (fingers) {
    for (const [dx, dy] of [[-1.6, -3.1], [0, -3.5], [1.6, -3.1]]) ell(c, m(hx + dx), hy + dy, 0.62, 1.25, P.skin);
    ell(c, m(hx - 2.6), hy - 1, 1.2, 0.62, P.skin, side * 0.5); // thumb
    const r = f.rand;
    const sx1 = m(hx + 5 + r() * 2), sy1 = hy - 3 - r() * 3;
    sparkle(c, sx1, sy1, 1.8, '#FFF3B0');
    if (!fromBack) sparkle(c, m(hx - 4.5 + r()), hy + 4.5 + r() * 2, 1.2, '#FFF3B0');
  }
}

// ------------------------------------------------------------------ heads
function headFront(c, o) {
  const { dx = 0, mood = 'idle', lag = 0, swing = 0 } = o;
  c.save(); c.translate(dx, 0);
  ell(c, 24, 21 + lag * 0.5, 11.6, 11, P.hairDk);
  ell(c, 14.2, 26 + lag, 2.6, 6.6, P.hairDk); ell(c, 33.8, 26 + lag, 2.6, 6.6, P.hairDk);
  const face = (c) => c.ellipse(24, 24, 9, 8.6, 0, 0, TAU);
  path(c, P.skin, face);
  clipped(c, face, (c) => {
    rect(c, 14, 14, 20, 7.6, P.skinSh);
    ell(c, 24, 34, 8.5, 2.6, P.skinSh);
  });
  eye(c, 19.5, 26.2, mood, 0); eye(c, 28.5, 26.2, mood, 0);
  ell(c, 17.2, 29.9, 1.9, 1.1, P.blush); ell(c, 30.8, 29.9, 1.9, 1.1, P.blush);
  if (mood === 'joy') { ell(c, 17.2, 29.9, 2.4, 1.4, P.blush); ell(c, 30.8, 29.9, 2.4, 1.4, P.blush); }
  rect(c, 23.6, 28.2, 1, 1, P.skinDk);
  mouth(c, 24, 31, mood);
  const bangs = (c) => {
    c.moveTo(12.4, 22);
    c.quadraticCurveTo(12.4, 9.4, 24, 9.4);
    c.quadraticCurveTo(35.6, 9.4, 35.6, 22);
    for (const [x, y] of [[34, 19.4], [31.6, 22.6], [29, 19], [26.4, 22.6], [24, 19.4], [21.6, 22.6], [19, 19], [16.4, 22.6], [14, 19.4]]) c.lineTo(x, y);
  };
  path(c, P.hair, bangs);
  clipped(c, bangs, (c) => {
    rect(c, 30, 8, 7, 16, P.hairShade);
    hiBand(c, 14, 14, 20, P.hairLt, 2.6);
    hiBand(c, 15, 13.6, 16, P.hairHi, 1.3);
    stroke(c, P.hairDk, 0.8, (c) => { c.moveTo(29, 19); c.lineTo(29.6, 13); });
    stroke(c, P.hairDk, 0.8, (c) => { c.moveTo(19, 19); c.lineTo(18.6, 13); });
  });
  ell(c, 13.8, 25 + lag, 2.3, 6.6, P.hair); ell(c, 34.2, 25 + lag, 2.3, 6.6, P.hair);
  ell(c, 13.8, 30.4 + lag, 2.1, 1.8, P.hairDk); ell(c, 34.2, 30.4 + lag, 2.1, 1.8, P.hairDk);
  ell(c, 34.6, 26 + lag, 1, 4, P.hairShade);
  ribbon(c, 13.6, 14, -1, swing);
  c.restore();
}

function headBack(c, o) {
  const { dx = 0, lag = 0, swing = 0 } = o;
  c.save(); c.translate(dx, 0);
  rect(c, 21, 27, 6, 7, P.skinSh);
  const dome = (c) => {
    c.moveTo(12.4, 21);
    c.quadraticCurveTo(12.4, 9.4, 24, 9.4);
    c.quadraticCurveTo(35.6, 9.4, 35.6, 21);
    c.quadraticCurveTo(35.8, 32 + lag, 33, 32.4 + lag);
    c.quadraticCurveTo(24, 29.5 + lag, 15, 32.4 + lag);
    c.quadraticCurveTo(12.2, 32 + lag, 12.4, 21);
  };
  path(c, P.hair, dome);
  clipped(c, dome, (c) => {
    // darker underside of the bob and the shaded right
    path(c, P.hairDk, (c) => { c.moveTo(12, 26.5); c.quadraticCurveTo(24, 31, 36, 26.5); c.lineTo(36, 36); c.lineTo(12, 36); });
    rect(c, 30, 8, 7, 30, P.hairShade);
    hiBand(c, 14, 14, 20, P.hairLt, 2.6);
    hiBand(c, 15, 13.6, 16, P.hairHi, 1.3);
    stroke(c, P.hairDk, 0.9, (c) => { c.moveTo(24.5, 10); c.quadraticCurveTo(25.5, 20, 24.5, 28); });
    stroke(c, P.hairDk, 0.8, (c) => { c.moveTo(18.5, 18); c.quadraticCurveTo(18, 24, 18.5, 30); });
    stroke(c, P.hairDk, 0.8, (c) => { c.moveTo(30, 18); c.quadraticCurveTo(30.5, 24, 30, 30); });
  });
  ribbon(c, 34.4, 14, 1, swing);
  c.restore();
}

/** Facing left. Mirrored by the caller for right. */
function headSide(c, o) {
  const { dx = 0, mood = 'idle', lag = 0, ribbonNear = false, swing = 0 } = o;
  c.save(); c.translate(dx, 0);
  if (!ribbonNear) { ell(c, 29.5, 9.6, 2.7, 1.9, P.ribbon, -0.25); ell(c, 27.3, 9.9, 1.3, 1.3, P.ribbonDk); }
  ell(c, 25, 21 + lag * 0.5, 11.6, 11, P.hairDk);
  path(c, P.hairDk, (c) => { c.moveTo(25, 19); c.lineTo(36.2, 19); c.quadraticCurveTo(36.8, 29 + lag, 33.6, 32.4 + lag); c.quadraticCurveTo(29.4, 33.6 + lag, 25, 30.5 + lag); });
  const face = (c) => c.ellipse(20.5, 24.5, 8.8, 8.4, 0, 0, TAU);
  path(c, P.skin, face);
  clipped(c, face, (c) => { rect(c, 10, 14, 22, 7.4, P.skinSh); ell(c, 21, 34.5, 8, 2.6, P.skinSh); });
  poly(c, [[12.4, 25], [10.9, 26.8], [12.5, 28.3]], P.skin);
  eye(c, 16.4, 26.4, mood, -1, 2.1);
  ell(c, 14.8, 30.2, 1.8, 1.1, P.blush);
  if (mood === 'joy') { ell(c, 14.8, 30.2, 2.2, 1.4, P.blush); ell(c, 13, 31.2, 1.6, 1.4, P.mouthIn); ell(c, 12.9, 31.7, 0.9, 0.6, P.tongue); }
  else stroke(c, P.line, 1.1, (c) => { c.moveTo(12.4, 30.4); c.quadraticCurveTo(13.6, 31.8, 14.8, 30.9); });
  const bangs = (c) => {
    c.moveTo(11.5, 21.5);
    c.quadraticCurveTo(11, 9.4, 24, 9.4);
    c.quadraticCurveTo(36.6, 9.4, 36.6, 22);
    c.lineTo(31, 22);
    for (const [x, y] of [[29.4, 19.4], [27.2, 23.4], [25, 19], [22.6, 23.6], [19.6, 19], [16.6, 23.2], [13.6, 19.4]]) c.lineTo(x, y);
  };
  path(c, P.hair, bangs);
  clipped(c, bangs, (c) => {
    rect(c, 30, 8, 8, 16, P.hairShade);
    hiBand(c, 13, 14.2, 18, P.hairLt, 2.6);
    hiBand(c, 14, 13.8, 14, P.hairHi, 1.3);
    stroke(c, P.hairDk, 0.8, (c) => { c.moveTo(19.6, 19); c.lineTo(19, 13); });
    stroke(c, P.hairDk, 0.8, (c) => { c.moveTo(25, 19); c.lineTo(25.4, 13); });
  });
  ell(c, 27.2, 26 + lag, 2.4, 6.6, P.hair);
  ell(c, 27.2, 31.4 + lag, 2.1, 1.7, P.hairDk);
  if (ribbonNear) ribbon(c, 30.2, 13.4, 1, swing);
  c.restore();
}

// --------------------------------------------------------------- side body
function sandalSide(c, x, y, lifted) {
  // foot points to the front (left); x = ankle centre; rows y..y+3
  const tilt = lifted ? 1 : 0;
  path(c, P.skin, (c) => { c.moveTo(x - 4.6, y + 1.4 + tilt); c.quadraticCurveTo(x - 4.2, y - 0.6 + tilt, x - 2, y + tilt * 0.5); c.lineTo(x + 2.6, y); c.lineTo(x + 2.6, y + 2); c.lineTo(x - 4.6, y + 2 + tilt); });
  rect(c, x - 1.2, y + tilt * 0.3, 1, 2, P.strap);
  poly(c, [[x - 4.6, y + 2 + tilt], [x + 2.6, y + 2], [x + 2.6, y + 3], [x - 4.6, y + 3 + tilt]], P.sandalLt);
  poly(c, [[x - 4.6, y + 3 + tilt], [x + 2.6, y + 3], [x + 2.6, y + 4], [x - 4.6, y + 4 + tilt]], P.sandal);
}
function legsSide(c, s, by) {
  const leg = (x, lift, near) => {
    const top = 51 + by, footY = 59 - lift;
    rect(c, x - 2, top, 4, footY - top, near ? P.skin : P.skinSh);
    if (near) rect(c, x + 1, top, 1, footY - top, P.skinSh);
    sandalSide(c, x, footY, lift > 0);
  };
  leg(24 + 3 * s, s > 0 ? 2 : 0, false);
  leg(22 - 3 * s, s < 0 ? 2 : 0, true);
}
function dressSide(c, sway) {
  const g = grad(c, 14, 0, 34, 0, [[0, P.dressLt], [0.25, P.dress], [0.72, P.dress], [1, P.dressDk]]);
  path(c, g, (c) => {
    c.moveTo(18.5, 34); c.lineTo(29.5, 34);
    c.quadraticCurveTo(32.2, 44, 33.6 + sway * 0.5, 55.5);
    c.quadraticCurveTo(24, 58.5, 14 - sway, 55.5);
    c.quadraticCurveTo(15.6, 44, 18.5, 34);
  });
  stroke(c, P.dressDk, 1.2, (c) => { c.moveTo(30.5, 46); c.lineTo(32 + sway * 0.5, 55); });
  stroke(c, P.dressDk, 1, (c) => { c.moveTo(14.5 - sway, 56); c.quadraticCurveTo(24, 58.8, 33 + sway * 0.5, 56); });
  // collar: cream band wrapping the front of the neck
  poly(c, [[18.6, 34], [22.4, 34], [23.4, 40.5], [19.2, 40.5]], P.cream);
  stroke(c, P.creamDk, 0.9, (c) => { c.moveTo(21.2, 34.4); c.lineTo(22.2, 40.4); });
  // obi with a knot bump at the back
  poly(c, [[16.4, 40], [31.6, 40], [32.4, 44.5], [15.6, 44.5]], P.obi);
  rect(c, 16.6, 40, 15, 1, P.obiLt);
  rect(c, 15.8, 43.5, 16.6, 1, P.obiDk);
  rect(c, 16.2, 42, 16, 0.9, P.obiDk);
  ell(c, 32.6, 41.6, 2, 2.4, P.obi);
  ell(c, 33.2, 42.4, 1.2, 1.4, P.obiDk);
  // apron: the front half of the skirt
  const ap = (c) => {
    c.moveTo(17.6, 44); c.lineTo(25.2, 44); c.lineTo(25.6, 54.6);
    c.quadraticCurveTo(22.4, 57.8, 19.2, 54.6);
    c.quadraticCurveTo(16.4, 57.4, 13.8 - sway, 54.2);
    c.quadraticCurveTo(15.4, 48, 17.6, 44);
  };
  path(c, P.cream, ap);
  clipped(c, ap, (c) => {
    rect(c, 23, 44, 4, 14, P.creamSh);
    rect(c, 12, 44, 16, 1.2, P.creamSh);
    stroke(c, P.creamSh, 1, (c) => { c.moveTo(18.5, 47); c.lineTo(17.4 - sway * 0.6, 54.5); });
  });
  rect(c, 20.5, 48, 3, 3, P.creamSh);
  rect(c, 20.5, 48, 3, 1, P.creamDk);
}
function farArmSide(c, s, sway) {
  // her far arm hangs behind the body with the basket on the forearm; it swings opposite the near leg
  const fx = 30 - 2.2 * s;
  poly(c, [[26.5, 36], [30, 36], [fx + 3, 46], [fx - 0.5, 46]], P.dressDk);
  ell(c, fx + 1.2, 47.4, 2, 2.2, P.skinSh);
  basket(c, fx - 0.5, 45.5, 1, sway);
}
function nearArmSide(c, s) {
  const hx = 23 + 2.6 * s;
  poly(c, [[20, 35], [25.6, 35], [hx + 3.4, 47], [hx - 3, 46.5]], P.dress);
  poly(c, [[23.6, 36], [25.6, 35], [hx + 3.4, 47], [hx + 1.4, 47]], P.dressDk);
  stroke(c, P.dressLt, 0.9, (c) => { c.moveTo(hx - 2.5, 46.6); c.lineTo(hx + 3, 47); });
  ell(c, hx, 48.6, 2.1, 2.3, P.skin);
  ell(c, hx + 0.4, 49.8, 1.6, 0.9, P.skinSh);
}
function waveArmSide(c, k, f) {
  const sx = 22.5, sy = 37;
  const poses = [
    { hand: [13.6, 40.6], via: [17, 40.5], end: [1.4, 0.4], fingers: false },
    { hand: [7.6, 20.2], via: [6.4, 38.5], end: [0.2, 2.6], fingers: true },
    { hand: [11.6, 32.8], via: [16, 36], end: [1.4, 0.4], fingers: false },
  ];
  const { hand, via, end, fingers } = poses[k];
  const [hx, hy] = hand;
  const seg = (c, dx, dy) => { c.moveTo(sx + dx, sy + dy); c.quadraticCurveTo(via[0] + dx, via[1] + dy, hx + end[0] + dx, hy + end[1] + dy); };
  stroke(c, P.dressDk, 5, (c) => seg(c, 0.9, 0.9));
  stroke(c, P.dress, 5, (c) => seg(c, 0, 0));
  if (fingers) {
    // sleeve opening below the wrist
    poly(c, [[5.6, 25.5], [10.6, 25.5], [11.4, 30.5], [5.4, 30], [4.6, 27.5]], P.dress);
    poly(c, [[8.8, 25.5], [10.6, 25.5], [11.4, 30.5], [9.6, 30.5]], P.dressDk);
    stroke(c, P.dressLt, 0.9, (c) => { c.moveTo(5.4, 30); c.lineTo(11, 30.5); });
  }
  ell(c, hx, hy, 2.2, 2.4, P.skin);
  ell(c, hx + 0.4, hy + 1.2, 1.5, 0.9, P.skinSh);
  if (fingers) {
    for (const [dx, dy] of [[-1.7, -3], [-0.2, -3.5], [1.4, -3]]) ell(c, hx + dx, hy + dy, 0.62, 1.25, P.skin);
    ell(c, hx + 2.7, hy - 0.8, 1.2, 0.62, P.skin, -0.5);
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
  dressFB(c, sway);
  collarFront(c);
  obiFront(c);
  apronFront(c, sway);
  armFB(c, 1, s, { basket: true, sway });           // her left arm (viewer right) carries the basket
  if (wave < 0) armFB(c, -1, -s, {});
  const lean = wave === 1 ? -1 : wave === 0 ? -0.5 : 0;
  headFront(c, { dx: lean, mood, lag, swing: -s });
  if (wave >= 0) waveArmFB(c, wave, -1, f);
  c.restore();
}
function drawUp(c, p, f) {
  const { s, by, wave, lag } = p;
  const sway = -s;
  legsFB(c, -s, by);
  c.save(); c.translate(0, by);
  dressFB(c, sway);
  poly(c, [[19.5, 34], [28.5, 34], [28, 36.4], [20, 36.4]], P.cream);
  obiFront(c);
  obiBowBack(c, sway);
  armFB(c, -1, s, { basket: true, sway });          // her left arm is on the viewer's left from behind
  if (wave < 0) armFB(c, 1, -s, {});
  const lean = wave === 1 ? 1 : wave === 0 ? 0.5 : 0;
  headBack(c, { dx: lean, lag, swing: s });
  if (wave >= 0) waveArmFB(c, wave, 1, f, true);
  c.restore();
}
function drawSide(c, p, f, ribbonNear) {
  const { s, by, wave, mood, lag } = p;
  const sway = s;
  c.save(); c.translate(0, by);
  farArmSide(c, s, sway);
  c.restore();
  legsSide(c, s, by);
  c.save(); c.translate(0, by);
  dressSide(c, sway);
  if (wave < 0) nearArmSide(c, s);
  const lean = wave === 1 ? -1 : wave === 0 ? -0.5 : 0;
  headSide(c, { dx: lean, mood, lag, ribbonNear, swing: -s });
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
  const S = (color, w, fn) => { ctx.beginPath(); fn(ctx); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); };

  // back hair + side locks
  E(128, 118, 86, 82, P.hairDk, 0, 3);
  O(P.hairDk, (c) => { c.moveTo(44, 120); c.quadraticCurveTo(34, 180, 60, 214); c.quadraticCurveTo(80, 214, 82, 180); c.lineTo(74, 118); });
  O(P.hairDk, (c) => { c.moveTo(212, 120); c.quadraticCurveTo(222, 180, 196, 214); c.quadraticCurveTo(176, 214, 174, 180); c.lineTo(182, 118); });
  // neck
  O(P.skinSh, (c) => { c.moveTo(110, 168); c.lineTo(146, 168); c.lineTo(150, 210); c.lineTo(106, 210); });
  // shoulders / dress
  const dg = grad(ctx, 30, 0, 230, 0, [[0, P.dressLt], [0.3, P.dress], [0.8, P.dress], [1, P.dressDk]]);
  O(dg, (c) => {
    c.moveTo(102, 200); c.quadraticCurveTo(62, 206, 30, 236); c.quadraticCurveTo(18, 248, 14, 262);
    c.lineTo(242, 262); c.quadraticCurveTo(238, 248, 226, 236); c.quadraticCurveTo(194, 206, 154, 200);
    c.lineTo(128, 240);
  });
  // collar (eri), overlapped left over right
  O(P.creamSh, (c) => { c.moveTo(148, 196); c.lineTo(168, 200); c.lineTo(134, 250); c.lineTo(124, 240); }, 3);
  O(P.cream, (c) => { c.moveTo(108, 196); c.lineTo(88, 200); c.lineTo(126, 252); c.lineTo(136, 242); }, 3);
  // obi
  O(P.obi, (c) => { c.moveTo(52, 242); c.lineTo(204, 242); c.lineTo(210, 262); c.lineTo(46, 262); }, 3);
  S(P.obiLt, 4, (c) => { c.moveTo(56, 246); c.lineTo(200, 246); });
  S(P.obiDk, 3, (c) => { c.moveTo(52, 254); c.lineTo(206, 254); });
  // face: round cheeks, soft chin
  const face = (c) => {
    c.moveTo(66, 118);
    c.quadraticCurveTo(66, 176, 96, 194);
    c.quadraticCurveTo(128, 210, 160, 194);
    c.quadraticCurveTo(190, 176, 190, 118);
    c.quadraticCurveTo(186, 74, 128, 72);
    c.quadraticCurveTo(70, 74, 66, 118);
  };
  O(P.skin, face, 3);
  clipped(ctx, face, (c) => {
    rect(c, 60, 60, 140, 50, P.skinSh);
    ell(c, 128, 204, 56, 14, P.skinSh);
  });
  // blush
  const blushG = (x) => { const g = ctx.createRadialGradient(x, 164, 2, x, 164, 20); g.addColorStop(0, 'rgba(242,120,130,0.85)'); g.addColorStop(1, 'rgba(242,120,130,0)'); return g; };
  ell(ctx, 90, 164, 20, 12, blushG(90)); ell(ctx, 166, 164, 20, 12, blushG(166));
  S('rgba(214,100,110,0.5)', 2, (c) => { c.moveTo(82, 160); c.lineTo(88, 168); c.moveTo(90, 158); c.lineTo(96, 166); });
  S('rgba(214,100,110,0.5)', 2, (c) => { c.moveTo(160, 158); c.lineTo(166, 166); c.moveTo(168, 160); c.lineTo(174, 168); });
  // eyes
  const bigEye = (ex, ey, look) => {
    E(ex, ey, 17, 21, P.eyeW, 0, 2.5);
    const g = grad(ctx, 0, ey - 18, 0, ey + 20, [[0, P.irisDk], [0.4, P.iris], [1, P.irisLt]]);
    ctx.beginPath(); ctx.ellipse(ex + look, ey + 3, 12.5, 15.5, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = P.irisDk; ctx.lineWidth = 1.5; ctx.stroke();
    ell(ctx, ex + look, ey + 4, 5.5, 7.5, P.pupil);
    ell(ctx, ex + look, ey + 11, 6, 3, 'rgba(255,240,180,0.55)');
    ell(ctx, ex - 6 + look, ey - 5, 5.4, 5.8, '#FFFFFF');
    ell(ctx, ex + 6 + look, ey + 10, 2.8, 3, '#FFFFFF');
    // upper lash: symmetric arc, thicker toward the outer corner
    O(P.line, (c) => {
      c.moveTo(ex - 18, ey - 4);
      c.quadraticCurveTo(ex - 8, ey - 28, ex + 10, ey - 26);
      c.quadraticCurveTo(ex + 18, ey - 24, ex + 21, ey - 10);
      c.quadraticCurveTo(ex + 14, ey - 21, ex, ey - 21);
      c.quadraticCurveTo(ex - 10, ey - 21, ex - 18, ey - 4);
    }, 1.5);
    S(P.line, 2.2, (c) => { c.moveTo(ex - 12, ey + 18); c.quadraticCurveTo(ex, ey + 23, ex + 12, ey + 18); });
    S('rgba(214,120,90,0.7)', 2, (c) => { c.moveTo(ex - 12, ey - 26); c.quadraticCurveTo(ex, ey - 32, ex + 12, ey - 28); });
  };
  bigEye(100, 148, 1); bigEye(156, 148, -1);
  // nose + mouth
  S(P.skinDk, 2.5, (c) => { c.moveTo(126, 172); c.quadraticCurveTo(131, 174, 129, 178); });
  O(P.mouthIn, (c) => { c.moveTo(116, 188); c.quadraticCurveTo(128, 185, 140, 188); c.quadraticCurveTo(135, 202, 128, 202); c.quadraticCurveTo(121, 202, 116, 188); }, 2.5);
  ell(ctx, 128, 198, 6, 3.5, P.tongue);
  S('#FFFFFF', 2, (c) => { c.moveTo(120, 189); c.lineTo(136, 189); });
  // bangs: rounded locks
  const bangs = (c) => {
    c.moveTo(42, 130);
    c.quadraticCurveTo(38, 36, 128, 34);
    c.quadraticCurveTo(218, 36, 214, 130);
    const tips = [[214, 130], [200, 112], [184, 132], [166, 108], [150, 130], [132, 104], [112, 130], [94, 108], [76, 132], [58, 112], [42, 130]];
    for (let i = 1; i < tips.length; i++) {
      const [x0, y0] = tips[i - 1], [x1, y1] = tips[i];
      const down = y1 > y0;
      c.quadraticCurveTo(down ? x0 - (x0 - x1) * 0.35 : x1 + (x0 - x1) * 0.35, down ? y1 - 2 : y0 - 2, x1, y1);
    }
  };
  O(P.hair, bangs, 3);
  clipped(ctx, bangs, (c) => {
    rect(c, 176, 20, 60, 130, P.hairShade);
    hiBand(c, 60, 76, 136, P.hairLt, 15, 11, 17);
    hiBand(c, 68, 74, 120, P.hairHi, 6, 11, 17);
    S(P.hairDk, 2.5, (c) => { c.moveTo(166, 108); c.quadraticCurveTo(164, 84, 168, 62); });
    S(P.hairDk, 2.5, (c) => { c.moveTo(94, 108); c.quadraticCurveTo(92, 84, 90, 62); });
    S(P.hairDk, 2, (c) => { c.moveTo(132, 104); c.quadraticCurveTo(133, 82, 130, 62); });
  });
  // brows, showing through the bangs
  S('rgba(90,51,27,0.75)', 3.5, (c) => { c.moveTo(84, 122); c.quadraticCurveTo(100, 112, 116, 118); });
  S('rgba(90,51,27,0.75)', 3.5, (c) => { c.moveTo(140, 118); c.quadraticCurveTo(156, 112, 172, 122); });
  // front side locks
  O(P.hair, (c) => { c.moveTo(46, 112); c.quadraticCurveTo(40, 170, 58, 208); c.quadraticCurveTo(72, 208, 72, 160); c.lineTo(66, 112); }, 3);
  O(P.hair, (c) => { c.moveTo(210, 112); c.quadraticCurveTo(216, 170, 198, 208); c.quadraticCurveTo(184, 208, 184, 160); c.lineTo(190, 112); }, 3);
  S(P.hairDk, 2.5, (c) => { c.moveTo(60, 192); c.quadraticCurveTo(64, 202, 60, 208); });
  S(P.hairDk, 2.5, (c) => { c.moveTo(196, 192); c.quadraticCurveTo(192, 202, 196, 208); });
  // ribbon on her right (viewer's left)
  const rb = (x, y) => {
    O(P.ribbonDk, (c) => { c.moveTo(x - 6, y + 4); c.lineTo(x + 6, y + 4); c.lineTo(x + 2, y + 34); c.lineTo(x - 10, y + 30); }, 3);
    O(P.ribbon, (c) => { c.moveTo(x - 8, y + 4); c.lineTo(x + 2, y + 4); c.lineTo(x - 14, y + 30); c.lineTo(x - 24, y + 24); }, 3);
    E(x - 16, y - 2, 17, 11, P.ribbon, 0.45, 3);
    E(x + 4, y - 16, 11, 16, P.ribbon, -0.35, 3);
    E(x - 18, y - 5, 8, 4, P.ribbonLt, 0.45);
    E(x + 2, y - 20, 4, 7, P.ribbonLt, -0.35);
    E(x, y, 7, 7, P.ribbonDk, 0, 3);
  };
  rb(66, 66);
  ctx.restore();
}

// -------------------------------------------------------------- export
export default {
  id: 'chr_villager',
  name: 'Villager',
  role: 'npc',
  assetId: 'ast_starter_villager',
  file: 'villager.png',
  frameWidth: W,
  frameHeight: H,
  collider: { width: 24, height: 16, offsetX: 12, offsetY: 48 },
  walkFrameRate: 8,
  attackFrameRate: 10,
  portrait: { assetId: 'ast_starter_villager_portrait', file: 'villager_portrait.png', size: 256 },

  draw(ctx, f) {
    const p = pose(f);
    // ground shadow (not outlined)
    ell(ctx, 24, 61.6, 10.5 + (p.by ? 0.5 : 0), 2.6, P.shadow);

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
