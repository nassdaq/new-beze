import { describe, expect, it } from 'vitest';
import type { GameVariable } from '@beze/project-schema';
import { identifierFrom, pickVariable, uniqueVariableName } from './variables.js';

const v = (id: string, name: string, type: GameVariable['type'], label?: string): GameVariable => ({ id, name, type, initial: type === 'number' ? 0 : type === 'boolean' ? false : '', ...(label ? { label } : {}) });

describe('identifierFrom', () => {
  it('makes identifiers out of names', () => {
    expect(identifierFrom("Mama Ntilie's Shop")).toBe('mama_ntilie_s_shop');
    expect(identifierFrom('  ')).toBe('value');
    expect(identifierFrom('42 Bank')).toBe('_42_bank');
  });
});

describe('uniqueVariableName', () => {
  it('appends a counter when the name is taken', () => {
    const vars = { a: v('var_a', 'owns_shop', 'boolean'), b: v('var_b', 'owns_shop2', 'boolean') };
    expect(uniqueVariableName(vars, 'owns_shop')).toBe('owns_shop3');
    expect(uniqueVariableName(vars, 'money')).toBe('money');
  });
});

describe('pickVariable', () => {
  it('prefers a matching name or label, then the first of the type', () => {
    const vars = { a: v('var_a', 'xp', 'number'), b: v('var_b', 'cash', 'number', 'Money'), c: v('var_c', 'flag', 'boolean') };
    expect(pickVariable(vars, 'number', /money|cash/i)?.id).toBe('var_b');
    expect(pickVariable(vars, 'number')?.id).toBe('var_a');
    expect(pickVariable(vars, 'boolean')?.id).toBe('var_c');
    expect(pickVariable(vars, 'string')).toBeUndefined();
  });
});
