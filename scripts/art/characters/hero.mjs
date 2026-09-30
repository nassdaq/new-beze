/**
 * Hero: a young female swordswoman (player character).
 * Long white side-swept hair, blue-violet eyes, long black high-collared coat with crimson lining,
 * dark trousers, boots and a katana worn at the left hip. Beze Character Sheet v2, 48x64 frames.
 * Everything is drawn with paths; deterministic (uses f.rand only).
 */

const P = {
  ol: '#1a1424',
  skin: '#ffe4d2', skinS: '#efb9a2', blush: 'rgba(255,110,140,0.35)', mouth: '#a54a5e',
  hair: '#eeeaf7', hairS: '#b7b1d9', hairD: '#8d87bb', hairH: '#ffffff',
  eye: '#5d4fe0', eyeD: '#2a2272', eyeL: '#9a92ff', brow: '#5a5484',
  coat: '#26243a', coatS: '#151320', coatH: '#3f3c58', coatL: '#55516f',
  red: '#b3152c', redH: '#e83d52', redS: '#7a0d1e',
  pants: '#2c2a3e', pantsS: '#1a1928',
  boot: '#6b4634', bootS: '#3e2719', bootH: '#94674c',
  belt: '#15121b', gold: '#dcb040', goldD: '#8f6f1c',
  hilt: '#4b3f98', hiltD: '#2c2560', blade: '#e4ecf6', bladeS: '#98abc6', bladeH: '#ffffff',
  sheath: '#1f1e2b', sheathH: '#4a4860',
  trail: 'rgba(140,210,255,0.6)', trailH: 'rgba(240,250,255,0.95)',
};

// ---------------------------------------------------------------- primitives
function fs(ctx, fill, stroke = P.ol, lw = 1) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function ell(ctx, cx, cy, rx, ry, fill, stroke = P.ol, lw = 1) {
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); fs(ctx, fill, stroke, lw);
}
function line(ctx, x1, y1, x2, y2, color, w = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function curve(ctx, x1, y1, cxp, cyp, x2, y2, color, w = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cxp, cyp, x2, y2); ctx.stroke();
}
function limb(ctx, x1, y1, x2, y2, color, w) { line(ctx, x1, y1, x2, y2, P.ol, w + 2); line(ctx, x1, y1, x2, y2, color, w); }
function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g;
}
function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
function shadow(ctx, cx, rx) {
  ctx.fillStyle = 'rgba(10,6,24,0.30)'; ctx.beginPath(); ctx.ellipse(cx, 61.6, rx, 2.4, 0, 0, Math.PI * 2); ctx.fill();
}

// ---------------------------------------------------------------- weapon
function hand(ctx, x, y) { ell(ctx, x, y, 2.2, 2.2, P.skin); }

/** Drawn katana: hand at (hx,hy), blade pointing along `ang` (screen radians), blade length `len`. */
function katana(ctx, hx, hy, ang, len) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const p = (t, n) => [hx + dx * t + nx * n, hy + dy * t + ny * n];
  limb(ctx, ...p(-1, 0), ...p(-6.5, 0), P.hilt, 3);
  ctx.strokeStyle = P.hiltD; ctx.lineWidth = 1;
  for (const t of [-2.3, -4.6]) { ctx.beginPath(); ctx.moveTo(...p(t, -1.3)); ctx.lineTo(...p(t - 1, 1.3)); ctx.stroke(); }
  ell(ctx, ...p(-6.8, 0), 1.3, 1.3, P.gold, P.ol, 0.9);
  // blade: tapered, one bright edge
  poly(ctx, [p(2, 1.5), p(len - 4, 1.2), p(len, -0.3), p(2, -1.5)]);
  ctx.fillStyle = grad(ctx, ...p(0, 1.6), ...p(0, -1.6), [[0, P.bladeS], [0.5, P.blade], [1, P.bladeH]]);
  ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  line(ctx, ...p(3, -0.6), ...p(len - 4, -0.5), P.bladeH, 0.7);
  // tsuba
  line(ctx, ...p(1.5, 3.1), ...p(1.5, -3.1), P.ol, 3.4);
  line(ctx, ...p(1.5, 2.4), ...p(1.5, -2.4), P.gold, 1.9);
}

/** Pale-blue slash arc. */
function trail(ctx, t, rand) {
  const [cx, cy] = t.c;
  ctx.lineCap = 'round';
  ctx.strokeStyle = P.trail; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, t.r, t.a0, t.a1); ctx.stroke();
  ctx.strokeStyle = P.trailH; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(cx, cy, t.r, t.a0, t.a1); ctx.stroke();
  ctx.fillStyle = P.trailH;
  for (let i = 0; i < 4; i++) {
    const a = t.a0 + (t.a1 - t.a0) * rand(), rr = t.r + 2.5 + rand() * 3;
    const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr);
    if (x >= 1 && x <= 46 && y >= 1 && y <= 62) ctx.fillRect(x, y, 1, 1);
  }
}

/** Sheath from guard end (x1,y1) to tip (x2,y2); hilt continues backwards from the guard when `withHilt`. */
function sheath(ctx, x1, y1, x2, y2, withHilt) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  limb(ctx, x1, y1, x2, y2, P.sheath, 3);
  line(ctx, x1 + ux * 2, y1 + uy * 2 - 0.8, x2 - ux * 1.5, y2 - uy * 1.5 - 0.8, P.sheathH, 0.8);
  line(ctx, x1 + ux * 3, y1 + uy * 3, x1 + ux * 5, y1 + uy * 5, P.red, 3); // sageo cord
  ell(ctx, x2, y2, 1.4, 1.4, P.sheathH, P.ol, 0.8); // kojiri cap
  if (withHilt) {
    limb(ctx, x1 - ux * 1.5, y1 - uy * 1.5, x1 - ux * 7.5, y1 - uy * 7.5, P.hilt, 3);
    ctx.strokeStyle = P.hiltD; ctx.lineWidth = 1;
    for (const t of [3, 5.2]) { ctx.beginPath(); ctx.moveTo(x1 - ux * t - uy * 1.3, y1 - uy * t + ux * 1.3); ctx.lineTo(x1 - ux * (t + 1) + uy * 1.3, y1 - uy * (t + 1) - ux * 1.3); ctx.stroke(); }
    ell(ctx, x1 - ux * 7.8, y1 - uy * 7.8, 1.3, 1.3, P.gold, P.ol, 0.9);
  }
  // tsuba at the mouth
  line(ctx, x1 - uy * 3, y1 + ux * 3, x1 + uy * 3, y1 - ux * 3, P.ol, 3.2);
  line(ctx, x1 - uy * 2.3, y1 + ux * 2.3, x1 + uy * 2.3, y1 - ux * 2.3, P.gold, 1.8);
}

// ---------------------------------------------------------------- body parts (front / back)
function legFront(ctx, x, bottom, side) {
  const top = 45;
  poly(ctx, [[x - 2.8, top], [x + 2.8, top], [x + 2.6, bottom - 6.5], [x - 2.6, bottom - 6.5]]);
  fs(ctx, P.pants);
  line(ctx, x + side * 1.6, top + 1, x + side * 1.5, bottom - 7, P.pantsS, 1.2);
  ctx.beginPath();
  ctx.moveTo(x - 3, bottom - 7); ctx.lineTo(x + 3, bottom - 7);
  ctx.lineTo(x + 3.3, bottom - 2); ctx.quadraticCurveTo(x + 3.5, bottom - 0.5, x + 2, bottom - 0.5);
  ctx.lineTo(x - 2, bottom - 0.5); ctx.quadraticCurveTo(x - 3.5, bottom - 0.5, x - 3.3, bottom - 2);
  ctx.closePath(); fs(ctx, P.boot);
  line(ctx, x - 1.6, bottom - 5.5, x - 1.6, bottom - 2.5, P.bootH, 1);
  line(ctx, x - 2.6, bottom - 1.2, x + 2.6, bottom - 1.2, P.bootS, 1);
  line(ctx, x - 3, bottom - 6.5, x + 3, bottom - 6.5, P.bootS, 0.8);
}

function coatPath(ctx, cx, sy, hy, hemL, hemR) {
  ctx.beginPath();
  ctx.moveTo(cx - 6, sy); ctx.lineTo(cx + 6, sy);
  ctx.quadraticCurveTo(cx + 11, sy, cx + 11, sy + 6);
  ctx.lineTo(cx + 12.5, hy + hemR);
  ctx.quadraticCurveTo(cx + 6, hy + 2.5, cx, hy + 1.5);
  ctx.quadraticCurveTo(cx - 6, hy + 2.5, cx - 12.5, hy + hemL);
  ctx.lineTo(cx - 11, sy + 6);
  ctx.quadraticCurveTo(cx - 11, sy, cx - 6, sy);
  ctx.closePath();
}
function hemPath(ctx, cx, hy, hemL, hemR) {
  ctx.beginPath();
  ctx.moveTo(cx - 13.5, hy + hemL); ctx.quadraticCurveTo(cx - 6, hy + 2.5, cx, hy + 1.5); ctx.quadraticCurveTo(cx + 6, hy + 2.5, cx + 13.5, hy + hemR);
}
function coatFront(ctx, cx, by, pose, back) {
  const sy = 30.5 + by, hy = 52 + (pose.crouch || 0) * 0.5;
  const hemL = pose.hemL || 0, hemR = pose.hemR || 0;
  coatPath(ctx, cx, sy, hy, hemL, hemR);
  ctx.fillStyle = grad(ctx, cx - 12, 0, cx + 12, 0, [[0, P.coatH], [0.4, P.coat], [1, P.coatS]]);
  ctx.fill();
  ctx.save(); ctx.clip();
  if (!back) {
    // front opening showing the crimson lining
    poly(ctx, [[cx - 0.5, 43], [cx - 3.5, hy + 3], [cx + 3.5, hy + 3]]); ctx.fillStyle = P.red; ctx.fill();
    line(ctx, cx - 0.5, 44, cx - 0.5, hy + 2, P.redS, 1);
    line(ctx, cx + 1.2, 46, cx + 2.5, hy + 2, P.redH, 0.8);
    for (const y of [35.5, 39]) { ctx.fillStyle = P.gold; ctx.beginPath(); ctx.arc(cx + 0.5, y + by, 0.9, 0, Math.PI * 2); ctx.fill(); }
  } else {
    line(ctx, cx, sy + 2, cx, hy + 1, P.coatS, 1); // back seam
    curve(ctx, cx - 8, sy + 8, cx - 5, 44, cx - 7, hy, P.coatS, 0.8);
  }
  hemPath(ctx, cx, hy, hemL, hemR); ctx.strokeStyle = P.red; ctx.lineWidth = 3.2; ctx.stroke();
  hemPath(ctx, cx, hy - 1.2, hemL, hemR); ctx.strokeStyle = P.redH; ctx.lineWidth = 0.8; ctx.stroke();
  // fold highlight
  curve(ctx, cx - 9, sy + 6, cx - 10, 44, cx - 10, hy - 2, P.coatL, 0.8);
  ctx.restore();
  coatPath(ctx, cx, sy, hy, hemL, hemR); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  // belt + buckle
  poly(ctx, [[cx - 11, 41 + by], [cx + 11, 41 + by], [cx + 11.3, 43.6 + by], [cx - 11.3, 43.6 + by]]); fs(ctx, P.belt);
  line(ctx, cx - 10, 41.8 + by, cx + 10, 41.8 + by, P.coatL, 0.6);
  if (!back) { ctx.fillStyle = P.gold; ctx.fillRect(cx - 1.5, 41 + by, 3, 3); ctx.strokeStyle = P.ol; ctx.lineWidth = 0.7; ctx.strokeRect(cx - 1.5, 41 + by, 3, 3); }
}

function armSleeve(ctx, sx, sy, hx, hy, w = 4.4) {
  limb(ctx, sx, sy, hx, hy, P.coat, w);
  const dx = hx - sx, dy = hy - sy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  line(ctx, sx + ux * 2 - uy * 1.2, sy + uy * 2 + ux * 1.2, hx - ux * 4 - uy * 1.2, hy - uy * 4 + ux * 1.2, P.coatH, 0.9);
  line(ctx, hx - ux * 3.2, hy - uy * 3.2, hx - ux * 0.6, hy - uy * 0.6, P.red, w);
  line(ctx, hx - ux * 3.4, hy - uy * 3.4, hx - ux * 3.4, hy - uy * 3.4, P.ol, w + 1.4);
  line(ctx, hx - ux * 3.2, hy - uy * 3.2, hx - ux * 0.6, hy - uy * 0.6, P.red, w);
  hand(ctx, hx + ux * 1.6, hy + uy * 1.6);
}

// ---------------------------------------------------------------- head (front)
function faceShape(ctx, cx, cy) {
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy - 3);
  ctx.bezierCurveTo(cx - 11, cy + 6, cx - 6, cy + 11, cx, cy + 11.5);
  ctx.bezierCurveTo(cx + 6, cy + 11, cx + 11, cy + 6, cx + 11, cy - 3);
  ctx.bezierCurveTo(cx + 11, cy - 12, cx + 6, cy - 12.5, cx, cy - 12.5);
  ctx.bezierCurveTo(cx - 6, cy - 12.5, cx - 11, cy - 12, cx - 11, cy - 3);
  ctx.closePath();
}
function fringePath(ctx, cx, cy) {
  ctx.beginPath();
  ctx.moveTo(cx - 12.5, cy - 3);
  ctx.quadraticCurveTo(cx - 13.5, cy - 15.5, cx - 1, cy - 14.5);
  ctx.quadraticCurveTo(cx + 12.5, cy - 15, cx + 12.5, cy - 3);
  ctx.quadraticCurveTo(cx + 13.5, cy + 3, cx + 10.5, cy + 7);
  ctx.quadraticCurveTo(cx + 9, cy + 1, cx + 6, cy + 3.5);
  ctx.quadraticCurveTo(cx + 4.5, cy - 1.5, cx + 1.5, cy + 1.5);
  ctx.quadraticCurveTo(cx - 0.5, cy - 3, cx - 3.5, cy - 0.5);
  ctx.quadraticCurveTo(cx - 6, cy - 4, cx - 8.5, cy - 1);
  ctx.quadraticCurveTo(cx - 11, cy - 3.5, cx - 12.5, cy - 3);
  ctx.closePath();
}
function hairFill(ctx, y0, y1) {
  ctx.fillStyle = grad(ctx, 0, y0, 0, y1, [[0, P.hairH], [0.3, P.hair], [1, P.hairS]]); ctx.fill();
}
function eyeFront(ctx, ex, ey, side, narrow) {
  const n = narrow ? 0.62 : 1;
  ctx.beginPath(); ctx.ellipse(ex, ey, 2.6, 3.1 * n, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(ex, ey + 0.4, 2, 2.6 * n, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad(ctx, 0, ey - 2.4, 0, ey + 3, [[0, P.eyeD], [0.55, P.eye], [1, P.eyeL]]); ctx.fill();
  ctx.beginPath(); ctx.ellipse(ex, ey + 0.7, 0.85, 1.3 * n, 0, 0, Math.PI * 2); ctx.fillStyle = P.eyeD; ctx.fill();
  // upper lash: outer corner high, inner corner lower -> sharp look
  ctx.strokeStyle = P.ol; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(ex - side * 3, ey - 1.1 * n); ctx.quadraticCurveTo(ex, ey - 4.2 * n, ex + side * 3.3, ey - 2.6 * n); ctx.stroke();
  line(ctx, ex + side * 3.2, ey - 2.6 * n, ex + side * 3.9, ey - 3.3 * n, P.ol, 1);
  line(ctx, ex - side * 1.2, ey + 3.1 * n, ex + side * 2.2, ey + 2.8 * n, P.ol, 0.7);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(ex - 0.9, ey - 0.7 * n, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex + 1.1, ey + 1.6 * n, 0.5, 0, Math.PI * 2); ctx.fill();
  // brow
  ctx.strokeStyle = P.brow; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(ex + side * 3.3, ey - 6.8 * n - (narrow ? 0.6 : 0)); ctx.quadraticCurveTo(ex, ey - 7 * n, ex - side * 2.4, ey - 5.2 * n + (narrow ? 0.6 : 0)); ctx.stroke();
}
function headFront(ctx, cx, cy, o) {
  ell(ctx, cx - 11, cy + 2, 2, 2.4, P.skin); ell(ctx, cx + 11, cy + 2, 2, 2.4, P.skin);
  faceShape(ctx, cx, cy); fs(ctx, P.skin);
  ctx.save(); faceShape(ctx, cx, cy); ctx.clip();
  ctx.fillStyle = P.skinS;
  ctx.beginPath(); ctx.ellipse(cx, cy + 12, 9, 3, 0, 0, Math.PI * 2); ctx.fill(); // chin/jaw shade
  ctx.translate(0, 2); fringePath(ctx, cx, cy); ctx.fill(); // fringe cast shadow
  ctx.restore();
  ctx.fillStyle = P.blush;
  ctx.beginPath(); ctx.ellipse(cx - 7.2, cy + 6.5, 2.3, 1.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 7.2, cy + 6.5, 2.3, 1.2, 0, 0, Math.PI * 2); ctx.fill();
  eyeFront(ctx, cx - 5, cy + 3, -1, o.narrow); eyeFront(ctx, cx + 5, cy + 3, 1, o.narrow);
  ctx.fillStyle = P.skinS; ctx.fillRect(cx + 0.5, cy + 6, 1, 1);
  if (o.narrow) line(ctx, cx - 1.5, cy + 8.6, cx + 1.5, cy + 8.6, P.mouth, 1);
  else curve(ctx, cx - 1.3, cy + 8.2, cx, cy + 9.2, cx + 1.3, cy + 8.2, P.mouth, 0.9);
}
function collarFront(ctx, cx, cy) {
  poly(ctx, [[cx - 8.5, cy + 15.5], [cx - 7, cy + 8], [cx - 2.5, cy + 10], [cx, cy + 15], [cx + 2.5, cy + 10], [cx + 7, cy + 8], [cx + 8.5, cy + 15.5]]);
  fs(ctx, P.coatH);
  poly(ctx, [[cx - 3.6, cy + 9.6], [cx, cy + 14.6], [cx + 3.6, cy + 9.6]]); ctx.fillStyle = P.red; ctx.fill();
  ctx.fillStyle = P.skin; ctx.beginPath(); ctx.moveTo(cx - 2.4, cy + 9.5); ctx.lineTo(cx + 2.4, cy + 9.5); ctx.lineTo(cx + 1.2, cy + 12.8); ctx.lineTo(cx - 1.2, cy + 12.8); ctx.closePath(); ctx.fill();
  line(ctx, cx - 6.6, cy + 9, cx - 7.5, cy + 15, P.coatL, 0.7); line(ctx, cx + 6.6, cy + 9, cx + 7.5, cy + 15, P.coatL, 0.7);
}
function frontHair(ctx, cx, cy, sway) {
  fringePath(ctx, cx, cy); hairFill(ctx, cy - 14, cy + 7);
  ctx.save(); fringePath(ctx, cx, cy); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx + 1, cy - 1, 10, -2.7, -0.55); ctx.stroke();
  ctx.strokeStyle = P.hairS; ctx.lineWidth = 0.8;
  curve(ctx, cx + 8, cy - 8, cx + 10, cy - 2, cx + 8.5, cy + 4, P.hairS, 0.8);
  curve(ctx, cx + 2, cy - 8, cx + 4, cy - 3, cx + 3.5, cy + 1, P.hairS, 0.8);
  curve(ctx, cx - 4, cy - 9, cx - 3, cy - 4, cx - 5, cy - 1, P.hairS, 0.8);
  ctx.restore();
  fringePath(ctx, cx, cy); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  // side locks framing the face
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * 12.8, cy - 4);
    ctx.quadraticCurveTo(cx + side * 15.5, cy + 5, cx + side * (13 + sway * 0.4), cy + 16);
    ctx.quadraticCurveTo(cx + side * 10.5, cy + 9, cx + side * 10, cy - 1);
    ctx.closePath(); hairFill(ctx, cy - 4, cy + 16); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  }
  // the loose strand that swings when she walks (her left side = viewer's right)
  ctx.beginPath();
  ctx.moveTo(cx + 8.5, cy + 3);
  ctx.quadraticCurveTo(cx + 13.5 + sway * 1.5, cy + 11, cx + 10.5 + sway * 2.6, cy + 22);
  ctx.quadraticCurveTo(cx + 12 + sway, cy + 11, cx + 10.8, cy + 5.5);
  ctx.closePath(); ctx.fillStyle = P.hair; ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 0.9; ctx.stroke();
}
function backHairFront(ctx, cx, cy, sway) {
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy - 5);
  ctx.quadraticCurveTo(cx - 18.5, cy + 10, cx - 15 + sway * 0.5, cy + 26);
  ctx.quadraticCurveTo(cx - 12, cy + 30, cx - 9, cy + 27);
  ctx.quadraticCurveTo(cx - 7, cy + 31, cx - 4, cy + 28);
  ctx.quadraticCurveTo(cx - 1, cy + 32, cx + 2, cy + 28);
  ctx.quadraticCurveTo(cx + 5, cy + 31, cx + 8, cy + 27);
  ctx.quadraticCurveTo(cx + 11, cy + 30, cx + 15 - sway * 0.5, cy + 26);
  ctx.quadraticCurveTo(cx + 18.5, cy + 10, cx + 12, cy - 5);
  ctx.quadraticCurveTo(cx + 8, cy - 16, cx, cy - 15);
  ctx.quadraticCurveTo(cx - 8, cy - 16, cx - 12, cy - 5);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, cy, 0, cy + 31, [[0, P.hair], [1, P.hairS]]); ctx.fill();
  ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
}
/** Back of the head + long hair over the coat (up view). */
function backHead(ctx, cx, cy, sway) {
  ctx.beginPath();
  ctx.moveTo(cx - 12.5, cy - 3);
  ctx.quadraticCurveTo(cx - 13.5, cy - 15.5, cx, cy - 15);
  ctx.quadraticCurveTo(cx + 13.5, cy - 15.5, cx + 12.5, cy - 3);
  ctx.quadraticCurveTo(cx + 13, cy + 6, cx + 9.5, cy + 12);
  ctx.quadraticCurveTo(cx + 8.5 - sway * 0.6, cy + 18, cx + 7 - sway * 0.8, cy + 25);
  ctx.quadraticCurveTo(cx + 5, cy + 22, cx + 3, cy + 26);
  ctx.quadraticCurveTo(cx + 1, cy + 23, cx - 1, cy + 27);
  ctx.quadraticCurveTo(cx - 3, cy + 23, cx - 5, cy + 26);
  ctx.quadraticCurveTo(cx - 7 + sway * 0.4, cy + 22, cx - 8 + sway * 0.8, cy + 24);
  ctx.quadraticCurveTo(cx - 9.5, cy + 18, cx - 9.5, cy + 12);
  ctx.quadraticCurveTo(cx - 13, cy + 6, cx - 12.5, cy - 3);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, cy - 15, 0, cy + 27, [[0, P.hairH], [0.22, P.hair], [0.6, P.hair], [1, P.hairS]]); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(cx, cy - 1, 10, -2.7, -0.45); ctx.stroke();
  ctx.fillStyle = 'rgba(120,112,170,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy + 22, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  for (const [x0, x1] of [[-6, -6], [-2, -3], [2, 1], [6, 5]]) curve(ctx, cx + x0, cy + 2, cx + x0 * 1.4, cy + 12, cx + x1, cy + 24, P.hairS, 0.9);
  curve(ctx, cx - 9, cy + 4, cx - 12, cy + 10, cx - 9, cy + 18, P.hairD, 0.8);
  curve(ctx, cx + 9, cy + 4, cx + 12, cy + 10, cx + 9, cy + 18, P.hairD, 0.8);
  ctx.restore();
  ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  // loose strand poking out on her left (viewer's left)
  ctx.beginPath(); ctx.moveTo(cx - 12, cy + 2); ctx.quadraticCurveTo(cx - 15 - sway, cy + 10, cx - 13 - sway * 2, cy + 20); ctx.quadraticCurveTo(cx - 12, cy + 10, cx - 11, cy + 4); ctx.closePath();
  ctx.fillStyle = P.hair; ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 0.9; ctx.stroke();
}

// ---------------------------------------------------------------- front / back frame
function drawFront(ctx, f, pose, back) {
  const cx = 24 + (pose.lean || 0);
  const by = -(pose.bob || 0) + (pose.crouch || 0);
  const cy = 18 + by + (pose.headDy || 0);
  const s = pose.stride || 0, sp = pose.spread || 0;
  shadow(ctx, 24, 11);
  if (!back) backHairFront(ctx, cx, cy, pose.sway);
  // down: the sheath sits behind the coat; only the hilt shows past her left hip (viewer's right)
  if (!back && pose.sheathed) sheath(ctx, cx + 12.5, 45 + by, cx + 4, 41.5 + by, true);
  // legs (feet stay on the ground; only the upper body bobs)
  const lx = cx - 4.3 - (s > 0 ? 1.5 : s < 0 ? -0.5 : 0) - sp * 0.8, rx = cx + 4.3 + (s < 0 ? 1.5 : s > 0 ? -0.5 : 0) + sp * 0.8;
  const lb = s < 0 ? 61 : 64, rb = s > 0 ? 61 : 64;
  if (s >= 0) { legFront(ctx, rx, rb, 1); legFront(ctx, lx, lb, -1); } else { legFront(ctx, lx, lb, -1); legFront(ctx, rx, rb, 1); }
  coatFront(ctx, cx, by, pose, back);
  const sw = pose.sword;
  const swordSide = back ? 1 : -1; // her right hand
  const shY = 33.5 + by;
  // free (left) arm and the sheathed sword
  const freeSide = -swordSide;
  if (back) sheath(ctx, cx - 8.5, 45 + by, cx - 15, 58 + by, false);
  const armSwing = (side) => {
    const legFwd = side === -1 ? s > 0 : s < 0; // that side's leg forward -> arm swings back
    return legFwd ? [-side * 0.6, -1.6] : (s !== 0 ? [side * 0.6, 1.4] : [0, 0]);
  };
  const [fdx, fdy] = sw ? (sw.freeArm || [0, 0]) : armSwing(freeSide);
  armSleeve(ctx, cx + freeSide * 9.5, shY, cx + freeSide * 11.2 + fdx, 46.5 + by + fdy);
  if (!sw) {
    const [adx, ady] = armSwing(swordSide);
    armSleeve(ctx, cx + swordSide * 9.5, shY, cx + swordSide * 11.2 + adx, 46.5 + by + ady);
  }
  // head
  ctx.fillStyle = P.skinS; ctx.fillRect(cx - 2.5, cy + 9, 5, 7);
  if (!back) {
    headFront(ctx, cx, cy, pose);
    collarFront(ctx, cx, cy);
    frontHair(ctx, cx, cy, pose.sway);
  } else {
    poly(ctx, [[cx - 8, cy + 15.5], [cx - 7, cy + 9], [cx + 7, cy + 9], [cx + 8, cy + 15.5]]); fs(ctx, P.coatH);
    backHead(ctx, cx, cy, pose.sway);
  }
  if (sw) {
    if (sw.trail) trail(ctx, sw.trail, f.rand);
    armSleeve(ctx, cx + swordSide * 9.5, shY, sw.hand[0] - Math.cos(sw.ang) * 0, sw.hand[1]);
    katana(ctx, sw.hand[0], sw.hand[1], sw.ang, sw.len);
    hand(ctx, sw.hand[0], sw.hand[1]);
  }
}

// ---------------------------------------------------------------- side frame (drawn facing left; mirrored for right)
function faceSidePath(ctx, hx, hy) {
  ctx.beginPath();
  ctx.moveTo(hx - 10, hy - 8);
  ctx.quadraticCurveTo(hx - 12.2, hy - 2, hx - 11.2, hy + 1.5);
  ctx.quadraticCurveTo(hx - 11.8, hy + 3.2, hx - 12.8, hy + 4.8);
  ctx.quadraticCurveTo(hx - 11.2, hy + 6, hx - 10.8, hy + 7.2);
  ctx.quadraticCurveTo(hx - 10.2, hy + 9.5, hx - 8, hy + 10.8);
  ctx.quadraticCurveTo(hx - 3, hy + 12.2, hx + 4, hy + 10.2);
  ctx.quadraticCurveTo(hx + 11, hy + 6.5, hx + 11, hy - 2);
  ctx.quadraticCurveTo(hx + 11, hy - 12.5, hx, hy - 12.5);
  ctx.quadraticCurveTo(hx - 9, hy - 12.5, hx - 10, hy - 8);
  ctx.closePath();
}
function hairSidePath(ctx, hx, hy, heavy) {
  const t = heavy ? 1 : -0.8; // fringe tip height over the eye (her left side carries the swept fringe)
  ctx.beginPath();
  ctx.moveTo(hx - 11.5, hy - 5);
  ctx.quadraticCurveTo(hx - 13, hy - 14.5, hx - 1, hy - 14.5);
  ctx.quadraticCurveTo(hx + 12.5, hy - 15, hx + 13.2, hy - 2);
  ctx.quadraticCurveTo(hx + 14.5, hy + 7, hx + 10, hy + 13);
  ctx.quadraticCurveTo(hx + 7, hy + 9, hx + 5, hy + 11.5);
  ctx.quadraticCurveTo(hx + 4, hy + 3, hx + 2.5, hy - 2);
  ctx.quadraticCurveTo(hx + 1, hy - 5, hx - 1.5, hy - 1.5 + t);
  ctx.quadraticCurveTo(hx - 3.5, hy - 6, hx - 6, hy - 1 + t);
  ctx.quadraticCurveTo(hx - 8, hy - 6, hx - 10, hy - 2 + t * 0.6);
  ctx.quadraticCurveTo(hx - 11.5, hy - 5.5, hx - 11.5, hy - 5);
  ctx.closePath();
}
function eyeSide(ctx, ex, ey, narrow) {
  const n = narrow ? 0.62 : 1;
  ctx.beginPath(); ctx.ellipse(ex, ey, 2.2, 3 * n, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(ex - 0.5, ey + 0.4, 1.7, 2.5 * n, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad(ctx, 0, ey - 2.4, 0, ey + 3, [[0, P.eyeD], [0.55, P.eye], [1, P.eyeL]]); ctx.fill();
  ctx.beginPath(); ctx.ellipse(ex - 0.6, ey + 0.7, 0.75, 1.25 * n, 0, 0, Math.PI * 2); ctx.fillStyle = P.eyeD; ctx.fill();
  ctx.strokeStyle = P.ol; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(ex + 2.4, ey - 1.2 * n); ctx.quadraticCurveTo(ex - 0.5, ey - 4.3 * n, ex - 3.2, ey - 2.2 * n); ctx.stroke();
  line(ctx, ex - 3.1, ey - 2.2 * n, ex - 3.9, ey - 3 * n, P.ol, 1);
  line(ctx, ex - 2, ey + 3 * n, ex + 1, ey + 2.9 * n, P.ol, 0.7);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(ex - 1.2, ey - 0.7 * n, 0.85, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex + 0.6, ey + 1.6 * n, 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = P.brow; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(ex + 2.2, ey - 5 * n + (narrow ? 0.6 : 0)); ctx.quadraticCurveTo(ex - 1, ey - 7 * n, ex - 3.8, ey - 6 * n - (narrow ? 0.6 : 0)); ctx.stroke();
}
function bootSide(ctx, x, bottom) {
  // ankle at x, toe toward -x
  ctx.beginPath();
  ctx.moveTo(x - 2.6, bottom - 7); ctx.lineTo(x + 2.6, bottom - 7);
  ctx.lineTo(x + 2.8, bottom - 1.2); ctx.quadraticCurveTo(x + 2.8, bottom - 0.5, x + 1.8, bottom - 0.5);
  ctx.lineTo(x - 5.5, bottom - 0.5); ctx.quadraticCurveTo(x - 7.6, bottom - 0.5, x - 7.2, bottom - 2.2);
  ctx.quadraticCurveTo(x - 6.5, bottom - 3.6, x - 2.6, bottom - 3.8);
  ctx.closePath(); fs(ctx, P.boot);
  line(ctx, x - 1.4, bottom - 6, x - 1.4, bottom - 3.6, P.bootH, 1);
  line(ctx, x - 6.5, bottom - 1.2, x + 2, bottom - 1.2, P.bootS, 1);
  line(ctx, x - 2.6, bottom - 6.5, x + 2.6, bottom - 6.5, P.bootS, 0.8);
}
function legSide(ctx, hx, hy, fx, bottom, far) {
  // thigh/shin from hip (hx,hy) to ankle (fx, bottom-6)
  limb(ctx, hx, hy, fx, bottom - 6.5, far ? P.pantsS : P.pants, 5);
  bootSide(ctx, fx, bottom);
  if (far) { ctx.fillStyle = 'rgba(20,14,30,0.35)'; ctx.beginPath(); ctx.moveTo(fx - 8, bottom - 4); ctx.lineTo(fx + 3.5, bottom - 4); ctx.lineTo(fx + 3.5, bottom); ctx.lineTo(fx - 8, bottom); ctx.fill(); }
}
function coatSidePath(ctx, cx, sy, hy, flare) {
  ctx.beginPath();
  ctx.moveTo(cx - 5, sy);
  ctx.quadraticCurveTo(cx - 8.5, sy + 0.5, cx - 8.5, sy + 5);
  ctx.quadraticCurveTo(cx - 9.5, 44, cx - 8.5, hy);
  ctx.quadraticCurveTo(cx, hy + 2.5, cx + 9 + flare, hy + 0.5);
  ctx.quadraticCurveTo(cx + 8.5, 42, cx + 7.5, sy + 5);
  ctx.quadraticCurveTo(cx + 7.5, sy, cx + 3, sy);
  ctx.closePath();
}
function drawSide(ctx, f, pose, flipped) {
  const lean = pose.lean || 0;
  const cx = 24 + lean;
  const by = -(pose.bob || 0) + (pose.crouch || 0);
  const hx = cx - 1 + (pose.headLean || 0), hy = 18 + by;
  const s = pose.stride || 0, sp = pose.spread || 0, sway = pose.sway || 0;
  shadow(ctx, 24, 10);
  // long hair falling behind the back (trails backwards when walking)
  ctx.beginPath();
  ctx.moveTo(hx + 4, hy - 4); ctx.lineTo(hx + 12, hy - 4);
  ctx.quadraticCurveTo(hx + 16 + sway, hy + 8, hx + 14 + sway * 1.5, hy + 19);
  ctx.quadraticCurveTo(hx + 15 + sway * 2, hy + 25, hx + 12 + sway * 2, hy + 26);
  ctx.quadraticCurveTo(hx + 10 + sway, hy + 22, hx + 8 + sway, hy + 25);
  ctx.quadraticCurveTo(hx + 6, hy + 21, hx + 4, hy + 23);
  ctx.quadraticCurveTo(hx + 3, hy + 10, hx + 4, hy - 4);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, hy, 0, hy + 27, [[0, P.hair], [1, P.hairS]]); ctx.fill();
  ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  curve(ctx, hx + 9, hy + 6, hx + 12 + sway, hy + 14, hx + 10 + sway * 1.5, hy + 23, P.hairS, 0.8);
  curve(ctx, hx + 6, hy + 8, hx + 8 + sway * 0.5, hy + 15, hx + 6 + sway, hy + 22, P.hairS, 0.8);
  // far arm (her right; behind torso) and sheath when it is on the far side
  const shY = 33 + by;
  const nearFwd = s > 0; // near leg forward -> near arm back
  const farHand = [cx + 3 + (nearFwd ? -3 : s < 0 ? 3 : 0), 46 + by];
  const sw = pose.sword;
  const sheathPts = [cx - 6.5, 44.5 + by, cx + 15, 50 + by];
  if (flipped) sheath(ctx, ...sheathPts, pose.sheathed);
  if (!sw) armSleeve(ctx, cx + 2.5, shY, farHand[0], farHand[1], 4);
  else if (sw.farArm) armSleeve(ctx, cx + 2.5, shY, sw.farArm[0], sw.farArm[1], 4);
  // legs: A = near (her left), B = far
  const hipY = 47;
  const aFx = cx - 1 - s * 3.5 - sp, bFx = cx + 1 + s * 3.5 + sp;
  const aBottom = pose.liftNear ? 62 : 64, bBottom = pose.liftFar ? 62 : 64;
  legSide(ctx, cx + 1, hipY, bFx + (pose.liftFar ? 1.5 : 0), bBottom, true);
  legSide(ctx, cx - 1, hipY, aFx + (pose.liftNear ? 1.5 : 0), aBottom, false);
  // coat
  const sy = 30.5 + by, hemY = 52 + (pose.crouch || 0) * 0.5;
  const flare = pose.flare || (s !== 0 ? 1.5 : 0);
  coatSidePath(ctx, cx, sy, hemY, flare);
  ctx.fillStyle = grad(ctx, cx - 9, 0, cx + 9, 0, [[0, P.coatH], [0.45, P.coat], [1, P.coatS]]); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.beginPath(); ctx.moveTo(cx - 10, hemY); ctx.quadraticCurveTo(cx, hemY + 2.5, cx + 10 + flare, hemY + 0.5); ctx.strokeStyle = P.red; ctx.lineWidth = 3.2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 10, hemY - 1.2); ctx.quadraticCurveTo(cx, hemY + 1.3, cx + 10 + flare, hemY - 0.7); ctx.strokeStyle = P.redH; ctx.lineWidth = 0.8; ctx.stroke();
  line(ctx, cx - 7.5, sy + 3, cx - 7.5, hemY - 2, P.red, 1.2); // front edge lining
  curve(ctx, cx + 4, sy + 6, cx + 6, 44, cx + 5, hemY, P.coatS, 0.8);
  ctx.restore();
  coatSidePath(ctx, cx, sy, hemY, flare); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  poly(ctx, [[cx - 9, 41 + by], [cx + 8.5, 41 + by], [cx + 8.5, 43.6 + by], [cx - 9.3, 43.6 + by]]); fs(ctx, P.belt);
  // sheath on the near hip (facing left)
  if (!flipped) sheath(ctx, ...sheathPts, pose.sheathed);
  // head
  ctx.fillStyle = P.skinS; ctx.fillRect(hx - 3, hy + 9, 6, 7);
  ell(ctx, hx + 2.5, hy + 3, 1.8, 2.3, P.skin);
  faceSidePath(ctx, hx, hy); fs(ctx, P.skin);
  ctx.save(); faceSidePath(ctx, hx, hy); ctx.clip();
  ctx.fillStyle = P.skinS;
  ctx.beginPath(); ctx.ellipse(hx - 2, hy + 12, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, 2); hairSidePath(ctx, hx, hy, !flipped); ctx.fill();
  ctx.restore();
  ctx.fillStyle = P.blush; ctx.beginPath(); ctx.ellipse(hx - 7, hy + 6.8, 2.4, 1.2, 0, 0, Math.PI * 2); ctx.fill();
  eyeSide(ctx, hx - 6.6, hy + 3.2, pose.narrow);
  line(ctx, hx - 10.6, hy + 8.4, hx - 9.4, hy + 8.6, P.mouth, 0.9);
  // collar (side): a standing band around the neck
  poly(ctx, [[hx - 6.5, hy + 15.5], [hx - 5.5, hy + 8.5], [hx + 1, hy + 10], [hx + 6.5, hy + 8.5], [hx + 7.5, hy + 15.5]]); fs(ctx, P.coatH);
  poly(ctx, [[hx - 4.5, hy + 10], [hx - 1.5, hy + 14.5], [hx + 0.5, hy + 10.5]]); ctx.fillStyle = P.red; ctx.fill();
  // hair cap + fringe
  hairSidePath(ctx, hx, hy, !flipped); hairFill(ctx, hy - 14.5, hy + 8);
  ctx.save(); hairSidePath(ctx, hx, hy, !flipped); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx + 1, hy - 1, 10, -2.9, -0.7); ctx.stroke();
  curve(ctx, hx - 4, hy - 9, hx - 6, hy - 4, hx - 8, hy - 1, P.hairS, 0.8);
  curve(ctx, hx + 8, hy - 8, hx + 10, hy - 2, hx + 9, hy + 6, P.hairS, 0.8);
  ctx.restore();
  hairSidePath(ctx, hx, hy, !flipped); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  // side lock in front of the ear + the swinging strand by the cheek
  // one lock over the ear, and the loose strand hanging from the temple in front of the face
  ctx.beginPath(); ctx.moveTo(hx + 5.5, hy - 3); ctx.quadraticCurveTo(hx + 8, hy + 6, hx + 6.5 - sway * 0.5, hy + 14); ctx.quadraticCurveTo(hx + 3.5, hy + 7, hx + 3, hy - 1); ctx.closePath();
  hairFill(ctx, hy - 3, hy + 14); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx - 9.5, hy - 4); ctx.quadraticCurveTo(hx - 13.5 - sway * 1.2, hy + 2, hx - 12.5 - sway * 2.2, hy + 12); ctx.quadraticCurveTo(hx - 12 - sway * 0.6, hy + 2, hx - 11.5, hy - 3); ctx.closePath();
  ctx.fillStyle = P.hair; ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 0.9; ctx.stroke();
  // near arm (her left) or the sword arm
  if (!sw) {
    const nearHand = [cx - 2.5 + (nearFwd ? 3 : s < 0 ? -3 : 0), 46.5 + by];
    armSleeve(ctx, cx - 1, shY, nearHand[0], nearHand[1], 4.4);
  } else {
    if (sw.trail) trail(ctx, sw.trail, f.rand);
    armSleeve(ctx, cx - 1, shY, sw.hand[0], sw.hand[1], 4.4);
    katana(ctx, sw.hand[0], sw.hand[1], sw.ang, sw.len);
    hand(ctx, sw.hand[0], sw.hand[1]);
  }
}

// ---------------------------------------------------------------- poses
function walkPose(i) {
  const s = [1, 0, -1, 0][i];
  return {
    bob: i % 2, stride: s, sway: [1, 0.3, -1, -0.3][i], sheathed: true,
    hemL: s > 0 ? -1.5 : 0, hemR: s < 0 ? -1.5 : 0,
    liftFar: i === 1, liftNear: i === 3,
  };
}
const ATTACK = {
  down: [
    { lean: 1, crouch: -1, sway: -1, spread: 1, sword: { hand: [13, 29], ang: -2.15, len: 19, freeArm: [1, 1] } },
    { lean: 0, crouch: 2, sway: 2, spread: 2, narrow: true, hemL: -2, sword: { hand: [29, 42], ang: 0.85, len: 21, freeArm: [-1.5, -2], trail: { c: [29, 42], r: 19, a0: 0.95, a1: 2.75 } } },
    { lean: 0, crouch: 1, sway: 1, spread: 1, sword: { hand: [32, 46], ang: 1.15, len: 15, freeArm: [0, 0] } },
  ],
  up: [
    { crouch: 1, sway: 1, spread: 1, sword: { hand: [33, 44], ang: 1.1, len: 17, freeArm: [0, 0] } },
    { crouch: -1, sway: -2, spread: 2, hemL: -2, sword: { hand: [34, 21], ang: -Math.PI / 2, len: 18, freeArm: [-1.5, 1], trail: { c: [34, 22], r: 17, a0: -3.0, a1: -1.65 } } },
    { crouch: 0, sway: 1, spread: 1, sword: { hand: [32, 40], ang: -0.7, len: 16, freeArm: [0, 0] } },
  ],
  side: [
    { lean: 2, headLean: 1, sway: -1, spread: 1, flare: 1, sword: { hand: [30, 23], ang: -1.25, len: 19, farArm: [28, 46] } },
    { lean: 1, headLean: -2.5, crouch: 1, sway: 3, spread: 3, narrow: true, flare: 3, sword: { hand: [17, 37], ang: Math.PI, len: 14, farArm: [31, 45], trail: { c: [17, 37], r: 13, a0: -3.1, a1: -1.35 } } },
    { lean: 0, sway: 1, spread: 1, flare: 1.5, sword: { hand: [17, 44], ang: 2.35, len: 15, farArm: [27, 46] } },
  ],
};

// ---------------------------------------------------------------- portrait
function drawPortrait(ctx, size) {
  const k = size / 256;
  ctx.save(); ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const cx = 128, cy = 118, R = 6.2; // head geometry is the frame's head scaled by R
  const OL = 2.4;
  // back hair mass
  ctx.beginPath();
  ctx.moveTo(cx - 80, cy - 20); ctx.quadraticCurveTo(cx - 118, cy + 70, cx - 100, cy + 150);
  ctx.lineTo(cx + 100, cy + 150); ctx.quadraticCurveTo(cx + 118, cy + 70, cx + 80, cy - 20);
  ctx.quadraticCurveTo(cx + 60, cy - 105, cx, cy - 100); ctx.quadraticCurveTo(cx - 60, cy - 105, cx - 80, cy - 20); ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, cy - 40, 0, cy + 150, [[0, P.hair], [0.6, P.hairS], [1, P.hairD]]); ctx.fill();
  ctx.strokeStyle = P.ol; ctx.lineWidth = OL; ctx.stroke();
  // shoulders / coat
  ctx.beginPath();
  ctx.moveTo(cx - 118, 256); ctx.quadraticCurveTo(cx - 110, cy + 82, cx - 48, cy + 74);
  ctx.lineTo(cx + 48, cy + 74); ctx.quadraticCurveTo(cx + 110, cy + 82, cx + 118, 256); ctx.closePath();
  ctx.fillStyle = grad(ctx, cx - 100, 0, cx + 100, 0, [[0, P.coatH], [0.4, P.coat], [1, P.coatS]]); ctx.fill();
  ctx.strokeStyle = P.ol; ctx.lineWidth = OL; ctx.stroke();
  // neck
  poly(ctx, [[cx - 16, cy + 50], [cx + 16, cy + 50], [cx + 18, cy + 88], [cx - 18, cy + 88]]); fs(ctx, P.skinS, P.ol, OL);
  // high collar with crimson inside
  poly(ctx, [[cx - 58, cy + 100], [cx - 46, cy + 46], [cx - 16, cy + 62], [cx, cy + 96], [cx + 16, cy + 62], [cx + 46, cy + 46], [cx + 58, cy + 100]]);
  ctx.fillStyle = grad(ctx, cx - 50, 0, cx + 50, 0, [[0, P.coatL], [0.5, P.coatH], [1, P.coat]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = OL; ctx.stroke();
  poly(ctx, [[cx - 22, cy + 60], [cx, cy + 92], [cx + 22, cy + 60]]); ctx.fillStyle = P.red; ctx.fill();
  poly(ctx, [[cx - 15, cy + 60], [cx + 15, cy + 60], [cx + 7, cy + 80], [cx - 7, cy + 80]]); ctx.fillStyle = P.skinS; ctx.fill();
  line(ctx, cx - 44, cy + 52, cx - 52, cy + 98, P.coatL, 1.5); line(ctx, cx + 44, cy + 52, cx + 52, cy + 98, P.coatL, 1.5);
  // face
  ctx.save(); ctx.translate(cx, cy); ctx.scale(R, R);
  ell(ctx, -11, 2, 2, 2.4, P.skin, P.ol, OL / R); ell(ctx, 11, 2, 2, 2.4, P.skin, P.ol, OL / R);
  faceShape(ctx, 0, 0); fs(ctx, P.skin, P.ol, OL / R);
  ctx.save(); faceShape(ctx, 0, 0); ctx.clip();
  ctx.fillStyle = P.skinS; ctx.beginPath(); ctx.ellipse(0, 12.5, 9.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, 2); fringePath(ctx, 0, 0); ctx.fillStyle = 'rgba(200,140,120,0.45)'; ctx.fill();
  ctx.restore();
  ctx.fillStyle = P.blush;
  ctx.beginPath(); ctx.ellipse(-7.2, 6.5, 2.6, 1.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(7.2, 6.5, 2.6, 1.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // eyes (detailed)
  for (const side of [-1, 1]) {
    const ex = cx + side * 31, ey = cy + 20;
    ctx.beginPath(); ctx.ellipse(ex, ey, 15, 19, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex, ey + 2, 11.5, 15.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad(ctx, 0, ey - 14, 0, ey + 18, [[0, P.eyeD], [0.5, P.eye], [1, P.eyeL]]); ctx.fill();
    ctx.strokeStyle = P.eyeD; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(ex, ey + 3, 4.5, 7.5, 0, 0, Math.PI * 2); ctx.fillStyle = P.eyeD; ctx.fill();
    // iris rays
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * 5, ey + 2 + Math.sin(a) * 7); ctx.lineTo(ex + Math.cos(a) * 10, ey + 2 + Math.sin(a) * 14); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(ex - 2, ey + 12, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    // lashes: a thick upper lid hugging the eye, outer corner lifted
    ctx.strokeStyle = P.ol; ctx.lineWidth = 4.5; ctx.beginPath();
    ctx.moveTo(ex - side * 15, ey - 6); ctx.quadraticCurveTo(ex + side * 1, ey - 22, ex + side * 16, ey - 13); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ex + side * 15.5, ey - 13); ctx.lineTo(ex + side * 21, ey - 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex + side * 11, ey - 17); ctx.lineTo(ex + side * 14, ey - 22); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,30,60,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex - side * 12, ey - 14); ctx.quadraticCurveTo(ex, ey - 24, ex + side * 12, ey - 19); ctx.stroke(); // lid crease
    ctx.strokeStyle = P.ol; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(ex - side * 8, ey + 18); ctx.quadraticCurveTo(ex + side * 6, ey + 21, ex + side * 14, ey + 14); ctx.stroke();
    // highlights
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(ex - 5, ey - 5, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 6, ey + 9, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // nose + mouth
  curve(ctx, cx + 2, cy + 40, cx + 5, cy + 46, cx + 1, cy + 48, P.skinS, 2.5);
  curve(ctx, cx - 8, cy + 60, cx, cy + 66, cx + 8, cy + 60, P.mouth, 2.5);
  // front hair
  ctx.save(); ctx.translate(cx, cy); ctx.scale(R, R);
  fringePath(ctx, 0, 0); ctx.fillStyle = grad(ctx, 0, -14, 0, 7, [[0, P.hairH], [0.3, P.hair], [1, P.hairS]]); ctx.fill();
  ctx.save(); fringePath(ctx, 0, 0); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1, -1, 10, -2.7, -0.55); ctx.stroke();
  ctx.strokeStyle = P.hairS; ctx.lineWidth = 0.5;
  for (const [a, b, c, d, e, g] of [[8, -8, 10, -2, 8.5, 4], [2, -8, 4, -3, 3.5, 1], [-4, -9, -3, -4, -5, -1], [-9, -8, -9, -4, -10, -2], [5, -10, 7, -5, 6, 2]]) curve(ctx, a, b, c, d, e, g, P.hairS, 0.5);
  ctx.restore();
  fringePath(ctx, 0, 0); ctx.strokeStyle = P.ol; ctx.lineWidth = OL / R; ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(side * 12.8, -4); ctx.quadraticCurveTo(side * 16.5, 8, side * 14, 24); ctx.quadraticCurveTo(side * 10.5, 12, side * 10, -1); ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, -4, 0, 24, [[0, P.hair], [1, P.hairS]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = OL / R; ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(8.5, 3); ctx.quadraticCurveTo(14.5, 12, 11.5, 26); ctx.quadraticCurveTo(12.5, 12, 10.8, 5.5); ctx.closePath();
  ctx.fillStyle = P.hair; ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = OL / R; ctx.stroke();
  ctx.restore();
  // brows drawn over the fringe (anime convention) so the sharp expression reads
  for (const side of [-1, 1]) {
    const ex = cx + side * 31, ey = cy + 20;
    ctx.strokeStyle = P.brow; ctx.lineWidth = 3.5; ctx.beginPath();
    ctx.moveTo(ex + side * 19, ey - 36); ctx.quadraticCurveTo(ex, ey - 41, ex - side * 13, ey - 30); ctx.stroke();
  }
  ctx.restore();
}

export default {
  id: 'chr_hero',
  name: 'Hero',
  role: 'player',
  assetId: 'ast_starter_hero',
  file: 'hero.png',
  frameWidth: 48,
  frameHeight: 64,
  collider: { width: 24, height: 16, offsetX: 12, offsetY: 48 },
  walkFrameRate: 8,
  attackFrameRate: 14,
  portrait: { assetId: 'ast_starter_hero_portrait', file: 'hero_portrait.png', size: 256 },
  draw(ctx, f) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    let pose;
    if (f.anim === 'walk') pose = walkPose(f.index);
    else pose = { ...(ATTACK[f.dir === 'left' || f.dir === 'right' ? 'side' : f.dir][f.index]), sheathed: false };
    if (f.dir === 'down') drawFront(ctx, f, pose, false);
    else if (f.dir === 'up') drawFront(ctx, f, pose, true);
    else {
      if (f.dir === 'right') { ctx.translate(f.w, 0); ctx.scale(-1, 1); }
      drawSide(ctx, f, pose, f.dir === 'right');
    }
    ctx.restore();
  },
  drawPortrait,
};
