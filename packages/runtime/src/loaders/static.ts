import { mountGame } from '../mount.js';

/** Runs in an exported build: loads project.json and the asset manifest from relative paths. */
export async function startStaticLoader(opts: { container: HTMLElement; debug?: boolean }): Promise<void> {
  try {
    const [project, manifest] = await Promise.all([
      fetch('project.json').then((r) => r.json()),
      fetch('assets/manifest.json').then((r) => r.json() as Promise<Record<string, { path: string }>>),
    ]);
    const assetUrls = Object.fromEntries(Object.entries(manifest).map(([id, m]) => [id, m.path]));
    mountGame({ container: opts.container, project, assetUrls, debug: opts.debug ?? false });
  } catch (e) {
    const msg = document.createElement('pre');
    msg.style.cssText = 'color:#fff;font:14px sans-serif;padding:16px;white-space:pre-wrap';
    msg.textContent = `This game could not start: ${(e as Error).message}\n\nIf you opened index.html from disk, serve the folder with a static server instead (see README.txt).`;
    opts.container.appendChild(msg);
  }
}
