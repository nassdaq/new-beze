import type { Asset } from '@beze/project-schema';
import { newId, type StarterPack } from '@beze/project-core';
import { idb, STORES } from '../repository/idb.js';
import { UPLOAD_LIMITS, type AssetStore, type PutAssetMeta } from './AssetStore.js';

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
  private readyPromise: Promise<void> | null = null;

  ready(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.load();
    return this.readyPromise;
  }

  private async load(): Promise<void> {
    const res = await fetch('/starter/manifest.json');
    if (!res.ok) throw new Error('starter pack manifest is missing');
    const manifest = (await res.json()) as StarterManifest;
    this.manifest = manifest;
    await Promise.all([
      ...Object.entries(manifest.files).map(async ([id, file]) => {
        const blob = await fetch(`/starter/${file}`).then((r) => r.blob());
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
        const image = await decode(row.blob);
        this.blobs.set(row.id, row.blob);
        this.images.set(row.id, image);
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
    return asset;
  }
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
