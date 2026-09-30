import type { Action } from '@beze/project-schema';
import { useProject } from '../store/editorStore.js';
import { ACTION_TYPE_LABELS, EDITABLE_ACTION_TYPES, actionContextOf, actionLabel, actionUnavailableReason, animationNames, defaultAction, isEditableActionType, replaceAt, spawnToTile, tileToSpawn, type EditableActionType } from './actions.js';
import { ValueInput, VariablePicker, defaultFor } from './ValueEditors.js';

const MAX_DEPTH = 2;

/**
 * Edits one action: a type select, then the fields of that type. Sequences nest (two levels deep).
 * Switching type starts from `defaultAction`; types the project cannot satisfy are disabled.
 */
export function ActionEditor({ value, onChange, depth = 0, testId }: { value: Action; onChange: (a: Action) => void; depth?: number; testId?: string }) {
  const project = useProject();
  if (!project) return null;
  const ctx = actionContextOf(project);
  const editable = isEditableActionType(value.type);
  const types = EDITABLE_ACTION_TYPES.filter((t) => t !== 'sequence' || depth < MAX_DEPTH);

  const setType = (type: string) => {
    if (!isEditableActionType(type) || type === value.type) return;
    const next = defaultAction(type, ctx);
    if (next) onChange(next);
  };

  return (
    <div className={`action-editor${depth > 0 ? ' action-nested' : ''}`} data-testid={testId}>
      <select value={value.type} onChange={(e) => setType(e.target.value)} aria-label="Action type" className="action-type">
        {!editable && <option value={value.type}>{value.type}</option>}
        {types.map((t) => {
          const reason = actionUnavailableReason(t, ctx);
          return <option key={t} value={t} disabled={reason !== null} title={reason ?? ''}>{ACTION_TYPE_LABELS[t]}{reason ? ` (${reason.toLowerCase()})` : ''}</option>;
        })}
      </select>
      <ActionBody value={value} onChange={onChange} depth={depth} />
    </div>
  );
}

function ActionBody({ value, onChange, depth }: { value: Action; onChange: (a: Action) => void; depth: number }) {
  const project = useProject()!;
  const tileSize = project.settings.tileSize;
  switch (value.type) {
    case 'startDialogue':
      return (
        <select value={value.dialogueId} onChange={(e) => onChange({ ...value, dialogueId: e.target.value })} aria-label="Dialogue">
          {Object.values(project.dialogues).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      );
    case 'changeScene': {
      const tile = spawnToTile(value.spawn, tileSize);
      const setTile = (patch: Partial<{ x: number; y: number }>) => onChange({ ...value, spawn: { ...value.spawn, ...tileToSpawn({ ...tile, ...patch }, tileSize) } });
      return (
        <>
          <select value={value.sceneId} onChange={(e) => onChange({ ...value, sceneId: e.target.value })} aria-label="Scene">
            {Object.values(project.scenes).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="field-inline"><span className="muted small">tile</span>
            <input type="number" className="num" value={tile.x} onChange={(e) => setTile({ x: Number(e.target.value) || 0 })} aria-label="Spawn tile X" />
            <input type="number" className="num" value={tile.y} onChange={(e) => setTile({ y: Number(e.target.value) || 0 })} aria-label="Spawn tile Y" />
          </label>
          <select value={value.spawn.facing ?? ''} onChange={(e) => { const { facing: _f, ...spawn } = value.spawn; onChange({ ...value, spawn: e.target.value ? { ...spawn, facing: e.target.value as 'down' | 'left' | 'right' | 'up' } : spawn }); }} aria-label="Facing">
            <option value="">(keep facing)</option>
            {(['down', 'left', 'right', 'up'] as const).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </>
      );
    }
    case 'setVariable': {
      const type = project.variables[value.variableId]?.type ?? 'boolean';
      return (
        <>
          <VariablePicker value={value.variableId} onChange={(id) => { const t = project.variables[id]?.type ?? 'boolean'; onChange({ ...value, variableId: id, op: t === 'number' ? value.op : 'set', value: defaultFor(t) }); }} />
          <select value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as 'set' | 'add' })} aria-label="Operator">
            <option value="set">=</option>
            {type === 'number' && <option value="add">+=</option>}
          </select>
          <ValueInput type={type} value={value.value} onChange={(v) => onChange({ ...value, value: v })} />
        </>
      );
    }
    case 'notify':
      return (
        <>
          <input value={value.text} maxLength={200} placeholder="Message" onChange={(e) => onChange({ ...value, text: e.target.value })} aria-label="Message" className="grow" />
          <select value={value.kind ?? 'info'} onChange={(e) => { const { kind: _k, ...rest } = value; onChange(e.target.value === 'info' ? rest : { ...rest, kind: e.target.value as 'reward' | 'warning' }); }} aria-label="Message kind">
            <option value="info">info</option><option value="reward">reward</option><option value="warning">warning</option>
          </select>
        </>
      );
    case 'playAnimation': {
      const names = animationNames(project);
      return (
        <>
          <input value={value.animation} maxLength={40} list="beze-animation-names" placeholder="celebrate" onChange={(e) => onChange({ ...value, animation: e.target.value || 'celebrate' })} aria-label="Animation name" />
          <datalist id="beze-animation-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          <label className="field-inline"><span className="muted small">ms</span>
            <input type="number" className="num" min={0} max={10000} value={value.durationMs ?? ''} placeholder="auto" onChange={(e) => { const { durationMs: _d, ...rest } = value; const n = Math.round(Number(e.target.value)); onChange(n > 0 ? { ...rest, durationMs: Math.min(10000, n) } : rest); }} aria-label="Duration (ms)" />
          </label>
        </>
      );
    }
    case 'startQuest':
      return (
        <select value={value.questId} onChange={(e) => onChange({ ...value, questId: e.target.value })} aria-label="Quest">
          {Object.values(project.quests).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </select>
      );
    case 'sequence':
      return (
        <div className="action-sequence">
          {value.actions.map((a, i) => (
            <div key={i} className="action-step">
              <ActionEditor value={a} onChange={(next) => onChange({ ...value, actions: replaceAt(value.actions, i, next) })} depth={depth + 1} />
              <button type="button" className="small" title="Remove step" onClick={() => onChange({ ...value, actions: replaceAt(value.actions, i, null) })}>×</button>
            </div>
          ))}
          {value.actions.length < 50 && <button type="button" className="small" onClick={() => onChange({ ...value, actions: [...value.actions, { type: 'notify', text: 'Hello!' }] })}>+ Step</button>}
        </div>
      );
    default:
      return <span className="muted small">{actionLabel(value, project)}</span>;
  }
}

/** A list of actions (quest rewards, onFail): one ActionEditor per item with add/remove. */
export function ActionListEditor({ value, onChange, addLabel = '+ Action', max = 20, testId }: { value: readonly Action[]; onChange: (list: Action[]) => void; addLabel?: string; max?: number; testId?: string }) {
  const project = useProject();
  if (!project) return null;
  const ctx = actionContextOf(project);
  const initial: Action = defaultAction('setVariable', ctx) ?? { type: 'notify', text: 'Well done!' };
  return (
    <div className="action-list" data-testid={testId}>
      {value.map((a, i) => (
        <div key={i} className="action-step">
          <ActionEditor value={a} onChange={(next) => onChange(replaceAt(value, i, next))} />
          <button type="button" className="small" title="Remove" onClick={() => onChange(replaceAt(value, i, null))}>×</button>
        </div>
      ))}
      {value.length < max && <button type="button" className="small" onClick={() => onChange([...value, initial])}>{addLabel}</button>}
    </div>
  );
}

export type { EditableActionType };
