import { describe, expect, it } from 'vitest';
import { advanceClock, buyItem, buyProperty, dayClock, formatDelta, formatMoney, levelFromXp, listProperties, reputationStars, sellItem } from '../src/systems/economy.js';
import { smoothingFactor } from '../src/systems/camera.js';
import { directionFromVector } from '../src/systems/joystick.js';
import { initGameState } from '../src/state/GameState.js';
import { cityProject } from './fixtures/city.js';

describe('money formatting', () => {
  it('groups thousands and prints the prefix', () => {
    expect(formatMoney(50000, 'TSh ')).toBe('TSh 50,000');
    expect(formatMoney(2500000, 'TSh ')).toBe('TSh 2,500,000');
    expect(formatMoney(999, 'TSh ')).toBe('TSh 999');
    expect(formatMoney(0, '$')).toBe('$0');
  });
  it('keeps the sign in front of the prefix and rounds fractions', () => {
    expect(formatMoney(-250, 'TSh ')).toBe('-TSh 250');
    expect(formatMoney(1234.6, '')).toBe('1,235');
    expect(formatDelta(500, 'TSh ')).toBe('+TSh 500');
    expect(formatDelta(-8000, 'TSh ')).toBe('-TSh 8,000');
  });
});

describe('level from thresholds', () => {
  const thresholds = [100, 300, 600];
  it('starts at level 1 with progress towards the first threshold', () => {
    const l = levelFromXp(0, thresholds);
    expect(l.level).toBe(1);
    expect(l.progress).toBe(0);
    expect(l.nextAt).toBe(100);
    expect(levelFromXp(50, thresholds).progress).toBeCloseTo(0.5);
  });
  it('reaches a level exactly at its threshold', () => {
    expect(levelFromXp(100, thresholds).level).toBe(2);
    expect(levelFromXp(299, thresholds).level).toBe(2);
    expect(levelFromXp(300, thresholds)).toMatchObject({ level: 3, into: 0, span: 300, nextAt: 600 });
    expect(levelFromXp(450, thresholds).progress).toBeCloseTo(0.5);
  });
  it('caps at the top level with a full bar', () => {
    expect(levelFromXp(600, thresholds)).toMatchObject({ level: 4, progress: 1, nextAt: null });
    expect(levelFromXp(99999, thresholds).level).toBe(4);
  });
  it('is level 1 without thresholds and tolerates unsorted ones', () => {
    expect(levelFromXp(500, undefined)).toMatchObject({ level: 1, progress: 1 });
    expect(levelFromXp(150, [300, 100]).level).toBe(2);
  });
});

describe('day clock', () => {
  it('starts on day 1 at 06:00', () => {
    expect(dayClock(0, 60000)).toMatchObject({ day: 1, hour: 6, minute: 0, text: '06:00' });
  });
  it('advances through the day and wraps past midnight', () => {
    expect(dayClock(30000, 60000).text).toBe('18:00');
    expect(dayClock(45000, 60000).text).toBe('00:00');
    expect(dayClock(59999, 60000)).toMatchObject({ day: 1, hour: 5, minute: 59 });
    expect(dayClock(60000, 60000)).toMatchObject({ day: 2, text: '06:00' });
    expect(dayClock(150000, 60000)).toMatchObject({ day: 3, text: '18:00' });
  });
  it('never shows a negative day', () => {
    expect(dayClock(-5, 60000).day).toBe(1);
  });
});

describe('stars', () => {
  it('rounds and clamps to five', () => {
    expect(reputationStars(0)).toBe('☆☆☆☆☆');
    expect(reputationStars(2.6)).toBe('★★★☆☆');
    expect(reputationStars(9)).toBe('★★★★★');
    expect(reputationStars(-1)).toBe('☆☆☆☆☆');
  });
});

describe('property income and purchases', () => {
  const project = cityProject();
  const economy = project.settings.economy!;
  it('lists every property in the project', () => {
    expect(listProperties(project).map((p) => p.name)).toEqual(['Mama Ntilie Kiosk', 'Bus Cafe']);
  });
  it('pays owned properties once per day crossing, several days at once after a long stall', () => {
    const state = initGameState(project);
    state.variables['var_own_kiosk'] = true;
    expect(advanceClock(project, state, 5000)).toEqual([]);
    expect(state.clock.day).toBe(1);
    const r = advanceClock(project, state, economy.dayLengthMs * 2);
    expect(r).toEqual([{ day: 2, income: 8000 }, { day: 3, income: 8000 }]);
    expect(state.variables['var_money']).toBe(50000 + 16000);
  });
  it('buys only when affordable, once', () => {
    const state = initGameState(project);
    const kiosk = listProperties(project)[0]!;
    expect(buyProperty(state, economy, kiosk)).toEqual({ ok: true });
    expect(state.variables['var_money']).toBe(50000 - 25000);
    expect(state.variables['var_own_kiosk']).toBe(true);
    expect(buyProperty(state, economy, kiosk)).toMatchObject({ ok: false, reason: 'owned' });
    const cafe = listProperties(project)[1]!;
    expect(buyProperty(state, economy, cafe)).toEqual({ ok: false, reason: 'poor', short: 750000 - 25000 });
    expect(state.variables['var_money']).toBe(25000);
  });
  it('trades one unit at a time through a shop', () => {
    const state = initGameState(project);
    expect(sellItem(state, 'var_money', 'var_parcel', 100)).toEqual({ ok: false, reason: 'none' });
    expect(buyItem(state, 'var_money', 'var_parcel', 500)).toEqual({ ok: true });
    expect(state.variables['var_parcel']).toBe(1);
    expect(state.variables['var_money']).toBe(49500);
    expect(sellItem(state, 'var_money', 'var_parcel', 100)).toEqual({ ok: true });
    expect(state.variables['var_parcel']).toBe(0);
    expect(state.variables['var_money']).toBe(49600);
    state.variables['var_money'] = 10;
    expect(buyItem(state, 'var_money', 'var_parcel', 500)).toEqual({ ok: false, reason: 'poor' });
  });
});

describe('camera smoothing', () => {
  it('closes the same fraction per 60 Hz frame whatever the delta', () => {
    expect(smoothingFactor(0.12, 1000 / 60)).toBeCloseTo(0.12);
    // Two 30 Hz frames cover the same 66 ms as eight 120 Hz frames, so they land in the same place.
    const two = 1 - Math.pow(1 - smoothingFactor(0.12, 1000 / 30), 2);
    const eight = 1 - Math.pow(1 - smoothingFactor(0.12, 1000 / 120), 8);
    expect(two).toBeCloseTo(eight);
    expect(two).toBeCloseTo(1 - Math.pow(0.88, 4));
    expect(smoothingFactor(0.12, 0)).toBe(0);
  });
});

describe('joystick direction', () => {
  it('maps the dominant axis to one direction and ignores the dead zone', () => {
    expect(directionFromVector(3, 2, 7)).toBeNull();
    expect(directionFromVector(20, 5, 7)).toBe('right');
    expect(directionFromVector(-20, 15, 7)).toBe('left');
    expect(directionFromVector(4, -30, 7)).toBe('up');
    expect(directionFromVector(10, 10, 7)).toBe('right');
  });
});
