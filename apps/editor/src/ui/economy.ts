import type { GameVariable, ProjectSettings } from '@beze/project-schema';

export type Economy = NonNullable<ProjectSettings['economy']>;

/** Comma-separated level thresholds → sorted, deduplicated non-negative integers (max 50). */
export function parseThresholds(text: string): number[] {
  const values = text.split(/[,\s;]+/).filter((s) => s !== '').map((s) => Number(s)).filter((n) => Number.isFinite(n) && n >= 0).map((n) => Math.round(n));
  return [...new Set(values)].sort((a, b) => a - b).slice(0, 50);
}

export function formatThresholds(thresholds: readonly number[] | undefined): string {
  return (thresholds ?? []).join(', ');
}

/** Default economy for a project: TSh, 2-minute days, a gentle XP curve. */
export function defaultEconomy(moneyVariableId: string, xpVariableId?: string): Economy {
  return {
    moneyVariableId,
    ...(xpVariableId ? { xpVariableId } : {}),
    currencyPrefix: 'TSh ',
    dayLengthMs: 120_000,
    levelThresholds: [100, 300, 600, 1000, 1500],
  };
}

export const isNumberVariable = (v: GameVariable): boolean => v.type === 'number';

/** Day length is edited in seconds; the schema stores milliseconds within [5 s, 1 h]. */
export function secondsToDayLength(seconds: number): number {
  const ms = Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000);
  return Math.min(3_600_000, Math.max(5000, ms));
}
