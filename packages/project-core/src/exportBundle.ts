import type { Project } from '@beze/project-schema';

export interface BundleAsset {
  id: string;
  bytes: Uint8Array;
}

export interface BundleInput {
  project: Project;
  assets: BundleAsset[];
  /** Contents of beze-runtime.js. */
  runtimeScript: string;
  runtimeVersion: string;
}

export interface BundleFile {
  path: string;
  content: string | Uint8Array;
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' };

export function assetFileName(project: Project, assetId: string): string {
  const asset = project.assets[assetId];
  const ext = asset ? EXT[asset.mime] ?? 'bin' : 'bin';
  return `${assetId}.${ext}`;
}

/**
 * The static web build: a fixed layout of copied files. No code generation, no build step.
 * The same layout is produced in the browser (slice 1) and by the export worker (later).
 */
export function buildStaticBundle(input: BundleInput): BundleFile[] {
  const { project } = input;
  const manifest: Record<string, { path: string; hash: string; mime: string; width?: number; height?: number }> = {};
  const files: BundleFile[] = [];

  for (const a of input.assets) {
    const meta = project.assets[a.id];
    if (!meta) continue;
    const path = `assets/${assetFileName(project, a.id)}`;
    const entry: (typeof manifest)[string] = { path, hash: meta.hash, mime: meta.mime };
    if (meta.width !== undefined) entry.width = meta.width;
    if (meta.height !== undefined) entry.height = meta.height;
    manifest[a.id] = entry;
    files.push({ path, content: a.bytes });
  }

  files.push(
    { path: 'index.html', content: indexHtml(project.settings.title, project.settings.backgroundColor) },
    { path: 'runtime/beze-runtime.js', content: input.runtimeScript },
    { path: 'runtime/VERSION', content: input.runtimeVersion + '\n' },
    { path: 'project.json', content: JSON.stringify(project, null, 2) + '\n' },
    { path: 'assets/manifest.json', content: JSON.stringify(manifest, null, 2) + '\n' },
    { path: 'README.txt', content: readme(project.name) },
  );
  return files;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function indexHtml(title: string, background: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="data:,">
<style>
  html, body { margin: 0; height: 100%; background: ${escapeHtml(background)}; overflow: hidden; }
  #game { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
  #game canvas { image-rendering: pixelated; }
</style>
</head>
<body>
<div id="game"></div>
<script src="runtime/beze-runtime.js"></script>
<script>BezeRuntime.startStaticLoader({ container: document.getElementById('game') });</script>
</body>
</html>
`;
}

function readme(name: string): string {
  return `${name}
Made with Beze.

This folder is a static website. Browsers refuse to load game files straight from disk
(file://), so serve the folder with any static file server, for example:

    npx serve .

then open the printed address. Uploading the folder to any static host works the same way.

Controls: arrow keys or WASD to move, E (or the key set in the project) to talk.
`;
}
