import type { Direction } from '@beze/project-schema';
import { giveDialogue } from '@beze/project-core';
import { useEditor, useProject } from '../../store/editorStore.js';
import { Field, Section } from '../../ui/Field.js';
import { toast } from '../../ui/Toast.js';

export function EntityInspector({ sceneId, entityId }: { sceneId: string; entityId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const select = useEditor((s) => s.select);
  const scene = project?.scenes[sceneId];
  const entity = scene?.entities[entityId];
  if (!project || !scene || !entity) return null;

  const sprite = entity.components.find((c) => c.type === 'sprite');
  const body = entity.components.find((c) => c.type === 'body');
  const isPlayer = entity.components.some((c) => c.type === 'playerControl');
  const interact = entity.components.find((c) => c.type === 'interactable');
  const dialogueId = interact?.type === 'interactable' && interact.action.type === 'startDialogue' ? interact.action.dialogueId : '';

  const run = (label: string, ops: Parameters<typeof dispatch>[1]) => {
    const r = dispatch(label, ops);
    if (!r.ok) toast.error('Change rejected', r.errors.map((e) => e.message));
  };

  const setPlayer = (on: boolean) => {
    if (on) {
      const others = Object.values(scene.entities).filter((e) => e.id !== entity.id && e.components.some((c) => c.type === 'playerControl'));
      run('Set player', [
        ...others.map((e) => ({ op: 'removeComponent' as const, sceneId, entityId: e.id, componentType: 'playerControl' as const })),
        { op: 'setComponent', sceneId, entityId, component: { type: 'playerControl' } },
      ]);
    } else {
      run('Unset player', [{ op: 'removeComponent', sceneId, entityId, componentType: 'playerControl' }]);
    }
  };

  const setDialogue = (id: string) => {
    if (id === '') run('Remove dialogue', [{ op: 'removeComponent', sceneId, entityId, componentType: 'interactable' }]);
    else run('Set dialogue', [{ op: 'setComponent', sceneId, entityId, component: { type: 'interactable', action: { type: 'startDialogue', dialogueId: id }, prompt: 'Talk' } }]);
  };

  const newDialogue = () => {
    const { ops, dialogueId: created } = giveDialogue(project, sceneId, entityId, { name: `${entity.name} talk`, speaker: entity.name, lines: ['Hello!'], ...(spritePortrait() ? { portraitAssetId: spritePortrait()! } : {}) });
    const r = dispatch('New dialogue', ops);
    if (r.ok) select({ kind: 'dialogue', dialogueId: created });
    else toast.error('Could not create dialogue', r.errors.map((e) => e.message));
  };
  const spritePortrait = () => (sprite?.type === 'sprite' ? project.characters[sprite.characterId]?.portraitAssetId : undefined);

  return (
    <Section title="Entity" actions={<button className="danger small" onClick={() => { run('Delete entity', [{ op: 'deleteEntity', sceneId, entityId }]); select({ kind: 'scene', sceneId }); }}>Delete</button>}>
      <Field label="Name"><input value={entity.name} data-testid="entity-name" onChange={(e) => run('Rename', [{ op: 'modifyEntity', sceneId, entityId, patch: { name: e.target.value || entity.name } }])} /></Field>
      <div className="field-row">
        <Field label="X"><input type="number" value={entity.x} onChange={(e) => run('Move', [{ op: 'placeEntity', sceneId, entityId, x: Math.round(Number(e.target.value)) || 0, y: entity.y }])} /></Field>
        <Field label="Y"><input type="number" value={entity.y} onChange={(e) => run('Move', [{ op: 'placeEntity', sceneId, entityId, x: entity.x, y: Math.round(Number(e.target.value)) || 0 }])} /></Field>
      </div>
      <Field label="Facing">
        <select value={entity.facing} onChange={(e) => run('Facing', [{ op: 'modifyEntity', sceneId, entityId, patch: { facing: e.target.value as Direction } }])}>
          {(['down', 'left', 'right', 'up'] as const).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      <Field label="Character">
        <select value={sprite?.type === 'sprite' ? sprite.characterId : ''} onChange={(e) => e.target.value ? run('Character', [{ op: 'setComponent', sceneId, entityId, component: { type: 'sprite', characterId: e.target.value } }]) : run('Character', [{ op: 'removeComponent', sceneId, entityId, componentType: 'sprite' }])}>
          <option value="">(none)</option>
          {Object.values(project.characters).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <label className="check"><input type="checkbox" checked={isPlayer} onChange={(e) => setPlayer(e.target.checked)} /> Player (arrow keys move it)</label>
      <label className="check"><input type="checkbox" checked={body?.type === 'body' ? body.solid : false} onChange={(e) => run('Solid', [{ op: 'setComponent', sceneId, entityId, component: { type: 'body', solid: e.target.checked } }])} /> Solid (blocks movement)</label>
      {!isPlayer && (
        <Field label="Talks (dialogue)">
          <div className="field-row">
            <select value={dialogueId} data-testid="entity-dialogue" onChange={(e) => setDialogue(e.target.value)}>
              <option value="">(none)</option>
              {Object.values(project.dialogues).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="small" onClick={newDialogue} data-testid="new-dialogue">New</button>
            {dialogueId && <button className="small" onClick={() => select({ kind: 'dialogue', dialogueId })}>Edit</button>}
          </div>
        </Field>
      )}
    </Section>
  );
}
