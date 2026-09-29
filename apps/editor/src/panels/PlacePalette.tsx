import { useEditor, useProject } from '../store/editorStore.js';

export function PlacePalette() {
  const project = useProject();
  const placeCharacterId = useEditor((s) => s.placeCharacterId);
  const setPlaceCharacter = useEditor((s) => s.setPlaceCharacter);
  if (!project) return null;
  return (
    <div className="palette">
      <span className="muted small">Place:</span>
      {Object.values(project.characters).map((c) => (
        <button key={c.id} className={placeCharacterId === c.id ? 'active' : ''} onClick={() => setPlaceCharacter(c.id)} data-testid={`place-${c.id}`}>{c.name}</button>
      ))}
      <span className="muted small">Then click a tile in the scene.</span>
    </div>
  );
}
