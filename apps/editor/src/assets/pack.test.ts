import { describe, expect, it } from 'vitest';
import type { Asset } from '@beze/project-schema';
import { assertPackManifest, planPackLoad, resolvePackFile } from './pack.js';

const asset = (id: string, hash: string): Asset => ({ id, kind: 'image', name: id, mime: 'image/png', width: 1, height: 1, hash, origin: 'starter' });
const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);

describe('resolvePackFile', () => {
  it('resolves relative names against the manifest directory', () => {
    expect(resolvePackFile('/templates/hacho/pack.json', 'hero.webp')).toBe('/templates/hacho/hero.webp');
    expect(resolvePackFile('/templates/hacho/pack.json', 'img/town.png')).toBe('/templates/hacho/img/town.png');
  });
  it('leaves absolute urls alone', () => {
    expect(resolvePackFile('/templates/hacho/pack.json', '/starter/hero.png')).toBe('/starter/hero.png');
    expect(resolvePackFile('/templates/hacho/pack.json', 'https://x.test/a.png')).toBe('https://x.test/a.png');
  });
});

describe('planPackLoad', () => {
  const manifest = { files: { ast_a: 'a.png', ast_b: 'b.png', ast_c: 'c.png' }, assets: [asset('ast_a', H1), asset('ast_b', H2)] };
  it('skips files whose declared hash is already held', () => {
    const plan = planPackLoad('/t/pack.json', manifest, new Map([['ast_a', H1], ['ast_b', 'stale']]));
    expect(plan.map((e) => e.id)).toEqual(['ast_b', 'ast_c']);
    expect(plan[0]).toMatchObject({ url: '/t/b.png', hash: H2 });
    expect(plan[1]).toMatchObject({ url: '/t/c.png', hash: undefined, asset: undefined });
  });
  it('fetches everything when nothing is held', () => {
    expect(planPackLoad('/t/pack.json', manifest, new Map()).length).toBe(3);
  });
  it('ignores malformed entries', () => {
    expect(planPackLoad('/t/pack.json', { files: { ast_x: '' } }, new Map())).toEqual([]);
  });
});

describe('assertPackManifest', () => {
  it('accepts a files map and rejects anything else', () => {
    expect(assertPackManifest({ files: {} }, '/p.json').files).toEqual({});
    expect(() => assertPackManifest(null, '/p.json')).toThrow(/pack manifest/);
    expect(() => assertPackManifest({ files: [] }, '/p.json')).toThrow(/pack manifest/);
    expect(() => assertPackManifest('<html>', '/p.json')).toThrow(/pack manifest/);
  });
});
