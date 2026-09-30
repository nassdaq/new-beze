/**
 * Bat: a purple cave bat enemy.
 * Wide membranous wings with visible finger bones, a fluffy round body, a big head with pointed
 * ears, red eyes and small fangs. It hovers (feet never touch the ground) while the shadow stays
 * at the frame bottom so the collider describes where it "stands".
 * Walk = wing flap (up, mid, down, mid) with a 2 px hover bob. Attack = dive (wings back, swoop
 * toward the facing direction, recover). Beze Character Sheet v2, 48x64. Paths only; f.rand only.
 */

const P = {
  ol: '#1c0f2e',
  fur: '#8656bf', furD: '#5a3588', furH: '#b08ce6', furL: '#c9adf0',
  mem: '#6c3fa3', memD: '#4a2775', memH: '#9364d2', memFar: '#4f2c7c', memFarD: '#37195a',
  bone: '#bd96ec', boneFar: '#7a55a8',
  earIn: '#e67fb0', earInD: '#b8508a',
  eye: '#ff3b4a', eyeD: '#9c0f22', eyeH: '#ffffff',
  fang: '#fbfbff', mouth: '#2b0f30', tongue: '#d64b78', nose: '#2a1238',
  claw: '#3d2258',
  shadow: 'rgba(10,6,24,0.30)', speed: 'rgba(225,205,255,0.85)',
};

// ---------------------------------------------------------------- helpers
function fs(ctx, fill, stroke = P.ol, lw = 1) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function ell(ctx, cx, cy, rx, ry, fill, stroke = null, lw = 1, rot = 0) {
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(rx, 0.2), Math.max(ry, 0.2), rot, 0, Math.PI * 2); fs(ctx, fill, stroke, lw);
}
function line(ctx, x1, y1, x2, y2, color, w = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function curve(ctx, x1, y1, cx, cy, x2, y2, color, w = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
}
function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
function shadow(ctx, cx, rx) {
  ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(cx, 61.6, rx, 2.2, 0, 0, Math.PI * 2); ctx.fill();
}

// ---------------------------------------------------------------- wing
/**
 * One wing from shoulder (sx,sy), extending in screen-x direction `d` (+1 right, -1 left).
 * f: flap, -1 (down) .. 1 (up). sweep 0..1 folds the wing back (shorter, tips pulled `swY` px).
 * far: draw as the far wing (darker, behind the body). reach: horizontal span in px.
 */
function wing(ctx, sx, sy, d, f, sweep, swY, far, reach = 17) {
  const ex = (1 - 0.42 * sweep) * (reach / 17);
  const X = (dx) => sx + d * dx * ex;
  const lift = -f * 10 + swY * sweep;
  const Y = (dy, k) => sy + dy + lift * k;
  const W = [X(9), Y(-2, 0.7)];
  const T = [X(17), Y(1, 1)];
  const F1 = [X(14.5), Y(8, 0.6)];
  const F2 = [X(8), Y(10.5, 0.32)];
  const B = [X(1.2), Y(8, 0.05)];
  const scallop = (a, b) => [(a[0] + b[0]) / 2 + (W[0] - (a[0] + b[0]) / 2) * 0.42, (a[1] + b[1]) / 2 + (W[1] - (a[1] + b[1]) / 2) * 0.42];
  const path = () => {
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(X(4.5), Y(-4.5, 0.45), ...W);
    ctx.quadraticCurveTo(X(14.5), Y(-1.5, 0.95), ...T);
    ctx.quadraticCurveTo(...scallop(T, F1), ...F1);
    ctx.quadraticCurveTo(...scallop(F1, F2), ...F2);
    ctx.quadraticCurveTo(...scallop(F2, B), ...B);
    ctx.closePath();
  };
  path();
  const g = ctx.createLinearGradient(sx, sy, T[0], T[1]);
  if (far) { g.addColorStop(0, P.memFarD); g.addColorStop(1, P.memFar); }
  else { g.addColorStop(0, P.memD); g.addColorStop(0.45, P.mem); g.addColorStop(1, P.memH); }
  ctx.fillStyle = g; ctx.fill();
  // finger bones
  const bone = far ? P.boneFar : P.bone;
  ctx.save(); path(); ctx.clip();
  line(ctx, ...W, ...T, bone, 1);
  line(ctx, ...W, ...F1, bone, 1);
  line(ctx, ...W, ...F2, bone, 1);
  curve(ctx, sx, sy, X(4.5), Y(-4.5, 0.45), ...W, bone, 1.4);
  if (!far) curve(ctx, sx + d * 0.5, sy - 0.5, X(4.5), Y(-5.2, 0.45), W[0], W[1] - 0.8, P.furL, 0.8);
  ctx.restore();
  path(); fs(ctx, null, P.ol, 1);
  ell(ctx, W[0], W[1], 1.2, 1.2, far ? P.boneFar : P.furL, P.ol, 0.8); // thumb claw at the wrist
}

// ---------------------------------------------------------------- body & head
function fluffBody(ctx, bx, by, rx, ry, dir) {
  const N = 26, pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const lower = Math.sin(a) > 0.2;
    const k = lower && i % 2 ? 1.9 : 0;
    pts.push([bx + Math.cos(a) * (rx + k), by + Math.sin(a) * (ry + k)]);
  }
  poly(ctx, pts);
  const g = ctx.createRadialGradient(bx - rx * 0.35, by - ry * 0.45, 1, bx, by, rx * 1.5);
  g.addColorStop(0, P.furH); g.addColorStop(0.5, P.fur); g.addColorStop(1, P.furD);
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  ell(ctx, bx, by + ry * 0.55, rx * 1.2, ry * 0.65, 'rgba(60,30,100,0.45)');
  if (dir === 'down') ell(ctx, bx, by + 1, rx * 0.5, ry * 0.55, 'rgba(210,180,245,0.55)'); // belly patch
  if (dir === 'up') {
    // back fur stripe
    curve(ctx, bx, by - ry * 0.6, bx + 1, by, bx, by + ry * 0.6, P.furD, 1.4);
  }
  ctx.restore();
  poly(ctx, pts); fs(ctx, null, P.ol, 1);
}

function feet(ctx, bx, by, s) {
  for (const side of [-1, 1]) {
    const x = bx + side * 2.4 + s * 1.5;
    line(ctx, x, by, x - side * 0.6, by + 3.4, P.ol, 2.6);
    line(ctx, x, by, x - side * 0.6, by + 3.4, P.claw, 1.2);
    line(ctx, x - side * 0.6, by + 3.4, x - side * 1.6, by + 4.6, P.ol, 1.2);
  }
}

function ear(ctx, x, y, dx, dy, tilt, inner) {
  // base at (x,y), tip offset (dx,dy); tilt shifts the base width
  poly(ctx, [[x - 3 + tilt, y], [x + dx, y + dy], [x + 3 + tilt, y + 0.5]]);
  fs(ctx, P.fur, P.ol, 1);
  if (inner) {
    poly(ctx, [[x - 1.2 + tilt * 0.6, y - 0.4], [x + dx * 0.72, y + dy * 0.72], [x + 1.6 + tilt * 0.6, y]]);
    fs(ctx, inner, null);
  }
}

/** mood: 'idle' | 'wide' | 'open' | 'fierce' */
function headFront(ctx, hx, hy, mood) {
  ear(ctx, hx - 4, hy - 3.5, -2.8, -8.5, -0.5, P.earIn);
  ear(ctx, hx + 4, hy - 3.5, 2.8, -8.5, 0.5, P.earIn);
  ell(ctx, hx, hy, 6.6, 6.2, null);
  const g = ctx.createRadialGradient(hx - 2.5, hy - 2.5, 1, hx, hy, 8);
  g.addColorStop(0, P.furH); g.addColorStop(0.55, P.fur); g.addColorStop(1, P.furD);
  fs(ctx, g, P.ol, 1);
  // cheek fluff
  ell(ctx, hx - 5.2, hy + 2.5, 1.6, 1.4, P.fur, P.ol, 0.8);
  ell(ctx, hx + 5.2, hy + 2.5, 1.6, 1.4, P.fur, P.ol, 0.8);
  // eyes
  const wide = mood === 'wide' || mood === 'open';
  const ry = wide ? 2.4 : 2;
  for (const side of [-1, 1]) {
    const ex = hx + side * 2.7, ey = hy - 0.6;
    ell(ctx, ex, ey, 1.8, ry, P.eyeD);
    ell(ctx, ex, ey - 0.4, 1.4, ry * 0.7, P.eye);
    ctx.fillStyle = P.eyeH; ctx.fillRect(ex - side * 0.8 - 0.5, ey - ry * 0.7 - 0.5, 1, 1);
    // angry brow
    line(ctx, ex - side * 2.6, ey - ry - 1.9, ex + side * 0.9, ey - ry - 0.5, P.ol, 1.1);
  }
  ell(ctx, hx, hy + 1.7, 0.9, 0.7, P.nose);
  if (mood === 'open') {
    ell(ctx, hx, hy + 4.2, 2.6, 2, P.mouth, P.ol, 0.8);
    ell(ctx, hx, hy + 5.3, 1.3, 0.9, P.tongue);
    for (const side of [-1, 1]) { poly(ctx, [[hx + side * 2.2, hy + 2.6], [hx + side * 1.4, hy + 5.2], [hx + side * 0.7, hy + 2.6]]); fs(ctx, P.fang, P.ol, 0.6); }
  } else {
    curve(ctx, hx - 2.6, hy + 3.2, hx, hy + 4.4, hx + 2.6, hy + 3.2, P.ol, 1);
    for (const side of [-1, 1]) { poly(ctx, [[hx + side * 2.3, hy + 3.4], [hx + side * 1.5, hy + 5.6], [hx + side * 0.8, hy + 3.5]]); fs(ctx, P.fang, P.ol, 0.6); }
  }
}

function headSide(ctx, hx, hy, s, mood) {
  // far ear (behind), then head, then near ear
  ear(ctx, hx - s * 2.5, hy - 4, -s * 3.5, -8, -s * 0.5, null);
  ell(ctx, hx, hy, 6.4, 6.2, null);
  const g = ctx.createRadialGradient(hx + s * 1.5, hy - 2.5, 1, hx, hy, 8);
  g.addColorStop(0, P.furH); g.addColorStop(0.55, P.fur); g.addColorStop(1, P.furD);
  fs(ctx, g, P.ol, 1);
  // snout
  ell(ctx, hx + s * 5.6, hy + 1.6, 2.4, 2, P.fur, P.ol, 1);
  ell(ctx, hx + s * 7.2, hy + 1, 0.9, 0.7, P.nose);
  ear(ctx, hx + s * 1.5, hy - 4, -s * 1.5, -9, s * 0.5, P.earIn);
  // eye
  const wide = mood === 'wide' || mood === 'open';
  const ex = hx + s * 2.6, ey = hy - 0.8, ry = wide ? 2.4 : 2;
  ell(ctx, ex, ey, 1.7, ry, P.eyeD);
  ell(ctx, ex + s * 0.2, ey - 0.4, 1.3, ry * 0.7, P.eye);
  ctx.fillStyle = P.eyeH; ctx.fillRect(ex + s * 0.6 - 0.5, ey - ry * 0.7 - 0.5, 1, 1);
  line(ctx, ex - s * 2.2, ey - ry - 1.9, ex + s * 1.2, ey - ry - 0.6, P.ol, 1.1);
  if (mood === 'open') {
    ell(ctx, hx + s * 4.4, hy + 4.2, 2.4, 1.9, P.mouth, P.ol, 0.8);
    ell(ctx, hx + s * 4.6, hy + 5.2, 1.2, 0.8, P.tongue);
    poly(ctx, [[hx + s * 5.4, hy + 2.6], [hx + s * 4.6, hy + 5.2], [hx + s * 3.8, hy + 2.6]]); fs(ctx, P.fang, P.ol, 0.6);
  } else {
    curve(ctx, hx + s * 2, hy + 3.4, hx + s * 4.3, hy + 4.4, hx + s * 6.4, hy + 3.2, P.ol, 1);
    poly(ctx, [[hx + s * 4.9, hy + 3.4], [hx + s * 4.2, hy + 5.6], [hx + s * 3.5, hy + 3.5]]); fs(ctx, P.fang, P.ol, 0.6);
  }
}

function headBack(ctx, hx, hy) {
  ell(ctx, hx, hy, 6.6, 6.2, null);
  const g = ctx.createRadialGradient(hx - 2, hy - 2.5, 1, hx, hy, 8);
  g.addColorStop(0, P.furH); g.addColorStop(0.55, P.fur); g.addColorStop(1, P.furD);
  fs(ctx, g, P.ol, 1);
  // crown fur tufts
  curve(ctx, hx - 3, hy - 4.5, hx - 1, hy - 7, hx + 0.5, hy - 4.8, P.ol, 1);
  curve(ctx, hx + 0.5, hy - 4.8, hx + 2.5, hy - 7, hx + 4, hy - 4.5, P.ol, 1);
  ear(ctx, hx - 4, hy - 3.5, -2.8, -8.5, -0.5, P.furD);
  ear(ctx, hx + 4, hy - 3.5, 2.8, -8.5, 0.5, P.furD);
}

// ---------------------------------------------------------------- effects
function speedLines(ctx, kind, bx, by, s, rand) {
  if (kind === 'side') {
    const x0 = bx - s * 12;
    for (let i = -1; i <= 1; i++) { const len = 6 + rand() * 5, y = by - 8 + i * 5; line(ctx, x0 - s * Math.abs(i) * 2, y, x0 - s * (len + Math.abs(i) * 2), y, P.speed, 1); }
  } else if (kind === 'down') {
    for (let i = -1; i <= 1; i++) { const len = 5 + rand() * 4, x = bx + i * 8, y0 = by - 22 - Math.abs(i) * 3; line(ctx, x, y0, x, y0 - len, P.speed, 1); }
  } else if (kind === 'up') {
    for (let i = -1; i <= 1; i++) { const len = 5 + rand() * 4, x = bx + i * 8, y0 = by + 10 + Math.abs(i) * 2; line(ctx, x, y0, x, y0 + len, P.speed, 1); }
  }
}

// ---------------------------------------------------------------- frames
function pose(f) {
  const { anim, dir, index } = f;
  const s = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  if (anim === 'walk') {
    return [
      { f: 1, bob: 0, sweep: 0, mood: 'idle' },
      { f: 0.1, bob: -2, sweep: 0, mood: 'idle' },
      { f: -1, bob: 0, sweep: 0, mood: 'idle' },
      { f: 0.1, bob: -2, sweep: 0, mood: 'idle' },
    ][index];
  }
  if (dir === 'down') {
    return [
      { f: 1.25, bob: -3, sweep: 0.25, swY: -6, mood: 'wide' },
      { f: 0.7, bob: 9, sweep: 1, swY: -7, mood: 'open', lines: 'down', shadowR: 11, scale: 1.18 },
      { f: -0.2, bob: 2, sweep: 0.1, swY: -4, mood: 'fierce' },
    ][index];
  }
  if (dir === 'up') {
    return [
      { f: 1.25, bob: 1, sweep: 0.25, swY: 6, mood: 'wide' },
      { f: -0.9, bob: -8, sweep: 1, swY: 7, mood: 'open', lines: 'up', shadowR: 7, scale: 0.9 },
      { f: -0.2, bob: -1, sweep: 0.1, swY: 4, mood: 'fierce' },
    ][index];
  }
  return [
    { f: 1.25, bob: -3, dx: -s * 2, sweep: 0.25, swY: -6, mood: 'wide', rot: -s * 0.12 },
    { f: 0.5, bob: 2, dx: s * 9, sweep: 1, swY: -7, mood: 'open', lines: 'side', rot: s * 0.28 },
    { f: -0.2, bob: 0, dx: s * 1, sweep: 0.1, swY: -4, mood: 'fierce' },
  ][index];
}

export default {
  id: 'chr_bat',
  name: 'Bat',
  role: 'enemy',
  assetId: 'ast_starter_bat',
  file: 'bat.png',
  frameWidth: 48, frameHeight: 64,
  collider: { width: 22, height: 14, offsetX: 13, offsetY: 50 },
  walkFrameRate: 10, attackFrameRate: 14,
  portrait: null,
  draw(ctx, f) {
    const p = pose(f);
    const { dir } = f;
    const s = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const bx = 24 + (p.dx ?? 0), by = 36 + p.bob;
    const swY = p.swY ?? 0;
    shadow(ctx, 24 + (p.dx ?? 0) * 0.6, p.shadowR ?? (9 - Math.max(0, -p.bob) * 0.4));
    if (p.lines) speedLines(ctx, p.lines, bx, by, s, f.rand);
    if (p.scale || p.rot) { ctx.translate(bx, by); if (p.scale) ctx.scale(p.scale, p.scale); if (p.rot) ctx.rotate(p.rot); ctx.translate(-bx, -by); }
    if (s === 0) {
      const front = dir === 'down';
      const drawWings = () => { wing(ctx, bx - 4, by - 3, -1, p.f, p.sweep, swY, false); wing(ctx, bx + 4, by - 3, 1, p.f, p.sweep, swY, false); };
      if (front) drawWings();
      feet(ctx, bx, by + 6.5, 0);
      fluffBody(ctx, bx, by, 7, 7.2, dir);
      if (!front) drawWings();
      if (front) headFront(ctx, bx, by - 10.5, p.mood); else headBack(ctx, bx, by - 10.5);
    } else {
      // side view: far wing behind, near wing in front, both trailing away from the facing direction
      wing(ctx, bx - s * 2, by - 9, -s, p.f * 0.85 + 0.25, p.sweep, swY, true, 16);
      feet(ctx, bx - s * 1, by + 6.5, s);
      fluffBody(ctx, bx, by, 6.5, 7.2, dir);
      wing(ctx, bx - s * 1, by - 1, -s, p.f, p.sweep, swY, false, 17);
      headSide(ctx, bx + s * 2.5, by - 10.5, s, p.mood);
    }
  },
};
