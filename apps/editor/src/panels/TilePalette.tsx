import { useEffect, useRef } from 'react';
import { useActiveScene, useEditor, useProject } from '../store/editorStore.js';
import { assets } from '../services.js';

/** Shows every tile of the map's tilesets; click selects the brush gid. Also picks the layer and collision mode. */
export function TilePalette() {
  const project = useProject();
  const scene = useActiveScene();
  const tool = useEditor((s) => s.activeTool);
  const brush = useEditor((s) => s.tileBrush);
  const setBrush = useEditor((s) => s.setTileBrush);
  const collisionMode = useEditor((s) => s.collisionMode);
  const setCollisionMode = useEditor((s) => s.setCollisionMode);
  const map = project && scene?.mapId ? project.maps[scene.mapId] : undefined;
  if (!project || !map) return <p className="muted small">This scene has no map.</p>;

  if (tool === 'collision') {
    return (
      <div className="palette">
        <span className="muted small">Collision:</span>
        <button className={collisionMode === 'solid' ? 'active' : ''} onClick={() => setCollisionMode('solid')}>Paint solid</button>
        <button className={collisionMode === 'clear' ? 'active' : ''} onClick={() => setCollisionMode('clear')}>Clear</button>
        <span className="muted small">Hold Shift to invert. Red tiles block the player.</span>
      </div>
    );
  }

  return (
    <div className="palette">
      <label className="field-inline">
        <span className="muted small">Layer</span>
        <select value={brush.layerId ?? ''} onChange={(e) => setBrush({ layerId: e.target.value })}>
          {map.layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {tool === 'tileBrush' && map.tilesets.map((ref) => {
        const tileset = project.tilesets[ref.tilesetId];
        if (!tileset) return null;
        return (
          <div key={ref.tilesetId} className="tiles">
            {Array.from({ length: tileset.tileCount }, (_, i) => (
              <TileButton key={i} tilesetId={ref.tilesetId} local={i} gid={ref.firstGid + i} selected={brush.gid === ref.firstGid + i} onClick={() => setBrush({ gid: ref.firstGid + i })} />
            ))}
          </div>
        );
      })}
      {tool === 'eraser' && <span className="muted small">Click or drag to clear tiles on the selected layer.</span>}
    </div>
  );
}

function TileButton({ tilesetId, local, gid, selected, onClick }: { tilesetId: string; local: number; gid: number; selected: boolean; onClick: () => void }) {
  const project = useProject();
  const ref = useRef<HTMLCanvasElement>(null);
  const tileset = project?.tilesets[tilesetId];
  useEffect(() => {
    const c = ref.current;
    const image = tileset ? assets.image(tileset.imageAssetId) : undefined;
    if (!c || !tileset || !image) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const col = local % tileset.columns;
    const row = Math.floor(local / tileset.columns);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(image, tileset.margin + col * (tileset.tileWidth + tileset.spacing), tileset.margin + row * (tileset.tileHeight + tileset.spacing), tileset.tileWidth, tileset.tileHeight, 0, 0, c.width, c.height);
  }, [tileset, local]);
  return (
    <button className={`tile ${selected ? 'active' : ''}`} onClick={onClick} title={`tile ${gid}${tileset?.tileProperties[String(local)]?.solid ? ' (solid)' : ''}`} data-testid={`tile-${gid}`}>
      <canvas ref={ref} width={32} height={32} />
    </button>
  );
}
