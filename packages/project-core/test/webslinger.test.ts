import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject } from '@beze/project-schema';
import { checkLimits, validateProject } from '../src/index.js';

/** The Webslinger template (docs/examples/webslinger.project.json, written by scripts/generate_webslinger.py) must be playable as-is. */
describe('webslinger template', () => {
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/examples/webslinger.project.json'), 'utf8'));
  const parsed = parseProject(raw);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues, null, 2));
  const project = parsed.value;

  it('has no integrity errors and stays within the limits', () => {
    expect(validateProject(project).filter((d) => d.severity === 'error')).toEqual([]);
    expect(checkLimits(project)).toEqual([]);
  });

  it('gives Spidey the web ability, climbing and danger sense in every scene', () => {
    for (const scene of Object.values(project.scenes)) {
      const players = Object.values(scene.entities).filter((e) => e.components.some((c) => c.type === 'playerControl'));
      expect(players).toHaveLength(1);
      expect(players[0]!.components.find((c) => c.type === 'sprite')).toMatchObject({ characterId: 'chr_spidey' });
      expect(players[0]!.components.find((c) => c.type === 'playerControl')).toMatchObject({ climb: true, ability: { type: 'web', zip: true }, senseRadius: expect.any(Number) });
    }
    expect(project.settings.abilityKey).toBe('X');
    expect(project.characters['chr_spidey']!.animations['web_left']).toBeDefined();
  });

  it('uses climbable collision (2) for building walls and ledges, and a walkable roof inside', () => {
    const map = project.maps['map_downtown']!;
    const at = (x: number, y: number) => map.collision[y * map.width + x];
    // Spidey's block: facade rows 16-19 and the ledge ring are climbable, the tar roof inside is walkable, the sidewalk below is free.
    expect(at(20, 18)).toBe(2);
    expect(at(16, 8)).toBe(2);
    expect(at(22, 11)).toBe(0);
    expect(at(21, 20)).toBe(0);
    expect(map.collision.filter((v) => v === 2).length).toBeGreaterThan(300);
  });

  it('puts every sprite entity and trigger on a cell that entity can stand on', () => {
    for (const scene of Object.values(project.scenes)) {
      const map = project.maps[scene.mapId!]!;
      const T = map.tileWidth;
      const value = (px: number, py: number) => map.collision[Math.floor(py / T) * map.width + Math.floor(px / T)];
      for (const e of Object.values(scene.entities)) {
        const sprite = e.components.find((c) => c.type === 'sprite');
        if (sprite && sprite.type === 'sprite') {
          const col = project.characters[sprite.characterId]!.collider;
          expect(value(e.x + col.offsetX + col.width / 2, e.y + col.offsetY + col.height / 2), `${scene.id}/${e.id}`).toBe(0);
        }
        const trigger = e.components.find((c) => c.type === 'trigger');
        if (trigger && trigger.type === 'trigger') {
          for (let y = e.y; y < e.y + trigger.height; y += T) for (let x = e.x; x < e.x + trigger.width; x += T) expect(value(x, y), `${scene.id}/${e.id}`).toBe(0);
        }
      }
    }
  });

  it('wires the missions: a timed pizza run, a reputation-gated boss, thugs that report their defeat', () => {
    expect(project.quests['qst_pizza']).toMatchObject({ timeLimitMs: 60000, repeatable: true });
    const lock = Object.values(project.scenes['scn_downtown']!.entities).flatMap((e) => e.components).find((c) => c.type === 'lock');
    expect(lock).toMatchObject({ condition: { variableId: 'var_rep', op: 'gte', value: 3 } });
    const enemies = Object.values(project.scenes).flatMap((s) => Object.values(s.entities)).flatMap((e) => e.components).filter((c) => c.type === 'enemy');
    expect(enemies.length).toBeGreaterThanOrEqual(12);
    expect(enemies.filter((c) => c.type === 'enemy' && c.onDefeat).length).toBeGreaterThanOrEqual(6);
    expect(project.scenes['scn_warehouse']!.entities['ent_warehouse_enforcer']!.components.find((c) => c.type === 'sprite')).toMatchObject({ characterId: 'chr_enforcer' });
  });
});
