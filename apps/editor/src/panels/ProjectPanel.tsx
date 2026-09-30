import { newId } from '@beze/project-core';
import type { Dialogue, GameVariable } from '@beze/project-schema';
import { useEditor, useProject } from '../store/editorStore.js';
import { sameSelection, type Selection } from '../store/selection.js';
import { Section } from '../ui/Field.js';
import { SpritePreview } from '../ui/SpritePreview.js';
import { toast } from '../ui/Toast.js';

export function ProjectPanel() {
  const project = useProject();
  const selection = useEditor((s) => s.selection);
  const activeSceneId = useEditor((s) => s.activeSceneId);
  const select = useEditor((s) => s.select);
  const setActiveScene = useEditor((s) => s.setActiveScene);
  const dispatch = useEditor((s) => s.dispatch);
  if (!project) return null;

  const row = (sel: Selection, label: string, extra?: string, onClick?: () => void, icon?: React.ReactNode) => (
    <li key={JSON.stringify(sel)} className={sameSelection(sel, selection) ? 'selected' : ''}>
      <button className={`row${icon ? ' row-with-icon' : ''}`} onClick={onClick ?? (() => select(sel))} title={label}>
        {icon}
        <span className="row-label">{label}</span>
        {extra && <span className="muted small row-extra">{extra}</span>}
      </button>
    </li>
  );

  const addScene = () => {
    const first = Object.values(project.maps)[0];
    const tileset = Object.values(project.tilesets)[0];
    if (!first || !tileset) return;
    const mapId = newId('map');
    const sceneId = newId('scn');
    const cells = first.width * first.height;
    const groundGid = first.tilesets[0]?.firstGid ?? 1;
    const r = dispatch('Add scene', [
      { op: 'createMap', map: { ...first, id: mapId, name: `Map ${Object.keys(project.maps).length + 1}`, layers: [
        { id: newId('lyr'), name: 'Ground', visible: true, aboveEntities: false, data: new Array<number>(cells).fill(groundGid) },
        { id: newId('lyr'), name: 'Decoration', visible: true, aboveEntities: false, data: new Array<number>(cells).fill(0) },
      ], collision: new Array<0 | 1>(cells).fill(0) } },
      { op: 'createScene', scene: { id: sceneId, name: `Scene ${Object.keys(project.scenes).length + 1}`, mapId, entities: {}, entityOrder: [] } },
    ]);
    if (r.ok) setActiveScene(sceneId);
    else toast.error('Could not add scene', r.errors.map((e) => e.message));
  };

  const addDialogue = () => {
    const lineId = newId('nod');
    const endId = newId('nod');
    const dialogue: Dialogue = {
      id: newId('dlg'), name: `Dialogue ${Object.keys(project.dialogues).length + 1}`, startNodeId: lineId,
      nodes: { [lineId]: { id: lineId, type: 'line', speaker: '', text: 'Hello!', next: endId }, [endId]: { id: endId, type: 'end' } },
    };
    const r = dispatch('Add dialogue', [{ op: 'createDialogue', dialogue }]);
    if (r.ok) select({ kind: 'dialogue', dialogueId: dialogue.id });
  };

  const addVariable = () => {
    const n = Object.keys(project.variables).length + 1;
    const variable: GameVariable = { id: newId('var'), name: `flag${n}`, type: 'boolean', initial: false };
    const r = dispatch('Add variable', [{ op: 'createVariable', variable }]);
    if (r.ok) select({ kind: 'variable', variableId: variable.id });
  };

  return (
    <aside className="panel panel-left">
      <Section title="Scenes" actions={<button className="small" onClick={addScene} title="Add scene">+</button>}>
        <ul className="list" data-testid="scene-list">
          {Object.values(project.scenes).map((s) => row({ kind: 'scene', sceneId: s.id }, s.name, s.id === project.startSceneId ? 'start' : (s.id === activeSceneId ? 'active' : undefined), () => setActiveScene(s.id)))}
        </ul>
      </Section>
      <Section title="Characters">
        <ul className="list" data-testid="character-list">
          {Object.values(project.characters).map((c) => row(
            { kind: 'character', characterId: c.id }, c.name,
            undefined, undefined,
            <SpritePreview characterId={c.id} size={28} hoverAnimate className="row-thumb" />,
          ))}
        </ul>
      </Section>
      <Section title="Dialogues" actions={<button className="small" onClick={addDialogue} title="Add dialogue">+</button>}>
        <ul className="list" data-testid="dialogue-list">
          {Object.values(project.dialogues).map((d) => row({ kind: 'dialogue', dialogueId: d.id }, d.name, `${Object.keys(d.nodes).length} nodes`))}
        </ul>
      </Section>
      <Section title="Variables" actions={<button className="small" onClick={addVariable} title="Add variable">+</button>}>
        <ul className="list">
          {Object.values(project.variables).map((v) => row({ kind: 'variable', variableId: v.id }, v.name, `${v.type} = ${String(v.initial)}`))}
        </ul>
      </Section>
      <Section title="Assets">
        <ul className="list">
          {Object.values(project.assets).map((a) => <li key={a.id}><span className="row muted">{a.name}<span className="small">{a.origin}</span></span></li>)}
        </ul>
      </Section>
    </aside>
  );
}
