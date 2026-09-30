import type { ProjectRepository } from './repository/ProjectRepository.js';
import type { AssetStore } from './assets/AssetStore.js';
import { LocalProjectRepository } from './repository/LocalProjectRepository.js';
import { LocalAssetStore } from './assets/LocalAssetStore.js';

/** Composition root. Swap these for API-backed implementations in slice 2. */
export const repository: ProjectRepository = new LocalProjectRepository();
export const assets: AssetStore = new LocalAssetStore();
