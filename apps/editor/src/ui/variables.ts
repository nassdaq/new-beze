import type { GameVariable, Project } from '@beze/project-schema';

/** "Mama Ntilie's Shop" → "mama_ntilies_shop"; always a valid identifier. */
export function identifierFrom(text: string, fallback = 'value'): string {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_').slice(0, 50);
  const base = cleaned || fallback;
  return /^[a-z_]/.test(base) ? base : `_${base}`;
}

/** A variable name not used by any existing variable: `base`, then `base2`, `base3`... */
export function uniqueVariableName(variables: Pick<Project, 'variables'>['variables'], base: string): string {
  const taken = new Set(Object.values(variables).map((v) => v.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

/** First variable of the wanted type, preferring one whose name matches `prefer`. */
export function pickVariable(variables: Pick<Project, 'variables'>['variables'], type: GameVariable['type'], prefer?: RegExp): GameVariable | undefined {
  const typed = Object.values(variables).filter((v) => v.type === type);
  return (prefer && typed.find((v) => prefer.test(v.name) || (v.label ? prefer.test(v.label) : false))) ?? typed[0];
}
