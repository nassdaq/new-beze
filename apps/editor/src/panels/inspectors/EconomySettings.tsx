import { useEffect, useState } from 'react';
import type { GameVariable, Operation } from '@beze/project-schema';
import { newId } from '@beze/project-core';
import { useEditor, useProject } from '../../store/editorStore.js';
import { Field } from '../../ui/Field.js';
import { defaultEconomy, formatThresholds, isNumberVariable, parseThresholds, secondsToDayLength, type Economy } from '../../ui/economy.js';
import { VariablePicker } from '../../ui/ValueEditors.js';
import { pickVariable, uniqueVariableName } from '../../ui/variables.js';
import { toast } from '../../ui/Toast.js';

/** Project-level economy: money/XP/reputation variables, currency, day length and level curve. */
export function EconomySettings() {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  if (!project) return null;
  const eco = project.settings.economy;

  const run = (label: string, ops: Operation[]) => {
    const r = dispatch(label, ops);
    if (!r.ok) toast.error('Change rejected', r.errors.map((e) => e.message));
  };
  const patch = (label: string, next: Partial<Economy>) => {
    if (!eco) return;
    const merged = { ...eco, ...next };
    for (const k of Object.keys(merged) as Array<keyof Economy>) if (merged[k] === undefined) delete merged[k];
    run(label, [{ op: 'updateSettings', patch: { economy: merged } }]);
  };

  const enable = () => {
    const ops: Operation[] = [];
    let money = pickVariable(project.variables, 'number', /money|cash|tsh/i);
    let xp = pickVariable(project.variables, 'number', /^xp$|experience/i);
    if (!money) {
      const variable: GameVariable = { id: newId('var'), name: uniqueVariableName(project.variables, 'money'), type: 'number', initial: 50000, label: 'Money', category: 'stat' };
      ops.push({ op: 'createVariable', variable });
      money = variable;
    }
    if (!xp || xp.id === money.id) {
      const variable: GameVariable = { id: newId('var'), name: uniqueVariableName(project.variables, 'xp'), type: 'number', initial: 0, label: 'XP', category: 'stat' };
      ops.push({ op: 'createVariable', variable });
      xp = variable;
    }
    ops.push({ op: 'updateSettings', patch: { economy: defaultEconomy(money.id, xp.id) } });
    run('Enable economy', ops);
  };

  return (
    <>
      <label className="check"><input type="checkbox" checked={!!eco} data-testid="economy-enabled" onChange={(e) => (e.target.checked ? enable() : run('Disable economy', [{ op: 'updateSettings', patch: { economy: undefined } }]))} /> Economy (money, XP, day clock, HUD)</label>
      {eco && (
        <div className="economy" data-testid="economy-settings">
          <Field label="Money variable"><VariablePicker value={eco.moneyVariableId} filter={isNumberVariable} testId="economy-money" onChange={(id) => id && patch('Money variable', { moneyVariableId: id })} /></Field>
          <Field label="XP variable"><VariablePicker value={eco.xpVariableId ?? ''} filter={isNumberVariable} allowNone noneLabel="(no XP)" onChange={(id) => patch('XP variable', { xpVariableId: id || undefined })} /></Field>
          <Field label="Reputation variable"><VariablePicker value={eco.reputationVariableId ?? ''} filter={isNumberVariable} allowNone noneLabel="(no reputation)" onChange={(id) => patch('Reputation variable', { reputationVariableId: id || undefined })} /></Field>
          <div className="field-row">
            <Field label="Currency prefix"><input value={eco.currencyPrefix} maxLength={12} placeholder="TSh " data-testid="economy-currency" onChange={(e) => patch('Currency', { currencyPrefix: e.target.value })} /></Field>
            <Field label="Day length (s)"><input type="number" min={5} max={3600} value={Math.round(eco.dayLengthMs / 1000)} data-testid="economy-day-length" onChange={(e) => patch('Day length', { dayLengthMs: secondsToDayLength(Number(e.target.value)) })} /></Field>
          </div>
          <Field label="Level thresholds (XP for level 2, 3, …)">
            <CommitInput value={formatThresholds(eco.levelThresholds)} placeholder="100, 300, 600" testId="economy-levels" onCommit={(text) => { const levels = parseThresholds(text); patch('Level thresholds', { levelThresholds: levels.length ? levels : undefined }); }} />
          </Field>
          <p className="muted small">Money is shown as "{eco.currencyPrefix}50,000". Owned properties pay their income once per day.</p>
        </div>
      )}
    </>
  );
}

/** Free-text input that commits on blur or Enter, so a half-typed list is never reformatted underneath the cursor. */
function CommitInput({ value, onCommit, placeholder, testId }: { value: string; onCommit: (text: string) => void; placeholder?: string; testId?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  const commit = () => { if (text !== value) onCommit(text); };
  return <input value={text} placeholder={placeholder} data-testid={testId} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />;
}
