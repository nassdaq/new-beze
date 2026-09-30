import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { Character } from '@beze/project-schema';
import { newId } from '@beze/project-core';
import { assets } from '../services.js';
import { useEditor } from '../store/editorStore.js';
import { Field } from '../ui/Field.js';
import { toast } from '../ui/Toast.js';
import { ACCEPT, canvasToPng, decodeFile, fileFromTransfer, imageToCanvas, nameFromFile, previewScale, strokeGrid, type DecodedFile } from './imageFiles.js';
import { Modal } from './Modal.js';
import { SheetPreview } from './SheetPreview.js';
import {
  LAYOUT_PRESETS, cropImage, detectGrid, detectGutters, framesFloat, gridContradictsGutters, guessPreset, hasOpaqueCorners,
  normalizeToGrid, presetAnimations, removeBackground, repack, suggestCellSize, suggestCollider, trimCells,
  type LayoutPreset, type RGBAImage, type SheetLayout,
} from './sheetTools.js';

type FrameMode = 'grid' | 'gaps';
const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;

/**
 * Turns a sprite sheet made elsewhere (ChatGPT, Aseprite, a pack from itch) into a character:
 * strips a painted background, finds the frame grid, repacks ragged frames into uniform cells
 * with feet at the bottom, maps rows to animations and stores the cut sheet as an upload.
 */
export function ImportSheetDialog({ onClose }: { onClose(): void }) {
  const dispatch = useEditor((s) => s.dispatch);
  const select = useEditor((s) => s.select);
  const [decoded, setDecoded] = useState<DecodedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [removeBg, setRemoveBg] = useState(false);
  const [tolerance, setTolerance] = useState(32);
  const deferredTolerance = useDeferredValue(tolerance);
  const [mode, setMode] = useState<FrameMode>('grid');
  const [frameW, setFrameW] = useState(48);
  const [frameH, setFrameH] = useState(64);
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(8);
  const [align, setAlign] = useState(false);
  const [preset, setPreset] = useState<LayoutPreset>('beze-v2');
  const [name, setName] = useState('');
  const [detectionText, setDetectionText] = useState('');

  // 1. Background removal (deferred tolerance keeps the slider responsive on big images).
  const processed = useMemo<RGBAImage | null>(() => {
    if (!decoded) return null;
    return removeBg ? removeBackground(decoded.image, deferredTolerance) : decoded.image;
  }, [decoded, removeBg, deferredTolerance]);

  // 2. Detection runs on the processed pixels and pre-fills the controls.
  const detection = useMemo(() => (processed ? { grid: detectGrid(processed), gutters: detectGutters(processed) } : null), [processed]);
  useEffect(() => {
    if (!detection || !processed) return;
    const { grid, gutters } = detection;
    const sure = Math.round(grid.confidence * 100);
    if (grid.confidence >= 0.9 && !gridContradictsGutters(grid, gutters)) {
      setMode('grid');
      setFrameW(grid.frameWidth); setFrameH(grid.frameHeight); setColumns(grid.columns); setRows(grid.rows);
      setPreset(guessPreset(grid.columns, grid.rows));
      // Frames that float above their cell bottoms get re-aligned so feet stand on the ground.
      setAlign(framesFloat(trimCells(processed, grid.frameWidth, grid.frameHeight, grid.columns, grid.rows), grid.frameHeight));
      setDetectionText(`Detected ${grid.frameWidth}×${grid.frameHeight} frames · ${grid.columns} columns × ${grid.rows} rows · ${sure}% sure`);
    } else if (gutters.boxes.length >= 2) {
      // No clean grid but separable frames: repack them into uniform cells.
      const cell = suggestCellSize(gutters.boxes);
      const layout = normalizeToGrid(gutters.boxes, cell.cellWidth, cell.cellHeight);
      setMode('gaps');
      setFrameW(cell.cellWidth); setFrameH(cell.cellHeight); setColumns(layout.columns); setRows(layout.rows);
      setPreset(guessPreset(layout.columns, layout.rows));
      setAlign(true);
      setDetectionText(`No uniform grid; found ${gutters.boxes.length} separate frames in ${gutters.rows.length} rows · repacking into ${layout.columns} columns × ${layout.rows} rows of ${cell.cellWidth}×${cell.cellHeight}`);
    } else {
      setMode('grid');
      setFrameW(processed.width); setFrameH(processed.height); setColumns(1); setRows(1);
      setPreset('single');
      setAlign(false);
      setDetectionText(gutters.boxes.length === 1 ? 'One frame found · a single picture used for every direction' : 'Nothing found: the image is empty or entirely background');
    }
  }, [detection, processed]);

  // 3. The output sheet: uniform cells, optionally re-aligned.
  const output = useMemo<{ image: RGBAImage; layout: SheetLayout | null; changed: boolean } | null>(() => {
    if (!processed) return null;
    const fw = clampInt(frameW, 1, 4096), fh = clampInt(frameH, 1, 4096);
    if (mode === 'gaps') {
      const boxes = detection?.gutters.boxes ?? [];
      if (boxes.length === 0) return { image: processed, layout: null, changed: removeBg };
      const layout = normalizeToGrid(boxes, fw, fh);
      return { image: repack(processed, layout), layout, changed: true };
    }
    const cols = clampInt(columns, 1, 64), rws = clampInt(rows, 1, 64);
    if (align) {
      const layout = normalizeToGrid(trimCells(processed, fw, fh, cols, rws), fw, fh, { columns: cols, rows: rws });
      return { image: repack(processed, layout), layout, changed: true };
    }
    const cropped = cropImage(processed, cols * fw, rws * fh);
    return { image: cropped, layout: null, changed: removeBg || cropped !== processed };
  }, [processed, detection, mode, frameW, frameH, columns, rows, align, removeBg]);

  const outCanvas = useMemo(() => (output ? imageToCanvas(output.image) : null), [output]);
  const outColumns = output?.layout?.columns ?? clampInt(columns, 1, 64);
  const outRows = output?.layout?.rows ?? clampInt(rows, 1, 64);
  const fw = clampInt(frameW, 1, 4096), fh = clampInt(frameH, 1, 4096);
  const animations = useMemo(() => presetAnimations(preset, outColumns, outRows), [preset, outColumns, outRows]);
  const collider = useMemo(() => suggestCollider(fw, fh), [fw, fh]);

  const pick = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const d = await decodeFile(file);
      setDecoded(d);
      setName((n) => n || nameFromFile(file));
      const opaque = hasOpaqueCorners(d.image);
      setRemoveBg(opaque);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); void pick(fileFromTransfer(e.dataTransfer)); };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => { void pick(e.target.files?.[0] ?? null); };

  const doImport = async () => {
    if (!decoded || !output || !outCanvas) return;
    const trimmed = name.trim();
    if (!trimmed) { setError('Give the character a name.'); return; }
    setBusy(true);
    setError(null);
    try {
      // Store the cut, uniform sheet when anything changed; otherwise the original bytes as they are.
      const mustReencode = output.changed || decoded.file.type !== 'image/png';
      const blob = mustReencode ? await canvasToPng(outCanvas) : decoded.file;
      const asset = await assets.put(blob, { name: `${trimmed} sheet` });
      const character: Character = {
        id: newId('chr'), name: trimmed, spriteSheetAssetId: asset.id,
        frameWidth: fw, frameHeight: fh, animations, collider,
      };
      const r = dispatch('Import character', [{ op: 'registerAsset', asset }, { op: 'createCharacter', character }]);
      if (!r.ok) { setError(r.errors.map((e) => e.message).join('\n')); return; }
      select({ kind: 'character', characterId: character.id });
      toast.info(`Imported ${trimmed} (${outColumns}×${outRows} frames of ${fw}×${fh})`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const gutterCount = detection?.gutters.boxes.length ?? 0;

  return (
    <Modal
      title="Import sprite sheet"
      onClose={onClose}
      className="import-dialog"
      testId="import-sheet-dialog"
      footer={<>
        <span className="muted small import-footnote">
          {output?.changed ? 'The sheet is re-cut and stored as a new PNG.' : decoded ? 'The file is stored as it is.' : 'PNG, WebP or JPEG · up to 5 MB · up to 4096×4096'}
        </span>
        <span className="spacer" />
        <button onClick={onClose} disabled={busy}>Cancel</button>
        <button className="primary" onClick={() => void doImport()} disabled={!decoded || busy} data-testid="import-confirm">{busy ? 'Importing…' : 'Import'}</button>
      </>}
    >
      <div className="import-body">
        <div
          className={`import-stage${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {processed && output
            ? <SheetCanvas image={mode === 'gaps' || align ? output.image : processed} layout={output.layout} grid={mode === 'grid' && !align ? { fw, fh, columns: outColumns, rows: outRows } : null} />
            : <div className="import-drop">
              <p><strong>Drop a sprite sheet here</strong></p>
              <p className="muted small">Ask your image tool for "a pixel-art sprite sheet, 4 columns × 8 rows, walk down/left/right/up then attack, plain white background, feet on the bottom of every frame". Then drop the PNG here.</p>
            </div>}
          <label className="import-file">
            <span className="muted small">{decoded ? `${decoded.file.name} · ${decoded.image.width}×${decoded.image.height}` : 'Choose a file'}</span>
            <input type="file" accept={ACCEPT} onChange={onFile} data-testid="import-file" />
          </label>
        </div>

        <div className="import-controls">
          <p className="import-detection small" data-testid="import-detection">{detectionText || 'Pick an image to detect its frames.'}</p>

          <label className="check">
            <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} data-testid="import-remove-bg" />
            Remove background (flood-fill from the corners)
          </label>
          {removeBg && (
            <Field label={`Tolerance ${tolerance}`}>
              <input type="range" min={0} max={128} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
            </Field>
          )}

          <div className="import-modes">
            <label className="field-inline"><input type="radio" name="frame-mode" checked={mode === 'grid'} onChange={() => setMode('grid')} /> Uniform grid</label>
            <label className="field-inline"><input type="radio" name="frame-mode" checked={mode === 'gaps'} onChange={() => setMode('gaps')} disabled={gutterCount < 2} title={gutterCount < 2 ? 'No separate frames found' : `${gutterCount} frames separated by transparent gaps`} /> Frames separated by gaps ({gutterCount})</label>
          </div>

          <div className="field-row">
            <Field label={mode === 'gaps' ? 'Cell width' : 'Frame width'}><input type="number" min={1} max={4096} value={frameW} onChange={(e) => setFrameW(Number(e.target.value))} data-testid="import-frame-width" /></Field>
            <Field label={mode === 'gaps' ? 'Cell height' : 'Frame height'}><input type="number" min={1} max={4096} value={frameH} onChange={(e) => setFrameH(Number(e.target.value))} data-testid="import-frame-height" /></Field>
            <Field label="Columns"><input type="number" min={1} max={64} value={mode === 'gaps' ? outColumns : columns} onChange={(e) => setColumns(Number(e.target.value))} readOnly={mode === 'gaps'} data-testid="import-columns" /></Field>
            <Field label="Rows"><input type="number" min={1} max={64} value={mode === 'gaps' ? outRows : rows} onChange={(e) => setRows(Number(e.target.value))} readOnly={mode === 'gaps'} data-testid="import-rows" /></Field>
          </div>

          <label className="check" title="Trim each frame and put it bottom-centred in its cell so feet stand on the ground">
            <input type="checkbox" checked={mode === 'gaps' || align} disabled={mode === 'gaps'} onChange={(e) => setAlign(e.target.checked)} data-testid="import-align" />
            Align frames: feet at the bottom, centred
          </label>

          <Field label="Layout">
            <select value={preset} onChange={(e) => setPreset(e.target.value as LayoutPreset)} data-testid="import-preset">
              {LAYOUT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <p className="muted small import-hint">{LAYOUT_PRESETS.find((p) => p.id === preset)?.hint}</p>

          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Villager" data-testid="import-name" /></Field>

          <div className="frame-strip import-previews">
            {DIRECTIONS.map((dir) => (
              <SheetPreview
                key={dir}
                sheet={outCanvas}
                frameWidth={fw}
                frameHeight={fh}
                frames={animations[`walk_${dir}`].frames}
                frameRate={animations[`walk_${dir}`].frameRate}
                size={64}
                collider={dir === 'down' ? collider : undefined}
                label={`walk ${dir}`}
              />
            ))}
          </div>

          {error && <pre className="ask-error" data-testid="import-error">{error}</pre>}
        </div>
      </div>
    </Modal>
  );
}

function clampInt(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
}

/** The sheet, scaled to fit, with the grid or the detected frame boxes drawn over it. */
function SheetCanvas({ image, layout, grid }: { image: RGBAImage; layout: SheetLayout | null; grid: { fw: number; fh: number; columns: number; rows: number } | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const source = useMemo(() => imageToCanvas(image), [image]);
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
    const lines = (n: number, step: number) => Array.from({ length: n + 1 }, (_, i) => i * step * s);
    if (grid) {
      strokeGrid(ctx, lines(grid.columns, grid.fw), lines(grid.rows, grid.fh), w, h);
    } else if (layout) {
      strokeGrid(ctx, lines(layout.columns, layout.cellWidth), lines(layout.rows, layout.cellHeight), w, h);
      ctx.strokeStyle = 'rgba(246, 211, 101, 0.9)';
      ctx.lineWidth = 1;
      for (const p of layout.placements) ctx.strokeRect(Math.round(p.x * s) + 0.5, Math.round(p.y * s) + 0.5, Math.max(1, Math.round(p.src.w * s) - 1), Math.max(1, Math.round(p.src.h * s) - 1));
    }
  }, [source, layout, grid]);
  return <canvas ref={ref} className="import-canvas" data-testid="import-canvas" />;
}
