import { useEditor, useProject } from '../store/editorStore.js';
import { EntityInspector } from './inspectors/EntityInspector.js';
import { SceneInspector } from './inspectors/SceneInspector.js';
import { VariableInspector } from './inspectors/VariableInspector.js';
import { DialogueInspector } from './inspectors/DialogueInspector.js';
import { CharacterInspector } from './inspectors/CharacterInspector.js';
import { QuestInspector } from './inspectors/QuestInspector.js';
import { EconomySettings } from './inspectors/EconomySettings.js';
import { PresentationSettings } from './inspectors/PresentationSettings.js';
import { Field, Section } from '../ui/Field.js';
import { AskPanel } from './AskPanel.js';

export function InspectorPanel() {
  const project = useProject();
  const selection = useEditor((s) => s.selection);
  const dispatch = useEditor((s) => s.dispatch);
  if (!project) return null;

  let body: React.ReactNode;
  switch (selection.kind) {
    case 'entity': body = <EntityInspector sceneId={selection.sceneId} entityId={selection.entityId} />; break;
    case 'scene': body = <SceneInspector sceneId={selection.sceneId} />; break;
    case 'variable': body = <VariableInspector variableId={selection.variableId} />; break;
    case 'dialogue': body = <DialogueInspector dialogueId={selection.dialogueId} />; break;
    case 'character': body = <CharacterInspector characterId={selection.characterId} />; break;
    case 'quest': body = <QuestInspector questId={selection.questId} />; break;
    default:
      body = (
        <Section title="Project">
          <p className="muted small">Select something in the scene or the lists to edit it.</p>
          <Field label="Move speed (px/s)">
            <input type="number" min={8} max={2000} value={project.settings.defaultMoveSpeed} onChange={(e) => dispatch('Move speed', [{ op: 'updateSettings', patch: { defaultMoveSpeed: Number(e.target.value) || 96 } }])} />
          </Field>
          <Field label="Interact key">
            <select value={project.settings.interactKey} onChange={(e) => dispatch('Interact key', [{ op: 'updateSettings', patch: { interactKey: e.target.value as 'E' | 'SPACE' | 'ENTER' } }])}>
              <option value="E">E</option><option value="SPACE">Space</option><option value="ENTER">Enter</option>
            </select>
          </Field>
          <Field label="Attack key">
            <select value={project.settings.attackKey} onChange={(e) => dispatch('Attack key', [{ op: 'updateSettings', patch: { attackKey: e.target.value as 'SPACE' | 'X' | 'J' | 'K' } }])}>
              <option value="SPACE">Space</option><option value="X">X</option><option value="J">J</option><option value="K">K</option>
            </select>
          </Field>
          <Field label="Ability key (web shooter)">
            <select value={project.settings.abilityKey ?? 'X'} onChange={(e) => dispatch('Ability key', [{ op: 'updateSettings', patch: { abilityKey: e.target.value as 'X' | 'C' | 'F' | 'Q' | 'Z' | 'J' | 'K' } }])}>
              {(['X', 'C', 'F', 'Q', 'Z', 'J', 'K'] as const).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <EconomySettings />
          <PresentationSettings />
        </Section>
      );
  }
  return <aside className="panel panel-right" data-testid="inspector"><AskPanel />{body}</aside>;
}
