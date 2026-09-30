/**
 * Slime: a green jelly enemy.
 * A glossy translucent dome with a darker core, two dark eyes and a small mouth, a little
 * droplet "tuft" on top that reacts to movement. Walk = hop (stretch tall, squash wide with a
 * landing splash). Attack = lunge (crouch, spring toward the facing direction, settle).
 * Beze Character Sheet v2, 48x64 frames. Paths only; deterministic (f.rand only).
 */

const P = {
  ol: '#123a1c',
  light: '#b6f7a3', base: '#5fd15e', mid: '#3fae48', dark: '#2a8438', deep: '#1d6a2c',
  gloss: 'rgba(255,255,255,0.88)', glossSoft: 'rgba(255,255,255,0.45)',
  core: 'rgba(22,100,46,0.55)', coreH: 'rgba(150,240,150,0.45)', bubble: 'rgba(230,255,225,0.55)',
  eye: '#162417', eyeH: '#ffffff', brow: '#123a1c', mouth: '#173a1f', tongue: '#d1587a',
  shadow: 'rgba(10,6,24,0.30)', splash: '#d7ffcf', speed: 'rgba(220,255,210,0.85)',
};

// ---------------------------------------------------------------- helpers
function fs(ctx, fill, stroke = P.ol, lw = 1) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function ell(ctx, cx, cy, rx, ry, fill, stroke = null, lw = 1, rot = 0) {
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(rx, 0.2), Math.max(ry, 0.2), rot, 0, Math.PI * 2); fs(ctx, fill, stroke, lw);
}
function curve(ctx, x1, y1, cx, cy, x2, y2, color, w = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
}
function line(ctx, x1, y1, x2, y2, color, w = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function shadow(ctx, cx, rx) {
  ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(cx, 61.6, rx, 2.4, 0, 0, Math.PI * 2); ctx.fill();
}

// ---------------------------------------------------------------- body
/** Dome path. Base line at `base`, width w, height h; the top leans `lean` px sideways. */
function bodyPath(ctx, cx, base, w, h, lean) {
  const l = cx - w / 2, r = cx + w / 2, top = base - h, tx = cx + lean;
  ctx.beginPath();
  ctx.moveTo(l, base);
  ctx.bezierCurveTo(l - w * 0.06, base - h * 0.62, tx - w * 0.48, top, tx, top);
  ctx.bezierCurveTo(tx + w * 0.48, top, r + w * 0.06, base - h * 0.62, r, base);
  ctx.quadraticCurveTo(cx, base + 1.4, l, base);
  ctx.closePath();
}

/** Droplet tuft on the top of the dome, tilting with `tilt`. Drawn before the body. */
function tuft(ctx, tx, top, tilt, squash = 0) {
  const hgt = 5.2 - squash * 2.5;
  ctx.beginPath();
  ctx.moveTo(tx - 2.4, top + 1.2);
  ctx.quadraticCurveTo(tx - 1.2 + tilt * 0.6, top - hgt * 0.55, tx + tilt * 1.3, top - hgt);
  ctx.quadraticCurveTo(tx + 2.2 + tilt * 0.8, top - hgt * 0.45, tx + 2.4, top + 1.2);
  ctx.closePath();
  fs(ctx, P.base, P.ol, 1);
  line(ctx, tx - 0.6 + tilt * 0.4, top - hgt * 0.5, tx + tilt * 0.9, top - hgt * 0.75, P.light, 0.9);
}

function body(ctx, cx, base, w, h, lean, dir) {
  const top = base - h;
  const backView = dir === 'up';
  // jelly fill: radial gradient, lit from the upper left
  bodyPath(ctx, cx, base, w, h, lean);
  const g = ctx.createRadialGradient(cx - w * 0.2 + lean * 0.5, top + h * 0.38, 1, cx + lean * 0.25, base - h * 0.45, w * 0.78);
  g.addColorStop(0, P.light); g.addColorStop(0.42, P.base); g.addColorStop(0.85, P.mid); g.addColorStop(1, P.dark);
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // darker translucent bottom band
  ell(ctx, cx, base + h * 0.12, w * 0.6, h * 0.36, 'rgba(24,96,44,0.42)');
  // translucent core, sitting a little back and low
  const coreX = cx + lean * 0.55 + (backView ? 0 : 0), coreY = base - h * (backView ? 0.5 : 0.42);
  ell(ctx, coreX, coreY, w * (backView ? 0.24 : 0.2), h * (backView ? 0.3 : 0.25), P.core);
  ell(ctx, coreX - w * 0.04, coreY - h * 0.06, w * 0.1, h * 0.12, P.coreH);
  // bubbles trapped in the jelly
  ell(ctx, cx + w * 0.28 + lean * 0.4, base - h * 0.36, 1.1, 1.1, P.bubble);
  ell(ctx, cx - w * 0.3 + lean * 0.4, base - h * 0.24, 0.8, 0.8, P.bubble);
  ell(ctx, cx + w * 0.16 + lean * 0.5, base - h * 0.72, 0.8, 0.8, P.bubble);
  // soft inner shade along the shadowed side for volume
  curve(ctx, cx - w * 0.47, base - h * 0.15, cx - w * 0.36 + lean * 0.3, base - h * 0.6, cx - w * 0.2 + lean * 0.8, top + 1.5, 'rgba(20,90,40,0.28)', 2.4);
  // rim light on the right edge
  curve(ctx, cx + w * 0.44, base - h * 0.2, cx + w * 0.42 + lean * 0.5, base - h * 0.75, cx + lean + w * 0.12, top + 1.2, 'rgba(255,255,255,0.32)', 1.2);
  // gloss highlight
  ell(ctx, cx - w * 0.24 + lean * 0.6, top + h * 0.3, w * 0.14, h * 0.11, P.gloss, null, 1, -0.65);
  ell(ctx, cx - w * 0.07 + lean * 0.7, top + h * 0.15, 1.1, 0.9, P.glossSoft);
  ctx.restore();
  bodyPath(ctx, cx, base, w, h, lean);
  fs(ctx, null, P.ol, 1);
}

// ---------------------------------------------------------------- face
/** mood: 'idle' | 'squint' | 'angry' | 'open' | 'blink' */
function face(ctx, cx, base, w, h, lean, dir, mood) {
  if (dir === 'up') return;
  const s = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const sw = Math.sqrt(w / 28), sh = Math.sqrt(h / 20);
  const eyeY = base - h * 0.5 - (mood === 'open' ? 1 : 0);
  const rx = 2.1 * sw, ry = (mood === 'squint' ? 1.4 : mood === 'blink' ? 0.5 : 3) * sh;
  const fx = cx + lean * 0.5;
  const eyes = s === 0
    ? [[fx - 5 * sw, rx, ry], [fx + 5 * sw, rx, ry]]
    : [[fx + s * 3.5 * sw, rx, ry], [fx + s * 9.2 * sw, rx * 0.62, ry * 0.9]];
  for (const [ex, erx, ery] of eyes) {
    ell(ctx, ex, eyeY, erx, ery, P.eye);
    if (mood !== 'blink') {
      ctx.fillStyle = P.eyeH; ctx.fillRect(Math.round(ex - erx * 0.45) - 0.5, Math.round(eyeY - ery * 0.5) - 0.5, 1, 1);
    }
    if (mood === 'angry' || mood === 'open') {
      const inner = s === 0 ? (ex < fx ? 1 : -1) : -s;
      line(ctx, ex - inner * erx * 1.2, eyeY - ery - 2.2, ex + inner * erx * 0.9, eyeY - ery - 0.8, P.brow, 1.1);
    }
  }
  const mx = s === 0 ? fx : fx + s * 6.5 * sw, my = eyeY + ry + 2.2;
  if (mood === 'open') {
    ell(ctx, mx, my + 0.8, 2.6 * sw, 2 * sh, P.mouth, P.ol, 0.8);
    ell(ctx, mx, my + 1.9, 1.3 * sw, 0.9 * sh, P.tongue);
  } else if (mood === 'squint' || mood === 'angry') {
    curve(ctx, mx - 2 * sw, my + 0.6, mx, my - 0.8, mx + 2 * sw, my + 0.6, P.mouth, 1);
  } else {
    curve(ctx, mx - 1.6 * sw, my - 0.4, mx, my + 1.2, mx + 1.6 * sw, my - 0.4, P.mouth, 1);
  }
}

// ---------------------------------------------------------------- effects
function splash(ctx, cx, base, w, rand) {
  const l = cx - w / 2, r = cx + w / 2;
  for (const [x0, sgn] of [[l, -1], [r, 1]]) {
    curve(ctx, x0 + sgn * 1.5, base - 0.5, x0 + sgn * 5, base - 1.5, x0 + sgn * 5.5, base - 6, P.mid, 2.2);
    curve(ctx, x0 + sgn * 1.5, base - 0.5, x0 + sgn * 5, base - 1.5, x0 + sgn * 5.5, base - 6, P.splash, 1);
  }
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? -1 : 1;
    const x = Math.round(cx + side * (w / 2 + 4 + rand() * 4)), y = Math.round(base - 6 - rand() * 5);
    if (x >= 3 && x <= 44 && y >= 2 && y < 62) ell(ctx, x, y, 1.2, 1.2, P.splash, P.mid, 0.8);
  }
}

function speedLines(ctx, kind, cx, base, w, h, s, rand) {
  ctx.lineCap = 'round';
  if (kind === 'side') {
    const x0 = cx - s * (w / 2 + 2);
    for (let i = 0; i < 3; i++) {
      const y = base - h * (0.25 + i * 0.25), len = 5 + rand() * 4;
      line(ctx, x0, y, x0 - s * len, y, P.speed, 1);
    }
  } else if (kind === 'up') {
    const top = base - h;
    for (let i = -1; i <= 1; i++) {
      const x = cx + i * 7, y0 = top - 3 - Math.abs(i) * 2, len = 4 + rand() * 3;
      line(ctx, x, y0, x, y0 - len, P.speed, 1);
    }
  } else if (kind === 'down') {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const x = cx + side * (w / 2 + 3 + i * 3), y1 = base - 2 - i * 2, len = 5 + rand() * 3;
        line(ctx, x, y1, x, y1 - len, P.speed, 1);
      }
    }
  }
}

// ---------------------------------------------------------------- frames
function pose(f) {
  const { anim, dir, index } = f;
  const s = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  if (anim === 'walk') {
    return [
      { w: 28, h: 20, lift: 0, lean: 0, tilt: 0, mood: 'idle' },
      { w: 22, h: 27, lift: 0, lean: s * 2, tilt: -s * 2.2, mood: 'idle' },
      { w: 25, h: 22, lift: 3, lean: s * 3, tilt: -s * 3, mood: 'idle', shadowScale: 0.82 },
      { w: 32, h: 15, lift: 0, lean: 0, tilt: s * 1.2, squash: 1, mood: 'blink', splash: true },
    ][index];
  }
  if (s === 0) {
    const down = dir === 'down';
    return [
      { w: 32, h: 14, lift: 0, lean: 0, tilt: 0, squash: 0.6, mood: 'squint' },
      down
        ? { w: 34, h: 25, lift: 0, lean: 0, tilt: -1, mood: 'open', lines: 'up' }
        : { w: 23, h: 31, lift: 0, lean: 0, tilt: 0, mood: 'open', lines: 'down' },
      { w: 30, h: 17, lift: 0, lean: 0, tilt: down ? 1 : -1, squash: 0.3, mood: 'angry' },
    ][index];
  }
  return [
    { w: 32, h: 14, lift: 0, lean: -s * 2, tilt: -s * 1.5, squash: 0.6, mood: 'squint' },
    { w: 30, h: 19, lift: 0, cx: 24 + s * 6, lean: s * 9, tilt: s * 4, mood: 'open', lines: 'side' },
    { w: 30, h: 17, lift: 0, lean: s * 1.5, tilt: -s * 1.5, squash: 0.3, mood: 'angry' },
  ][index];
}

export default {
  id: 'chr_slime',
  name: 'Slime',
  role: 'enemy',
  assetId: 'ast_starter_slime',
  file: 'slime.png',
  frameWidth: 48, frameHeight: 64,
  collider: { width: 26, height: 16, offsetX: 11, offsetY: 48 },
  walkFrameRate: 6, attackFrameRate: 12,
  portrait: null,
  draw(ctx, f) {
    const p = pose(f);
    const s = f.dir === 'left' ? -1 : f.dir === 'right' ? 1 : 0;
    const cx = p.cx ?? 24, base = 62 - p.lift;
    shadow(ctx, cx + s * (p.lean ?? 0) * 0.15, (p.w / 2 + 1) * (p.shadowScale ?? 1));
    if (p.lines === 'side') speedLines(ctx, 'side', cx, base, p.w, p.h, s, f.rand);
    if (p.lines === 'up') speedLines(ctx, 'up', cx, base, p.w, p.h, s, f.rand);
    if (p.lines === 'down') speedLines(ctx, 'down', cx, base, p.w, p.h, s, f.rand);
    tuft(ctx, cx + p.lean, base - p.h, p.tilt, p.squash ?? 0);
    body(ctx, cx, base, p.w, p.h, p.lean, f.dir);
    face(ctx, cx, base, p.w, p.h, p.lean, f.dir, p.mood);
    if (p.splash) splash(ctx, cx, base, p.w, f.rand);
  },
};
