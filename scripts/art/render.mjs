#!/usr/bin/env node
/**
 * Rasterises scripts/art/characters/*.mjs and scripts/art/tilesets/*.mjs into the starter pack, or, with
 * `--pack <name>`, scripts/art/packs/<name>/{characters,tilesets}/*.mjs into a template pack under
 * apps/editor/public/templates/<name>/ (pack.json + PNGs; the starter manifest is untouched).
 * See scripts/art/README.md for the module contracts and the sheet layout.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const previewDir = args.includes('--preview') ? resolve(args[args.indexOf('--preview') + 1]) : null;
/** Template pack mode: modules under scripts/art/packs/<name>, output under the template's folder. */
const pack = args.includes('--pack') ? args[args.indexOf('--pack') + 1] : null;
const MODULES = pack ? resolve(here, 'packs', pack) : here;
const OUT = pack ? resolve(root, 'apps/editor/public/templates', pack) : resolve(root, 'apps/editor/public/starter');
const MANIFEST_FILE = pack ? 'pack.json' : 'manifest.json';

const DIRS = ['down', 'left', 'right', 'up'];
const COLS = 4;
const ROWS = 8;
const WALK_FRAMES = 4;
const ATTACK_FRAMES = 3;

async function launch() {
  const { chromium } = await import(resolve(root, 'apps/editor/node_modules/@playwright/test/index.mjs'));
  const preinstalled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const executablePath = process.env.PW_CHROMIUM ?? (existsSync(preinstalled) ? preinstalled : undefined);
  return chromium.launch(executablePath ? { executablePath } : {});
}

/** Tileset order fixes firstGid and groundGid in the manifest: the Outdoor tileset (grass = gid 1) always comes first. */
const FIRST = ['outdoor'];
const rank = (f) => { const i = FIRST.indexOf(f.replace(/\.mjs$/, '')); return i < 0 ? FIRST.length : i; };
const listModules = (dir) => (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith('.mjs')).filter((f) => !only || f.replace(/\.mjs$/, '') === only).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((f) => join(dir, f));

/** The in-page harness: loads a module from source via a blob URL and rasterises frames. */
const HARNESS = `
  window.__beze = {
    async load(src) {
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const m = await import(url);
      return m.default;
    },
    rand(seed) {
      let s = (seed >>> 0) || 1;
      return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    },
    canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; return [c, ctx]; },
  };
`;

async function renderCharacters(page, src) {
  return page.evaluate(async ({ src, DIRS, COLS, ROWS, WALK_FRAMES, ATTACK_FRAMES }) => {
    const loaded = await window.__beze.load(src);
    const defs = Array.isArray(loaded) ? loaded : [loaded];
    return defs.map((def) => {
    const w = def.frameWidth, h = def.frameHeight;
    // Optional directional sets (4 rows each, e.g. "web") follow the 8 standard rows; optional emote rows
    // (one row per emote, facing down) come after them. Up to COLS frames per row.
    const sets = (def.sets ?? []).map((s) => ({ name: s.name, frames: Math.min(COLS, s.frames ?? 1), frameRate: s.frameRate ?? 10, loop: !!s.loop }));
    const emotes = (def.emotes ?? []).map((e) => ({ name: e.name, frames: Math.min(COLS, e.frames ?? 1), frameRate: e.frameRate ?? 6, loop: !!e.loop }));
    const setRows = sets.length * DIRS.length;
    const totalRows = ROWS + setRows + emotes.length;
    const [sheet, ctx] = window.__beze.canvas(w * COLS, h * totalRows);
    for (let row = 0; row < totalRows; row++) {
      const set = row >= ROWS && row < ROWS + setRows ? sets[Math.floor((row - ROWS) / DIRS.length)] : null;
      const emote = row >= ROWS + setRows ? emotes[row - ROWS - setRows] : null;
      const anim = emote ? emote.name : set ? set.name : row < 4 ? 'walk' : 'attack';
      const dir = emote ? 'down' : DIRS[row % 4];
      const count = emote ? emote.frames : set ? set.frames : anim === 'walk' ? WALK_FRAMES : ATTACK_FRAMES;
      for (let index = 0; index < count; index++) {
        ctx.save();
        ctx.translate(index * w, row * h);
        ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
        def.draw(ctx, { anim, dir, index, count, w, h, rand: window.__beze.rand(row * 100 + index + 7) });
        ctx.restore();
      }
    }
    let portrait = null;
    if (def.portrait && def.drawPortrait) {
      const size = def.portrait.size ?? 256;
      const [pc, pctx] = window.__beze.canvas(size, size);
      pctx.imageSmoothingEnabled = true;
      def.drawPortrait(pctx, size);
      portrait = pc.toDataURL('image/png');
    }
    const { draw, drawPortrait, ...meta } = def;
    meta.sets = sets;
    meta.emotes = emotes;
    return { meta, sheet: sheet.toDataURL('image/png'), portrait, sheetWidth: w * COLS, sheetHeight: h * totalRows };
    });
  }, { src, DIRS, COLS, ROWS, WALK_FRAMES, ATTACK_FRAMES });
}

async function renderTileset(page, src) {
  return page.evaluate(async ({ src }) => {
    const def = await window.__beze.load(src);
    const s = def.tileSize, cols = def.columns;
    const rows = Math.ceil(def.tiles.length / cols);
    const [sheet, ctx] = window.__beze.canvas(s * cols, s * rows);
    def.tiles.forEach((tile, i) => {
      ctx.save();
      ctx.translate((i % cols) * s, Math.floor(i / cols) * s);
      ctx.beginPath(); ctx.rect(0, 0, s, s); ctx.clip();
      tile.draw(ctx, s, window.__beze.rand(i * 31 + 3));
      ctx.restore();
    });
    const { tiles, stamps, ...meta } = def;
    return { meta, tiles: tiles.map(({ tag, solid, climbable }) => ({ tag, solid: !!solid, climbable: !!climbable })), stamps: stamps ?? [], sheet: sheet.toDataURL('image/png'), width: s * cols, height: s * rows };
  }, { src });
}

const decode = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
/** Write via a temp file + rename so a concurrent reader (another render, the dev server) never sees a half-written file. */
const writeAtomic = (path, data) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, data); renameSync(tmp, path); };

/**
 * Resolves a module's stamps (rows of tags, null = empty cell, plus optional rows of `above` flags)
 * into TileStampSchema entries: { name, width, height, tiles (local indices, -1 = empty), above }.
 */
function resolveStamps(def, tiles) {
  return (def.stamps ?? []).map((st) => {
    const rows = st.tags ?? [];
    const height = rows.length;
    const width = Math.max(0, ...rows.map((row) => row.length));
    if (!height || !width || height > 8 || width > 8) throw new Error(`stamp "${st.name}" in ${def.id}: tags must be 1..8 rows of 1..8 cells`);
    const out = { name: st.name, width, height, tiles: [], above: [] };
    rows.forEach((row, y) => {
      for (let x = 0; x < width; x++) {
        const tag = row[x] ?? null;
        if (tag === null) out.tiles.push(-1);
        else {
          const i = tiles.findIndex((t) => t.tag === tag);
          if (i < 0) throw new Error(`stamp "${st.name}" in ${def.id}: no tile tagged "${tag}"`);
          out.tiles.push(i);
        }
        out.above.push(!!st.above?.[y]?.[x]);
      }
    });
    return out;
  });
}

async function upscale(page, dataUrl, factor) {
  return page.evaluate(async ({ dataUrl, factor }) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = dataUrl; });
    const [c, ctx] = window.__beze.canvas(img.width * factor, img.height * factor);
    ctx.drawImage(img, 0, 0, img.width * factor, img.height * factor);
    return c.toDataURL('image/png');
  }, { dataUrl, factor });
}

function animations(def) {
  const out = {};
  DIRS.forEach((dir, row) => {
    const base = row * COLS;
    out[`idle_${dir}`] = { frames: [base], frameRate: 1, loop: false };
    out[`walk_${dir}`] = { frames: Array.from({ length: WALK_FRAMES }, (_, i) => base + i), frameRate: def.walkFrameRate ?? 8, loop: true };
    const abase = (row + 4) * COLS;
    out[`attack_${dir}`] = { frames: Array.from({ length: ATTACK_FRAMES }, (_, i) => abase + i), frameRate: def.attackFrameRate ?? 14, loop: false };
  });
  const sets = def.sets ?? [];
  sets.forEach((s, i) => {
    DIRS.forEach((dir, d) => {
      const base = (ROWS + i * DIRS.length + d) * COLS;
      out[`${s.name}_${dir}`] = { frames: Array.from({ length: s.frames }, (_, k) => base + k), frameRate: s.frameRate, loop: s.loop };
    });
  });
  (def.emotes ?? []).forEach((e, i) => {
    const base = (ROWS + sets.length * DIRS.length + i) * COLS;
    out[e.name] = { frames: Array.from({ length: e.frames }, (_, k) => base + k), frameRate: e.frameRate, loop: e.loop };
  });
  return out;
}

const browser = await launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: HARNESS });
mkdirSync(OUT, { recursive: true });
if (previewDir) mkdirSync(previewDir, { recursive: true });

const existing = existsSync(join(OUT, MANIFEST_FILE)) ? JSON.parse(readFileSync(join(OUT, MANIFEST_FILE), 'utf8')) : null;
const manifest = { files: {}, assets: [], tilesets: [], characters: [], groundGid: 1, playerCharacterId: null };
const asset = (id, name, file, buf, w, h) => {
  manifest.files[id] = file;
  manifest.assets.push({ id, kind: 'image', name, mime: 'image/png', width: w, height: h, hash: sha(buf), origin: 'starter', license: 'CC0-1.0' });
};

for (const path of listModules(join(MODULES, 'characters'))) {
  const src = readFileSync(path, 'utf8');
  for (const r of await renderCharacters(page, src)) {
  const d = r.meta;
  const sheet = decode(r.sheet);
  writeAtomic(join(OUT, d.file), sheet);
  asset(d.assetId, `${d.name} sheet`, d.file, sheet, r.sheetWidth, r.sheetHeight);
  const character = {
    id: d.id, name: d.name, spriteSheetAssetId: d.assetId, frameWidth: d.frameWidth, frameHeight: d.frameHeight,
    animations: animations(d), collider: d.collider,
  };
  if (r.portrait && d.portrait) {
    const buf = decode(r.portrait);
    writeAtomic(join(OUT, d.portrait.file), buf);
    asset(d.portrait.assetId, `${d.name} portrait`, d.portrait.file, buf, d.portrait.size ?? 256, d.portrait.size ?? 256);
    character.portraitAssetId = d.portrait.assetId;
  }
  manifest.characters.push(character);
  if (d.role === 'player') manifest.playerCharacterId = d.id;
  if (previewDir) {
    writeFileSync(join(previewDir, d.file.replace('.png', '@4x.png')), decode(await upscale(page, r.sheet, 4)));
    if (r.portrait) writeFileSync(join(previewDir, d.portrait.file), decode(r.portrait));
  }
  console.log(`character ${d.id}: ${d.file} ${r.sheetWidth}x${r.sheetHeight}${r.portrait ? ' + portrait' : ''}`);
  }
}

let firstGid = 1;
for (const path of listModules(join(MODULES, 'tilesets'))) {
  const src = readFileSync(path, 'utf8');
  const r = await renderTileset(page, src);
  const d = r.meta;
  const buf = decode(r.sheet);
  writeAtomic(join(OUT, d.file), buf);
  asset(d.assetId, `${d.name} tileset`, d.file, buf, r.width, r.height);
  const tileProperties = {};
  r.tiles.forEach((t, i) => { if (t.solid || t.tag) tileProperties[String(i)] = { ...(t.solid ? { solid: true } : {}), ...(t.tag ? { tag: t.tag } : {}), ...(t.solid && t.climbable ? { climbable: true } : {}) }; });
  const stamps = resolveStamps({ ...d, stamps: r.stamps }, r.tiles);
  manifest.tilesets.push({ id: d.id, name: d.name, imageAssetId: d.assetId, tileWidth: d.tileSize, tileHeight: d.tileSize, columns: d.columns, tileCount: r.tiles.length, margin: 0, spacing: 0, tileProperties, ...(stamps.length ? { stamps } : {}) });
  const groundIndex = r.tiles.findIndex((t) => t.tag === d.groundTag);
  if (groundIndex >= 0 && manifest.groundGid === 1 && firstGid === 1) manifest.groundGid = firstGid + groundIndex;
  firstGid += r.tiles.length;
  if (previewDir) writeFileSync(join(previewDir, d.file.replace('.png', '@4x.png')), decode(await upscale(page, r.sheet, 4)));
  console.log(`tileset ${d.id}: ${d.file} ${r.tiles.length} tiles${stamps.length ? `, ${stamps.length} stamps` : ''}`);
}

await browser.close();

if (only && existing) {
  // Partial render: merge into the existing manifest so other modules keep their entries.
  const merged = existing;
  for (const [id, file] of Object.entries(manifest.files)) merged.files[id] = file;
  merged.assets = [...merged.assets.filter((a) => !manifest.files[a.id]), ...manifest.assets];
  merged.characters = [...merged.characters.filter((c) => !manifest.characters.some((n) => n.id === c.id)), ...manifest.characters];
  merged.tilesets = [...merged.tilesets.filter((t) => !manifest.tilesets.some((n) => n.id === t.id)), ...manifest.tilesets]
    .sort((a, b) => rank(a.id.replace(/^tls_/, '')) - rank(b.id.replace(/^tls_/, '')));
  if (manifest.playerCharacterId) merged.playerCharacterId = manifest.playerCharacterId;
  // groundGid belongs to the first tileset; a partial render of another tileset must not touch it.
  if (manifest.tilesets.length && merged.tilesets[0] && manifest.tilesets.some((t) => t.id === merged.tilesets[0].id)) merged.groundGid = manifest.groundGid;
  writeAtomic(join(OUT, MANIFEST_FILE), JSON.stringify(merged, null, 2) + '\n');
} else {
  if (!manifest.playerCharacterId && !pack) throw new Error('no character module has role "player"');
  writeAtomic(join(OUT, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
}
if (!pack) writeAtomic(join(OUT, 'LICENSES.md'), '# Starter pack licences\n\nEvery file in this folder is rendered from the modules in `scripts/art/` and released under CC0 1.0 (public domain). Regenerate with `pnpm starter`.\n');
console.log(`wrote ${MANIFEST_FILE}`);
