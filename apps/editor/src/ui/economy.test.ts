import { describe, expect, it } from 'vitest';
import { defaultEconomy, formatThresholds, parseThresholds, secondsToDayLength } from './economy.js';

describe('level thresholds', () => {
  it('parses a messy comma list into sorted unique integers', () => {
    expect(parseThresholds('100, 300,600 ,, 300, abc, -5, 1000.4')).toEqual([100, 300, 600, 1000]);
    expect(parseThresholds('')).toEqual([]);
  });
  it('formats and round-trips', () => {
    expect(formatThresholds([100, 300])).toBe('100, 300');
    expect(formatThresholds(undefined)).toBe('');
    expect(parseThresholds(formatThresholds([5, 10, 20]))).toEqual([5, 10, 20]);
  });
  it('caps at 50 thresholds', () => {
    expect(parseThresholds(Array.from({ length: 60 }, (_, i) => String(i)).join(',')).length).toBe(50);
  });
});

describe('day length', () => {
  it('clamps to the schema range', () => {
    expect(secondsToDayLength(120)).toBe(120_000);
    expect(secondsToDayLength(1)).toBe(5000);
    expect(secondsToDayLength(99999)).toBe(3_600_000);
    expect(secondsToDayLength(Number.NaN)).toBe(5000);
  });
});

describe('defaultEconomy', () => {
  it('uses the given variables and TSh', () => {
    expect(defaultEconomy('var_money', 'var_xp')).toMatchObject({ moneyVariableId: 'var_money', xpVariableId: 'var_xp', currencyPrefix: 'TSh ' });
    expect('xpVariableId' in defaultEconomy('var_money')).toBe(false);
  });
});
