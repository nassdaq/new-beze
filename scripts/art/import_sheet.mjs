#!/usr/bin/env node
/**
 * Imports a sprite sheet drawn by an image tool (PNG or WebP, usually on a painted background)
 * into a clean, uniform Beze sheet:
 *
 *   1. removes a plain background by flood-filling from the four corners (colour tolerance,
 *      feathered fringe with colour decontamination so no halo survives),
 *   2. cuts the frames along transparent gutters (checked against --cols/--rows) or, when the
 *      frames touch, into uniform cells, and trims every frame to its content box,
 *   4. scales every frame by ONE common factor so the biggest frame fits the target cell
 *      (proportions stay identical across frames),
 *   5. bottom-centres each frame in its target cell (feet on the bottom row),
 *   6. writes the new sheet PNG plus a JSON with the frame size, the grid and per-frame bounds.
 *
 * Downscaling is smooth (drawImage with imageSmoothingQuality 'high' in steps of at most 2x) and
 * the result is kept as-is, never re-pixelated.
 *
 *   node scripts/art/import_sheet.mjs <in> <out.png> --cols 4 --rows 6 --frame 64x64
 *        [--bg auto|none] [--tolerance 28] [--feather 2] [--preview DIR]
 *        [--portrait out.png --portrait-frame 16 --portrait-size 256 --portrait-crop 0.42]
 *
 * Only Node and the headless Chromium that scripts/art/render.mjs already uses; no image libraries.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

// ---------------------------------------------------------------------------------------------
// CLI

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opts[key] = true;
      else { opts[key] = next; i++; }
    } else positional.push(a);
  }
  return { positional, opts };
}

const usage = `usage: node scripts/art/import_sheet.mjs <in.(png|webp)> <out.png> [options]
  --cols N --rows N        grid of the source (omitted: detected from transparent gutters)
  --grid auto|gutters|cells  auto (default) cuts along transparent gutters when they agree with --cols/--rows
                           (figures need not sit in exact cells), else into uniform cells
  --frame WxH              target cell size (default 64x64)
  --bg auto|none           auto (default) flood-fills the background from the corners; none keeps alpha as-is
  --tolerance N            colour distance (0..441) that still counts as background (default 28)
  --feather N              width in px of the fringe that is faded and decontaminated (default 2)
  --fit height|both        scale so the tallest frame fits the cell height (height) or so every frame
                           fits both cell dimensions (both, default)
  --preview DIR            also write <out>@2x.png and <out>@4x.png on a coloured background with cell lines
  --json PATH              where to write the JSON (default: next to out.png with .json)
  --portrait PATH          also write a square portrait cropped from one frame of the cleaned source
  --portrait-frame N       frame index (row-major) to crop the portrait from (default 0)
  --portrait-size N        portrait size in px (default 256)
  --portrait-crop F        fraction of the frame height kept from the top (head and shoulders, default 0.42)
`;

const { positional, opts } = parseArgs(process.argv.slice(2));
if (opts.help || positional.length < 2) { console.error(usage); process.exit(positional.length < 2 ? 1 : 0); }
const [inPath, outPath] = positional.map((p) => resolve(p));
const num = (v, d) => (v === undefined || v === true ? d : Number(v));
const frame = String(opts.frame ?? '64x64').toLowerCase().split('x').map(Number);
if (frame.length !== 2 || frame.some((n) => !Number.isInteger(n) || n < 8)) { console.error('--frame must look like 64x64'); process.exit(1); }
const options = {
  cols: opts.cols ? num(opts.cols) : null,
  rows: opts.rows ? num(opts.rows) : null,
  frameWidth: frame[0],
  frameHeight: frame[1],
  bg: String(opts.bg ?? 'auto'),
  tolerance: num(opts.tolerance, 28),
  feather: num(opts.feather, 2),
  fit: String(opts.fit ?? 'both'),
  grid: String(opts.grid ?? 'auto'),
  portrait: opts.portrait ? { frame: num(opts['portrait-frame'], 0), size: num(opts['portrait-size'], 256), crop: num(opts['portrait-crop'], 0.42) } : null,
};
if (!['auto', 'none'].includes(options.bg)) { console.error('--bg must be auto or none'); process.exit(1); }
if (!['height', 'both'].includes(options.fit)) { console.error('--fit must be height or both'); process.exit(1); }
if (!['auto', 'gutters', 'cells'].includes(options.grid)) { console.error('--grid must be auto, gutters or cells'); process.exit(1); }
if (!existsSync(inPath)) { console.error(`input not found: ${inPath}`); process.exit(1); }

const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
const mime = MIME[extname(inPath).toLowerCase()];
if (!mime) { console.error(`unsupported input type: ${extname(inPath)}`); process.exit(1); }

// ---------------------------------------------------------------------------------------------
// Browser

async function launch() {
  const { chromium } = await import(resolve(root, 'apps/editor/node_modules/@playwright/test/index.mjs'));
  const preinstalled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const executablePath = process.env.PW_CHROMIUM ?? (existsSync(preinstalled) ? preinstalled : undefined);
  return chromium.launch(executablePath ? { executablePath } : {});
}

/**
 * Runs in the page. Everything below works on plain RGBA buffers and canvases; it is one function
 * so Playwright can serialise it.
 */
async function processInPage({ dataUrl, options }) {
  const ALPHA_EMPTY = 8;
  const canvas = (w, h, smooth = false) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = smooth; if (smooth) ctx.imageSmoothingQuality = 'high';
    return [c, ctx];
  };
  const img = new Image();
  await new Promise((ok, err) => { img.onload = ok; img.onerror = () => err(new Error('cannot decode the input image')); img.src = dataUrl; });
  const W = img.naturalWidth, H = img.naturalHeight;
  const [srcCanvas, srcCtx] = canvas(W, H);
  srcCtx.drawImage(img, 0, 0);
  const image = srcCtx.getImageData(0, 0, W, H);
  const data = image.data;

  // --- 1. background removal ------------------------------------------------------------------
  let bgInfo = { removed: false, seeds: [] };
  if (options.bg === 'auto') bgInfo = removeBackground(image, options.tolerance, options.feather);

  function removeBackground(im, tolerance, feather) {
    const { width, height, data } = im;
    const tol2 = tolerance * tolerance;
    const filled = new Uint8Array(width * height);
    const seeds = [];
    const stack = new Int32Array(width * height);
    const corners = [0, width - 1, (height - 1) * width, height * width - 1];
    for (const corner of corners) {
      if (filled[corner]) continue;
      const ci = corner * 4;
      if (data[ci + 3] <= ALPHA_EMPTY) continue;
      const cr = data[ci], cg = data[ci + 1], cb = data[ci + 2];
      seeds.push([cr, cg, cb]);
      let top = 0; stack[top++] = corner; filled[corner] = 1;
      const visit = (n) => {
        if (filled[n]) return;
        const i = n * 4;
        let bg = data[i + 3] <= ALPHA_EMPTY;
        if (!bg) { const dr = data[i] - cr, dg = data[i + 1] - cg, db = data[i + 2] - cb; bg = dr * dr + dg * dg + db * db <= tol2; }
        if (bg) { filled[n] = 1; stack[top++] = n; }
      };
      while (top > 0) {
        const p = stack[--top]; const x = p % width; const y = (p - x) / width;
        if (x > 0) visit(p - 1); if (x < width - 1) visit(p + 1); if (y > 0) visit(p - width); if (y < height - 1) visit(p + width);
      }
    }
    if (seeds.length === 0) return { removed: false, seeds: [] };
    // Distance (in pixels, Chebyshev) from the fill: a band `feather` wide is the fringe.
    const dist = new Uint8Array(width * height).fill(255);
    let frontier = [];
    for (let p = 0; p < width * height; p++) if (filled[p]) { dist[p] = 0; frontier.push(p); }
    for (let d = 1; d <= feather && frontier.length; d++) {
      const next = [];
      for (const p of frontier) {
        const x = p % width; const y = (p - x) / width;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx; if (dist[n] !== 255) continue; dist[n] = d; next.push(n);
        }
      }
      frontier = next;
    }
    const nearest = (r, g, b) => { let best = seeds[0], bd = Infinity; for (const s of seeds) { const dr = r - s[0], dg = g - s[1], db = b - s[2]; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = s; } } return { seed: best, d: Math.sqrt(bd) }; };
    for (let p = 0; p < width * height; p++) {
      const i = p * 4;
      if (filled[p]) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0; continue; }
      if (dist[p] === 255) continue;
      // Fringe pixel: a blend of the sprite and the background. Estimate how much sprite is in it
      // from its distance to the background colour (0 at `tolerance`, 1 at 3×tolerance), then
      // decontaminate: pull the background's share out of the colour so no light halo survives.
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const { seed, d } = nearest(r, g, b);
      const lo = tolerance, hi = tolerance * 3;
      let cover = tolerance > 0 ? Math.max(0, Math.min(1, (d - lo) / (hi - lo))) : 1;
      // Deeper into the sprite the fringe is thinner: ease the fade with distance from the fill.
      cover = Math.min(1, cover + (dist[p] - 1) / Math.max(1, feather));
      if (cover >= 1) continue;
      const a = Math.max(cover, 0.001);
      data[i] = Math.max(0, Math.min(255, Math.round((r - (1 - a) * seed[0]) / a)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - a) * seed[1]) / a)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - a) * seed[2]) / a)));
      data[i + 3] = Math.round(data[i + 3] * cover);
    }
    return { removed: true, seeds };
  }

  // --- 2 + 3. grid and trim --------------------------------------------------------------------
  // Gutters first: transparent rows split the sheet into bands, transparent columns split a band
  // into frames. Sheets from image tools rarely honour an exact grid (a figure's feet cross the
  // cell below), so tight gutter boxes are used whenever they agree with the requested counts;
  // otherwise (frames that touch, or no counts and a messy sheet) the sheet is cut into uniform cells.
  const opaque = (x, y) => data[(y * W + x) * 4 + 3] > ALPHA_EMPTY;
  const runs = (profile) => { const out = []; let start = -1; for (let i = 0; i < profile.length; i++) { const on = profile[i] > 0; if (on && start < 0) start = i; if (!on && start >= 0) { out.push([start, i]); start = -1; } } if (start >= 0) out.push([start, profile.length]); return out; };
  const boxIn = (x0, y0, x1, y1) => {
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (opaque(x, y)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  };
  const rowProfile = new Uint32Array(H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (opaque(x, y)) rowProfile[y]++;
  const bands = runs(rowProfile);
  const gutterRows = bands.map(([y0, y1]) => {
    const cp = new Uint32Array(W); for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (opaque(x, y)) cp[x]++;
    return runs(cp).map(([x0, x1]) => boxIn(x0, y0, x1, y1)).filter(Boolean);
  });
  const detected = { rows: bands.length, columns: Math.max(0, ...gutterRows.map((r) => r.length)) };
  let cols = options.cols, rows = options.rows;
  let mode = options.grid;
  if (mode === 'auto') {
    const consistent = gutterRows.length > 0 && gutterRows.every((r) => r.length === detected.columns);
    const agrees = (!cols || cols === detected.columns) && (!rows || rows === detected.rows);
    mode = consistent && agrees ? 'gutters' : 'cells';
  }
  if (mode === 'gutters' && (!gutterRows.length || gutterRows.some((r) => r.length !== detected.columns))) throw new Error(`gutters give an uneven grid (${gutterRows.map((r) => r.length).join(',')} frames per row); pass --grid cells with --cols/--rows`);
  if (mode === 'gutters') { cols = detected.columns; rows = detected.rows; }
  if (!cols || !rows) throw new Error(`could not detect the grid (bands: ${detected.rows}, frames per band: ${gutterRows.map((r) => r.length).join(',')}); pass --cols and --rows`);
  const cellW = W / cols, cellH = H / rows;
  if (mode === 'cells' && (!Number.isInteger(cellW) || !Number.isInteger(cellH))) throw new Error(`the ${W}x${H} image does not divide into ${cols}x${rows} cells`);

  const frames = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const index = r * cols + c;
    const src = mode === 'gutters' ? gutterRows[r][c] : boxIn(c * cellW, r * cellH, (c + 1) * cellW, (r + 1) * cellH);
    frames.push(src ? { index, column: c, row: r, empty: false, src } : { index, column: c, row: r, empty: true });
  }
  const used = frames.filter((f) => !f.empty);
  if (used.length === 0) throw new Error('no frame has any content after background removal (raise --tolerance? --bg none?)');

  // --- 4. one common scale --------------------------------------------------------------------
  const fw = options.frameWidth, fh = options.frameHeight;
  const maxH = Math.max(...used.map((f) => f.src.h));
  const maxW = Math.max(...used.map((f) => f.src.w));
  let scale = fh / maxH;
  if (options.fit === 'both') scale = Math.min(scale, fw / maxW);
  const tallest = used.find((f) => f.src.h === maxH).index;
  const widest = used.find((f) => f.src.w === maxW).index;

  // --- 5. scale + bottom-centre ---------------------------------------------------------------
  srcCtx.putImageData(image, 0, 0); // cleaned pixels back on the canvas (premultiplied: transparent pixels never bleed colour)
  const [sheet, sctx] = canvas(fw * cols, fh * rows, true);
  /** Smooth resample of a source rectangle to tw×th, halving at most per step. */
  function resample(sx, sy, sw, sh, tw, th) {
    let [c, ctx] = canvas(sw, sh, true);
    ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    let cw = sw, ch = sh;
    while (cw / 2 >= tw && ch / 2 >= th && (cw > tw || ch > th)) {
      const nw = Math.max(tw, Math.ceil(cw / 2)), nh = Math.max(th, Math.ceil(ch / 2));
      const [nc, nctx] = canvas(nw, nh, true);
      nctx.drawImage(c, 0, 0, cw, ch, 0, 0, nw, nh);
      c = nc; ctx = nctx; cw = nw; ch = nh;
    }
    if (cw !== tw || ch !== th) { const [nc, nctx] = canvas(tw, th, true); nctx.drawImage(c, 0, 0, cw, ch, 0, 0, tw, th); c = nc; }
    return c;
  }
  for (const f of used) {
    const tw = Math.max(1, Math.round(f.src.w * scale)), th = Math.max(1, Math.round(f.src.h * scale));
    const c = resample(f.src.x, f.src.y, f.src.w, f.src.h, tw, th);
    const dx = f.column * fw + Math.floor((fw - tw) / 2), dy = f.row * fh + (fh - th);
    sctx.drawImage(c, dx, dy);
    f.dest = { x: dx - f.column * fw, y: dy - f.row * fh, w: tw, h: th };
    f.clipped = tw > fw || th > fh;
    // Feet footprint: the opaque span of the bottom rows of the placed frame, in cell coordinates.
    const feetRows = Math.max(2, Math.round(th * 0.12));
    const px = sctx.getImageData(f.column * fw, f.row * fh, fw, fh).data;
    let fx0 = fw, fx1 = -1, fy0 = fh;
    for (let y = Math.max(0, fh - feetRows); y < fh; y++) for (let x = 0; x < fw; x++) if (px[(y * fw + x) * 4 + 3] > ALPHA_EMPTY) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; if (y < fy0) fy0 = y; }
    f.feet = fx1 < 0 ? null : { x: fx0, y: fy0, w: fx1 - fx0 + 1, h: fh - fy0 };
  }

  // --- portrait (optional) --------------------------------------------------------------------
  let portrait = null;
  if (options.portrait) {
    const p = options.portrait;
    const f = frames[p.frame];
    if (!f || f.empty) throw new Error(`portrait frame ${p.frame} is empty or out of range`);
    const side = Math.round(f.src.h * p.crop);
    // Square crop from the top of the frame, centred on the head (the widest opaque span of the top third).
    const headRows = Math.max(1, Math.round(f.src.h / 3));
    let hx0 = W, hx1 = -1;
    for (let y = f.src.y; y < f.src.y + headRows; y++) for (let x = f.src.x; x < f.src.x + f.src.w; x++) if (opaque(x, y)) { if (x < hx0) hx0 = x; if (x > hx1) hx1 = x; }
    const cx = (hx0 + hx1) / 2;
    const sx = Math.round(Math.min(Math.max(0, cx - side / 2), W - side));
    const sy = Math.max(0, f.src.y - Math.round(side * 0.08));
    const [pc, pctx] = canvas(p.size, p.size, true);
    if (side >= p.size) pctx.drawImage(resample(sx, sy, side, side, p.size, p.size), 0, 0);
    else pctx.drawImage(srcCanvas, sx, sy, side, side, 0, 0, p.size, p.size);
    portrait = { dataUrl: pc.toDataURL('image/png'), crop: { x: sx, y: sy, w: side, h: side }, frame: p.frame, size: p.size };
  }

  return {
    sheet: sheet.toDataURL('image/png'),
    portrait,
    meta: {
      source: { width: W, height: H, columns: cols, rows, grid: mode, cellWidth: mode === 'cells' ? cellW : null, cellHeight: mode === 'cells' ? cellH : null, gutters: detected, background: bgInfo },
      frameWidth: fw, frameHeight: fh, columns: cols, rows, width: fw * cols, height: fh * rows,
      scale, tallestFrame: tallest, widestFrame: widest, fit: options.fit,
      frames,
    },
  };
}

/** Runs in the page: draws the sheet on a coloured background with faint cell lines, upscaled by `factor` (nearest). */
async function previewInPage({ dataUrl, factor, fw, fh, bg }) {
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = dataUrl; });
  const c = document.createElement('canvas'); c.width = img.width * factor; c.height = img.height * factor;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  for (let x = fw; x < img.width; x += fw) { ctx.beginPath(); ctx.moveTo(x * factor + 0.5, 0); ctx.lineTo(x * factor + 0.5, c.height); ctx.stroke(); }
  for (let y = fh; y < img.height; y += fh) { ctx.beginPath(); ctx.moveTo(0, y * factor + 0.5); ctx.lineTo(c.width, y * factor + 0.5); ctx.stroke(); }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

const decode = (u) => Buffer.from(u.split(',')[1], 'base64');
const writeAtomic = (path, buf) => { mkdirSync(dirname(path), { recursive: true }); const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, buf); renameSync(tmp, path); };

const browser = await launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  const dataUrl = `data:${mime};base64,${readFileSync(inPath).toString('base64')}`;
  const result = await page.evaluate(processInPage, { dataUrl, options });
  const sheet = decode(result.sheet);
  writeAtomic(outPath, sheet);
  const meta = { ...result.meta, input: basename(inPath), output: basename(outPath), options: { ...options, portrait: options.portrait ? { ...options.portrait } : null } };
  if (result.portrait) {
    const portraitPath = resolve(String(opts.portrait));
    writeAtomic(portraitPath, decode(result.portrait.dataUrl));
    meta.portrait = { file: basename(portraitPath), frame: result.portrait.frame, size: result.portrait.size, crop: result.portrait.crop };
    console.log(`portrait ${portraitPath} ${result.portrait.size}x${result.portrait.size} (frame ${result.portrait.frame}, crop ${JSON.stringify(result.portrait.crop)})`);
  }
  const jsonPath = opts.json ? resolve(String(opts.json)) : outPath.replace(/\.png$/i, '') + '.json';
  writeAtomic(jsonPath, JSON.stringify(meta, null, 2) + '\n');
  if (opts.preview) {
    const dir = resolve(String(opts.preview));
    mkdirSync(dir, { recursive: true });
    const stem = basename(outPath).replace(/\.png$/i, '');
    for (const factor of [2, 4]) {
      const u = await page.evaluate(previewInPage, { dataUrl: result.sheet, factor, fw: meta.frameWidth, fh: meta.frameHeight, bg: '#2f6b3a' });
      writeFileSync(resolve(dir, `${stem}@${factor}x.png`), decode(u));
    }
    if (result.portrait) {
      const u = await page.evaluate(previewInPage, { dataUrl: result.portrait.dataUrl, factor: 1, fw: 1e9, fh: 1e9, bg: '#2f6b3a' });
      writeFileSync(resolve(dir, `${stem}_portrait.png`), decode(u));
    }
    console.log(`previews in ${dir}`);
  }
  const m = result.meta;
  const clipped = m.frames.filter((f) => f.clipped).map((f) => f.index);
  console.log(`${basename(inPath)} ${m.source.width}x${m.source.height} → ${m.columns}x${m.rows} cells of ${m.frameWidth}x${m.frameHeight} (${m.width}x${m.height}), scale ${m.scale.toFixed(4)} (tallest frame ${m.tallestFrame}, widest ${m.widestFrame}); frames cut by ${m.source.grid} (gutters show ${m.source.gutters.columns}x${m.source.gutters.rows})`);
  console.log(`wrote ${outPath} and ${jsonPath}`);
  if (clipped.length) console.warn(`warning: frames ${clipped.join(', ')} do not fit the cell and were clipped`);
} finally {
  await browser.close();
}
