import { describe, expect, it } from 'vitest';
import { completeQuestStep, formatCountdown, questProgress, questTimeLeft, startQuest, tickQuests } from '../src/systems/quests.js';
import { initGameState } from '../src/state/GameState.js';
import { cityProject } from './fixtures/city.js';

const project = cityProject();

describe('quest step advancing', () => {
  it('starts a quest at its first step and refuses to start it twice', () => {
    const state = initGameState(project);
    const r = startQuest(project, state, 'qst_first', 0);
    expect(r.result).toBe('started');
    expect(r.events.map((e) => e.type)).toEqual(['started']);
    expect(state.activeQuests['qst_first']).toEqual({ stepIndex: 0, startedAt: 0 });
    expect(startQuest(project, state, 'qst_first', 5).result).toBe('active');
    expect(startQuest(project, state, 'qst_missing', 5).result).toBe('missing');
    expect(questProgress(project.quests['qst_first']!, state)).toEqual({ stepIndex: 0, stepText: 'Find the coins on the road', count: 2 });
  });

  it('advances when the current step condition holds, then completes with rewards', () => {
    const state = initGameState(project);
    startQuest(project, state, 'qst_first', 0);
    expect(tickQuests(project, state, 100)).toEqual([]);
    state.variables['var_money'] = 50500;
    const advanced = tickQuests(project, state, 200);
    expect(advanced).toMatchObject([{ type: 'advanced', stepIndex: 1 }]);
    expect(state.activeQuests['qst_first']?.stepIndex).toBe(1);
    // Steps complete in order: the kiosk flag alone does not skip ahead before the coins.
    state.variables['var_own_kiosk'] = true;
    const done = tickQuests(project, state, 300);
    expect(done).toMatchObject([{ type: 'completed' }]);
    expect(done[0]?.type === 'completed' && done[0].actions).toHaveLength(2);
    expect(state.activeQuests['qst_first']).toBeUndefined();
    expect(state.completedQuests).toEqual(['qst_first']);
    expect(startQuest(project, state, 'qst_first', 400).result).toBe('completed');
  });

  it('runs through several steps in one tick when their conditions already hold', () => {
    const state = initGameState(project);
    state.variables['var_money'] = 60000;
    state.variables['var_own_kiosk'] = true;
    const r = startQuest(project, state, 'qst_first', 0);
    expect(r.events.map((e) => e.type)).toEqual(['started', 'advanced', 'completed']);
  });

  it('completes explicit steps only through completeQuestStep and only for the current step', () => {
    const state = initGameState(project);
    startQuest(project, state, 'qst_timed', 0);
    expect(tickQuests(project, state, 500)).toEqual([]);
    expect(completeQuestStep(project, state, 'qst_timed', 'stp_wrong')).toEqual([]);
    expect(completeQuestStep(project, state, 'qst_timed', 'stp_deliver')).toMatchObject([{ type: 'completed' }]);
    expect(completeQuestStep(project, state, 'qst_timed', 'stp_deliver')).toEqual([]);
  });

  it('fails a timed quest on expiry and runs onFail; repeatable quests can start again', () => {
    const state = initGameState(project);
    startQuest(project, state, 'qst_timed', 1000);
    const quest = project.quests['qst_timed']!;
    expect(questTimeLeft(quest, state, 4000)).toBe(7000);
    expect(tickQuests(project, state, 10999)).toEqual([]);
    const failed = tickQuests(project, state, 11000);
    expect(failed).toMatchObject([{ type: 'failed' }]);
    expect(failed[0]?.type === 'failed' && failed[0].actions).toMatchObject([{ type: 'setVariable', variableId: 'var_rep' }]);
    expect(state.activeQuests['qst_timed']).toBeUndefined();
    expect(state.completedQuests).toEqual([]);
    expect(questTimeLeft(quest, state, 12000)).toBeNull();
    expect(startQuest(project, state, 'qst_timed', 12000).result).toBe('started');
    completeQuestStep(project, state, 'qst_timed', 'stp_deliver');
    expect(startQuest(project, state, 'qst_timed', 13000).result).toBe('started');
    expect(state.completedQuests).toEqual(['qst_timed']);
  });

  it('formats the countdown rounding up', () => {
    expect(formatCountdown(125000)).toBe('2:05');
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(60000)).toBe('1:00');
  });
});
