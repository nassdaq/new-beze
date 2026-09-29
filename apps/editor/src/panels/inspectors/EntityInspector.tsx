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
  const player = entity.components.find((c) => c.type === 'playerControl');
  const health = entity.components.find((c) => c.type === 'health');
  const enemy = entity.components.find((c) => c.type === 'enemy');
  const wander = entity.components.find((c) => c.type === 'wander');
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
      {isPlayer && player?.type === 'playerControl' && (
        <Field label="Attack damage per swing">
          <input type="number" min={1} max={9999} value={player.attackDamage ?? 1} onChange={(e) => run('Attack damage', [{ op: 'setComponent', sceneId, entityId, component: { type: 'playerControl', ...(player.speed !== undefined ? { speed: player.speed } : {}), attackDamage: Math.max(1, Math.round(Number(e.target.value)) || 1) } }])} />
        </Field>
      )}
      <label className="check"><input type="checkbox" checked={health?.type === 'health'} data-testid="entity-health" onChange={(e) => e.target.checked
        ? run('Add health', [{ op: 'setComponent', sceneId, entityId, component: { type: 'health', max: 3 } }])
        : run('Remove health', [{ op: 'removeComponent', sceneId, entityId, componentType: 'health' }, ...(enemy ? [{ op: 'removeComponent' as const, sceneId, entityId, componentType: 'enemy' as const }] : [])])} /> Has health</label>
      {health?.type === 'health' && (
        <Field label="Max health"><input type="number" min={1} max={9999} value={health.max} onChange={(e) => run('Max health', [{ op: 'setComponent', sceneId, entityId, component: { type: 'health', max: Math.max(1, Math.round(Number(e.target.value)) || 1) } }])} /></Field>
      )}
      {!isPlayer && (
        <>
          <label className="check"><input type="checkbox" checked={enemy?.type === 'enemy'} data-testid="entity-enemy" onChange={(e) => e.target.checked
            ? run('Make enemy', [
              ...(health ? [] : [{ op: 'setComponent' as const, sceneId, entityId, component: { type: 'health' as const, max: 2 } }]),
              { op: 'setComponent', sceneId, entityId, component: { type: 'enemy', speed: 48, aggroRadius: 128, damage: 1, attackCooldownMs: 800 } },
            ])
            : run('Not an enemy', [{ op: 'removeComponent', sceneId, entityId, componentType: 'enemy' }])} /> Enemy (chases and hurts the player)</label>
          {enemy?.type === 'enemy' && (
            <div className="field-row">
              <Field label="Speed"><input type="number" min={1} max={2000} value={enemy.speed} onChange={(e) => run('Enemy speed', [{ op: 'setComponent', sceneId, entityId, component: { ...enemy, speed: Math.max(1, Number(e.target.value) || 1) } }])} /></Field>
              <Field label="Sees (px)"><input type="number" min={1} max={4000} value={enemy.aggroRadius} onChange={(e) => run('Enemy range', [{ op: 'setComponent', sceneId, entityId, component: { ...enemy, aggroRadius: Math.max(1, Math.round(Number(e.target.value)) || 1) } }])} /></Field>
              <Field label="Damage"><input type="number" min={1} max={9999} value={enemy.damage} onChange={(e) => run('Enemy damage', [{ op: 'setComponent', sceneId, entityId, component: { ...enemy, damage: Math.max(1, Math.round(Number(e.target.value)) || 1) } }])} /></Field>
            </div>
          )}
          <label className="check"><input type="checkbox" checked={wander?.type === 'wander'} onChange={(e) => e.target.checked
            ? run('Wander', [{ op: 'setComponent', sceneId, entityId, component: { type: 'wander', radius: 64, speed: 24 } }])
            : run('Stay put', [{ op: 'removeComponent', sceneId, entityId, componentType: 'wander' }])} /> Wanders around</label>
          {wander?.type === 'wander' && (
            <div className="field-row">
              <Field label="Radius (px)"><input type="number" min={1} max={2000} value={wander.radius} onChange={(e) => run('Wander radius', [{ op: 'setComponent', sceneId, entityId, component: { ...wander, radius: Math.max(1, Math.round(Number(e.target.value)) || 1) } }])} /></Field>
              <Field label="Speed"><input type="number" min={1} max={2000} value={wander.speed} onChange={(e) => run('Wander speed', [{ op: 'setComponent', sceneId, entityId, component: { ...wander, speed: Math.max(1, Number(e.target.value) || 1) } }])} /></Field>
            </div>
          )}
        </>
      )}
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
