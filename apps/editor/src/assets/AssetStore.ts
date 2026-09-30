import type { Asset } from '@beze/project-schema';
import type { StarterPack } from '@beze/project-core';

/** What the caller knows about an uploaded image; the store fills in id, size and hash. */
export interface PutAssetMeta {
  name: string;
  license?: string;
}

/** Upload limits, enforced by `put`. */
export const UPLOAD_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxSide: 4096,
  mimes: ['image/png', 'image/webp'] as const,
  /** Music tracks: OGG or MP3, up to 12 MB. */
  audioMimes: ['audio/ogg', 'audio/mpeg'] as const,
  audioMaxBytes: 12 * 1024 * 1024,
};

/** Binary side of assets. The document only holds ids and metadata. */
export interface AssetStore {
  /** Resolves once the starter pack and any stored uploads are loaded. */
  ready(): Promise<void>;
  starterPack(): StarterPack;
  /** Decoded image for the editor's canvas renderer. Synchronous so render loops stay simple. */
  image(assetId: string): HTMLImageElement | undefined;
  bytes(assetId: string): Promise<Uint8Array>;
  /** URLs the runtime iframe can load. Data URLs cross the opaque-origin boundary; blob: URLs do not. */
  dataUrls(assetIds: string[]): Promise<Record<string, string>>;
  /**
   * Stores an uploaded image and returns the Asset record to register in the project. Rejects
   * files that are not PNG/WebP, larger than 5 MB or larger than 4096×4096. Once resolved,
   * `image()`, `bytes()` and `dataUrls()` all serve the new asset.
   */
  put(data: Blob, meta: PutAssetMeta): Promise<Asset>;
  /** Stores an uploaded music track (OGG or MP3, up to 12 MB) and returns its Asset record. */
  putAudio(data: Blob, meta: PutAssetMeta): Promise<Asset>;
  /**
   * Loads a template's image pack (`pack.json`, see pack.ts) so a project created from the
   * template can render, play and export. Files already held with the same hash are skipped;
   * new ones are decoded, kept in memory and persisted so they survive a reload.
   */
  loadPack(url: string): Promise<{ loaded: number; skipped: number }>;
}
