import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject } from '@beze/project-schema';
import { checkLimits, validateProject } from '../src/index.js';

/** The Hacho template (docs/examples/hacho.project.json, written by scripts/generate_hacho.py) must be playable as-is. */
describe('hacho template', () => {
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/examples/hacho.project.json'), 'utf8'));
  const parsed = parseProject(raw);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues, null, 2));
  const project = parsed.value;

  it('has no integrity errors', () => {
    expect(validateProject(project).filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('stays within the free-plan limits', () => {
    expect(checkLimits(project)).toEqual([]);
  });

  it('has exactly one player per scene, using the Hacho hero', () => {
    for (const scene of Object.values(project.scenes)) {
      const players = Object.values(scene.entities).filter((e) => e.components.some((c) => c.type === 'playerControl'));
      expect(players).toHaveLength(1);
      expect(players[0]!.components.find((c) => c.type === 'sprite')).toMatchObject({ characterId: 'chr_hacho' });
    }
  });

  it('puts every sprite entity and trigger on walkable cells', () => {
    for (const scene of Object.values(project.scenes)) {
      const map = project.maps[scene.mapId!]!;
      const T = map.tileWidth;
      const solid = (px: number, py: number) => map.collision[Math.floor(py / T) * map.width + Math.floor(px / T)] === 1;
      for (const e of Object.values(scene.entities)) {
        const sprite = e.components.find((c) => c.type === 'sprite');
        if (sprite && sprite.type === 'sprite') {
          const col = project.characters[sprite.characterId]!.collider;
          expect(solid(e.x + col.offsetX + col.width / 2, e.y + col.offsetY + col.height / 2), `${scene.id}/${e.id}`).toBe(false);
        }
        const trigger = e.components.find((c) => c.type === 'trigger');
        if (trigger && trigger.type === 'trigger') {
          for (let y = e.y; y < e.y + trigger.height; y += T) for (let x = e.x; x < e.x + trigger.width; x += T) expect(solid(x, y), `${scene.id}/${e.id}`).toBe(false);
        }
      }
    }
  });

  it('wires the economy and the missions the design asks for', () => {
    expect(project.variables[project.settings.economy!.moneyVariableId]!.initial).toBe(50000);
    expect(project.quests['qst_quick_delivery']).toMatchObject({ timeLimitMs: 90000, repeatable: true });
    const properties = Object.values(project.scenes).flatMap((s) => Object.values(s.entities)).flatMap((e) => e.components).filter((c) => c.type === 'property');
    expect(properties.map((p) => p.type === 'property' && [p.name, p.price, p.incomePerDay])).toEqual(expect.arrayContaining([
      ['Small Shop', 250000, 8000], ['Restaurant', 750000, 25000], ['Large Business', 2500000, 90000], ['House', 400000, 12000],
    ]));
  });
});
