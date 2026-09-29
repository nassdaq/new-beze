import type { StarterPack } from '@beze/project-core';

/** Binary side of assets. The document only holds ids and metadata. */
export interface AssetStore {
  /** Resolves once the starter pack is loaded. */
  ready(): Promise<void>;
  starterPack(): StarterPack;
  /** Decoded image for the editor's canvas renderer. Synchronous so render loops stay simple. */
  image(assetId: string): HTMLImageElement | undefined;
  bytes(assetId: string): Promise<Uint8Array>;
  /** URLs the runtime iframe can load. Data URLs cross the opaque-origin boundary; blob: URLs do not. */
  dataUrls(assetIds: string[]): Promise<Record<string, string>>;
}
