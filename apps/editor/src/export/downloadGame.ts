import { zipSync, strToU8 } from 'fflate';
import type { Project } from '@beze/project-schema';
import { buildStaticBundle } from '@beze/project-core';
import { assets } from '../services.js';
import { withBase } from '../base.js';

/** Builds the static web bundle in the browser and downloads it as a zip. */
export async function downloadGame(project: Project): Promise<void> {
  const [runtimeScript, runtimeVersion] = await Promise.all([
    fetch(withBase('/runtime/beze-runtime.js')).then((r) => { if (!r.ok) throw new Error('runtime bundle not found; run `pnpm build` first'); return r.text(); }),
    fetch(withBase('/runtime/VERSION')).then((r) => (r.ok ? r.text() : '0.0.0')).then((s) => s.trim()),
  ]);
  const assetBytes = await Promise.all(Object.keys(project.assets).map(async (id) => ({ id, bytes: await assets.bytes(id) })));
  const files = buildStaticBundle({ project, assets: assetBytes, runtimeScript, runtimeVersion });
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = typeof f.content === 'string' ? strToU8(f.content) : f.content;
  const zip = zipSync(entries, { level: 6 });
  download(new Blob([zip as BlobPart], { type: 'application/zip' }), `${slug(project.name)}.zip`);
}

export function downloadProjectFile(project: Project): void {
  download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${slug(project.name)}.beze.json`);
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
