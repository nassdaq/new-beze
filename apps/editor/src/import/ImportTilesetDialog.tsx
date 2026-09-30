import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { Operation, Tileset } from '@beze/project-schema';
import { newId, nextFirstGid } from '@beze/project-core';
import { assets } from '../services.js';
import { useEditor, useProject } from '../store/editorStore.js';
import { Field } from '../ui/Field.js';
import { toast } from '../ui/Toast.js';
import { ACCEPT, canvasToPng, decodeFile, fileFromTransfer, imageToCanvas, nameFromFile, previewScale, strokeGrid, type DecodedFile } from './imageFiles.js';
import { Modal } from './Modal.js';
import { detectTileSize } from './sheetTools.js';

const TILE_SIZES = [16, 32, 48, 64] as const;

/**
 * Registers an image as a tileset: tile size (detected from the repeating tile edges), name,
 * tile count and columns derived from the image. The tileset is attached to the active scene's
 * map right away (addMapTileset) so its tiles appear in the palette.
 */
export function ImportTilesetDialog({ onClose }: { onClose(): void }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const activeSceneId = useEditor((s) => s.activeSceneId);
  const [decoded, setDecoded] = useState<DecodedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tileSize, setTileSize] = useState<number>(project?.settings.tileSize ?? 32);
  const [detected, setDetected] = useState<{ tileSize: number; confidence: number } | null>(null);
  const [name, setName] = useState('');

  const pick = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const d = await decodeFile(file);
      setDecoded(d);
      setName((n) => n || nameFromFile(file));
      const guess = detectTileSize(d.image, [...TILE_SIZES], project?.settings.tileSize ?? 32);
      setDetected(guess);
      setTileSize(guess.tileSize);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); void pick(fileFromTransfer(e.dataTransfer)); };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => { void pick(e.target.files?.[0] ?? null); };

  const columns = decoded ? Math.floor(decoded.image.width / tileSize) : 0;
  const rows = decoded ? Math.floor(decoded.image.height / tileSize) : 0;
  const tileCount = columns * rows;
  const source = useMemo(() => (decoded ? imageToCanvas(decoded.image) : null), [decoded]);

  const doImport = async () => {
    if (!decoded || !source) return;
    const trimmed = name.trim();
    if (!trimmed) { setError('Give the tileset a name.'); return; }
    if (tileCount < 1) { setError(`The image is smaller than one ${tileSize}×${tileSize} tile.`); return; }
    setBusy(true);
    setError(null);
    try {
      const blob = decoded.file.type === 'image/png' ? decoded.file : await canvasToPng(source);
      const asset = await assets.put(blob, { name: `${trimmed} tiles` });
      const tileset: Tileset = {
        id: newId('tls'), name: trimmed, imageAssetId: asset.id,
        tileWidth: tileSize, tileHeight: tileSize, columns, tileCount, margin: 0, spacing: 0, tileProperties: {},
      };
      const mapId = project && activeSceneId ? project.scenes[activeSceneId]?.mapId ?? null : null;
      const ops: Operation[] = [{ op: 'registerAsset', asset }, { op: 'createTileset', tileset }];
      if (mapId && project) ops.push({ op: 'addMapTileset', mapId, tilesetId: tileset.id, firstGid: nextFirstGid(project, mapId) });
      const r = dispatch('Import tileset', ops);
      if (!r.ok) { setError(r.errors.map((e) => e.message).join('\n')); return; }
      toast.info(`Imported tileset ${trimmed} (${tileCount} tiles of ${tileSize}px)${mapId ? ' and added it to this map' : ''}.`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Import tileset"
      onClose={onClose}
      className="import-dialog"
      testId="import-tileset-dialog"
      footer={<>
        <span className="muted small import-footnote">{decoded ? `${columns} columns × ${rows} rows = ${tileCount} tiles` : 'PNG, WebP or JPEG · up to 5 MB · up to 4096×4096'}</span>
        <span className="spacer" />
        <button onClick={onClose} disabled={busy}>Cancel</button>
        <button className="primary" onClick={() => void doImport()} disabled={!decoded || busy} data-testid="import-tileset-confirm">{busy ? 'Importing…' : 'Import'}</button>
      </>}
    >
      <div className="import-body">
        <div
          className={`import-stage${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {source
            ? <TileCanvas source={source} tileSize={tileSize} columns={columns} rows={rows} />
            : <div className="import-drop">
              <p><strong>Drop a tileset here</strong></p>
              <p className="muted small">A grid of square tiles with no gaps: 16, 32, 48 or 64 px each. Ask your image tool for "a top-down pixel-art tileset, 32×32 tiles, 8 columns, grass, path, water, trees, no gaps between tiles".</p>
            </div>}
          <label className="import-file">
            <span className="muted small">{decoded ? `${decoded.file.name} · ${decoded.image.width}×${decoded.image.height}` : 'Choose a file'}</span>
            <input type="file" accept={ACCEPT} onChange={onFile} data-testid="import-tileset-file" />
          </label>
        </div>
        <div className="import-controls">
          <p className="import-detection small" data-testid="import-tileset-detection">
            {detected ? `Detected ${detected.tileSize}×${detected.tileSize} tiles · ${Math.round(detected.confidence * 100)}% sure` : 'Pick an image to detect its tile size.'}
          </p>
          <Field label="Tile size">
            <select value={tileSize} onChange={(e) => setTileSize(Number(e.target.value))} data-testid="import-tile-size">
              {TILE_SIZES.map((s) => <option key={s} value={s}>{s} × {s}{project && s === project.settings.tileSize ? ' (this game)' : ''}</option>)}
            </select>
          </Field>
          {project && tileSize !== project.settings.tileSize && <p className="muted small import-hint">This game uses {project.settings.tileSize} px tiles; a {tileSize} px tileset paints at its own size.</p>}
          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dungeon" data-testid="import-tileset-name" /></Field>
          {error && <pre className="ask-error" data-testid="import-error">{error}</pre>}
        </div>
      </div>
    </Modal>
  );
}

function TileCanvas({ source, tileSize, columns, rows }: { source: HTMLCanvasElement; tileSize: number; columns: number; rows: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const s = previewScale(source.width, source.height);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(source.width * s)), h = Math.max(1, Math.round(source.height * s));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = s < 1;
    ctx.drawImage(source, 0, 0, w, h);
    const lines = (n: number) => Array.from({ length: n + 1 }, (_, i) => i * tileSize * s);
    strokeGrid(ctx, lines(columns), lines(rows), w, h);
  }, [source, tileSize, columns, rows]);
  return <canvas ref={ref} className="import-canvas" data-testid="import-tileset-canvas" />;
}
