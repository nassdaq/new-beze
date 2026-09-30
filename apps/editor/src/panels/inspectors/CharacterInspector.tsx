import type { Direction } from '@beze/project-schema';
import { assets } from '../../services.js';
import { useEditor, useProject } from '../../store/editorStore.js';
import { Field, Section } from '../../ui/Field.js';
import { AssetImagePreview, SpritePreview } from '../../ui/SpritePreview.js';
import { sheetColumns, strikeFrame } from '../../ui/spriteFrames.js';
import { toast } from '../../ui/Toast.js';

const DIRECTIONS: Direction[] = ['down', 'left', 'right', 'up'];

/** Everything about one character: how it looks from each side, its sheet, its collider, and where it is used. */
export function CharacterInspector({ characterId }: { characterId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const select = useEditor((s) => s.select);
  const setActiveScene = useEditor((s) => s.setActiveScene);
  const c = project?.characters[characterId];
  if (!project || !c) return null;

  const image = assets.image(c.spriteSheetAssetId);
  const sheet = project.assets[c.spriteSheetAssetId];
  const cols = image ? sheetColumns(c, image.width) : null;
  const rows = image ? Math.max(1, Math.floor(image.height / c.frameHeight)) : null;
  const strikes = DIRECTIONS.map((d) => ({ d, frame: strikeFrame(c, d) })).filter((s): s is { d: Direction; frame: number } => s.frame !== null);
  const walk = c.animations.walk_down;
  const users = Object.values(project.scenes).flatMap((scene) =>
    scene.entityOrder
      .map((id) => scene.entities[id])
      .filter((e) => e && e.components.some((k) => k.type === 'sprite' && k.characterId === c.id))
      .map((e) => ({ sceneId: scene.id, sceneName: scene.name, entityId: e!.id, entityName: e!.name, player: e!.components.some((k) => k.type === 'playerControl') })),
  );

  const rename = (name: string) => {
    const r = dispatch('Rename character', [{ op: 'updateCharacter', id: c.id, patch: { name: name || c.name } }]);
    if (!r.ok) toast.error('Could not rename', r.errors.map((e) => e.message));
  };

  return (
    <Section title="Character">
      <div className="character-hero">
        <figure className="frame-cell">
          <SpritePreview characterId={c.id} size={96} hoverAnimate showCollider title="Hover to walk. Blue box: collider." />
          <figcaption>sprite · collider</figcaption>
        </figure>
        {c.portraitAssetId && (
          <figure className="frame-cell">
            <AssetImagePreview assetId={c.portraitAssetId} size={96} className="character-portrait" title="Shown beside dialogue lines" />
            <figcaption>portrait</figcaption>
          </figure>
        )}
      </div>
      <Field label="Name"><input value={c.name} data-testid="character-name" onChange={(e) => rename(e.target.value)} /></Field>
      <p className="muted small character-meta">{c.frameWidth}×{c.frameHeight} px frames · walks at {walk.frameRate} fps{strikes.length > 0 ? ' · can attack' : ''}</p>

      <h4 className="subhead">Idle</h4>
      <div className="frame-strip" data-testid="character-idle-strip">
        {DIRECTIONS.map((d) => (
          <figure key={d} className="frame-cell">
            <SpritePreview characterId={c.id} size={48} facing={d} hoverAnimate title={`${c.name} facing ${d} (hover to walk)`} />
            <figcaption>{d}</figcaption>
          </figure>
        ))}
      </div>

      {strikes.length > 0 && (
        <>
          <h4 className="subhead">Attack strike</h4>
          <div className="frame-strip" data-testid="character-attack-strip">
            {strikes.map(({ d, frame }) => (
              <figure key={d} className="frame-cell">
                <SpritePreview characterId={c.id} size={48} facing={d} anim="attack" frame={frame} hoverAnimate title={`${c.name} attacking ${d}: frame ${frame} (hover to swing)`} />
                <figcaption>{d}</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}

      <h4 className="subhead">Sheet</h4>
      <dl className="kv">
        <dt>Asset</dt><dd>{sheet?.name ?? c.spriteSheetAssetId}</dd>
        <dt>Size</dt><dd>{image ? `${image.width}×${image.height} px` : (sheet ? `${sheet.width}×${sheet.height} px` : 'not loaded')}</dd>
        <dt>Frame</dt><dd>{c.frameWidth}×{c.frameHeight} px</dd>
        <dt>Grid</dt><dd>{cols !== null && rows !== null ? `${cols} × ${rows} = ${cols * rows} frames` : '—'}</dd>
      </dl>

      <h4 className="subhead">Collider</h4>
      <dl className="kv">
        <dt>Size</dt><dd>{c.collider.width}×{c.collider.height} px</dd>
        <dt>Offset</dt><dd>x {c.collider.offsetX} · y {c.collider.offsetY}</dd>
      </dl>

      <h4 className="subhead">Used by {users.length === 0 ? 'nobody yet' : `${users.length} ${users.length === 1 ? 'entity' : 'entities'}`}</h4>
      {users.length === 0 ? (
        <p className="muted small">Pick the Place tool (P) and click a tile to put one in the scene.</p>
      ) : (
        <ul className="list uses" data-testid="character-uses">
          {users.map((u) => (
            <li key={u.entityId}>
              <button className="row" onClick={() => { setActiveScene(u.sceneId); select({ kind: 'entity', sceneId: u.sceneId, entityId: u.entityId }); }} title="Select this entity">
                <span className="row-label">{u.entityName}{u.player && <span className="tag">player</span>}</span>
                <span className="muted small">{u.sceneName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
