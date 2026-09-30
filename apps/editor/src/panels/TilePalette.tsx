import { useEffect, useRef } from 'react';
import type { TileStamp, Tileset } from '@beze/project-schema';
import { useActiveScene, useEditor, useProject } from '../store/editorStore.js';
import { assets } from '../services.js';

/**
 * Shows every tile of the map's tilesets plus an "Objects" row of multi-tile stamps; click selects
 * the brush (a gid, or a stamp). Also picks the layer, auto collision and the collision mode.
 */
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
        <button className={collisionMode === 'climb' ? 'active' : ''} onClick={() => setCollisionMode('climb')} data-testid="collision-climb">Paint climbable</button>
        <button className={collisionMode === 'clear' ? 'active' : ''} onClick={() => setCollisionMode('clear')}>Clear</button>
        <span className="muted small">Hold Shift to clear instead. Red tiles block everyone; blue tiles block everyone except a player who can climb.</span>
      </div>
    );
  }

  const stampSets = map.tilesets.map((ref) => ({ ref, tileset: project.tilesets[ref.tilesetId] })).filter((s) => s.tileset?.stamps?.length);

  return (
    <div className="palette">
      <label className="field-inline">
        <span className="muted small">Layer</span>
        <select value={brush.layerId ?? ''} onChange={(e) => setBrush({ layerId: e.target.value })}>
          {map.layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {tool === 'tileBrush' && (
        <label className="field-inline" title="Mark the cell solid when the painted tile is solid (never clears collision)">
          <input type="checkbox" checked={brush.autoCollision} onChange={(e) => setBrush({ autoCollision: e.target.checked })} data-testid="auto-collision" />
          <span className="muted small">Auto collision</span>
        </label>
      )}
      {tool === 'tileBrush' && map.tilesets.map((ref) => {
        const tileset = project.tilesets[ref.tilesetId];
        if (!tileset) return null;
        return (
          <div key={ref.tilesetId} className="tiles">
            {Array.from({ length: tileset.tileCount }, (_, i) => (
              <TileButton key={i} tilesetId={ref.tilesetId} local={i} gid={ref.firstGid + i} selected={!brush.stamp && brush.gid === ref.firstGid + i} onClick={() => setBrush({ gid: ref.firstGid + i, stamp: null })} />
            ))}
          </div>
        );
      })}
      {tool === 'tileBrush' && stampSets.length > 0 && (
        <>
          <span className="palette-label muted" title="Multi-tile objects: one click paints every tile; crowns and roofs go on the layer drawn over characters, trunks and walls on the first layer above the ground (never into the ground itself)">Objects</span>
          {stampSets.map(({ ref, tileset }) => (
            <div key={ref.tilesetId} className="tiles">
              {tileset!.stamps!.map((stamp, index) => (
                <StampButton
                  key={index}
                  tileset={tileset!}
                  stamp={stamp}
                  selected={brush.stamp?.tilesetId === ref.tilesetId && brush.stamp.index === index}
                  onClick={() => setBrush({ stamp: { tilesetId: ref.tilesetId, index } })}
                  testId={`stamp-${ref.tilesetId}-${index}`}
                />
              ))}
            </div>
          ))}
        </>
      )}
      {tool === 'eraser' && <span className="muted small">Click or drag to clear tiles on the selected layer.</span>}
    </div>
  );
}

/** Draws local tile `local` of `tileset` at (dx, dy) on `ctx`, one image pixel per canvas pixel. */
function drawTile(ctx: CanvasRenderingContext2D, image: HTMLImageElement, tileset: Tileset, local: number, dx: number, dy: number): void {
  const col = local % tileset.columns;
  const row = Math.floor(local / tileset.columns);
  const sx = tileset.margin + col * (tileset.tileWidth + tileset.spacing);
  const sy = tileset.margin + row * (tileset.tileHeight + tileset.spacing);
  ctx.drawImage(image, sx, sy, tileset.tileWidth, tileset.tileHeight, dx, dy, tileset.tileWidth, tileset.tileHeight);
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
    ctx.clearRect(0, 0, c.width, c.height);
    const col = local % tileset.columns;
    const row = Math.floor(local / tileset.columns);
    ctx.drawImage(image, tileset.margin + col * (tileset.tileWidth + tileset.spacing), tileset.margin + row * (tileset.tileHeight + tileset.spacing), tileset.tileWidth, tileset.tileHeight, 0, 0, c.width, c.height);
  }, [tileset, local]);
  return (
    <button className={`tile ${selected ? 'active' : ''}`} onClick={onClick} title={`tile ${gid}${tileset?.tileProperties[String(local)]?.solid ? ' (solid)' : ''}`} data-testid={`tile-${gid}`}>
      <canvas ref={ref} width={32} height={32} />
    </button>
  );
}

/** A stamp rendered whole from the tileset image (every cell, at 1:1) so the object reads as one thing. */
function StampButton({ tileset, stamp, selected, onClick, testId }: { tileset: Tileset; stamp: TileStamp; selected: boolean; onClick: () => void; testId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = stamp.width * tileset.tileWidth;
  const height = stamp.height * tileset.tileHeight;
  useEffect(() => {
    const c = ref.current;
    const image = assets.image(tileset.imageAssetId);
    if (!c || !image) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    stamp.tiles.forEach((local, i) => {
      if (local < 0) return;
      drawTile(ctx, image, tileset, local, (i % stamp.width) * tileset.tileWidth, Math.floor(i / stamp.width) * tileset.tileHeight);
    });
  }, [tileset, stamp]);
  const solid = stamp.tiles.some((local) => local >= 0 && tileset.tileProperties[String(local)]?.solid);
  return (
    <button className={`tile stamp ${selected ? 'active' : ''}`} onClick={onClick} title={`${stamp.name} (${stamp.width}×${stamp.height} tiles${solid ? ', solid' : ''})`} data-testid={testId}>
      <canvas ref={ref} width={width} height={height} style={{ width, height }} />
    </button>
  );
}
