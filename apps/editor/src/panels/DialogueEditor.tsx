import type { Condition, Dialogue, DialogueNode, Scalar } from '@beze/project-schema';
import { newId } from '@beze/project-core';
import { useEditor, useProject } from '../store/editorStore.js';
import { toast } from '../ui/Toast.js';

/**
 * List editor: nodes in flow order from the start node. Covers linear conversations, choices,
 * variable sets and branches without a graph canvas.
 */
export function DialogueEditor({ dialogueId }: { dialogueId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const d = project?.dialogues[dialogueId];
  if (!project || !d) return null;

  const run = (label: string, ops: Parameters<typeof dispatch>[1]) => {
    const r = dispatch(label, ops);
    if (!r.ok) toast.error('Change rejected', r.errors.map((e) => e.message));
  };
  const setNode = (node: DialogueNode) => run('Edit dialogue', [{ op: 'setDialogueNode', dialogueId: d.id, node }]);

  const ordered = flowOrder(d);
  const nodeOptions = (
    <>
      <option value="">(end)</option>
      {ordered.map((n) => <option key={n.id} value={n.id}>{label(n)}</option>)}
    </>
  );

  /** Appends a node after the last node that leads to (end)/nothing, or after the last node. */
  const append = (make: (id: string) => DialogueNode) => {
    const id = newId('nod');
    const node = make(id);
    const tail = [...ordered].reverse().find((n) => (n.type === 'line' || n.type === 'set' || n.type === 'action') && n.next === null);
    const ops: Parameters<typeof dispatch>[1] = [{ op: 'setDialogueNode', dialogueId: d.id, node }];
    if (tail && (tail.type === 'line' || tail.type === 'set' || tail.type === 'action')) ops.push({ op: 'setDialogueNode', dialogueId: d.id, node: { ...tail, next: id } });
    else {
      const endNode = ordered.find((n) => n.type === 'end');
      const pointsToEnd = endNode ? ordered.find((n) => (n.type === 'line' || n.type === 'set' || n.type === 'action') && n.next === endNode.id) : undefined;
      if (pointsToEnd && (pointsToEnd.type === 'line' || pointsToEnd.type === 'set' || pointsToEnd.type === 'action')) {
        ops.push({ op: 'setDialogueNode', dialogueId: d.id, node: { ...pointsToEnd, next: id } });
        if (node.type !== 'end' && 'next' in node && node.next === null && endNode) ops[0] = { op: 'setDialogueNode', dialogueId: d.id, node: { ...node, next: endNode.id } as DialogueNode };
      }
    }
    run('Add node', ops);
  };

  const remove = (n: DialogueNode) => {
    if (n.id === d.startNodeId) { toast.error('The first node cannot be removed'); return; }
    const ops: Parameters<typeof dispatch>[1] = [];
    const successor = 'next' in n ? n.next : null;
    for (const other of Object.values(d.nodes)) {
      if (other.id === n.id) continue;
      const patched = relink(other, n.id, successor);
      if (patched !== other) ops.push({ op: 'setDialogueNode', dialogueId: d.id, node: patched });
    }
    ops.push({ op: 'deleteDialogueNode', dialogueId: d.id, nodeId: n.id });
    run('Remove node', ops);
  };

  const variables = Object.values(project.variables);
  const firstVar = variables[0];

  return (
    <div className="dialogue-editor" data-testid="dialogue-editor">
      <div className="dialogue-toolbar">
        <strong>{d.name}</strong>
        <span className="spacer" />
        <button className="small" onClick={() => append((id) => ({ id, type: 'line', speaker: lastSpeaker(ordered), text: '…', next: null }))} data-testid="add-line">+ Line</button>
        <button className="small" onClick={() => append((id) => ({ id, type: 'choice', prompt: '', options: [{ text: 'Yes', next: null }, { text: 'No', next: null }] }))} data-testid="add-choice">+ Choice</button>
        <button className="small" disabled={!firstVar} title={firstVar ? '' : 'Create a variable first'} onClick={() => firstVar && append((id) => ({ id, type: 'set', variableId: firstVar.id, op: 'set', value: defaultFor(firstVar.type), next: null }))} data-testid="add-set">+ Set variable</button>
        <button className="small" disabled={!firstVar} title={firstVar ? '' : 'Create a variable first'} onClick={() => firstVar && append((id) => ({ id, type: 'branch', condition: { variableId: firstVar.id, op: 'eq', value: defaultFor(firstVar.type) }, ifTrue: null, ifFalse: null }))}>+ Branch</button>
      </div>
      <ol className="nodes">
        {ordered.map((n, i) => (
          <li key={n.id} className={`node node-${n.type}`} data-testid={`node-${n.type}`}>
            <div className="node-head">
              <span className="node-index">{i + 1}</span>
              <span className="node-type">{n.type}</span>
              {n.id === d.startNodeId && <span className="muted small">start</span>}
              <span className="spacer" />
              {n.type !== 'end' && n.id !== d.startNodeId && <button className="small danger" onClick={() => remove(n)} title="Remove node">×</button>}
            </div>
            {n.type === 'line' && (
              <div className="node-body">
                <input className="speaker" placeholder="Speaker" value={n.speaker ?? ''} onChange={(e) => setNode({ ...n, speaker: e.target.value })} />
                <textarea rows={2} value={n.text} data-testid="line-text" onChange={(e) => setNode({ ...n, text: e.target.value })} />
                <label className="field-inline"><span className="muted small">then</span><select value={n.next ?? ''} onChange={(e) => setNode({ ...n, next: e.target.value || null })}>{nodeOptions}</select></label>
                <label className="field-inline"><span className="muted small">portrait</span>
                  <select value={n.portraitAssetId ?? ''} onChange={(e) => { const { portraitAssetId: _drop, ...rest } = n; setNode(e.target.value ? { ...rest, portraitAssetId: e.target.value } : rest); }}>
                    <option value="">(none)</option>
                    {Object.values(project.assets).filter((a) => a.kind === 'image' && a.name.toLowerCase().includes('portrait')).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </div>
            )}
            {n.type === 'choice' && (
              <div className="node-body">
                <input placeholder="Prompt (optional)" value={n.prompt ?? ''} onChange={(e) => setNode({ ...n, prompt: e.target.value })} />
                {n.options.map((o, oi) => (
                  <div key={oi} className="option">
                    <input value={o.text} data-testid="option-text" onChange={(e) => setNode({ ...n, options: n.options.map((x, j) => (j === oi ? { ...x, text: e.target.value } : x)) })} />
                    <select value={o.next ?? ''} data-testid="option-next" onChange={(e) => setNode({ ...n, options: n.options.map((x, j) => (j === oi ? { ...x, next: e.target.value || null } : x)) })}>{nodeOptions}</select>
                    {n.options.length > 1 && <button className="small" onClick={() => setNode({ ...n, options: n.options.filter((_, j) => j !== oi) })}>×</button>}
                  </div>
                ))}
                {n.options.length < 6 && <button className="small" onClick={() => setNode({ ...n, options: [...n.options, { text: 'Option', next: null }] })}>+ Option</button>}
              </div>
            )}
            {n.type === 'set' && (
              <div className="node-body row">
                <VariablePicker value={n.variableId} onChange={(id) => setNode({ ...n, variableId: id, value: defaultFor(project.variables[id]?.type ?? 'boolean') })} />
                <select value={n.op} onChange={(e) => setNode({ ...n, op: e.target.value as 'set' | 'add' })}><option value="set">=</option><option value="add">+=</option></select>
                <ValueInput type={project.variables[n.variableId]?.type ?? 'boolean'} value={n.value} onChange={(value) => setNode({ ...n, value })} />
                <label className="field-inline"><span className="muted small">then</span><select value={n.next ?? ''} onChange={(e) => setNode({ ...n, next: e.target.value || null })}>{nodeOptions}</select></label>
              </div>
            )}
            {n.type === 'branch' && (
              <div className="node-body row">
                <span className="muted small">if</span>
                <ConditionEditor value={n.condition} onChange={(condition) => setNode({ ...n, condition })} />
                <label className="field-inline"><span className="muted small">then</span><select value={n.ifTrue ?? ''} onChange={(e) => setNode({ ...n, ifTrue: e.target.value || null })}>{nodeOptions}</select></label>
                <label className="field-inline"><span className="muted small">else</span><select value={n.ifFalse ?? ''} onChange={(e) => setNode({ ...n, ifFalse: e.target.value || null })}>{nodeOptions}</select></label>
              </div>
            )}
            {n.type === 'action' && <div className="node-body muted small">action: {n.action.type}</div>}
          </li>
        ))}
      </ol>
    </div>
  );

  function VariablePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {variables.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
    );
  }

  function ConditionEditor({ value, onChange }: { value: Condition; onChange: (c: Condition) => void }) {
    const type = project!.variables[value.variableId]?.type ?? 'boolean';
    return (
      <>
        <VariablePicker value={value.variableId} onChange={(id) => onChange({ ...value, variableId: id, value: defaultFor(project!.variables[id]?.type ?? 'boolean') })} />
        <select value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as Condition['op'] })}>
          {(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const).map((op) => <option key={op} value={op}>{{ eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' }[op]}</option>)}
        </select>
        <ValueInput type={type} value={value.value} onChange={(v) => onChange({ ...value, value: v })} />
      </>
    );
  }
}

function ValueInput({ type, value, onChange }: { type: 'boolean' | 'number' | 'string'; value: Scalar; onChange: (v: Scalar) => void }) {
  if (type === 'boolean') return <select value={String(value)} onChange={(e) => onChange(e.target.value === 'true')}><option value="true">true</option><option value="false">false</option></select>;
  if (type === 'number') return <input type="number" value={typeof value === 'number' ? value : 0} onChange={(e) => onChange(Number(e.target.value) || 0)} />;
  return <input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
}

function defaultFor(type: 'boolean' | 'number' | 'string'): Scalar {
  return type === 'boolean' ? true : type === 'number' ? 0 : '';
}

function lastSpeaker(nodes: DialogueNode[]): string {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    if (n.type === 'line' && n.speaker) return n.speaker;
  }
  return '';
}

function label(n: DialogueNode): string {
  switch (n.type) {
    case 'line': return `${n.speaker ? n.speaker + ': ' : ''}${n.text.slice(0, 30)}`;
    case 'choice': return `choice (${n.options.length})`;
    case 'set': return 'set variable';
    case 'branch': return 'branch';
    case 'action': return `action ${n.action.type}`;
    case 'end': return 'end';
  }
}

/** Breadth-first from the start node, then any unreachable nodes, so every node is editable. */
export function flowOrder(d: Dialogue): DialogueNode[] {
  const out: DialogueNode[] = [];
  const seen = new Set<string>();
  const queue = [d.startNodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const n = d.nodes[id];
    if (!n || seen.has(id)) continue;
    seen.add(id);
    out.push(n);
    for (const next of successors(n)) if (next && !seen.has(next)) queue.push(next);
  }
  for (const n of Object.values(d.nodes)) if (!seen.has(n.id)) out.push(n);
  // Keep the end node last for readability.
  return [...out.filter((n) => n.type !== 'end'), ...out.filter((n) => n.type === 'end')];
}

function successors(n: DialogueNode): Array<string | null> {
  switch (n.type) {
    case 'line': case 'set': case 'action': return [n.next];
    case 'choice': return n.options.map((o) => o.next);
    case 'branch': return [n.ifTrue, n.ifFalse];
    case 'end': return [];
  }
}

/** Returns `n` with every reference to `removed` pointing at `replacement`, or `n` itself when unchanged. */
function relink(n: DialogueNode, removed: string, replacement: string | null): DialogueNode {
  const r = (x: string | null) => (x === removed ? replacement : x);
  switch (n.type) {
    case 'line': case 'set': case 'action': return n.next === removed ? { ...n, next: replacement } : n;
    case 'choice': return n.options.some((o) => o.next === removed) ? { ...n, options: n.options.map((o) => ({ ...o, next: r(o.next) })) } : n;
    case 'branch': return n.ifTrue === removed || n.ifFalse === removed ? { ...n, ifTrue: r(n.ifTrue), ifFalse: r(n.ifFalse) } : n;
    case 'end': return n;
  }
}
