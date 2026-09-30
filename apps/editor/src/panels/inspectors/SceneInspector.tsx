import { useState } from 'react';
import { useEditor, useProject } from '../../store/editorStore.js';
import { FindArtDialog } from '../FindArtDialog.js';
import { Field, Section } from '../../ui/Field.js';
import { toast } from '../../ui/Toast.js';
import { MOOD_OPTIONS } from './AudioSettings.js';

export function SceneInspector({ sceneId }: { sceneId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const setActiveScene = useEditor((s) => s.setActiveScene);
  const scene = project?.scenes[sceneId];
  const [finding, setFinding] = useState(false);
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
      <Field label="Background image (behind the map)">
        <div className="field-row">
          <select value={scene.backgroundAssetId ?? ''} onChange={(e) => dispatch('Scene background', [{ op: 'updateScene', id: scene.id, patch: { backgroundAssetId: e.target.value || undefined } }])}>
            <option value="">(none)</option>
            {Object.values(project.assets).filter((a) => a.kind === 'image').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button type="button" className="small" onClick={() => setFinding(true)}>Find art…</button>
        </div>
      </Field>
      {finding && (
        <FindArtDialog title={`Find a background for ${scene.name}`} initialQuery={scene.name} onClose={() => setFinding(false)}
          onPicked={(asset) => dispatch('Scene background', [{ op: 'registerAsset', asset }, { op: 'updateScene', id: scene.id, patch: { backgroundAssetId: asset.id } }])} />
      )}
      <Field label="Music in this scene">
        <select value={scene.musicAssetId ? 'track' : (scene.music ?? '')} onChange={(e) => {
          const v = e.target.value;
          if (v === 'track') return;
          dispatch('Scene music', [{ op: 'updateScene', id: scene.id, patch: { music: v === '' ? undefined : (v as NonNullable<typeof scene.music>), musicAssetId: undefined } }]);
        }}>
          <option value="">(project setting)</option>
          {MOOD_OPTIONS.filter((o) => o.value !== 'auto').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {Object.values(project.assets).some((a) => a.kind === 'audio') && <option value="track">Uploaded track</option>}
        </select>
      </Field>
      {Object.values(project.assets).some((a) => a.kind === 'audio') && (
        <Field label="Track for this scene">
          <select value={scene.musicAssetId ?? ''} onChange={(e) => dispatch('Scene track', [{ op: 'updateScene', id: scene.id, patch: { musicAssetId: e.target.value || undefined } }])}>
            <option value="">(none)</option>
            {Object.values(project.assets).filter((a) => a.kind === 'audio').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      )}
      {map && <p className="muted small">Map "{map.name}": {map.width}×{map.height} tiles of {map.tileWidth}px · {map.layers.length} layers</p>}
      <p className="muted small">{scene.entityOrder.length} entities</p>
    </Section>
  );
}
