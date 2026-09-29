import type { Action, Condition, Dialogue, DialogueNode, Scalar } from '@beze/project-schema';

/** Pure dialogue walker. No Phaser. The runtime renders what `Step` describes. */

export type Variables = Record<string, Scalar>;

export type Step =
  | { kind: 'line'; node: Extract<DialogueNode, { type: 'line' }> }
  | { kind: 'choice'; node: Extract<DialogueNode, { type: 'choice' }>; options: Array<{ index: number; text: string }> }
  | { kind: 'end' };

export interface Outcome {
  step: Step;
  /** Actions from `action` nodes crossed during this resolution, in order. */
  actions: Action[];
}

const MAX_HOPS = 1000;

export function evaluateCondition(c: Condition, vars: Variables): boolean {
  const v = vars[c.variableId];
  if (v === undefined) return false;
  switch (c.op) {
    case 'eq': return v === c.value;
    case 'neq': return v !== c.value;
    case 'gt': return typeof v === 'number' && typeof c.value === 'number' && v > c.value;
    case 'gte': return typeof v === 'number' && typeof c.value === 'number' && v >= c.value;
    case 'lt': return typeof v === 'number' && typeof c.value === 'number' && v < c.value;
    case 'lte': return typeof v === 'number' && typeof c.value === 'number' && v <= c.value;
  }
}

/**
 * Walks from `nodeId` through non-visual nodes (set, branch, action) until it reaches a line,
 * a choice or the end. `vars` is mutated by `set` nodes so later branches see the change.
 */
export function resolve(dialogue: Dialogue, nodeId: string | null, vars: Variables): Outcome {
  const actions: Action[] = [];
  let current = nodeId;
  for (let hops = 0; hops < MAX_HOPS; hops++) {
    if (current === null) return { step: { kind: 'end' }, actions };
    const node = dialogue.nodes[current];
    if (!node) return { step: { kind: 'end' }, actions };
    switch (node.type) {
      case 'line':
        return { step: { kind: 'line', node }, actions };
      case 'choice': {
        const options = node.options
          .map((o, index) => ({ index, text: o.text, visible: !o.condition || evaluateCondition(o.condition, vars) }))
          .filter((o) => o.visible)
          .map(({ index, text }) => ({ index, text }));
        if (options.length === 0) return { step: { kind: 'end' }, actions };
        return { step: { kind: 'choice', node, options }, actions };
      }
      case 'set': {
        if (node.op === 'set') vars[node.variableId] = node.value;
        else if (typeof vars[node.variableId] === 'number' && typeof node.value === 'number') {
          vars[node.variableId] = (vars[node.variableId] as number) + node.value;
        }
        current = node.next;
        break;
      }
      case 'branch':
        current = evaluateCondition(node.condition, vars) ? node.ifTrue : node.ifFalse;
        break;
      case 'action':
        actions.push(node.action);
        current = node.next;
        break;
      case 'end':
        return { step: { kind: 'end' }, actions };
    }
  }
  return { step: { kind: 'end' }, actions };
}

export function start(dialogue: Dialogue, vars: Variables): Outcome {
  return resolve(dialogue, dialogue.startNodeId, vars);
}

/** Continues after the current visible step. `choiceIndex` is the option's original index. */
export function advance(dialogue: Dialogue, step: Step, vars: Variables, choiceIndex?: number): Outcome {
  switch (step.kind) {
    case 'line':
      return resolve(dialogue, step.node.next, vars);
    case 'choice': {
      const option = step.node.options[choiceIndex ?? -1];
      if (!option) return { step, actions: [] };
      return resolve(dialogue, option.next, vars);
    }
    case 'end':
      return { step, actions: [] };
  }
}
