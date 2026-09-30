import { useState } from 'react';
import { newId } from '@beze/project-core';
import type { Dialogue, GameVariable } from '@beze/project-schema';
import { ImportSheetDialog } from '../import/ImportSheetDialog.js';
import { ImportTilesetDialog } from '../import/ImportTilesetDialog.js';
import { newQuest } from './inspectors/QuestInspector.js';
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
  const [importing, setImporting] = useState<'sheet' | 'tileset' | 'choose' | null>(null);
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
        // Drawn over characters: tree crowns and roofs from stamps land here (same layout as createProject).
        { id: newId('lyr'), name: 'Canopy', visible: true, aboveEntities: true, data: new Array<number>(cells).fill(0) },
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

  const addQuest = () => {
    const quest = newQuest(Object.keys(project.quests).length + 1);
    const r = dispatch('Add quest', [{ op: 'createQuest', quest }]);
    if (r.ok) select({ kind: 'quest', questId: quest.id });
    else toast.error('Could not add quest', r.errors.map((e) => e.message));
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
      <Section title="Characters" actions={<button className="small" onClick={() => setImporting('sheet')} title="Import a sprite sheet as a character" data-testid="import-character">+</button>}>
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
      <Section title="Quests" actions={<button className="small" onClick={addQuest} title="Add quest (mission)" data-testid="add-quest">+</button>}>
        <ul className="list" data-testid="quest-list">
          {Object.values(project.quests).map((q) => row({ kind: 'quest', questId: q.id }, q.name, `${q.steps.length} step${q.steps.length === 1 ? '' : 's'}${q.timeLimitMs ? ' · timed' : ''}`))}
        </ul>
      </Section>
      <Section title="Variables" actions={<button className="small" onClick={addVariable} title="Add variable">+</button>}>
        <ul className="list" data-testid="variable-list">
          {Object.values(project.variables).map((v) => row({ kind: 'variable', variableId: v.id }, v.label ? `${v.label} (${v.name})` : v.name, `${v.category ? v.category + ' ' : ''}${v.type} = ${String(v.initial)}`))}
        </ul>
      </Section>
      <Section
        title="Assets"
        actions={
          <span className="import-chooser">
            <button className="small" onClick={() => setImporting(importing === 'choose' ? null : 'choose')} title="Import an image" data-testid="import-asset" aria-expanded={importing === 'choose'}>+</button>
            {importing === 'choose' && (
              <span className="import-menu" role="menu">
                <button className="row" role="menuitem" onClick={() => setImporting('sheet')} data-testid="import-asset-sheet">Sprite sheet…</button>
                <button className="row" role="menuitem" onClick={() => setImporting('tileset')} data-testid="import-asset-tileset">Tileset…</button>
              </span>
            )}
          </span>
        }
      >
        <ul className="list">
          {Object.values(project.assets).map((a) => <li key={a.id}><span className="row muted">{a.name}<span className="small">{a.origin}</span></span></li>)}
        </ul>
      </Section>
      {importing === 'sheet' && <ImportSheetDialog onClose={() => setImporting(null)} />}
      {importing === 'tileset' && <ImportTilesetDialog onClose={() => setImporting(null)} />}
    </aside>
  );
}
