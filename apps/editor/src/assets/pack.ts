import type { Asset } from '@beze/project-schema';

/**
 * A pack manifest (`pack.json`) next to a template's image files. Same shape as the starter
 * manifest: `files` maps asset ids to file names relative to the manifest, `assets` carries the
 * metadata (hashes let a loader skip files it already holds).
 */
export interface PackManifest {
  files: Record<string, string>;
  assets?: Asset[];
}

/** Resolves a file name from a pack manifest against the manifest's own URL. */
export function resolvePackFile(packUrl: string, file: string): string {
  if (/^(https?:)?\/\//.test(file) || file.startsWith('/') || file.startsWith('data:')) return file;
  const dir = packUrl.slice(0, packUrl.lastIndexOf('/') + 1);
  return `${dir}${file}`;
}

export interface PackEntry {
  id: string;
  url: string;
  /** Hash declared by the manifest, when it has one. */
  hash: string | undefined;
  asset: Asset | undefined;
}

/**
 * Which files of a pack still need fetching, given the hashes of assets already held. An entry
 * whose declared hash matches what the store has is skipped; entries without a declared hash
 * are always fetched (the loader compares after hashing the bytes).
 */
export function planPackLoad(packUrl: string, manifest: PackManifest, held: ReadonlyMap<string, string>): PackEntry[] {
  const byId = new Map((manifest.assets ?? []).map((a) => [a.id, a] as const));
  const out: PackEntry[] = [];
  for (const [id, file] of Object.entries(manifest.files ?? {})) {
    if (typeof file !== 'string' || !file) continue;
    const asset = byId.get(id);
    const hash = asset?.hash;
    if (hash && held.get(id) === hash) continue;
    out.push({ id, url: resolvePackFile(packUrl, file), hash, asset });
  }
  return out;
}

/** Validates the parsed JSON of a pack manifest; throws a readable error otherwise. */
export function assertPackManifest(value: unknown, url: string): PackManifest {
  const m = value as PackManifest | null;
  if (!m || typeof m !== 'object' || !m.files || typeof m.files !== 'object' || Array.isArray(m.files)) {
    throw new Error(`${url} is not a pack manifest (expected { files: { assetId: "file.png" } })`);
  }
  return m;
}
