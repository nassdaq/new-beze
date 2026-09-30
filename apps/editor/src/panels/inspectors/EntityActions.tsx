import type { Component, Operation } from '@beze/project-schema';
import { useEditor, useProject } from '../../store/editorStore.js';
import { ActionEditor } from '../../ui/ActionEditor.js';
import { Field } from '../../ui/Field.js';
import { toast } from '../../ui/Toast.js';

type Interactable = Extract<Component, { type: 'interactable' }>;
type Trigger = Extract<Component, { type: 'trigger' }>;

/** The interactable's action (beyond "Talks") and the trigger area of an entity. */
export function EntityActions({ sceneId, entityId }: { sceneId: string; entityId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const entity = project?.scenes[sceneId]?.entities[entityId];
  if (!project || !entity) return null;
  const interact = entity.components.find((c): c is Interactable => c.type === 'interactable');
  const trigger = entity.components.find((c): c is Trigger => c.type === 'trigger');
  const tile = project.settings.tileSize;

  const run = (label: string, ops: Operation[]) => {
    const r = dispatch(label, ops);
    if (!r.ok) toast.error('Change rejected', r.errors.map((e) => e.message));
  };
  const set = (label: string, component: Component) => run(label, [{ op: 'setComponent', sceneId, entityId, component }]);
  const remove = (label: string, componentType: Component['type']) => run(label, [{ op: 'removeComponent', sceneId, entityId, componentType }]);

  return (
    <>
      <label className="check"><input type="checkbox" checked={!!interact} data-testid="entity-interactable" onChange={(e) => (e.target.checked
        ? set('Interactable', { type: 'interactable', action: { type: 'notify', text: 'Hello!' }, prompt: 'Interact' })
        : remove('Not interactable', 'interactable'))} /> Interactable (press {project.settings.interactKey === 'SPACE' ? 'Space' : project.settings.interactKey === 'ENTER' ? 'Enter' : 'E'} nearby)</label>
      {interact && (
        <div className="component-body">
          <Field label="Prompt"><input value={interact.prompt ?? ''} maxLength={60} placeholder="Talk" onChange={(e) => { const { prompt: _p, ...rest } = interact; set('Prompt', e.target.value ? { ...rest, prompt: e.target.value } : rest); }} /></Field>
          <Field label="Action"><ActionEditor value={interact.action} onChange={(action) => set('Interact action', { ...interact, action })} testId="entity-action" /></Field>
        </div>
      )}
      <label className="check"><input type="checkbox" checked={!!trigger} data-testid="entity-trigger" onChange={(e) => (e.target.checked
        ? set('Trigger', { type: 'trigger', width: tile, height: tile, onEnter: { type: 'notify', text: 'You are here.' }, once: true })
        : remove('No trigger', 'trigger'))} /> Trigger area (runs when the player walks in)</label>
      {trigger && (
        <div className="component-body">
          <div className="field-row">
            <Field label="Width (px)"><input type="number" min={1} value={trigger.width} onChange={(e) => set('Trigger size', { ...trigger, width: Math.max(1, Math.round(Number(e.target.value)) || 1) })} /></Field>
            <Field label="Height (px)"><input type="number" min={1} value={trigger.height} onChange={(e) => set('Trigger size', { ...trigger, height: Math.max(1, Math.round(Number(e.target.value)) || 1) })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={trigger.once} onChange={(e) => set('Trigger once', { ...trigger, once: e.target.checked })} /> Only once</label>
          <Field label="On enter"><ActionEditor value={trigger.onEnter} onChange={(onEnter) => set('Trigger action', { ...trigger, onEnter })} testId="entity-trigger-action" /></Field>
        </div>
      )}
    </>
  );
}
