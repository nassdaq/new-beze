import { describe as suite, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject } from '@beze/project-schema';
import { describe } from './AskPanel.js';

const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../docs/examples/hello-aiko.project.json'), 'utf8'));
const parsed = parseProject(raw);
if (!parsed.ok) throw new Error('fixture invalid');
const project = parsed.value;

suite('Ask describe()', () => {
  it('names quests, properties and shops', () => {
    const lines = describe([
      { op: 'createQuest', quest: { id: 'qst_a', name: 'Lost Package', description: '', steps: [{ id: 'stp_a', text: 'Find it' }], rewards: [{ type: 'notify', text: 'Done' }] } },
      { op: 'setComponent', sceneId: 'scn_village', entityId: 'ent_aiko', component: { type: 'property', name: 'Small Shop', price: 250000, incomePerDay: 8000, ownedVariableId: 'var_x' } },
      { op: 'setComponent', sceneId: 'scn_village', entityId: 'ent_aiko', component: { type: 'shop', name: 'Duka', sells: [], buys: [] } },
      { op: 'updateSettings', patch: { economy: { moneyVariableId: 'var_x', currencyPrefix: 'TSh ', dayLengthMs: 60000 } } },
      { op: 'updateSettings', patch: { defaultMoveSpeed: 100 } },
      { op: 'setCollision', mapId: 'map_village', cells: [{ x: 0, y: 0, solid: true }] },
    ], project);
    expect(lines).toContain('quests: Lost Package (1 steps, rewards)');
    expect(lines).toContain('properties: Small Shop (Aiko)');
    expect(lines).toContain('shops: Duka (Aiko)');
    expect(lines).toContain('1 economy settings');
    expect(lines).toContain('1 settings');
    expect(lines).toContain('1 collision edits');
  });
});
