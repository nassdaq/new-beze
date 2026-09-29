import type { GameVariable } from '@beze/project-schema';
import { useEditor, useProject } from '../../store/editorStore.js';
import { Field, Section } from '../../ui/Field.js';
import { toast } from '../../ui/Toast.js';

export function VariableInspector({ variableId }: { variableId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const select = useEditor((s) => s.select);
  const v = project?.variables[variableId];
  if (!project || !v) return null;

  const run = (label: string, ops: Parameters<typeof dispatch>[1]) => {
    const r = dispatch(label, ops);
    if (!r.ok) toast.error('Change rejected', r.errors.map((e) => e.message));
  };
  const setType = (type: GameVariable['type']) => {
    const initial = type === 'boolean' ? false : type === 'number' ? 0 : '';
    run('Variable type', [{ op: 'updateVariable', id: v.id, patch: { type, initial } }]);
  };
  const setInitial = (raw: string) => {
    const initial = v.type === 'boolean' ? raw === 'true' : v.type === 'number' ? Number(raw) || 0 : raw;
    run('Initial value', [{ op: 'updateVariable', id: v.id, patch: { initial } }]);
  };

  return (
    <Section title="Variable" actions={<button className="danger small" onClick={() => { run('Delete variable', [{ op: 'deleteVariable', id: v.id }]); select({ kind: 'none' }); }}>Delete</button>}>
      <Field label="Name"><input value={v.name} onChange={(e) => run('Rename variable', [{ op: 'updateVariable', id: v.id, patch: { name: e.target.value.replace(/[^A-Za-z0-9_]/g, '') || v.name } }])} /></Field>
      <Field label="Type">
        <select value={v.type} onChange={(e) => setType(e.target.value as GameVariable['type'])}>
          <option value="boolean">boolean</option><option value="number">number</option><option value="string">string</option>
        </select>
      </Field>
      <Field label="Initial value">
        {v.type === 'boolean'
          ? <select value={String(v.initial)} onChange={(e) => setInitial(e.target.value)}><option value="false">false</option><option value="true">true</option></select>
          : <input type={v.type === 'number' ? 'number' : 'text'} value={String(v.initial)} onChange={(e) => setInitial(e.target.value)} />}
      </Field>
    </Section>
  );
}
