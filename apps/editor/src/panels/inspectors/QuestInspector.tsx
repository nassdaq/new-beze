import type { Quest } from '@beze/project-schema';
import { newId } from '@beze/project-core';
import { useEditor, useProject } from '../../store/editorStore.js';
import { ActionListEditor } from '../../ui/ActionEditor.js';
import { defaultCondition, replaceAt } from '../../ui/actions.js';
import { Field, Section } from '../../ui/Field.js';
import { ConditionEditor } from '../../ui/ValueEditors.js';
import { toast } from '../../ui/Toast.js';

/** Step ids share the id grammar (three letters, underscore, random tail). */
export const newStepId = (): string => `stp_${newId('qst').slice(4)}`;

export function newQuest(index: number): Quest {
  return { id: newId('qst'), name: `Quest ${index}`, description: '', steps: [{ id: newStepId(), text: 'Do something' }] };
}

export function QuestInspector({ questId }: { questId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const select = useEditor((s) => s.select);
  const q = project?.quests[questId];
  if (!project || !q) return null;

  const run = (label: string, patch: Partial<Omit<Quest, 'id'>>) => {
    const r = dispatch(label, [{ op: 'updateQuest', id: q.id, patch }]);
    if (!r.ok) toast.error('Change rejected', r.errors.map((e) => e.message));
  };
  const remove = () => {
    const r = dispatch('Delete quest', [{ op: 'deleteQuest', id: q.id }]);
    if (r.ok) select({ kind: 'none' });
    else toast.error('Cannot delete: it is still used', r.errors.map((e) => e.message));
  };
  const firstVar = Object.values(project.variables)[0];
  const starters = Object.values(project.scenes).flatMap((s) => Object.values(s.entities).filter((e) => e.components.some((c) => (c.type === 'interactable' && mentionsQuest(c.action, q.id)) || (c.type === 'trigger' && mentionsQuest(c.onEnter, q.id)))).map((e) => `${e.name} (${s.name})`));

  return (
    <Section title="Quest" actions={<button className="danger small" onClick={remove}>Delete</button>}>
      <Field label="Name"><input value={q.name} data-testid="quest-name" onChange={(e) => run('Rename quest', { name: e.target.value || q.name })} /></Field>
      <Field label="Description"><textarea rows={2} value={q.description} data-testid="quest-description" onChange={(e) => run('Quest description', { description: e.target.value })} /></Field>
      <label className="check"><input type="checkbox" checked={q.repeatable ?? false} onChange={(e) => run('Quest repeatable', { repeatable: e.target.checked || undefined })} /> Repeatable (can be started again after completion)</label>
      <Field label="Time limit (seconds, 0 = none)">
        <input type="number" min={0} max={3600} value={q.timeLimitMs ? Math.round(q.timeLimitMs / 1000) : 0} data-testid="quest-time-limit" onChange={(e) => { const sec = Math.max(0, Math.min(3600, Math.round(Number(e.target.value) || 0))); run('Quest time limit', { timeLimitMs: sec > 0 ? sec * 1000 : undefined }); }} />
      </Field>

      <h4 className="subhead">Steps (complete in order)</h4>
      <ol className="quest-steps" data-testid="quest-steps">
        {q.steps.map((step, i) => (
          <li key={step.id} className="quest-step">
            <div className="quest-step-head">
              <span className="node-index">{i + 1}</span>
              <input value={step.text} className="grow" placeholder="What the player must do" onChange={(e) => run('Quest step', { steps: replaceAt(q.steps, i, { ...step, text: e.target.value }) })} />
              {q.steps.length > 1 && <button type="button" className="small danger" title="Remove step" onClick={() => run('Remove step', { steps: replaceAt(q.steps, i, null) })}>×</button>}
            </div>
            <div className="quest-step-when">
              <label className="check" title={firstVar ? '' : 'Create a variable first'}>
                <input type="checkbox" checked={!!step.completeWhen} disabled={!firstVar && !step.completeWhen} onChange={(e) => { const { completeWhen: _c, ...rest } = step; run('Step condition', { steps: replaceAt(q.steps, i, e.target.checked && firstVar ? { ...rest, completeWhen: defaultCondition(firstVar) } : rest) }); }} />
                Completes when
              </label>
              {step.completeWhen && <div className="node-body row"><ConditionEditor value={step.completeWhen} onChange={(completeWhen) => run('Step condition', { steps: replaceAt(q.steps, i, { ...step, completeWhen }) })} /></div>}
              {!step.completeWhen && <span className="muted small">(a "complete quest step" action)</span>}
            </div>
          </li>
        ))}
      </ol>
      {q.steps.length < 50 && <button type="button" className="small" data-testid="quest-add-step" onClick={() => run('Add step', { steps: [...q.steps, { id: newStepId(), text: 'Next step' }] })}>+ Step</button>}

      <h4 className="subhead">Rewards (when the last step completes)</h4>
      <ActionListEditor value={q.rewards ?? []} onChange={(rewards) => run('Quest rewards', { rewards: rewards.length ? rewards : undefined })} addLabel="+ Reward" testId="quest-rewards" />

      <h4 className="subhead">On fail (time limit expires)</h4>
      <ActionListEditor value={q.onFail ?? []} onChange={(onFail) => run('Quest on fail', { onFail: onFail.length ? onFail : undefined })} addLabel="+ Action" testId="quest-on-fail" />

      <p className="muted small">{starters.length > 0 ? `Started by: ${starters.join(', ')}` : 'Nothing starts this quest yet: add a "Start quest" action to an NPC or trigger.'}</p>
    </Section>
  );
}

function mentionsQuest(action: { type: string; questId?: string; actions?: unknown[] }, questId: string): boolean {
  if (action.type === 'startQuest' && action.questId === questId) return true;
  if (action.type === 'sequence' && Array.isArray(action.actions)) return action.actions.some((a) => mentionsQuest(a as { type: string }, questId));
  return false;
}
