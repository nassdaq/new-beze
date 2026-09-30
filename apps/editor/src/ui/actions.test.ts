import { describe, expect, it } from 'vitest';
import type { Action } from '@beze/project-schema';
import { actionLabel, actionUnavailableReason, animationNames, defaultAction, defaultCondition, replaceAt, spawnToTile, tileToSpawn } from './actions.js';

const ctx = { dialogueId: 'dlg_a', sceneId: 'scn_a', questId: 'qst_a', variable: { id: 'var_money', type: 'number' as const } };

describe('defaultAction', () => {
  it('builds a valid starting action for each editable type', () => {
    expect(defaultAction('startDialogue', ctx)).toEqual({ type: 'startDialogue', dialogueId: 'dlg_a' });
    expect(defaultAction('changeScene', ctx)).toEqual({ type: 'changeScene', sceneId: 'scn_a', spawn: { x: 0, y: 0 } });
    expect(defaultAction('setVariable', ctx)).toEqual({ type: 'setVariable', variableId: 'var_money', op: 'add', value: 1 });
    expect(defaultAction('setVariable', { variable: { id: 'var_f', type: 'boolean' } })).toEqual({ type: 'setVariable', variableId: 'var_f', op: 'set', value: true });
    expect(defaultAction('notify', {})).toEqual({ type: 'notify', text: 'Hello!' });
    expect(defaultAction('playAnimation', {})).toEqual({ type: 'playAnimation', animation: 'celebrate' });
    expect(defaultAction('startQuest', ctx)).toEqual({ type: 'startQuest', questId: 'qst_a' });
    expect(defaultAction('sequence', {})).toEqual({ type: 'sequence', actions: [] });
  });
  it('returns null and a reason when the project lacks the target', () => {
    expect(defaultAction('startDialogue', {})).toBeNull();
    expect(actionUnavailableReason('startDialogue', {})).toMatch(/dialogue/);
    expect(actionUnavailableReason('startQuest', {})).toMatch(/quest/);
    expect(actionUnavailableReason('setVariable', {})).toMatch(/variable/);
    expect(actionUnavailableReason('changeScene', {})).toMatch(/scene/);
    expect(actionUnavailableReason('notify', {})).toBeNull();
  });
});

describe('actionLabel', () => {
  const project = { dialogues: { dlg_a: { name: 'Aiko talk' } }, scenes: { scn_a: { name: 'Town' } }, quests: { qst_a: { name: 'Lost Package' } }, variables: { var_money: { name: 'money' } }, characters: {} } as never;
  it('uses names from the project', () => {
    expect(actionLabel({ type: 'startDialogue', dialogueId: 'dlg_a' }, project)).toBe('talk: Aiko talk');
    expect(actionLabel({ type: 'setVariable', variableId: 'var_money', op: 'add', value: 5000 }, project)).toBe('money += 5000');
    expect(actionLabel({ type: 'startQuest', questId: 'qst_a' }, project)).toBe('start quest Lost Package');
    expect(actionLabel({ type: 'changeScene', sceneId: 'scn_a', spawn: { x: 0, y: 0 } }, project)).toBe('go to Town');
  });
  it('describes sequences recursively', () => {
    const seq: Action = { type: 'sequence', actions: [{ type: 'notify', text: 'Hi' }, { type: 'playAnimation', animation: 'celebrate' }] };
    expect(actionLabel(seq)).toBe('2 steps: say "Hi", play celebrate');
    expect(actionLabel({ type: 'sequence', actions: [] })).toBe('empty sequence');
  });
});

describe('spawn tiles', () => {
  it('round-trips through tile units', () => {
    expect(spawnToTile({ x: 96, y: 64 }, 32)).toEqual({ x: 3, y: 2 });
    expect(tileToSpawn({ x: 3, y: 2 }, 32)).toEqual({ x: 96, y: 64 });
    expect(spawnToTile(tileToSpawn({ x: 7, y: 9 }, 16), 16)).toEqual({ x: 7, y: 9 });
  });
});

describe('helpers', () => {
  it('lists emote animations across characters without the walk set', () => {
    const project = { characters: { a: { animations: { idle_down: {}, walk_up: {}, celebrate: {}, attack_down: {} } }, b: { animations: { map: {}, celebrate: {} } } } } as never;
    expect(animationNames(project)).toEqual(['attack_down', 'celebrate', 'map']);
  });
  it('replaceAt replaces or removes', () => {
    expect(replaceAt([1, 2, 3], 1, 9)).toEqual([1, 9, 3]);
    expect(replaceAt([1, 2, 3], 1, null)).toEqual([1, 3]);
  });
  it('defaultCondition picks a sensible value per type', () => {
    expect(defaultCondition({ id: 'v', type: 'number' })).toEqual({ variableId: 'v', op: 'eq', value: 1 });
    expect(defaultCondition({ id: 'v', type: 'boolean' })).toEqual({ variableId: 'v', op: 'eq', value: true });
  });
});
