/**
 * The path the editor is served under. Vite's BASE_URL is "/" in dev and whatever `base` the build was given
 * (BASE_PATH env, e.g. "/new-beze/" on GitHub Pages). Every root-relative URL in the app goes through `withBase`
 * so the same build works at a domain root and under a sub-path.
 */
export const BASE_URL: string = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

/** The router basename: the base without its trailing slash ("" at the root). */
export const ROUTER_BASENAME = BASE_URL === '/' ? '' : BASE_URL.slice(0, -1);

/** Prefixes a root-relative path ("/starter/x.png") with the base ("/new-beze/starter/x.png"). */
export function withBase(path: string): string {
  return `${BASE_URL}${path.replace(/^\//, '')}`;
}
