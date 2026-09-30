import type { Action, Project, Quest } from '@beze/project-schema';
import { evaluateCondition } from '../dialogue/interpreter.js';
import type { GameState } from '../state/GameState.js';

/** Pure quest machine. The world scene runs the actions these events carry and shows the notifications. */

export type QuestEvent =
  | { type: 'started'; quest: Quest }
  | { type: 'advanced'; quest: Quest; stepIndex: number }
  | { type: 'completed'; quest: Quest; actions: Action[] }
  | { type: 'failed'; quest: Quest; actions: Action[] };

export type StartResult = 'started' | 'active' | 'completed' | 'missing';

/** Activates a quest at its first step. Ignored while active, and after completion unless `repeatable`. */
export function startQuest(project: Project, state: GameState, questId: string, now: number): { result: StartResult; events: QuestEvent[] } {
  const quest = project.quests[questId];
  if (!quest) return { result: 'missing', events: [] };
  if (state.activeQuests[questId]) return { result: 'active', events: [] };
  if (state.completedQuests.includes(questId) && !quest.repeatable) return { result: 'completed', events: [] };
  state.activeQuests[questId] = { stepIndex: 0, startedAt: now };
  const events: QuestEvent[] = [{ type: 'started', quest }];
  // A first step whose condition already holds completes right away.
  events.push(...settle(state, quest));
  return { result: 'started', events };
}

/** Completes the named step explicitly when it is the current one (steps complete in order). */
export function completeQuestStep(project: Project, state: GameState, questId: string, stepId: string): QuestEvent[] {
  const quest = project.quests[questId];
  const active = state.activeQuests[questId];
  if (!quest || !active) return [];
  const current = quest.steps[active.stepIndex];
  if (!current || current.id !== stepId) return [];
  const events = [advance(state, quest)];
  events.push(...settle(state, quest));
  return events;
}

/**
 * Checks every active quest: the current step's `completeWhen`, then the time limit. Cheap enough to run every
 * 250 ms or after a variable change.
 */
export function tickQuests(project: Project, state: GameState, now: number): QuestEvent[] {
  const events: QuestEvent[] = [];
  for (const questId of Object.keys(state.activeQuests)) {
    const quest = project.quests[questId];
    const active = state.activeQuests[questId];
    if (!quest || !active) { delete state.activeQuests[questId]; continue; }
    events.push(...settle(state, quest));
    if (!state.activeQuests[questId]) continue;
    if (quest.timeLimitMs !== undefined && now - active.startedAt >= quest.timeLimitMs) {
      delete state.activeQuests[questId];
      events.push({ type: 'failed', quest, actions: quest.onFail ?? [] });
    }
  }
  return events;
}

/** Milliseconds left on a timed quest, or null when it has no limit or is not active. */
export function questTimeLeft(quest: Quest, state: GameState, now: number): number | null {
  const active = state.activeQuests[quest.id];
  if (!active || quest.timeLimitMs === undefined) return null;
  return Math.max(0, quest.timeLimitMs - (now - active.startedAt));
}

/** "2:05" from milliseconds, rounded up so the display never shows 0:00 while time remains. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Text of the current step of an active quest, with its position ("2/3"). */
export function questProgress(quest: Quest, state: GameState): { stepIndex: number; stepText: string; count: number } | null {
  const active = state.activeQuests[quest.id];
  if (!active) return null;
  const step = quest.steps[Math.min(active.stepIndex, quest.steps.length - 1)];
  return { stepIndex: active.stepIndex, stepText: step?.text ?? '', count: quest.steps.length };
}

/** Advances while the current step's condition holds; completing the last step ends the quest. */
function settle(state: GameState, quest: Quest): QuestEvent[] {
  const events: QuestEvent[] = [];
  for (let guard = 0; guard < quest.steps.length + 1; guard++) {
    const active = state.activeQuests[quest.id];
    if (!active) break;
    const step = quest.steps[active.stepIndex];
    if (!step?.completeWhen || !evaluateCondition(step.completeWhen, state.variables)) break;
    events.push(advance(state, quest));
  }
  return events;
}

function advance(state: GameState, quest: Quest): QuestEvent {
  const active = state.activeQuests[quest.id]!;
  active.stepIndex++;
  if (active.stepIndex >= quest.steps.length) {
    delete state.activeQuests[quest.id];
    if (!state.completedQuests.includes(quest.id)) state.completedQuests.push(quest.id);
    return { type: 'completed', quest, actions: quest.rewards ?? [] };
  }
  return { type: 'advanced', quest, stepIndex: active.stepIndex };
}
