import { useEditor, useProject } from '../../store/editorStore.js';
import { Field, Section } from '../../ui/Field.js';
import { toast } from '../../ui/Toast.js';

export function SceneInspector({ sceneId }: { sceneId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const setActiveScene = useEditor((s) => s.setActiveScene);
  const scene = project?.scenes[sceneId];
  if (!project || !scene) return null;
  const map = scene.mapId ? project.maps[scene.mapId] : undefined;
  const isStart = project.startSceneId === scene.id;

  const remove = () => {
    if (isStart) { toast.error('The start scene cannot be deleted. Make another scene the start first.'); return; }
    const r = dispatch('Delete scene', [{ op: 'deleteScene', id: scene.id }, ...(scene.mapId ? [{ op: 'deleteMap' as const, id: scene.mapId }] : [])]);
    if (r.ok) setActiveScene(project.startSceneId);
    else toast.error('Cannot delete scene', r.errors.map((e) => e.message));
  };

  return (
    <Section title="Scene" actions={<button className="danger small" onClick={remove}>Delete</button>}>
      <Field label="Name"><input value={scene.name} onChange={(e) => dispatch('Rename scene', [{ op: 'updateScene', id: scene.id, patch: { name: e.target.value || scene.name } }])} /></Field>
      <label className="check"><input type="checkbox" checked={isStart} disabled={isStart} onChange={() => dispatch('Start scene', [{ op: 'setStartScene', sceneId: scene.id }])} /> Start scene</label>
      {map && <p className="muted small">Map "{map.name}": {map.width}×{map.height} tiles of {map.tileWidth}px · {map.layers.length} layers</p>}
      <p className="muted small">{scene.entityOrder.length} entities</p>
    </Section>
  );
}
