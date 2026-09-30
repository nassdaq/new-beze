import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, type Tool as ToolName } from '../store/editorStore.js';
import { assets } from '../services.js';
import { ViewportRenderer } from './ViewportRenderer.js';
import { fitCamera, screenToWorld, worldToTile, zoomAt, type Camera, type Point } from './camera.js';
import type { Tool, PointerInfo, ToolContext } from './tools/Tool.js';
import { SelectTool } from './tools/SelectTool.js';
import { TileBrushTool, CollisionTool } from './tools/TileTools.js';
import { PlaceEntityTool } from './tools/PlaceEntityTool.js';

const TOOLS: Record<ToolName, () => Tool> = {
  select: () => new SelectTool(),
  tileBrush: () => new TileBrushTool(false),
  eraser: () => new TileBrushTool(true),
  collision: () => new CollisionTool(),
  placeEntity: () => new PlaceEntityTool(),
};

/** Canvas host: converts pointer events to world space, routes them to the active tool, renders on change. */
export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ViewportRenderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [hoverTile, setHoverTile] = useState<Point | null>(null);
  const pointerDown = useRef(false);
  const panning = useRef<{ start: Point; camera: Camera } | null>(null);
  const spaceHeld = useRef(false);

  const activeTool = useEditor((s) => s.activeTool);
  const tool = useMemo(() => TOOLS[activeTool](), [activeTool]);

  // Render whenever anything relevant changes. Subscribing to the store directly avoids
  // React re-render cost for high-frequency edits like paint strokes.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new ViewportRenderer(canvas, assets);
    rendererRef.current = renderer;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const s = useEditor.getState();
      const scene = s.project && s.activeSceneId ? s.project.scenes[s.activeSceneId] : null;
      if (!s.project || !scene) return;
      const map = scene.mapId ? s.project.maps[scene.mapId] : undefined;
      if (!cameraRef.current) {
        const w = map ? map.width * map.tileWidth : s.project.settings.viewport.width;
        const h = map ? map.height * map.tileHeight : s.project.settings.viewport.height;
        cameraRef.current = fitCamera(w, h, canvas.clientWidth, canvas.clientHeight);
      }
      renderer.render(s.project, scene, cameraRef.current, {
        selection: s.selection,
        hoverTile: hoverRef.current,
        showCollision: s.activeTool === 'collision',
        ghost: s.activeTool === 'placeEntity' && s.placeCharacterId && hoverRef.current ? { characterId: s.placeCharacterId, tile: hoverRef.current } : null,
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    scheduleRef.current = schedule;
    const unsub = useEditor.subscribe(schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    schedule();
    return () => { unsub(); observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
  const hoverRef = useRef<Point | null>(null);
  const scheduleRef = useRef<() => void>(() => {});

  // Reset the camera when the active scene changes.
  const activeSceneId = useEditor((s) => s.activeSceneId);
  useEffect(() => { cameraRef.current = null; scheduleRef.current(); }, [activeSceneId]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !isTyping(e)) { spaceHeld.current = true; e.preventDefault(); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const toolContext = (): ToolContext | null => {
    const store = useEditor.getState();
    const scene = store.project && store.activeSceneId ? store.project.scenes[store.activeSceneId] : null;
    if (!store.project || !scene) return null;
    const map = scene.mapId ? store.project.maps[scene.mapId] ?? null : null;
    return { store, project: store.project, scene, map };
  };

  const pointerInfo = (e: React.PointerEvent, ctx: ToolContext): PointerInfo => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(cameraRef.current!, screen);
    const tile = worldToTile(world, ctx.project.settings.tileSize);
    const inMap = !!ctx.map && tile.x >= 0 && tile.y >= 0 && tile.x < ctx.map.width && tile.y < ctx.map.height;
    return { world, tile, inMap, button: e.button, shiftKey: e.shiftKey };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const ctx = toolContext();
    if (!ctx || !cameraRef.current) return;
    canvasRef.current!.setPointerCapture(e.pointerId);
    canvasRef.current!.focus();
    if (e.button === 1 || e.button === 2 || spaceHeld.current) {
      panning.current = { start: { x: e.clientX, y: e.clientY }, camera: cameraRef.current };
      e.preventDefault();
      return;
    }
    pointerDown.current = true;
    tool.onDown?.(ctx, pointerInfo(e, ctx));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const ctx = toolContext();
    if (!ctx || !cameraRef.current) return;
    if (panning.current) {
      const { start, camera } = panning.current;
      cameraRef.current = { ...camera, x: camera.x - (e.clientX - start.x) / camera.zoom, y: camera.y - (e.clientY - start.y) / camera.zoom };
      scheduleRef.current();
      return;
    }
    const p = pointerInfo(e, ctx);
    const next = p.inMap ? p.tile : null;
    if ((next?.x !== hoverRef.current?.x) || (next?.y !== hoverRef.current?.y)) {
      hoverRef.current = next;
      setHoverTile(next);
      scheduleRef.current();
    }
    tool.onMove?.(ctx, p, pointerDown.current);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const ctx = toolContext();
    panning.current = null;
    if (!ctx) return;
    if (pointerDown.current) tool.onUp?.(ctx, pointerInfo(e, ctx));
    pointerDown.current = false;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!cameraRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    cameraRef.current = zoomAt(cameraRef.current, anchor, e.deltaY < 0 ? 1.25 : 0.8);
    scheduleRef.current();
  };

  return (
    <div className="viewport">
      <canvas
        ref={canvasRef}
        className="viewport-canvas"
        tabIndex={0}
        data-testid="viewport"
        style={{ cursor: tool.cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { hoverRef.current = null; setHoverTile(null); scheduleRef.current(); }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="viewport-status">
        {hoverTile ? `tile ${hoverTile.x}, ${hoverTile.y}` : ''}
        <span className="viewport-hint">wheel: zoom · space or right-drag: pan</span>
      </div>
    </div>
  );
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
