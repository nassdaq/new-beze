import type { Project, ProjectSettings } from '@beze/project-schema';
import { numberOf, setVariable, type GameState } from '../state/GameState.js';

/** Pure economy helpers: money formatting, levels, the day clock and property income. No Phaser. */

export type Economy = NonNullable<ProjectSettings['economy']>;

/** The in-game day starts at this hour. */
export const DAY_START_HOUR = 6;

/** "TSh 50,000"; negatives keep the sign in front of the prefix: "-TSh 250". */
export function formatMoney(amount: number, prefix: string): string {
  const whole = Math.round(Math.abs(amount));
  const digits = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${prefix}${digits}`;
}

/** "+TSh 500" / "-TSh 250" for floating deltas. */
export function formatDelta(delta: number, prefix: string): string {
  return `${delta < 0 ? '-' : '+'}${formatMoney(Math.abs(delta), prefix)}`;
}

export interface LevelInfo {
  level: number;
  /** XP into the current level. */
  into: number;
  /** XP the current level spans, or 0 at the top level. */
  span: number;
  /** 0..1 progress towards the next level; 1 at the top level. */
  progress: number;
  /** Total XP needed for the next level, or null at the top level. */
  nextAt: number | null;
}

/**
 * `thresholds[i]` is the total XP needed for level i + 2, so level = 1 + thresholds reached. Thresholds are read
 * in order; an unsorted list is sorted first so a hand-typed one still behaves.
 */
export function levelFromXp(xp: number, thresholds: readonly number[] | undefined): LevelInfo {
  const sorted = [...(thresholds ?? [])].sort((a, b) => a - b);
  let level = 1;
  let prev = 0;
  for (const t of sorted) {
    if (xp >= t) { level++; prev = t; } else break;
  }
  const next = sorted[level - 1];
  if (next === undefined) return { level, into: Math.max(0, xp - prev), span: 0, progress: 1, nextAt: null };
  const span = Math.max(1, next - prev);
  return { level, into: Math.max(0, xp - prev), span, progress: Math.min(1, Math.max(0, (xp - prev) / span)), nextAt: next };
}

export interface DayClock {
  /** 1-based day number. */
  day: number;
  hour: number;
  minute: number;
  /** "06:00" */
  text: string;
  /** 0..1 through the current day. */
  fraction: number;
}

/** Where the day clock stands after `elapsedMs` of world time, with days of `dayLengthMs` starting at 06:00. */
export function dayClock(elapsedMs: number, dayLengthMs: number): DayClock {
  const len = Math.max(1, dayLengthMs);
  const elapsed = Math.max(0, elapsedMs);
  const day = Math.floor(elapsed / len) + 1;
  const fraction = (elapsed % len) / len;
  const totalMinutes = Math.floor(fraction * 24 * 60);
  const hour = (DAY_START_HOUR + Math.floor(totalMinutes / 60)) % 24;
  const minute = totalMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { day, hour, minute, text: `${pad(hour)}:${pad(minute)}`, fraction };
}

/** Reputation as 0-5 stars ("★★★☆☆"). Fractions round to the nearest star. */
export function reputationStars(reputation: number, max = 5): string {
  const filled = Math.max(0, Math.min(max, Math.round(reputation)));
  return '★'.repeat(filled) + '☆'.repeat(max - filled);
}

export interface PropertyInfo {
  key: string;
  sceneId: string;
  entityId: string;
  name: string;
  price: number;
  incomePerDay: number;
  ownedVariableId: string;
  description?: string;
}

/** Every property component in the project, in scene/entity order. */
export function listProperties(project: Project): PropertyInfo[] {
  const out: PropertyInfo[] = [];
  for (const scene of Object.values(project.scenes)) {
    for (const id of scene.entityOrder) {
      const entity = scene.entities[id];
      if (!entity) continue;
      for (const c of entity.components) {
        if (c.type !== 'property') continue;
        const info: PropertyInfo = { key: `${scene.id}:${entity.id}`, sceneId: scene.id, entityId: entity.id, name: c.name, price: c.price, incomePerDay: c.incomePerDay, ownedVariableId: c.ownedVariableId };
        if (c.description !== undefined) info.description = c.description;
        out.push(info);
      }
    }
  }
  return out;
}

export function isOwned(state: GameState, ownedVariableId: string): boolean {
  return state.variables[ownedVariableId] === true;
}

export function ownedProperties(project: Project, state: GameState): PropertyInfo[] {
  return listProperties(project).filter((p) => isOwned(state, p.ownedVariableId));
}

/** Sum of `incomePerDay` over owned properties. */
export function dailyIncome(project: Project, state: GameState): number {
  return ownedProperties(project, state).reduce((sum, p) => sum + p.incomePerDay, 0);
}

export interface DayRollover {
  day: number;
  income: number;
}

/**
 * Advances world time by `deltaMs`. When the clock crosses into a new day, property income is paid into the money
 * variable and the rollover is returned (one per crossed day; a long stall pays each day). Without an economy the
 * clock still advances so quest timers work, but nothing is paid.
 */
export function advanceClock(project: Project, state: GameState, deltaMs: number): DayRollover[] {
  state.clock.elapsedMs += Math.max(0, deltaMs);
  const economy = project.settings.economy;
  if (!economy) return [];
  const rollovers: DayRollover[] = [];
  const nowDay = dayClock(state.clock.elapsedMs, economy.dayLengthMs).day;
  while (state.clock.day < nowDay) {
    state.clock.day++;
    const income = dailyIncome(project, state);
    if (income > 0) setVariable(state, economy.moneyVariableId, 'add', income);
    rollovers.push({ day: state.clock.day, income });
  }
  return rollovers;
}

export type PurchaseResult = { ok: true } | { ok: false; reason: 'owned' | 'poor'; short: number };

/** Buys a property when the player can afford it: deducts the price and sets the owned flag. */
export function buyProperty(state: GameState, economy: Economy, property: { price: number; ownedVariableId: string }): PurchaseResult {
  if (isOwned(state, property.ownedVariableId)) return { ok: false, reason: 'owned', short: 0 };
  const money = numberOf(state, economy.moneyVariableId);
  if (money < property.price) return { ok: false, reason: 'poor', short: property.price - money };
  setVariable(state, economy.moneyVariableId, 'add', -property.price);
  state.variables[property.ownedVariableId] = true;
  return { ok: true };
}

export type TradeResult = { ok: true } | { ok: false; reason: 'poor' | 'none' };

/** Buys one unit of `variableId` for `price`. */
export function buyItem(state: GameState, moneyVariableId: string, variableId: string, price: number): TradeResult {
  if (numberOf(state, moneyVariableId) < price) return { ok: false, reason: 'poor' };
  setVariable(state, moneyVariableId, 'add', -price);
  state.variables[variableId] = numberOf(state, variableId) + 1;
  return { ok: true };
}

/** Sells one unit of `variableId` for `price`. */
export function sellItem(state: GameState, moneyVariableId: string, variableId: string, price: number): TradeResult {
  if (numberOf(state, variableId) < 1) return { ok: false, reason: 'none' };
  state.variables[variableId] = numberOf(state, variableId) - 1;
  setVariable(state, moneyVariableId, 'add', price);
  return { ok: true };
}

/** The human label of a variable for HUD and menus. */
export function variableLabel(project: Project, variableId: string): string {
  const v = project.variables[variableId];
  return v?.label ?? v?.name ?? variableId;
}
