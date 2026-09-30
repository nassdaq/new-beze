/**
 * Hero on horse: the white-haired swordswoman from hero.mjs riding the chestnut horse from horse.mjs.
 * Same 64x64 sheet and collider as the horse. Walk rows are the horse's four-beat gait with the rider swaying; the
 * attack rows keep the horse standing while she slashes from the saddle. The horse drawing code is a copy of
 * horse.mjs (art modules import nothing); the rider is redrawn at riding scale rather than reused from hero.mjs.
 */

const P = {
  ol: '#241610',
  coat: '#b0562a', coatS: '#7e3a19', coatH: '#d3805a', coatL: '#e9a988',
  belly: '#c98a64',
  mane: '#2c1a14', maneH: '#553529', maneL: '#6f4a3c',
  blaze: '#f7f1ea', blazeS: '#d9cbbf',
  muzzle: '#8f4a2e', nostril: '#3a1f14',
  eye: '#1a1210', eyeH: '#ffffff', lash: '#120c09',
  earIn: '#e59a86',
  hoof: '#2f2521', hoofH: '#6b5a52',
  leather: '#6b3d22', leatherH: '#9a6540', leatherS: '#40220f',
  blanket: '#355a9c', blanketS: '#23407a', trim: '#e2c25e',
  rein: '#3a2416', metal: '#dcb040',
  sock: '#efe6dd',
};

// ---------------------------------------------------------------- primitives
function fs(ctx, fill, stroke = P.ol, lw = 1) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function ell(ctx, cx, cy, rx, ry, fill, stroke = P.ol, lw = 1, rot = 0) {
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); fs(ctx, fill, stroke, lw);
}
function line(ctx, x1, y1, x2, y2, color, w = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function curve(ctx, x1, y1, cx, cy, x2, y2, color, w = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
}
function limb(ctx, x1, y1, x2, y2, color, w) { line(ctx, x1, y1, x2, y2, P.ol, w + 2); line(ctx, x1, y1, x2, y2, color, w); }
function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g;
}
function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
function shadow(ctx, cx, rx, ry = 3) {
  ctx.fillStyle = 'rgba(10,6,24,0.30)'; ctx.beginPath(); ctx.ellipse(cx, 61.4, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

/** A hoof whose bottom edge is at `y`, centred on `x`. */
function hoof(ctx, x, y, w = 5.8) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - 3.4); ctx.lineTo(x + w / 2, y - 3.4);
  ctx.lineTo(x + w / 2 + 0.4, y - 0.8); ctx.quadraticCurveTo(x + w / 2 + 0.4, y, x + w / 2 - 0.8, y);
  ctx.lineTo(x - w / 2 + 0.8, y); ctx.quadraticCurveTo(x - w / 2 - 0.4, y, x - w / 2 - 0.4, y - 0.8);
  ctx.closePath(); fs(ctx, P.hoof);
  line(ctx, x - w / 2 + 1.2, y - 2.6, x - w / 2 + 1.2, y - 1.2, P.hoofH, 0.9);
}

/**
 * One leg in profile: joint at (hx,hy), hoof bottom at (fx,fy). `hind` bends the hock backwards (+x when the horse
 * faces left), a front leg bends its knee forwards. `bend` scales the joint offset (lifted legs fold more).
 */
function legSide(ctx, hx, hy, fx, fy, hind, far, bend = 1, sock = false) {
  const ay = fy - 3.4;
  const kx = (hx + fx) / 2 + (hind ? 2.4 : -1.8) * bend;
  const ky = hy + (ay - hy) * (hind ? 0.55 : 0.5);
  const c = far ? P.coatS : P.coat;
  limb(ctx, hx, hy, kx, ky, c, far ? 4.6 : 5.4);
  limb(ctx, kx, ky, fx, ay, c, far ? 3 : 3.6);
  if (sock) limb(ctx, (kx + fx) / 2, (ky + ay) / 2, fx, ay, far ? P.blazeS : P.sock, far ? 3 : 3.6);
  if (!far) {
    line(ctx, hx - 1.2, hy + 2, kx - 1.4, ky - 1, P.coatH, 1);
    if (!sock) line(ctx, kx - 0.9, ky + 1, fx - 0.9, ay - 1, P.coatH, 0.7);
  }
  hoof(ctx, fx, fy, far ? 5 : 5.8);
}

/** One leg seen head-on (or from behind): joint at (x, top), hoof bottom at y = 63 - lift, knee kicks out to `side`. */
function legFront(ctx, x, top, lift, far, side) {
  const kx = x + side * lift * 0.5, ky = top + 9.5 - lift * 0.35;
  const fx = x + side * lift * 0.25, fy = 63 - lift;
  const c = far ? P.coatS : P.coat;
  limb(ctx, x, top, kx, ky, c, far ? 5 : 6);
  limb(ctx, kx, ky, fx, fy - 3.4, c, far ? 3.4 : 4.2);
  if (!far) { line(ctx, x - 1.4, top + 2, kx - 1.4, ky - 1, P.coatH, 1); line(ctx, kx - 0.9, ky + 1.5, fx - 0.9, fy - 5, P.coatH, 0.7); }
  hoof(ctx, fx, fy, far ? 5.2 : 6.2);
}

// ---------------------------------------------------------------- side view (facing left)
const HIND_PIVOT = [46, 63];
function rotator(rear) {
  const th = (rear || 0) * 0.32, c = Math.cos(th), s = Math.sin(th);
  const [px, py] = HIND_PIVOT;
  return { th, pt: (x, y) => [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c] };
}

function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(22, 30);
  ctx.quadraticCurveTo(36, 24, 47, 28);
  ctx.quadraticCurveTo(56.5, 31, 54, 42);
  ctx.quadraticCurveTo(51, 50, 40, 49.5);
  ctx.quadraticCurveTo(26, 50.5, 19, 43);
  ctx.quadraticCurveTo(15, 35, 22, 30);
  ctx.closePath();
}

function bodySide(ctx) {
  bodyPath(ctx);
  ctx.fillStyle = grad(ctx, 0, 25, 0, 50, [[0, P.coatH], [0.35, P.coat], [1, P.coatS]]); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = P.coatL; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.ellipse(36, 28.5, 11, 2.2, 0, 0, Math.PI * 2); ctx.fill(); // back sheen
  ctx.globalAlpha = 1;
  curve(ctx, 24, 34, 27, 42, 25, 47, P.coatS, 1.4); // shoulder crease
  curve(ctx, 48, 33, 45, 40, 47, 47, P.coatS, 1.2); // stifle crease
  ctx.fillStyle = P.belly; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.ellipse(35, 47, 10, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  bodyPath(ctx); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
}

function tailSide(ctx, sw) {
  ctx.beginPath();
  ctx.moveTo(49, 28.5);
  ctx.quadraticCurveTo(57 + sw, 35, 57.5 + sw * 1.4, 45);
  ctx.quadraticCurveTo(58.5 + sw * 2, 53, 54.5 + sw * 2.2, 57);
  ctx.quadraticCurveTo(53.5 + sw * 1.2, 50, 52, 42);
  ctx.quadraticCurveTo(51.5, 35, 48.5, 30.5);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, 28, 0, 57, [[0, P.maneH], [0.5, P.mane], [1, P.mane]]); ctx.fill();
  ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  curve(ctx, 53.5, 33, 56 + sw, 40, 55.5 + sw * 1.6, 50, P.maneL, 0.9);
}

function neckHeadSide(ctx, o) {
  const hu = o.headUp || 0;
  const hx = 10 + (o.headDx || 0), hy = 14 - hu;
  // neck
  poly(ctx, [[27, 30.5], [hx + 4, hy - 2.5], [hx - 1, hy - 1], [hx - 2, hy + 8.5], [16, 41.5], [22, 40]]);
  ctx.fillStyle = grad(ctx, 8, 0, 26, 0, [[0, P.coatH], [0.5, P.coat], [1, P.coatS]]); ctx.fill();
  ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  curve(ctx, hx + 1, hy + 9, 15, 26, 19, 39, P.coatS, 1.2); // throat / jugular groove
  // head
  const head = () => {
    ctx.beginPath();
    ctx.moveTo(hx + 4, hy - 2);
    ctx.quadraticCurveTo(hx - 2, hy - 3.2, hx - 5, hy + 3);
    ctx.quadraticCurveTo(hx - 8, hy + 8, hx - 8.2, hy + 12);
    ctx.quadraticCurveTo(hx - 8.6, hy + 16.2, hx - 4.5, hy + 16.2);
    ctx.quadraticCurveTo(hx - 0.8, hy + 16, hx + 0.5, hy + 12);
    ctx.quadraticCurveTo(hx + 3.5, hy + 8, hx + 6.5, hy + 4);
    ctx.quadraticCurveTo(hx + 7.5, hy, hx + 4, hy - 2);
    ctx.closePath();
  };
  // far ear
  poly(ctx, [[hx + 4.5, hy - 1.5], [hx + 4, hy - 8], [hx + 7, hy - 2]]); fs(ctx, P.coatS);
  head(); ctx.fillStyle = grad(ctx, hx - 8, 0, hx + 7, 0, [[0, P.coatH], [0.45, P.coat], [1, P.coatS]]); ctx.fill();
  ctx.save(); head(); ctx.clip();
  ctx.fillStyle = P.muzzle; ctx.beginPath(); ctx.ellipse(hx - 5.5, hy + 13.5, 4.2, 3.2, 0.5, 0, Math.PI * 2); ctx.fill();
  // blaze
  ctx.strokeStyle = P.blaze; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(hx - 0.5, hy - 1.5); ctx.quadraticCurveTo(hx - 5, hy + 4, hx - 6.5, hy + 13.5); ctx.stroke();
  line(ctx, hx - 1.8, hy + 1, hx - 5.2, hy + 7, P.blazeS, 0.7);
  ctx.restore();
  head(); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  // near ear
  poly(ctx, [[hx + 0.5, hy - 2], [hx - 0.5, hy - 9], [hx + 3.5, hy - 2.5]]); fs(ctx, P.coat);
  poly(ctx, [[hx + 1, hy - 2.8], [hx + 0.5, hy - 6.8], [hx + 2.6, hy - 3.2]]); ctx.fillStyle = P.earIn; ctx.fill();
  // nostril, mouth
  ell(ctx, hx - 6.6, hy + 12.6, 0.9, 1.3, P.nostril, null, 0, -0.5);
  if (o.open) {
    line(ctx, hx - 7.5, hy + 15.2, hx - 3.5, hy + 15.6, P.ol, 1.2);
    ell(ctx, hx - 5.5, hy + 15.6, 2, 1, '#5a2a22', P.ol, 0.8);
  } else line(ctx, hx - 7.6, hy + 14.6, hx - 4, hy + 15, P.ol, 0.9);
  // eye: almond, dark, one highlight, a lash flick
  ctx.beginPath(); ctx.ellipse(hx - 1.2, hy + 4.2, 1.7, 2, 0.35, 0, Math.PI * 2); ctx.fillStyle = P.eye; ctx.fill();
  ctx.strokeStyle = P.lash; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx - 3.2, hy + 3); ctx.quadraticCurveTo(hx - 1, hy + 1, hx + 1.2, hy + 3); ctx.stroke();
  line(ctx, hx - 3.2, hy + 3, hx - 4.2, hy + 2.2, P.lash, 1);
  ctx.fillStyle = P.eyeH; ctx.beginPath(); ctx.arc(hx - 1.9, hy + 3.5, 0.6, 0, Math.PI * 2); ctx.fill();
  // bridle: crown strap behind the ear, cheek piece, noseband, bit ring
  line(ctx, hx + 3.5, hy - 1, hx - 3.5, hy + 10.8, P.rein, 1.1);
  line(ctx, hx - 8.6, hy + 10.2, hx - 1.5, hy + 11.6, P.rein, 1.1);
  ell(ctx, hx - 7.2, hy + 13.6, 1.2, 1.2, null, P.metal, 0.9);
  // forelock + mane hanging on the near side
  poly(ctx, [[hx + 1.5, hy - 2.5], [hx - 2.5, hy - 1.5], [hx - 3.5, hy + 2.5], [hx - 1.5, hy + 0.5], [hx + 2.5, hy + 0.5]]);
  fs(ctx, P.mane, P.ol, 0.9);
  const sw = o.sway || 0;
  ctx.beginPath();
  ctx.moveTo(hx + 3.5, hy - 3);
  ctx.quadraticCurveTo(hx + 11, hy + 4, 20, 20);
  ctx.quadraticCurveTo(24, 25, 28.5, 31);
  ctx.quadraticCurveTo(29.5, 33.5, 27, 34.5 + sw * 0.3);
  ctx.quadraticCurveTo(26.5, 31.5, 24.5, 29.5 + sw * 0.5);
  ctx.quadraticCurveTo(24.5, 33, 22, 32 + sw * 0.6);
  ctx.quadraticCurveTo(21, 27.5, 19, 24.5 + sw * 0.5);
  ctx.quadraticCurveTo(18.5, 28, 16, 25.5 + sw * 0.6);
  ctx.quadraticCurveTo(15.5, 20, 14, 17 + sw * 0.4);
  ctx.quadraticCurveTo(13, 19.5, 11, 16.5 + sw * 0.4);
  ctx.quadraticCurveTo(11, 10, hx + 5.5, hy - 2);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, 8, 0, 34, [[0, P.maneH], [0.6, P.mane], [1, P.mane]]); ctx.fill();
  ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  curve(ctx, 14, 12, 19, 19, 24, 28, P.maneL, 0.9);
}

function tackSide(ctx, o) {
  // blanket under the saddle, following the back
  ctx.beginPath(); ctx.moveTo(26, 30.5); ctx.quadraticCurveTo(35, 26.5, 43.5, 29); ctx.lineTo(44.5, 38.5); ctx.quadraticCurveTo(35, 41, 27, 39); ctx.closePath();
  fs(ctx, P.blanket);
  ctx.save(); ctx.clip();
  line(ctx, 27, 37.5, 44.5, 37, P.trim, 1.6); line(ctx, 27.8, 31.5, 27.8, 39, P.trim, 1.2);
  ctx.fillStyle = P.blanketS; ctx.fillRect(38, 29, 7, 11);
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(26, 30.5); ctx.quadraticCurveTo(35, 26.5, 43.5, 29); ctx.lineTo(44.5, 38.5); ctx.quadraticCurveTo(35, 41, 27, 39); ctx.closePath();
  ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  // girth
  curve(ctx, 31, 38.5, 29.5, 45, 31, 49.5, P.leatherS, 1.8);
  // stirrup leather + iron
  line(ctx, 34.5, 32, 34, 43, P.leatherS, 1.6);
  ctx.strokeStyle = P.metal; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(34, 44.5, 2, Math.PI * 1.1, Math.PI * 1.9, true); ctx.stroke();
  line(ctx, 32, 45.3, 36, 45.3, P.metal, 1.2);
  // flap
  ctx.beginPath(); ctx.moveTo(29, 30); ctx.lineTo(40, 29); ctx.quadraticCurveTo(42, 34, 39.5, 37.5); ctx.quadraticCurveTo(34, 39, 30, 37); ctx.quadraticCurveTo(28, 33.5, 29, 30); ctx.closePath();
  fs(ctx, P.leather);
  // seat with pommel and cantle
  const seat = () => {
    ctx.beginPath();
    ctx.moveTo(27.5, 30.5); ctx.quadraticCurveTo(27, 25.5, 29.5, 24.5);
    ctx.quadraticCurveTo(34.5, 29.5, 39.5, 25.5); ctx.quadraticCurveTo(43, 22.5, 43.5, 27);
    ctx.quadraticCurveTo(43.5, 30.5, 41, 31.5); ctx.quadraticCurveTo(34, 33.5, 27.5, 30.5);
    ctx.closePath();
  };
  seat(); ctx.fillStyle = grad(ctx, 0, 23, 0, 33, [[0, P.leatherH], [0.5, P.leather], [1, P.leatherS]]); ctx.fill();
  ctx.save(); seat(); ctx.clip();
  curve(ctx, 30, 26, 34.5, 30.5, 39.5, 27, P.leatherH, 1.1);
  ctx.restore();
  seat(); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  if (!o.noReins) reinsSide(ctx, [28.5, 26.5], o);
}

/** Reins from the bit ring to `hand`, sagging a little. */
function reinsSide(ctx, hand, o) {
  const hu = o.headUp || 0, hx = 10 + (o.headDx || 0), hy = 14 - hu;
  const bx = hx - 7.2, by = hy + 13.6;
  curve(ctx, bx, by, (bx + hand[0]) / 2, Math.max(by, hand[1]) + 4, hand[0], hand[1], P.ol, 2.2);
  curve(ctx, bx, by, (bx + hand[0]) / 2, Math.max(by, hand[1]) + 4, hand[0], hand[1], P.rein, 1);
}

/** Leg targets for one side-view frame: hoof x rest positions and gait phase. Forward is -x. */
function sideLegs(pose) {
  const p = pose.phase;
  const g = (off, restX) => {
    if (p === null) return { fx: restX, lift: 0, bend: 1 };
    const a = Math.PI * 2 * (p - off);
    const s = Math.sin(a), l = Math.max(0, Math.cos(a));
    return { fx: restX - s * 4.5, lift: l * 3.6, bend: 1 + l * 0.9 };
  };
  // four-beat walk: near hind, near front, far hind, far front
  return { nh: g(0, 48), nf: g(0.25, 22), fh: g(0.5, 44), ff: g(0.75, 26) };
}

function drawSide(ctx, pose, hooks = {}) {
  const bob = pose.bob || 0;
  const R = rotator(pose.rear);
  const legs = sideLegs(pose);
  shadow(ctx, 33, 24);
  // hind legs stand on the ground; their hips ride with the (possibly rotated) body
  const [fhx, fhy] = R.pt(45, 40 + bob), [nhx, nhy] = R.pt(47, 40 + bob);
  const hindBend = 1 + (pose.rear || 0) * 0.8;
  legSide(ctx, fhx, fhy, legs.fh.fx, 63 - legs.fh.lift, true, true, legs.fh.bend * hindBend);
  ctx.save();
  ctx.translate(HIND_PIVOT[0], HIND_PIVOT[1]); ctx.rotate(R.th); ctx.translate(-HIND_PIVOT[0], -HIND_PIVOT[1]);
  ctx.translate(0, bob);
  if (pose.rear > 0.3) {
    // rearing: front legs fold up under the chest
    const k = pose.rear;
    limb(ctx, 23, 40, 15 + k * 2, 44 - k * 6, P.coatS, 4.6); limb(ctx, 15 + k * 2, 44 - k * 6, 17 + k * 3, 52 - k * 6, P.coatS, 3); hoof(ctx, 17 + k * 3, 55 - k * 6, 5);
  } else legSide(ctx, 23, 40, legs.ff.fx, 63 - legs.ff.lift - bob, false, true, legs.ff.bend);
  tailSide(ctx, pose.tail || 0);
  bodySide(ctx);
  hooks.beforeTack?.(ctx);
  tackSide(ctx, { ...pose, noReins: !!hooks.reins });
  hooks.afterTack?.(ctx);
  if (pose.rear > 0.3) {
    const k = pose.rear;
    limb(ctx, 25, 40, 17 + k * 2, 42 - k * 6, P.coat, 5.4); limb(ctx, 17 + k * 2, 42 - k * 6, 20 + k * 3, 50 - k * 6, P.coat, 3.6);
    line(ctx, 24, 42, 18 + k * 2, 41 - k * 6, P.coatH, 1);
    hoof(ctx, 20 + k * 3, 53 - k * 6, 5.8);
  } else legSide(ctx, 25, 40, legs.nf.fx, 63 - legs.nf.lift - bob, false, false, legs.nf.bend, true);
  neckHeadSide(ctx, pose);
  hooks.rider?.(ctx);
  if (hooks.reins) reinsSide(ctx, hooks.reins, pose);
  ctx.restore();
  legSide(ctx, nhx, nhy, legs.nh.fx, 63 - legs.nh.lift, true, false, legs.nh.bend * hindBend);
}

// ---------------------------------------------------------------- front view (down)
function headFront(ctx, cx, top, o) {
  const face = () => {
    ctx.beginPath();
    ctx.moveTo(cx - 6.2, top + 2);
    ctx.quadraticCurveTo(cx - 8.4, top + 12, cx - 5.2, top + 20);
    ctx.quadraticCurveTo(cx - 3.2, top + 24.5, cx, top + 24.5);
    ctx.quadraticCurveTo(cx + 3.2, top + 24.5, cx + 5.2, top + 20);
    ctx.quadraticCurveTo(cx + 8.4, top + 12, cx + 6.2, top + 2);
    ctx.quadraticCurveTo(cx, top - 1.5, cx - 6.2, top + 2);
    ctx.closePath();
  };
  // ears
  for (const s of [-1, 1]) {
    poly(ctx, [[cx + s * 3.5, top + 2.5], [cx + s * 6.5, top - 6], [cx + s * 8, top + 3]]); fs(ctx, P.coat);
    poly(ctx, [[cx + s * 4.6, top + 1.8], [cx + s * 6.3, top - 3.8], [cx + s * 7, top + 2]]); ctx.fillStyle = P.earIn; ctx.fill();
  }
  face(); ctx.fillStyle = grad(ctx, cx - 8, 0, cx + 8, 0, [[0, P.coatH], [0.5, P.coat], [1, P.coatS]]); ctx.fill();
  ctx.save(); face(); ctx.clip();
  ctx.fillStyle = P.muzzle; ctx.beginPath(); ctx.ellipse(cx, top + 21.5, 5, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  poly(ctx, [[cx - 2.2, top + 1.5], [cx + 2.2, top + 1.5], [cx + 1.3, top + 22], [cx - 1.3, top + 22]]); ctx.fillStyle = P.blaze; ctx.fill();
  line(ctx, cx + 1, top + 3, cx + 0.6, top + 20, P.blazeS, 0.7);
  ctx.restore();
  face(); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  // eyes on the sides of the skull
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(cx + s * 5.4, top + 9.5, 1.4, 2, 0, 0, Math.PI * 2); ctx.fillStyle = P.eye; ctx.fill();
    ctx.strokeStyle = P.lash; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(cx + s * 3.6, top + 8.6); ctx.quadraticCurveTo(cx + s * 5.6, top + 6.6, cx + s * 7.4, top + 8.2); ctx.stroke();
    ctx.fillStyle = P.eyeH; ctx.beginPath(); ctx.arc(cx + s * 5.9, top + 8.8, 0.55, 0, Math.PI * 2); ctx.fill();
  }
  // nostrils + mouth
  ell(ctx, cx - 2.6, top + 21, 0.9, 1.3, P.nostril, null, 0, 0.4); ell(ctx, cx + 2.6, top + 21, 0.9, 1.3, P.nostril, null, 0, -0.4);
  if (o.open) ell(ctx, cx, top + 23.6, 2.2, 1.1, '#5a2a22', P.ol, 0.8);
  else curve(ctx, cx - 2, top + 23.4, cx, top + 24.2, cx + 2, top + 23.4, P.ol, 0.8);
  // bridle
  line(ctx, cx - 6.6, top + 6, cx - 5, top + 19, P.rein, 1); line(ctx, cx + 6.6, top + 6, cx + 5, top + 19, P.rein, 1);
  curve(ctx, cx - 5.4, top + 18.5, cx, top + 20.5, cx + 5.4, top + 18.5, P.rein, 1.1);
  // forelock, dropping over the right side of the forehead
  poly(ctx, [[cx - 3.5, top + 0.5], [cx + 3.5, top + 0.2], [cx + 4.5, top + 7], [cx + 1.5, top + 4], [cx - 0.5, top + 6.5], [cx - 2.5, top + 3.5]]);
  fs(ctx, P.mane, P.ol, 0.9);
}

function drawFront(ctx, pose, hooks = {}) {
  const cx = 32, bob = -(pose.bob || 0);
  const lift = pose.lift || 0;   // rear-up amount
  const top = 9 + bob + (pose.headDy || 0) - lift * 6;
  const bodyY = 40 + bob - lift * 3;
  shadow(ctx, 32, 17);
  const sw = pose.legSwing || 0; // + = left front (viewer's left) lifted
  // hind legs, behind
  legFront(ctx, cx - 10, bodyY + 4, Math.max(0, -sw) * 3, true, -1);
  legFront(ctx, cx + 10, bodyY + 4, Math.max(0, sw) * 3, true, 1);
  // tail tip peeking at the side
  ell(ctx, cx + 15 + (pose.tail || 0) * 0.5, bodyY + 12, 2.2, 5, P.mane, P.ol, 0.9, 0.2);
  // barrel / chest
  ctx.beginPath(); ctx.ellipse(cx, bodyY, 15.5, 11.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad(ctx, cx - 15, 0, cx + 15, 0, [[0, P.coatH], [0.5, P.coat], [1, P.coatS]]); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = P.belly; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.ellipse(cx, bodyY + 8, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  curve(ctx, cx - 1, bodyY + 2, cx, bodyY + 6, cx - 1, bodyY + 10, P.coatS, 1); // chest groove
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(cx, bodyY, 15.5, 11.5, 0, 0, Math.PI * 2); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  // saddle blanket edges and pommel behind the neck
  for (const s of [-1, 1]) {
    poly(ctx, [[cx + s * 8, bodyY - 11], [cx + s * 15, bodyY - 9], [cx + s * 15.5, bodyY - 1], [cx + s * 9, bodyY - 3]]); fs(ctx, P.blanket);
    line(ctx, cx + s * 14, bodyY - 8, cx + s * 14.5, bodyY - 2, P.trim, 1.2);
  }
  ctx.beginPath(); ctx.ellipse(cx, bodyY - 12, 9.5, 3.2, 0, 0, Math.PI * 2); fs(ctx, P.leather);
  ctx.beginPath(); ctx.ellipse(cx, bodyY - 12.6, 7.5, 1.6, 0, 0, Math.PI * 2); ctx.fillStyle = P.leatherH; ctx.fill();
  hooks.riderBack?.(ctx, cx, bodyY);
  // front legs
  if (lift > 0.3) {
    // rearing: forelegs fold, hooves shown from below
    for (const s of [-1, 1]) {
      const kx = cx + s * 11, ky = bodyY + 2 - lift * 4;
      limb(ctx, cx + s * 7, bodyY + 3, kx, ky, P.coat, 5.5);
      limb(ctx, kx, ky, cx + s * 9, ky + 7 - lift * 2, P.coat, 4);
      ell(ctx, cx + s * 9, ky + 8.5 - lift * 2, 3, 2.2, P.hoofH, P.ol, 1);
    }
  } else {
    legFront(ctx, cx - 7, bodyY + 3, Math.max(0, sw) * 4, false, -1);
    legFront(ctx, cx + 7, bodyY + 3, Math.max(0, -sw) * 4, false, 1);
  }
  // neck
  poly(ctx, [[cx - 8.5, bodyY - 4], [cx - 7.5, top + 12], [cx + 7.5, top + 12], [cx + 8.5, bodyY - 4]]);
  ctx.fillStyle = grad(ctx, cx - 8, 0, cx + 8, 0, [[0, P.coatH], [0.5, P.coat], [1, P.coatS]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  // mane falling down the right side of the neck
  const ms = pose.mane || 0;
  ctx.beginPath(); ctx.moveTo(cx + 2, top + 10); ctx.quadraticCurveTo(cx + 9, top + 14, cx + 10 + ms, bodyY - 5);
  ctx.quadraticCurveTo(cx + 9.5 + ms, bodyY - 1, cx + 7 + ms, bodyY - 3); ctx.quadraticCurveTo(cx + 6, bodyY - 8, cx + 4, top + 16); ctx.closePath();
  fs(ctx, P.mane, P.ol, 0.9);
  // reins from the bit around the neck to the saddle
  for (const s of [-1, 1]) curve(ctx, cx + s * 5.5, top + 19.5, cx + s * 11, top + 24, cx + s * 11, bodyY - 5, P.rein, 1.1);
  headFront(ctx, cx, top, pose);
  hooks.riderFront?.(ctx, cx, bodyY, top);
}

// ---------------------------------------------------------------- back view (up)
function drawBack(ctx, pose, hooks = {}) {
  const cx = 32, bob = -(pose.bob || 0);
  const lift = pose.lift || 0;
  const bodyY = 40 + bob - lift * 3;
  const headY = 13 + bob - lift * 5;
  shadow(ctx, 32, 17);
  const sw = pose.legSwing || 0;
  // front legs, behind the rump
  if (lift > 0.3) {
    for (const s of [-1, 1]) { limb(ctx, cx + s * 9, bodyY - 2, cx + s * 13, bodyY - 2 - lift * 8, P.coatS, 4.6); ell(ctx, cx + s * 13.5, bodyY - 3 - lift * 8, 2.6, 2, P.hoof, P.ol, 1); }
  } else {
    legFront(ctx, cx - 9, bodyY + 2, Math.max(0, sw) * 3, true, -1);
    legFront(ctx, cx + 9, bodyY + 2, Math.max(0, -sw) * 3, true, 1);
  }
  // neck and back of the head
  poly(ctx, [[cx - 7, bodyY - 8], [cx - 5.5, headY + 2], [cx + 5.5, headY + 2], [cx + 7, bodyY - 8]]);
  ctx.fillStyle = grad(ctx, cx - 7, 0, cx + 7, 0, [[0, P.coatH], [0.5, P.coat], [1, P.coatS]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  const es = pose.earSpread || 0;
  for (const s of [-1, 1]) {
    poly(ctx, [[cx + s * 2.5, headY - 3], [cx + s * (5.5 + es), headY - 10.5 + es * 0.4], [cx + s * (7 + es * 0.6), headY - 2]]); fs(ctx, P.coat);
    poly(ctx, [[cx + s * 3.6, headY - 3.2], [cx + s * (5.4 + es), headY - 8 + es * 0.4], [cx + s * (6.2 + es * 0.6), headY - 2.6]]); ctx.fillStyle = P.coatS; ctx.fill();
  }
  ell(ctx, cx, headY, 6, 6.3, P.coat);
  ctx.beginPath(); ctx.ellipse(cx - 2, headY - 1.5, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fillStyle = P.coatH; ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
  // mane down the crest, tufts to the viewer's left
  const ms = pose.mane || 0;
  ctx.beginPath(); ctx.moveTo(cx - 1, headY - 5.5); ctx.quadraticCurveTo(cx + 4, headY - 1, cx + 3.5, bodyY - 12);
  ctx.quadraticCurveTo(cx - 1 + ms, bodyY - 8, cx - 6 + ms, bodyY - 10.5); ctx.quadraticCurveTo(cx - 3 + ms * 0.5, bodyY - 15, cx - 4.5 + ms * 0.5, headY + 2);
  ctx.quadraticCurveTo(cx - 2.5, headY - 1, cx - 5, headY - 4); ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, headY, 0, bodyY, [[0, P.maneH], [1, P.mane]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 0.9; ctx.stroke();
  curve(ctx, cx, headY - 2, cx + 1, headY + 8, cx - 1 + ms * 0.5, bodyY - 12, P.maneL, 0.8);
  // rider (front of the horse's rump, behind the cantle)
  hooks.riderBack?.(ctx, cx, bodyY, headY);
  // rump
  ctx.beginPath(); ctx.ellipse(cx, bodyY, 16, 11.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad(ctx, cx - 16, 0, cx + 16, 0, [[0, P.coatH], [0.5, P.coat], [1, P.coatS]]); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = P.coatL; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(cx - 6, bodyY - 6, 5, 3, 0.6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  curve(ctx, cx, bodyY - 2, cx, bodyY + 5, cx, bodyY + 10, P.coatS, 1.2);
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(cx, bodyY, 16, 11.5, 0, 0, Math.PI * 2); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  // cantle + blanket edges seen from behind
  for (const s of [-1, 1]) {
    poly(ctx, [[cx + s * 8, bodyY - 10], [cx + s * 15, bodyY - 8], [cx + s * 15.5, bodyY], [cx + s * 9, bodyY - 2]]); fs(ctx, P.blanket);
    line(ctx, cx + s * 14, bodyY - 7, cx + s * 14.5, bodyY - 1, P.trim, 1.2);
  }
  ctx.beginPath(); ctx.moveTo(cx - 9, bodyY - 9); ctx.quadraticCurveTo(cx, bodyY - 16, cx + 9, bodyY - 9); ctx.quadraticCurveTo(cx, bodyY - 6, cx - 9, bodyY - 9); ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, bodyY - 16, 0, bodyY - 6, [[0, P.leatherH], [1, P.leatherS]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  hooks.riderOver?.(ctx, cx, bodyY, headY);
  // tail hanging down the middle
  const ts = pose.tail || 0;
  ctx.beginPath(); ctx.moveTo(cx - 3, bodyY - 8); ctx.quadraticCurveTo(cx + 4 + ts, bodyY + 2, cx + 3 + ts * 2, bodyY + 15);
  ctx.quadraticCurveTo(cx + 2 + ts * 2, bodyY + 19, cx - 1 + ts * 2, bodyY + 18); ctx.quadraticCurveTo(cx - 3 + ts, bodyY + 8, cx - 3, bodyY - 8); ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, bodyY - 8, 0, bodyY + 19, [[0, P.maneH], [0.4, P.mane], [1, P.mane]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  curve(ctx, cx - 1, bodyY - 4, cx + 2 + ts, bodyY + 5, cx + 1 + ts * 2, bodyY + 15, P.maneL, 0.8);
  // hind legs in front
  legFront(ctx, cx - 10, bodyY + 4, Math.max(0, -sw) * 4, false, -1);
  legFront(ctx, cx + 10, bodyY + 4, Math.max(0, sw) * 4, false, 1);
}

// ---------------------------------------------------------------- poses

// ================================================================ the rider
// The white-haired swordswoman from hero.mjs, redrawn at riding scale (about 0.55x): long white hair, black
// high-collared coat with crimson lining, dark trousers, boots, katana at her left hip.
const R = {
  skin: '#ffe4d2', skinS: '#efb9a2', blush: 'rgba(255,110,140,0.35)', mouth: '#a54a5e',
  hair: '#eeeaf7', hairS: '#b7b1d9', hairD: '#8d87bb', hairH: '#ffffff',
  eye: '#5d4fe0', eyeD: '#2a2272', eyeL: '#9a92ff', brow: '#5a5484',
  coat: '#26243a', coatS: '#151320', coatH: '#3f3c58', coatL: '#55516f',
  red: '#b3152c', redH: '#e83d52', pants: '#2c2a3e', boot: '#6b4634', bootS: '#3e2719', bootH: '#94674c',
  belt: '#15121b', gold: '#dcb040', hilt: '#4b3f98', hiltD: '#2c2560',
  blade: '#e4ecf6', bladeS: '#98abc6', bladeH: '#ffffff', sheath: '#1f1e2b', sheathH: '#4a4860',
  trail: 'rgba(140,210,255,0.6)', trailH: 'rgba(240,250,255,0.95)',
};

function hand(ctx, x, y) { ell(ctx, x, y, 1.6, 1.6, R.skin, P.ol, 0.9); }
function hairFill(ctx, y0, y1) { ctx.fillStyle = grad(ctx, 0, y0, 0, y1, [[0, R.hairH], [0.3, R.hair], [1, R.hairS]]); ctx.fill(); }

function sleeve(ctx, sx, sy, hx, hy, w = 3.2, dark = false) {
  limb(ctx, sx, sy, hx, hy, dark ? R.coatS : R.coat, w);
  const dx = hx - sx, dy = hy - sy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  line(ctx, hx - ux * 2.4, hy - uy * 2.4, hx - ux * 0.5, hy - uy * 0.5, R.red, w);
  hand(ctx, hx + ux * 1.2, hy + uy * 1.2);
}

/** Katana: hand at (hx,hy), blade along `ang`, blade length `len`. */
function katana(ctx, hx, hy, ang, len) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const p = (t, n) => [hx + dx * t + nx * n, hy + dy * t + ny * n];
  limb(ctx, ...p(-0.5, 0), ...p(-4.5, 0), R.hilt, 2.2);
  ell(ctx, ...p(-4.8, 0), 1, 1, R.gold, P.ol, 0.8);
  poly(ctx, [p(1.5, 1.1), p(len - 3, 0.9), p(len, -0.2), p(1.5, -1.1)]);
  ctx.fillStyle = grad(ctx, ...p(0, 1.2), ...p(0, -1.2), [[0, R.bladeS], [0.5, R.blade], [1, R.bladeH]]);
  ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 0.9; ctx.stroke();
  line(ctx, ...p(2.5, -0.4), ...p(len - 3, -0.35), R.bladeH, 0.6);
  line(ctx, ...p(1, 2.3), ...p(1, -2.3), P.ol, 2.6);
  line(ctx, ...p(1, 1.7), ...p(1, -1.7), R.gold, 1.4);
}

function trail(ctx, t, rand) {
  const [cx, cy] = t.c;
  ctx.strokeStyle = R.trail; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(cx, cy, t.r, t.a0, t.a1); ctx.stroke();
  ctx.strokeStyle = R.trailH; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, t.r, t.a0, t.a1); ctx.stroke();
  ctx.fillStyle = R.trailH;
  for (let i = 0; i < 4; i++) {
    const a = t.a0 + (t.a1 - t.a0) * rand(), rr = t.r + 2 + rand() * 3;
    const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr);
    if (x >= 1 && x <= 62 && y >= 1 && y <= 62) ctx.fillRect(x, y, 1, 1);
  }
}

/** Sheath from the guard (x1,y1) to the tip (x2,y2), hilt continuing backwards when sheathed. */
function sheath(ctx, x1, y1, x2, y2, withHilt) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  limb(ctx, x1, y1, x2, y2, R.sheath, 2.2);
  line(ctx, x1 + ux * 1.5, y1 + uy * 1.5 - 0.6, x2 - ux, y2 - uy - 0.6, R.sheathH, 0.6);
  line(ctx, x1 + ux * 2, y1 + uy * 2, x1 + ux * 3.5, y1 + uy * 3.5, R.red, 2.2);
  if (withHilt) { limb(ctx, x1 - ux, y1 - uy, x1 - ux * 5, y1 - uy * 5, R.hilt, 2.2); ell(ctx, x1 - ux * 5.3, y1 - uy * 5.3, 1, 1, R.gold, P.ol, 0.8); }
  line(ctx, x1 - uy * 2.2, y1 + ux * 2.2, x1 + uy * 2.2, y1 - ux * 2.2, P.ol, 2.4);
  line(ctx, x1 - uy * 1.6, y1 + ux * 1.6, x1 + uy * 1.6, y1 - ux * 1.6, R.gold, 1.3);
}

function boot(ctx, ax, ay, dir) {
  // ankle at (ax, ay); toe points to `dir` (-1 left, +1 right, 0 towards the viewer)
  if (dir === 0) {
    ctx.beginPath(); ctx.moveTo(ax - 2.2, ay - 2); ctx.lineTo(ax + 2.2, ay - 2); ctx.lineTo(ax + 2.5, ay + 2.2); ctx.quadraticCurveTo(ax, ay + 3.4, ax - 2.5, ay + 2.2); ctx.closePath();
    fs(ctx, R.boot); line(ctx, ax - 1.6, ay + 1.2, ax + 1.6, ay + 1.2, R.bootS, 0.8);
    return;
  }
  ctx.beginPath(); ctx.moveTo(ax - 2, ay - 2.2); ctx.lineTo(ax + 2, ay - 2.2); ctx.lineTo(ax + 2 - dir * 0.2, ay + 1.8);
  ctx.lineTo(ax + dir * 5, ay + 2.4); ctx.quadraticCurveTo(ax + dir * 6, ay + 1, ax + dir * 4, ay + 0.2); ctx.lineTo(ax - 2 + dir * 0.4, ay); ctx.closePath();
  fs(ctx, R.boot); line(ctx, ax - 1, ay - 1.4, ax - 1, ay - 0.2, R.bootH, 0.8);
}

// ---------------------------------------------------------------- rider, side view (facing left)
function riderHeadSide(ctx, hx, hy, sway, narrow) {
  // long hair trailing behind
  ctx.beginPath(); ctx.moveTo(hx + 2, hy - 5.5); ctx.lineTo(hx + 6, hy - 4.5);
  ctx.quadraticCurveTo(hx + 10 + sway, hy + 2, hx + 9 + sway * 1.5, hy + 10);
  ctx.quadraticCurveTo(hx + 8.5 + sway * 1.9, hy + 14.5, hx + 5.5 + sway * 1.6, hy + 15);
  ctx.quadraticCurveTo(hx + 5, hy + 11, hx + 3, hy + 12.5); ctx.quadraticCurveTo(hx + 2, hy + 5, hx + 2, hy - 5.5); ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, hy - 5, 0, hy + 15, [[0, R.hair], [1, R.hairS]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 0.9; ctx.stroke();
  curve(ctx, hx + 5, hy + 1, hx + 7.5 + sway, hy + 6, hx + 6 + sway * 1.4, hy + 12, R.hairS, 0.7);
  // face
  const face = () => {
    ctx.beginPath(); ctx.moveTo(hx - 5.2, hy - 4); ctx.quadraticCurveTo(hx - 6.8, hy + 1, hx - 5.8, hy + 3.5);
    ctx.quadraticCurveTo(hx - 5.5, hy + 6.3, hx - 2.5, hy + 6.8); ctx.quadraticCurveTo(hx + 2, hy + 7, hx + 5.5, hy + 3);
    ctx.quadraticCurveTo(hx + 6.5, hy - 3, hx + 2, hy - 6.3); ctx.quadraticCurveTo(hx - 3, hy - 7, hx - 5.2, hy - 4); ctx.closePath();
  };
  face(); fs(ctx, R.skin);
  ctx.save(); face(); ctx.clip(); ctx.fillStyle = R.skinS; ctx.beginPath(); ctx.ellipse(hx - 1, hy + 7, 5, 1.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = R.blush; ctx.beginPath(); ctx.ellipse(hx - 4, hy + 3.6, 1.4, 0.7, 0, 0, Math.PI * 2); ctx.fill();
  // eye
  const n = narrow ? 0.6 : 1;
  ctx.beginPath(); ctx.ellipse(hx - 3.4, hy + 1.6, 1.25, 1.7 * n, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx - 3.6, hy + 1.8, 0.95, 1.4 * n, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad(ctx, 0, hy, 0, hy + 3.5, [[0, R.eyeD], [0.55, R.eye], [1, R.eyeL]]); ctx.fill();
  ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx - 2, hy + 0.2); ctx.quadraticCurveTo(hx - 3.6, hy - 1.2 * n, hx - 5.2, hy + 0.2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx - 4, hy + 1.1, 0.45, 0, Math.PI * 2); ctx.fill();
  line(ctx, hx - 5.6, hy + 5, hx - 4.8, hy + 5.1, R.mouth, 0.7);
  // hair cap with the swept fringe
  const cap = () => {
    ctx.beginPath(); ctx.moveTo(hx - 6.4, hy - 2.5); ctx.quadraticCurveTo(hx - 7.2, hy - 8.8, hx, hy - 8.8);
    ctx.quadraticCurveTo(hx + 7.2, hy - 9, hx + 7.4, hy - 1); ctx.quadraticCurveTo(hx + 8, hy + 4, hx + 5.5, hy + 7.5);
    ctx.quadraticCurveTo(hx + 4, hy + 4.5, hx + 3, hy + 6.5); ctx.quadraticCurveTo(hx + 2.4, hy + 1, hx + 1.4, hy - 1.2);
    ctx.quadraticCurveTo(hx - 0.3, hy - 3.2, hx - 1.6, hy - 0.6); ctx.quadraticCurveTo(hx - 3, hy - 3.8, hx - 4.6, hy - 1);
    ctx.quadraticCurveTo(hx - 6, hy - 3.2, hx - 6.4, hy - 2.5); ctx.closePath();
  };
  cap(); hairFill(ctx, hy - 9, hy + 5);
  ctx.save(); cap(); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(hx + 0.5, hy - 1, 6, -2.8, -0.9); ctx.stroke(); ctx.restore();
  cap(); ctx.strokeStyle = P.ol; ctx.lineWidth = 0.9; ctx.stroke();
  // loose strand hanging by the cheek
  poly(ctx, [[hx - 5.6, hy - 2.6], [hx - 7.6 - sway * 0.6, hy + 2], [hx - 7.2 - sway * 1.1, hy + 7.5], [hx - 6.6, hy + 1.5]]);
  fs(ctx, R.hair, P.ol, 0.8);
}

/** Rider in profile on the saddle; `pose.sword` = { hand, ang, len, trail? } for the slash frames. */
function riderSide(ctx, pose, rand) {
  const sx = 35.5, sy = 27.5;
  const sway = pose.sway || 0;
  const sw = pose.sword;
  // coat tails flaring back over the cantle
  poly(ctx, [[sx - 1, sy - 6], [sx + 6, sy - 5.5], [sx + 11.5, sy + 6], [sx + 3.5, sy + 5]]); fs(ctx, R.coatS);
  line(ctx, sx + 4, sy + 4.6, sx + 11, sy + 5.6, R.red, 1.6);
  // far arm holds the reins
  const farHand = sw ? [sx - 8, sy - 2] : [sx - 8.5, sy - 1.5];
  sleeve(ctx, sx - 0.5, sy - 8, farHand[0], farHand[1], 3, true);
  // near leg down the horse's side, foot in the stirrup
  limb(ctx, sx - 1.5, sy + 1, sx - 6.5, sy + 8.5, R.pants, 3.6);
  limb(ctx, sx - 6.5, sy + 8.5, sx - 3, sy + 15, R.pants, 3.2);
  boot(ctx, sx - 2.5, sy + 15.8, -1);
  // torso
  poly(ctx, [[sx - 5, sy - 9.5], [sx + 3.5, sy - 9.5], [sx + 5, sy + 1.5], [sx - 4.5, sy + 1.5]]);
  ctx.fillStyle = grad(ctx, sx - 5, 0, sx + 5, 0, [[0, R.coatH], [0.5, R.coat], [1, R.coatS]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  line(ctx, sx - 3.6, sy - 7.5, sx - 4, sy + 0.5, R.red, 1.1);
  poly(ctx, [[sx - 4.6, sy - 1.5], [sx + 4.8, sy - 1.5], [sx + 5, sy + 0.5], [sx - 4.5, sy + 0.5]]); fs(ctx, R.belt, P.ol, 0.6);
  // sheath at her hip, angled back along the saddle flap
  sheath(ctx, sx + 1.5, sy + 1.5, sx + 9.5, sy + 9, !sw);
  // collar
  poly(ctx, [[sx - 5, sy - 9], [sx - 4, sy - 13], [sx - 0.5, sy - 12], [sx + 3.5, sy - 13.5], [sx + 4.5, sy - 9]]); fs(ctx, R.coatH);
  poly(ctx, [[sx - 3, sy - 12], [sx - 1.5, sy - 9.5], [sx + 0.5, sy - 12]]); ctx.fillStyle = R.red; ctx.fill();
  ctx.fillStyle = R.skinS; ctx.fillRect(sx - 2.5, sy - 13, 3, 3.5);
  // head
  riderHeadSide(ctx, sx - 1.5, sy - 17.5, sway, pose.narrow);
  // near arm: reins or sword
  if (!sw) sleeve(ctx, sx - 2.5, sy - 7.5, sx - 9, sy - 1, 3.4);
  else {
    if (sw.trail) trail(ctx, sw.trail, rand);
    sleeve(ctx, sx - 2.5, sy - 7.5, sw.hand[0], sw.hand[1], 3.4);
    katana(ctx, sw.hand[0], sw.hand[1], sw.ang, sw.len);
    hand(ctx, sw.hand[0], sw.hand[1]);
  }
}

// ---------------------------------------------------------------- rider, front view (down)
function riderFrontHead(ctx, cx, cy, sway, narrow) {
  // back hair behind the head
  ctx.beginPath(); ctx.moveTo(cx - 6.5, cy - 3); ctx.quadraticCurveTo(cx - 10, cy + 5, cx - 8.5 + sway * 0.3, cy + 13);
  ctx.quadraticCurveTo(cx - 4, cy + 15.5, cx, cy + 14.5); ctx.quadraticCurveTo(cx + 4, cy + 15.5, cx + 8.5 - sway * 0.3, cy + 13);
  ctx.quadraticCurveTo(cx + 10, cy + 5, cx + 6.5, cy - 3); ctx.quadraticCurveTo(cx + 4, cy - 8.5, cx, cy - 8.2); ctx.quadraticCurveTo(cx - 4, cy - 8.5, cx - 6.5, cy - 3); ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, cy, 0, cy + 15, [[0, R.hair], [1, R.hairS]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 0.9; ctx.stroke();
  // face
  const face = () => {
    ctx.beginPath(); ctx.moveTo(cx - 6, cy - 1.5); ctx.bezierCurveTo(cx - 6, cy + 3.5, cx - 3.5, cy + 6.3, cx, cy + 6.5);
    ctx.bezierCurveTo(cx + 3.5, cy + 6.3, cx + 6, cy + 3.5, cx + 6, cy - 1.5); ctx.bezierCurveTo(cx + 6, cy - 6.8, cx + 3.5, cy - 7, cx, cy - 7);
    ctx.bezierCurveTo(cx - 3.5, cy - 7, cx - 6, cy - 6.8, cx - 6, cy - 1.5); ctx.closePath();
  };
  face(); fs(ctx, R.skin);
  ctx.fillStyle = R.blush;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 3.8, cy + 3.5, 1.3, 0.7, 0, 0, Math.PI * 2); ctx.fill(); }
  const n = narrow ? 0.6 : 1;
  for (const s of [-1, 1]) {
    const ex = cx + s * 2.7, ey = cy + 1.6;
    ctx.beginPath(); ctx.ellipse(ex, ey, 1.4, 1.8 * n, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex, ey + 0.2, 1.05, 1.45 * n, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad(ctx, 0, ey - 1.5, 0, ey + 2, [[0, R.eyeD], [0.55, R.eye], [1, R.eyeL]]); ctx.fill();
    ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ex - s * 1.7, ey - 0.4 * n); ctx.quadraticCurveTo(ex, ey - 2.3 * n, ex + s * 1.9, ey - 1.4 * n); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - 0.5, ey - 0.3, 0.45, 0, Math.PI * 2); ctx.fill();
  }
  curve(ctx, cx - 0.8, cy + 4.6, cx, cy + 5.2, cx + 0.8, cy + 4.6, R.mouth, 0.7);
  // fringe
  ctx.beginPath(); ctx.moveTo(cx - 7, cy - 1.5); ctx.quadraticCurveTo(cx - 7.5, cy - 8.5, cx - 0.5, cy - 8);
  ctx.quadraticCurveTo(cx + 7, cy - 8.3, cx + 7, cy - 1.5); ctx.quadraticCurveTo(cx + 7.5, cy + 1.5, cx + 5.8, cy + 3.8);
  ctx.quadraticCurveTo(cx + 5, cy + 0.5, cx + 3.3, cy + 1.8); ctx.quadraticCurveTo(cx + 2.4, cy - 1, cx + 0.8, cy + 0.8);
  ctx.quadraticCurveTo(cx - 0.3, cy - 1.7, cx - 2, cy - 0.3); ctx.quadraticCurveTo(cx - 3.3, cy - 2.3, cx - 4.7, cy - 0.5);
  ctx.quadraticCurveTo(cx - 6, cy - 2, cx - 7, cy - 1.5); ctx.closePath();
  hairFill(ctx, cy - 8, cy + 4); ctx.strokeStyle = P.ol; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx + 0.5, cy - 0.5, 5.5, -2.7, -0.6); ctx.stroke();
  // side locks
  for (const s of [-1, 1]) { poly(ctx, [[cx + s * 7, cy - 2], [cx + s * (8.5 + sway * 0.2), cy + 7], [cx + s * 6, cy + 4.5], [cx + s * 5.8, cy - 0.5]]); fs(ctx, R.hair, P.ol, 0.8); }
}

function riderFrontLegs(ctx, cx, bodyY) {
  for (const s of [-1, 1]) {
    poly(ctx, [[cx + s * 6, bodyY - 12], [cx + s * 10, bodyY - 11], [cx + s * 11.5, bodyY - 3], [cx + s * 7.5, bodyY - 4]]); fs(ctx, R.coatS);
    line(ctx, cx + s * 8, bodyY - 4, cx + s * 11.2, bodyY - 3.4, R.red, 1.3);
    limb(ctx, cx + s * 8.5, bodyY - 7, cx + s * 14, bodyY + 0.5, R.pants, 3.4);
    limb(ctx, cx + s * 14, bodyY + 0.5, cx + s * 14.5, bodyY + 7, R.pants, 3);
    boot(ctx, cx + s * 14.5, bodyY + 8.5, 0);
  }
}

function riderFront(ctx, cx, bodyY, top, pose, rand) {
  const sw = pose.sword;
  const hy = 8 - (pose.bob || 0);
  // shoulders peeking past the horse's face, arms down to the reins
  poly(ctx, [[cx - 8.5, hy + 8], [cx + 8.5, hy + 8], [cx + 8, hy + 14], [cx - 8, hy + 14]]); fs(ctx, R.coat);
  poly(ctx, [[cx - 5, hy + 8], [cx - 4, hy + 4.5], [cx, hy + 7.5], [cx + 4, hy + 4.5], [cx + 5, hy + 8]]); fs(ctx, R.coatH);
  const reinHand = (s) => [cx + s * 10.5, top + 21];
  if (!sw) { for (const s of [-1, 1]) sleeve(ctx, cx + s * 7, hy + 9.5, ...reinHand(s), 3.2); }
  else {
    sleeve(ctx, cx - 7, hy + 9.5, ...reinHand(-1), 3.2);
    if (sw.trail) trail(ctx, sw.trail, rand);
    sleeve(ctx, cx + 7, hy + 9.5, sw.hand[0], sw.hand[1], 3.2);
    katana(ctx, sw.hand[0], sw.hand[1], sw.ang, sw.len);
    hand(ctx, sw.hand[0], sw.hand[1]);
  }
  if (!sw) { limb(ctx, cx + 9.5, bodyY - 9, cx + 12.5, bodyY - 14, R.hilt, 2.2); ell(ctx, cx + 12.8, bodyY - 14.5, 1, 1, R.gold, P.ol, 0.8); }
  riderFrontHead(ctx, cx, hy, pose.sway || 0, pose.narrow);
}

// ---------------------------------------------------------------- rider, back view (up)
function riderBackBody(ctx, cx, bodyY, pose) {
  const sway = pose.sway || 0;
  const hy = 9 - (pose.bob || 0);
  // coat back + long hair down it
  poly(ctx, [[cx - 6.5, hy + 8], [cx + 6.5, hy + 8], [cx + 8, bodyY - 8], [cx - 8, bodyY - 8]]);
  ctx.fillStyle = grad(ctx, cx - 8, 0, cx + 8, 0, [[0, R.coatH], [0.5, R.coat], [1, R.coatS]]); ctx.fill(); ctx.strokeStyle = P.ol; ctx.lineWidth = 1; ctx.stroke();
  poly(ctx, [[cx - 5, hy + 8], [cx - 4.5, hy + 4], [cx + 4.5, hy + 4], [cx + 5, hy + 8]]); fs(ctx, R.coatH);
  // head from behind
  ctx.beginPath(); ctx.moveTo(cx - 6.5, hy - 1.5); ctx.quadraticCurveTo(cx - 7, hy - 8.5, cx, hy - 8.3); ctx.quadraticCurveTo(cx + 7, hy - 8.5, cx + 6.5, hy - 1.5);
  ctx.quadraticCurveTo(cx + 7, hy + 4, cx + 5.5 - sway * 0.4, hy + 9); ctx.quadraticCurveTo(cx + 5 - sway * 0.5, hy + 14, cx + 4 - sway * 0.6, hy + 17);
  ctx.quadraticCurveTo(cx + 2, hy + 15, cx + 0.5, hy + 18); ctx.quadraticCurveTo(cx - 1.5, hy + 15, cx - 3.5, hy + 17.5);
  ctx.quadraticCurveTo(cx - 5 + sway * 0.4, hy + 13, cx - 5.5 + sway * 0.4, hy + 9); ctx.quadraticCurveTo(cx - 7, hy + 4, cx - 6.5, hy - 1.5); ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, hy - 8, 0, hy + 18, [[0, R.hairH], [0.25, R.hair], [1, R.hairS]]); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(cx, hy - 1, 5.5, -2.8, -0.5); ctx.stroke();
  for (const x of [-3, 0, 3]) curve(ctx, cx + x, hy + 2, cx + x * 1.3, hy + 9, cx + x * 0.8, hy + 16, R.hairS, 0.7);
  ctx.restore();
  ctx.strokeStyle = P.ol; ctx.lineWidth = 0.9; ctx.stroke();
}

function riderBackOver(ctx, cx, bodyY, pose, rand) {
  const sw = pose.sword;
  const hy = 9 - (pose.bob || 0);
  for (const s of [-1, 1]) {
    limb(ctx, cx + s * 8, bodyY - 8, cx + s * 13.5, bodyY - 1, R.pants, 3.4);
    limb(ctx, cx + s * 13.5, bodyY - 1, cx + s * 14, bodyY + 5.5, R.pants, 3);
    boot(ctx, cx + s * 14, bodyY + 7, 0);
  }
  // arms along the sides toward the reins; sword arm when slashing
  if (!sw) { for (const s of [-1, 1]) sleeve(ctx, cx + s * 7, hy + 9, cx + s * 9.5, hy + 19, 3, s < 0); }
  else {
    sleeve(ctx, cx - 7, hy + 9, cx - 9.5, hy + 19, 3, true);
    if (sw.trail) trail(ctx, sw.trail, rand);
    sleeve(ctx, cx + 7, hy + 9, sw.hand[0], sw.hand[1], 3.2);
    katana(ctx, sw.hand[0], sw.hand[1], sw.ang, sw.len);
    hand(ctx, sw.hand[0], sw.hand[1]);
  }
  if (!sw) sheath(ctx, cx - 7, bodyY - 9, cx - 12, bodyY + 1, true);
}

// ---------------------------------------------------------------- poses
function walkPoseM(i) {
  return {
    phase: i / 4, bob: i % 2, sway: [1, 0.3, -1, -0.3][i], tail: [1.2, 0.4, -1.2, -0.4][i], mane: [1, 0.3, -1, -0.3][i],
    legSwing: [1, 0, -1, 0][i],
  };
}
const SLASH = {
  side: [
    { phase: null, sway: -1, sword: { hand: [44, 22], ang: -0.55, len: 12 } },
    { phase: null, sway: 2.5, narrow: true, headUp: 1, tail: 1.5, sword: { hand: [25, 10.5], ang: 2.75, len: 13, trail: { c: [34, 15], r: 14, a0: 2.5, a1: 3.9 } } },
    { phase: null, sway: 1, sword: { hand: [24, 30], ang: 1.85, len: 11 } },
  ],
  down: [
    { phase: null, sway: -1, sword: { hand: [43, 12], ang: -1.95, len: 12 } },
    { phase: null, sway: 2, narrow: true, sword: { hand: [46, 27], ang: 0.95, len: 13, trail: { c: [40, 19], r: 14, a0: -0.5, a1: 1.15 } } },
    { phase: null, sway: 1, sword: { hand: [45, 33], ang: 1.35, len: 11 } },
  ],
  up: [
    { phase: null, sway: -1, sword: { hand: [44, 26], ang: 1.1, len: 12 } },
    { phase: null, sway: 2, sword: { hand: [42, 13], ang: -2.15, len: 13, trail: { c: [34, 17], r: 13, a0: -3.05, a1: -1.2 } } },
    { phase: null, sway: 1, sword: { hand: [21, 21], ang: 2.55, len: 12 } },
  ],
};

export default {
  id: 'chr_hero_mounted',
  name: 'Hero on horse',
  role: 'npc',
  assetId: 'ast_starter_hero_mounted',
  file: 'hero_mounted.png',
  frameWidth: 64,
  frameHeight: 64,
  collider: { width: 40, height: 16, offsetX: 12, offsetY: 48 },
  walkFrameRate: 12,
  attackFrameRate: 14,
  portrait: null,
  draw(ctx, f) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const side = f.dir === 'left' || f.dir === 'right';
    const pose = f.anim === 'walk' ? walkPoseM(f.index) : { ...SLASH[side ? 'side' : f.dir][f.index] };
    if (f.dir === 'down') {
      drawFront(ctx, { ...pose, headDy: 8 }, {
        riderBack: (c, cx, bodyY) => riderFrontLegs(c, cx, bodyY),
        riderFront: (c, cx, bodyY, top) => riderFront(c, cx, bodyY, top, pose, f.rand),
      });
    } else if (f.dir === 'up') {
      drawBack(ctx, { ...pose, earSpread: 3 }, {
        riderBack: (c, cx, bodyY) => riderBackBody(c, cx, bodyY, pose),
        riderOver: (c, cx, bodyY) => riderBackOver(c, cx, bodyY, pose, f.rand),
      });
    } else {
      if (f.dir === 'right') { ctx.translate(f.w, 0); ctx.scale(-1, 1); }
      drawSide(ctx, pose, { rider: (c) => riderSide(c, pose, f.rand), reins: pose.sword ? [27.5, 25.5] : [26.5, 26.5] });
    }
    ctx.restore();
  },
};
