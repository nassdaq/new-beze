import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject } from '@beze/project-schema';
import { start, advance, type Variables } from '../src/dialogue/interpreter.js';
import { initGameState } from '../src/state/GameState.js';

const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/examples/hello-aiko.project.json'), 'utf8'));
const parsed = parseProject(raw);
if (!parsed.ok) throw new Error('fixture invalid');
const project = parsed.value;
const dialogue = project.dialogues['dlg_aiko_intro']!;

describe('dialogue interpreter', () => {
  it('walks the intro, applies the set node, and branches on the second visit', () => {
    const vars: Variables = initGameState(project).variables;
    expect(vars['var_met_aiko']).toBe(false);

    let o = start(dialogue, vars);
    expect(o.step.kind).toBe('line');
    if (o.step.kind !== 'line') return;
    expect(o.step.node.text).toContain("I'm Aiko");

    o = advance(dialogue, o.step, vars);
    expect(o.step.kind).toBe('choice');
    if (o.step.kind !== 'choice') return;
    expect(o.step.options.map((x) => x.text)).toEqual(['Nice to meet you, Aiko.', 'Just passing through.']);

    o = advance(dialogue, o.step, vars, 1);
    expect(o.step.kind === 'line' && o.step.node.text).toContain('Everyone is');

    o = advance(dialogue, o.step, vars);
    expect(o.step.kind).toBe('end');
    expect(vars['var_met_aiko']).toBe(true);

    const again = start(dialogue, vars);
    expect(again.step.kind === 'line' && again.step.node.text).toContain('Back again');
  });

  it('hides options whose condition fails and ends when none remain', () => {
    const vars: Variables = { var_x: 1 };
    const d = {
      id: 'dlg_t', name: 't', startNodeId: 'nod_c',
      nodes: {
        nod_c: { id: 'nod_c', type: 'choice' as const, options: [{ text: 'a', next: null, condition: { variableId: 'var_x', op: 'gt' as const, value: 5 } }] },
      },
    };
    expect(start(d, vars).step.kind).toBe('end');
  });

  it('collects action nodes for the runtime to execute', () => {
    const d = {
      id: 'dlg_t', name: 't', startNodeId: 'nod_a',
      nodes: {
        nod_a: { id: 'nod_a', type: 'action' as const, action: { type: 'setVariable' as const, variableId: 'var_x', op: 'set' as const, value: 3 }, next: null },
      },
    };
    const o = start(d, {});
    expect(o.step.kind).toBe('end');
    expect(o.actions).toHaveLength(1);
  });
});
