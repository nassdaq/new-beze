import type { Component, Operation } from '@beze/project-schema';
import { useEditor, useProject } from '../../store/editorStore.js';
import { Field } from '../../ui/Field.js';
import { toast } from '../../ui/Toast.js';

type Light = Extract<Component, { type: 'light' }>;

/** The v4 `light` component: a coloured point light on the entity, optionally night-only and flickering. */
export function LightFields({ sceneId, entityId }: { sceneId: string; entityId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const entity = project?.scenes[sceneId]?.entities[entityId];
  if (!project || !entity) return null;
  const light = entity.components.find((c): c is Light => c.type === 'light');
  const run = (label: string, ops: Operation[]) => {
    const r = dispatch(label, ops);
    if (!r.ok) toast.error('Change rejected', r.errors.map((e) => e.message));
  };
  const set = (label: string, component: Light) => run(label, [{ op: 'setComponent', sceneId, entityId, component }]);

  return (
    <>
      <label className="check"><input type="checkbox" checked={!!light} data-testid="entity-light" onChange={(e) => (e.target.checked
        ? set('Add light', { type: 'light', color: '#ffd9a0', radius: 120, intensity: 1, night: true, flicker: false })
        : run('Remove light', [{ op: 'removeComponent', sceneId, entityId, componentType: 'light' }]))} /> Light (a glow around this entity)</label>
      {light && (
        <div className="component-body" data-testid="light-fields">
          <div className="field-row">
            <Field label="Colour"><input type="color" value={light.color} onChange={(e) => set('Light colour', { ...light, color: e.target.value })} /></Field>
            <Field label="Radius (px)"><input type="number" min={1} max={2000} value={light.radius} onChange={(e) => set('Light radius', { ...light, radius: Math.min(2000, Math.max(1, Math.round(Number(e.target.value)) || 1)) })} /></Field>
            <Field label="Intensity"><input type="number" min={0} max={10} step={0.1} value={light.intensity} onChange={(e) => set('Light intensity', { ...light, intensity: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={light.night ?? false} onChange={(e) => set('Light at night', { ...light, night: e.target.checked })} /> Only at night</label>
          <label className="check"><input type="checkbox" checked={light.flicker ?? false} onChange={(e) => set('Light flicker', { ...light, flicker: e.target.checked })} /> Flickers (fire, neon)</label>
        </div>
      )}
    </>
  );
}
