import { useEditor, useProject } from '../../store/editorStore.js';
import { Field, Section } from '../../ui/Field.js';
import { toast } from '../../ui/Toast.js';

export function DialogueInspector({ dialogueId }: { dialogueId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const select = useEditor((s) => s.select);
  const d = project?.dialogues[dialogueId];
  if (!project || !d) return null;

  const users = Object.values(project.scenes).flatMap((s) => Object.values(s.entities).filter((e) => e.components.some((c) => c.type === 'interactable' && c.action.type === 'startDialogue' && c.action.dialogueId === d.id)).map((e) => `${e.name} (${s.name})`));

  const remove = () => {
    const r = dispatch('Delete dialogue', [{ op: 'deleteDialogue', id: d.id }]);
    if (r.ok) select({ kind: 'none' });
    else toast.error('Cannot delete: it is still used', r.errors.map((e) => e.message));
  };

  return (
    <Section title="Dialogue" actions={<button className="danger small" onClick={remove}>Delete</button>}>
      <Field label="Name"><input value={d.name} onChange={(e) => dispatch('Rename dialogue', [{ op: 'updateDialogue', id: d.id, patch: { name: e.target.value || d.name } }])} /></Field>
      <p className="muted small">{Object.keys(d.nodes).length} nodes. Edit the lines in the panel below.</p>
      <p className="muted small">{users.length > 0 ? `Used by: ${users.join(', ')}` : 'Not used by any entity yet.'}</p>
    </Section>
  );
}
