import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject } from '@beze/project-schema';
import { useEditor } from './editorStore.js';

const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../docs/examples/hello-aiko.project.json'), 'utf8'));
const parsed = parseProject(raw);
if (!parsed.ok) throw new Error('fixture invalid');
const fixture = parsed.value;
const SCENE = 'scn_village';
const MAP = 'map_village';

describe('editor store', () => {
  beforeEach(() => useEditor.getState().loadProject(fixture));

  it('dispatch applies, marks unsaved, and undo/redo round-trip', () => {
    const s = useEditor.getState();
    expect(s.dispatch('Rename', [{ op: 'renameProject', name: 'Renamed' }]).ok).toBe(true);
    expect(useEditor.getState().project?.name).toBe('Renamed');
    expect(useEditor.getState().saveState).toBe('unsaved');
    useEditor.getState().undo();
    expect(useEditor.getState().project).toEqual(fixture);
    useEditor.getState().redo();
    expect(useEditor.getState().project?.name).toBe('Renamed');
  });

  it('rejects invalid batches without touching history', () => {
    const r = useEditor.getState().dispatch('Bad', [{ op: 'deleteCharacter', id: 'chr_hero' }]);
    expect(r.ok).toBe(false);
    expect(useEditor.getState().history.undo).toHaveLength(0);
    expect(useEditor.getState().project).toEqual(fixture);
  });

  it('coalesces a paint stroke into one undo step', () => {
    const s = useEditor.getState();
    for (let x = 0; x < 5; x++) {
      s.dispatch('Paint', [{ op: 'paintTiles', mapId: MAP, layerId: 'lyr_ground', cells: [{ x, y: 3, gid: 2 }] }], { coalesceKey: 'stroke1' });
    }
    useEditor.getState().endCoalesce();
    useEditor.getState().dispatch('Paint', [{ op: 'paintTiles', mapId: MAP, layerId: 'lyr_ground', cells: [{ x: 9, y: 3, gid: 2 }] }], { coalesceKey: 'stroke2' });
    expect(useEditor.getState().history.undo).toHaveLength(2);
    useEditor.getState().undo();
    useEditor.getState().undo();
    expect(useEditor.getState().project).toEqual(fixture);
  });

  it('drops a selection that undo removes', () => {
    const s = useEditor.getState();
    s.dispatch('Add var', [{ op: 'createVariable', variable: { id: 'var_new', name: 'fresh', type: 'number', initial: 0 } }]);
    useEditor.getState().select({ kind: 'variable', variableId: 'var_new' });
    useEditor.getState().undo();
    expect(useEditor.getState().selection).toEqual({ kind: 'none' });
    expect(useEditor.getState().dispatch('Move', [{ op: 'placeEntity', sceneId: SCENE, entityId: 'ent_aiko', x: 64, y: 64 }]).ok).toBe(true);
  });
});
