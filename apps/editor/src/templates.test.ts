import { describe, expect, it } from 'vitest';
import { TEMPLATES, findTemplate } from './templates.js';

describe('templates registry', () => {
  it('has unique ids and absolute urls', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TEMPLATES) {
      expect(t.project.startsWith('/')).toBe(true);
      expect(t.pack.startsWith('/')).toBe(true);
      expect(t.name.length).toBeGreaterThan(0);
    }
  });

  it('lists the Hacho template', () => {
    expect(findTemplate('hacho')?.project).toBe('/templates/hacho/project.json');
    expect(findTemplate('nope')).toBeUndefined();
  });
});
