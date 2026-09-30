import { useRef, useState } from 'react';
import type { Operation, Project } from '@beze/project-schema';
import { applyOperations, type OperationError } from '@beze/project-core';
import { useEditor } from '../store/editorStore.js';
import { requestGeneration, waitForGeneration, type GenerationOutput } from '../api/client.js';
import { Section } from '../ui/Field.js';
import { toast } from '../ui/Toast.js';

type State =
  | { kind: 'idle' }
  | { kind: 'running'; prompt: string }
  | { kind: 'proposal'; prompt: string; output: GenerationOutput; lines: string[] }
  | { kind: 'rejected'; prompt: string; output: GenerationOutput; errors: OperationError[] }
  | { kind: 'error'; prompt: string; message: string };

/**
 * "Ask": a prompt becomes a batch of operations. The batch is previewed, then applied as one
 * undoable transaction. AI output never touches the document without passing applyOperations.
 */
export function AskPanel() {
  const project = useEditor((s) => s.project);
  const dispatch = useEditor((s) => s.dispatch);
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  if (!project) return null;

  const run = async (text: string, feedback?: string) => {
    const current = useEditor.getState().project;
    if (!current) return;
    abort.current?.abort();
    abort.current = new AbortController();
    setState({ kind: 'running', prompt: text });
    try {
      const jobId = await requestGeneration({ prompt: text, project: current, ...(feedback ? { feedback } : {}) });
      const status = await waitForGeneration(jobId, abort.current.signal);
      if (status.status === 'failed' || !status.output) {
        setState({ kind: 'error', prompt: text, message: status.error ?? 'generation failed' });
        return;
      }
      const output = status.output;
      if (output.operations.length === 0) {
        setState({ kind: 'error', prompt: text, message: output.summary || 'The model made no changes.' });
        return;
      }
      const dry = applyOperations(useEditor.getState().project ?? current, output.operations);
      if (!dry.ok) {
        setState({ kind: 'rejected', prompt: text, output, errors: dry.errors });
        return;
      }
      setState({ kind: 'proposal', prompt: text, output, lines: describe(output.operations, dry.value.project) });
    } catch (e) {
      setState({ kind: 'error', prompt: text, message: (e as Error).message });
    }
  };

  const accept = () => {
    if (state.kind !== 'proposal') return;
    const r = dispatch(`Ask: ${state.prompt.slice(0, 40)}`, state.output.operations);
    if (!r.ok) { toast.error('Could not apply the proposal', r.errors.map((e) => e.message)); return; }
    toast.info('Applied. Undo reverts it.');
    setState({ kind: 'idle' });
    setPrompt('');
  };

  const retry = () => {
    if (state.kind !== 'rejected') return;
    void run(state.prompt, state.errors.map((e) => `${e.path ?? ''} ${e.message}`.trim()).join('\n'));
  };

  return (
    <Section title="Ask">
      <form onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) void run(prompt.trim()); }}>
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={'Describe what to add. For example:\n"Add an NPC named Aiko who asks the player to find a lost sword" or "Put three slimes in the forest and a pond at the top-left."'}
          data-testid="ask-prompt"
          disabled={state.kind === 'running'}
        />
        <div className="field-row" style={{ marginTop: 6 }}>
          <button type="submit" className="primary" disabled={state.kind === 'running' || !prompt.trim()} data-testid="ask-submit">
            {state.kind === 'running' ? 'Thinking…' : 'Ask'}
          </button>
          {state.kind === 'running' && <button type="button" onClick={() => { abort.current?.abort(); setState({ kind: 'idle' }); }}>Cancel</button>}
        </div>
      </form>

      {state.kind === 'error' && <p className="ask-error" data-testid="ask-error">{state.message}</p>}

      {state.kind === 'rejected' && (
        <div className="proposal" data-testid="ask-rejected">
          <p className="muted small">The model's proposal could not be applied:</p>
          <ul className="toast-lines">{state.errors.slice(0, 6).map((e, i) => <li key={i}>{e.message}</li>)}</ul>
          <div className="field-row">
            <button className="primary small" onClick={retry}>Retry with these errors</button>
            <button className="small" onClick={() => setState({ kind: 'idle' })}>Dismiss</button>
          </div>
        </div>
      )}

      {state.kind === 'proposal' && (
        <div className="proposal" data-testid="ask-proposal">
          {state.output.summary && <p className="small">{state.output.summary}</p>}
          <ul className="proposal-lines">{state.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          {state.output.warnings.length > 0 && <p className="muted small">{state.output.warnings.join(' ')}</p>}
          <div className="field-row">
            <button className="primary small" onClick={accept} data-testid="ask-accept">Apply</button>
            <button className="small" onClick={() => setState({ kind: 'idle' })} data-testid="ask-reject">Discard</button>
          </div>
          <p className="muted small">{state.output.operations.length} changes · {state.output.provider}{state.output.model ? ` · ${state.output.model}` : ''}</p>
        </div>
      )}
    </Section>
  );
}

/** Human-readable summary of a batch, grouped by what it does, using names from the resulting project. */
export function describe(ops: Operation[], after: Project): string[] {
  const groups = new Map<string, { count: number; names: string[] }>();
  const add = (key: string, name?: string) => {
    const g = groups.get(key) ?? { count: 0, names: [] };
    g.count++;
    if (name) g.names.push(name);
    groups.set(key, g);
  };
  for (const op of ops) {
    switch (op.op) {
      case 'createEntity': {
        const kinds = op.entity.components.map((c) => c.type);
        add(kinds.includes('property') ? 'properties' : kinds.includes('shop') ? 'shops' : kinds.includes('enemy') ? 'enemies' : kinds.includes('playerControl') ? 'player' : 'characters', op.entity.name);
        break;
      }
      case 'createDialogue': add('dialogues', `${op.dialogue.name} (${Object.keys(op.dialogue.nodes).length} nodes)`); break;
      case 'createVariable': add('variables', op.variable.name); break;
      case 'createQuest': add('quests', `${op.quest.name} (${op.quest.steps.length} steps${op.quest.rewards?.length ? ', rewards' : ''})`); break;
      case 'updateQuest': add('quest edits', after.quests[op.id]?.name); break;
      case 'updateSettings': add(op.patch.economy !== undefined ? 'economy settings' : 'settings'); break;
      case 'createScene': add('scenes', op.scene.name); break;
      case 'createMap': add('maps', op.map.name); break;
      case 'paintRect': case 'paintTiles': add('map painting'); break;
      case 'setCollisionRect': case 'setCollision': add('collision edits'); break;
      case 'setComponent': {
        const entityName = after.scenes[op.sceneId]?.entities[op.entityId]?.name ?? op.entityId;
        const c = op.component;
        if (c.type === 'property') add('properties', `${c.name} (${entityName})`);
        else if (c.type === 'shop') add('shops', `${c.name} (${entityName})`);
        else add('component changes', `${entityName}: ${c.type}`);
        break;
      }
      case 'setDialogueNode': add('dialogue edits'); break;
      case 'placeEntity': add('moves', after.scenes[op.sceneId]?.entities[op.entityId]?.name); break;
      default: add(op.op.replace(/([A-Z])/g, ' $1').toLowerCase()); break;
    }
  }
  return [...groups.entries()].map(([key, { count, names }]) =>
    names.length ? `${key}: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}` : `${count} ${key}`,
  );
}
