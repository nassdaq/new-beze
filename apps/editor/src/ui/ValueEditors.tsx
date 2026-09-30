import type { Condition, GameVariable, Scalar } from '@beze/project-schema';
import { useProject } from '../store/editorStore.js';

export type VariableType = GameVariable['type'];

/** The "true-ish" default a fresh condition or set node starts with. */
export function defaultFor(type: VariableType): Scalar {
  return type === 'boolean' ? true : type === 'number' ? 0 : '';
}

export const OP_LABELS: Record<Condition['op'], string> = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' };

/**
 * Picks a project variable. `filter` narrows the list (e.g. number variables for money);
 * `allowNone` adds an empty option. Variables show their label when they have one.
 */
export function VariablePicker({ value, onChange, filter, allowNone, noneLabel = '(none)', testId }: {
  value: string;
  onChange: (id: string) => void;
  filter?: (v: GameVariable) => boolean;
  allowNone?: boolean;
  noneLabel?: string;
  testId?: string;
}) {
  const project = useProject();
  const variables = Object.values(project?.variables ?? {}).filter(filter ?? (() => true));
  // Keep an id that the filter would hide (or that no longer exists) visible so the select is never blank.
  const stray = value && !variables.some((v) => v.id === value) ? value : '';
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
      {allowNone && <option value="">{noneLabel}</option>}
      {stray && <option value={stray}>{project?.variables[stray]?.name ?? stray}</option>}
      {variables.map((v) => <option key={v.id} value={v.id}>{v.label ? `${v.label} (${v.name})` : v.name}</option>)}
    </select>
  );
}

export function ValueInput({ type, value, onChange }: { type: VariableType; value: Scalar; onChange: (v: Scalar) => void }) {
  if (type === 'boolean') return <select value={String(value)} onChange={(e) => onChange(e.target.value === 'true')}><option value="true">true</option><option value="false">false</option></select>;
  if (type === 'number') return <input type="number" value={typeof value === 'number' ? value : 0} onChange={(e) => onChange(Number(e.target.value) || 0)} />;
  return <input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
}

/** variable · operator · value. Changing the variable resets the value to that type's default. */
export function ConditionEditor({ value, onChange }: { value: Condition; onChange: (c: Condition) => void }) {
  const project = useProject();
  const typeOf = (id: string): VariableType => project?.variables[id]?.type ?? 'boolean';
  return (
    <>
      <VariablePicker value={value.variableId} onChange={(id) => onChange({ ...value, variableId: id, value: defaultFor(typeOf(id)) })} />
      <select value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as Condition['op'] })}>
        {(Object.keys(OP_LABELS) as Condition['op'][]).map((op) => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
      </select>
      <ValueInput type={typeOf(value.variableId)} value={value.value} onChange={(v) => onChange({ ...value, value: v })} />
    </>
  );
}
