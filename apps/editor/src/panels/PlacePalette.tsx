import { useEditor, useProject } from '../store/editorStore.js';
import { SpritePreview } from '../ui/SpritePreview.js';

/** Pick which character the place tool drops. Cards show the sprite so you can tell them apart before placing. */
export function PlacePalette() {
  const project = useProject();
  const placeCharacterId = useEditor((s) => s.placeCharacterId);
  const setPlaceCharacter = useEditor((s) => s.setPlaceCharacter);
  if (!project) return null;
  const characters = Object.values(project.characters);
  return (
    <div className="palette place-palette">
      <span className="muted small palette-label">Place</span>
      <div className="place-cards">
        {characters.map((c) => {
          const selected = placeCharacterId === c.id;
          return (
            <button
              key={c.id}
              className={`place-card${selected ? ' active' : ''}`}
              onClick={() => setPlaceCharacter(c.id)}
              data-testid={`place-${c.id}`}
              title={`${c.name} · ${c.frameWidth}×${c.frameHeight} px${c.animations.attack_down ? ' · can attack' : ''}`}
              aria-pressed={selected}
            >
              <SpritePreview characterId={c.id} size={64} hoverAnimate />
              <span className="place-card-name">{c.name}</span>
            </button>
          );
        })}
      </div>
      <span className="muted small palette-hint">{placeCharacterId ? 'Click a tile in the scene to place it.' : 'Pick a character, then click a tile in the scene.'}</span>
    </div>
  );
}
