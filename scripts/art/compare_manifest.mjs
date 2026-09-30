#!/usr/bin/env node
/**
 * CI check for the starter art: after `pnpm starter` re-renders it, the manifest must match the committed one
 * except for the PNG hashes (Chromium builds rasterise anti-aliased paths slightly differently, so bytes are not
 * comparable across machines), and every PNG must keep its committed dimensions. Any change to what a module
 * *declares* (characters, animations, tiles, tags, stamps, colliders) still fails the build until it is committed.
 *
 *   node scripts/art/compare_manifest.mjs <committed-manifest.json> <rendered-manifest.json>
 */
import { readFileSync } from 'node:fs';

const [, , beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) {
  console.error('usage: compare_manifest.mjs <before.json> <after.json>');
  process.exit(2);
}
const strip = (m) => ({ ...m, assets: (m.assets ?? []).map(({ hash: _h, ...a }) => a) });
const before = JSON.stringify(strip(JSON.parse(readFileSync(beforePath, 'utf8'))), null, 1);
const after = JSON.stringify(strip(JSON.parse(readFileSync(afterPath, 'utf8'))), null, 1);
if (before === after) {
  console.log('starter manifest matches (hashes ignored)');
  process.exit(0);
}
const a = before.split('\n'); const b = after.split('\n');
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) { console.error(`first difference at line ${i + 1}:\n  committed: ${a[i]}\n  rendered:  ${b[i]}`); break; }
}
console.error('starter manifest differs from the committed one: run `pnpm starter` and commit the result');
process.exit(1);
