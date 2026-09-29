import { useEditor, useProject } from '../store/editorStore.js';
import { EntityInspector } from './inspectors/EntityInspector.js';
import { SceneInspector } from './inspectors/SceneInspector.js';
import { VariableInspector } from './inspectors/VariableInspector.js';
import { DialogueInspector } from './inspectors/DialogueInspector.js';
import { Field, Section } from '../ui/Field.js';

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
    case 'character': {
      const c = project.characters[selection.characterId];
      body = c ? (
        <Section title="Character">
          <Field label="Name"><input value={c.name} onChange={(e) => dispatch('Rename character', [{ op: 'updateCharacter', id: c.id, patch: { name: e.target.value || c.name } }])} /></Field>
          <p className="muted small">{c.frameWidth}×{c.frameHeight} frames · collider {c.collider.width}×{c.collider.height}</p>
        </Section>
      ) : null;
      break;
    }
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
        </Section>
      );
  }
  return <aside className="panel panel-right" data-testid="inspector">{body}</aside>;
}
