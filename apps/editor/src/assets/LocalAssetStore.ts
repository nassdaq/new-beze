import type { Asset } from '@beze/project-schema';
import { newId, type StarterPack } from '@beze/project-core';
import { idb, STORES } from '../repository/idb.js';
import { UPLOAD_LIMITS, type AssetStore, type PutAssetMeta } from './AssetStore.js';
import { assertPackManifest, planPackLoad } from './pack.js';
import { withBase } from '../base.js';

interface StarterManifest extends StarterPack {
  files: Record<string, string>;
}

/** One uploaded image in the IndexedDB 'blobs' store, keyed by asset id. */
interface BlobRow {
  id: string;
  blob: Blob;
  mime: Asset['mime'];
  name: string;
  width: number;
  height: number;
  hash: string;
  createdAt: string;
}

/**
 * Starter pack served from /starter plus user uploads in IndexedDB. Uploads are global (not per
 * project): a project only references ids, so an asset stored once serves every project.
 */
export class LocalAssetStore implements AssetStore {
  private manifest: StarterManifest | null = null;
  private images = new Map<string, HTMLImageElement>();
  private blobs = new Map<string, Blob>();
  /** sha256 of every blob held, so a pack can skip files the store already has. */
  private hashes = new Map<string, string>();
  private packs = new Map<string, Promise<{ loaded: number; skipped: number }>>();
  private readyPromise: Promise<void> | null = null;

  ready(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.load();
    return this.readyPromise;
  }

  private async load(): Promise<void> {
    const res = await fetch(withBase('/starter/manifest.json'));
    if (!res.ok) throw new Error('starter pack manifest is missing');
    const manifest = (await res.json()) as StarterManifest;
    this.manifest = manifest;
    for (const a of manifest.assets) this.hashes.set(a.id, a.hash);
    await Promise.all([
      ...Object.entries(manifest.files).map(async ([id, file]) => {
        const blob = await fetch(withBase(`/starter/${file}`)).then((r) => r.blob());
        this.blobs.set(id, blob);
        this.images.set(id, await decode(blob));
      }),
      this.loadUploads(),
    ]);
  }

  /** Uploads are optional: a broken or blocked IndexedDB must not keep the editor from opening. */
  private async loadUploads(): Promise<void> {
    let rows: BlobRow[] = [];
    try { rows = await idb.getAll<BlobRow>(STORES.blobs); } catch (e) { console.warn('uploaded assets unavailable', e); return; }
    await Promise.all(rows.map(async (row) => {
      if (!row?.blob || this.blobs.has(row.id)) return;
      try {
        this.blobs.set(row.id, row.blob);
        this.hashes.set(row.id, row.hash);
        if (row.mime.startsWith('audio/')) return;
        const image = await decode(row.blob);
        this.blobs.set(row.id, row.blob);
        this.images.set(row.id, image);
        if (row.hash) this.hashes.set(row.id, row.hash);
      } catch (e) { console.warn(`uploaded asset ${row.id} could not be decoded`, e); }
    }));
  }

  starterPack(): StarterPack {
    if (!this.manifest) throw new Error('asset store not ready');
    const { assets, tilesets, characters, groundGid, playerCharacterId } = this.manifest;
    return { assets, tilesets, characters, groundGid, playerCharacterId };
  }

  image(assetId: string): HTMLImageElement | undefined {
    return this.images.get(assetId);
  }

  async bytes(assetId: string): Promise<Uint8Array> {
    const blob = this.blobs.get(assetId);
    if (!blob) throw new Error(`asset "${assetId}" has no data`);
    return new Uint8Array(await blob.arrayBuffer());
  }

  async dataUrls(assetIds: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    await Promise.all(assetIds.map(async (id) => {
      const blob = this.blobs.get(id);
      if (blob) out[id] = await toDataUrl(blob);
    }));
    return out;
  }

  async put(data: Blob, meta: PutAssetMeta): Promise<Asset> {
    const mime = data.type as Asset['mime'];
    if (!(UPLOAD_LIMITS.mimes as readonly string[]).includes(mime)) throw new Error(`only PNG or WebP images can be imported (got ${data.type || 'unknown type'})`);
    if (data.size > UPLOAD_LIMITS.maxBytes) throw new Error(`image is ${(data.size / 1024 / 1024).toFixed(1)} MB; the limit is ${UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    const blob = new Blob([bytes], { type: mime });
    const image = await decode(blob);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width < 1 || height < 1) throw new Error('image is empty');
    if (width > UPLOAD_LIMITS.maxSide || height > UPLOAD_LIMITS.maxSide) throw new Error(`image is ${width}×${height}; the limit is ${UPLOAD_LIMITS.maxSide}×${UPLOAD_LIMITS.maxSide}`);
    const hash = await sha256(bytes);
    const id = newId('ast');
    const name = meta.name.trim().slice(0, 120) || 'Imported image';
    const asset: Asset = { id, kind: 'image', name, mime, width, height, hash, origin: 'upload', ...(meta.license ? { license: meta.license } : {}) };
    const row: BlobRow = { id, blob, mime, name, width, height, hash, createdAt: new Date().toISOString() };
    await idb.put(STORES.blobs, id, row);
    this.blobs.set(id, blob);
    this.images.set(id, image);
    this.hashes.set(id, hash);
    return asset;
  }

  async putAudio(data: Blob, meta: PutAssetMeta): Promise<Asset> {
    const mime = (data.type === 'audio/mp3' ? 'audio/mpeg' : data.type) as Asset['mime'];
    if (!(UPLOAD_LIMITS.audioMimes as readonly string[]).includes(mime)) throw new Error(`only OGG or MP3 audio can be imported (got ${data.type || 'unknown type'})`);
    if (data.size > UPLOAD_LIMITS.audioMaxBytes) throw new Error(`track is ${(data.size / 1024 / 1024).toFixed(1)} MB; the limit is ${UPLOAD_LIMITS.audioMaxBytes / 1024 / 1024} MB`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    const blob = new Blob([bytes], { type: mime });
    const hash = await sha256(bytes);
    const id = newId('ast');
    const name = meta.name.trim().slice(0, 120) || 'Imported track';
    const asset: Asset = { id, kind: 'audio', name, mime, hash, origin: 'upload', ...(meta.license ? { license: meta.license } : {}) };
    const row: BlobRow = { id, blob, mime, name, width: 0, height: 0, hash, createdAt: new Date().toISOString() };
    await idb.put(STORES.blobs, id, row);
    this.blobs.set(id, blob);
    this.hashes.set(id, hash);
    return asset;
  }

  loadPack(url: string): Promise<{ loaded: number; skipped: number }> {
    // One in-flight load per pack; a failed load is forgotten so a retry can succeed.
    let pending = this.packs.get(url);
    if (!pending) {
      pending = this.doLoadPack(url).catch((e) => { this.packs.delete(url); throw e; });
      this.packs.set(url, pending);
    }
    return pending;
  }

  private async doLoadPack(url: string): Promise<{ loaded: number; skipped: number }> {
    await this.ready();
    const manifest = assertPackManifest(await fetchJson(url), url);
    const plan = planPackLoad(url, manifest, this.hashes);
    const skipped = Object.keys(manifest.files).length - plan.length;
    let loaded = 0;
    await Promise.all(plan.map(async (entry) => {
      const res = await fetch(entry.url);
      if (!res.ok) throw new Error(`${entry.url} is missing (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const hash = await sha256(bytes);
      if (this.hashes.get(entry.id) === hash) return;
      const mime = mimeOf(entry.asset?.mime, res.headers.get('content-type'), entry.url);
      if (!(UPLOAD_LIMITS.mimes as readonly string[]).includes(mime)) throw new Error(`${entry.url} is not a PNG or WebP image`);
      const blob = new Blob([bytes], { type: mime });
      const image = await decode(blob);
      const row: BlobRow = {
        id: entry.id, blob, mime, name: entry.asset?.name ?? entry.id,
        width: image.naturalWidth, height: image.naturalHeight, hash, createdAt: new Date().toISOString(),
      };
      // Persisting is best effort: a blocked IndexedDB still lets this session render and play.
      try { await idb.put(STORES.blobs, entry.id, row); } catch (e) { console.warn(`pack asset ${entry.id} could not be persisted`, e); }
      this.blobs.set(entry.id, blob);
      this.images.set(entry.id, image);
      this.hashes.set(entry.id, hash);
      loaded++;
    }));
    return { loaded, skipped: skipped + (plan.length - loaded) };
  }
}

/** Fetches JSON and turns a dev server's HTML fallback for a missing file into a clear error. */
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} is missing (${res.status})`);
  const text = await res.text();
  try { return JSON.parse(text) as unknown; } catch { throw new Error(`${url} is missing or not JSON`); }
}

function mimeOf(declared: Asset['mime'] | undefined, header: string | null, url: string): Asset['mime'] {
  if (declared) return declared;
  const h = (header ?? '').split(';')[0]!.trim();
  if (h === 'image/png' || h === 'image/webp') return h;
  return /\.webp(\?|$)/i.test(url) ? 'image/webp' : 'image/png';
}

function decode(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
    img.src = url;
  });
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
