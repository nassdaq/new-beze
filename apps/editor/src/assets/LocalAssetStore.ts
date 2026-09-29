import type { StarterPack } from '@beze/project-core';
import type { AssetStore } from './AssetStore.js';

interface StarterManifest extends StarterPack {
  files: Record<string, string>;
}

/** Starter pack served from /starter plus (later) user blobs in IndexedDB. */
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
    await Promise.all(Object.entries(manifest.files).map(async ([id, file]) => {
      const blob = await fetch(`/starter/${file}`).then((r) => r.blob());
      this.blobs.set(id, blob);
      this.images.set(id, await decode(blob));
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
