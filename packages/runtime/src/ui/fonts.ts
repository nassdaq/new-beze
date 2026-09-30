/**
 * The runtime's two typefaces, bundled as base64 so exported games work offline and the sandboxed Play iframe needs
 * no network: Nunito (variable weight, OFL) for interface text and Bangers (OFL) for titles, mission cards and damage
 * numbers. Licences sit next to the files. `ensureFonts` installs them once per document and resolves when they are
 * ready to draw; scenes await it before creating text.
 */
import nunitoUrl from './fonts/nunito.woff2?inline';
import bangersUrl from './fonts/bangers.woff2?inline';

export const FONT_UI = 'Beze Nunito';
export const FONT_DISPLAY = 'Beze Bangers';

let pending: Promise<void> | null = null;

export function ensureFonts(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document) || typeof FontFace === 'undefined') return;
    const faces = [
      new FontFace(FONT_UI, `url(${nunitoUrl})`, { weight: '200 1000', style: 'normal' }),
      new FontFace(FONT_DISPLAY, `url(${bangersUrl})`, { weight: '400', style: 'normal' }),
    ];
    await Promise.all(faces.map(async (f) => {
      try {
        await f.load();
        document.fonts.add(f);
      } catch (e) {
        console.warn(`font ${f.family} failed to load`, e);
      }
    }));
    // Warm the glyph caches so the first canvas measurement already uses the loaded faces.
    await Promise.all([document.fonts.load(`700 16px "${FONT_UI}"`), document.fonts.load(`400 16px "${FONT_DISPLAY}"`)]).catch(() => undefined);
  })();
  return pending;
}
