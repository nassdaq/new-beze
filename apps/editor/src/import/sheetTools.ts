import type { Character } from '@beze/project-schema';

/**
 * Pure pixel tools for importing sprite sheets and tilesets drawn by image tools (ChatGPT and
 * friends). Everything here works on plain RGBA buffers so it runs in node tests and in workers;
 * the dialogs wrap it with canvases.
 */

/** ImageData-like: `data` is width*height*4 bytes, row-major RGBA. */
export interface RGBAImage { width: number; height: number; data: Uint8ClampedArray }
/** A rectangle in sheet pixels. `cell` says which grid cell the box came from when it is known. */
export interface Box { x: number; y: number; w: number; h: number; cell?: { column: number; row: number } }
/** Half-open index range [start, end). */
export interface Range { start: number; end: number }

/** Pixels with alpha at or below this count as empty. AI exports leave faint noise around sprites. */
export const ALPHA_EMPTY = 8;

export function createImage(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneImage(img: RGBAImage): RGBAImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

/** True when a corner is opaque, i.e. the image most likely has a painted background rather than transparency. */
export function hasOpaqueCorners(img: RGBAImage): boolean {
  const { width, height, data } = img;
  if (width === 0 || height === 0) return false;
  const corners = [0, (width - 1) * 4, (height - 1) * width * 4, ((height - 1) * width + width - 1) * 4];
  return corners.every((i) => (data[i + 3] ?? 0) > ALPHA_EMPTY);
}

// ---------------------------------------------------------------------------------------------
// Background removal

/**
 * Flood-fills from the four corners over pixels whose colour is within `tolerance` (euclidean RGB
 * distance, 0..441) of that corner's colour and makes them transparent. Anti-aliased fringe pixels
 * next to the fill fade out in proportion to how close they are to the background colour.
 * Returns a new image; the input is untouched. Corners that are already transparent are skipped.
 */
export function removeBackground(img: RGBAImage, tolerance = 32): RGBAImage {
  const out = cloneImage(img);
  const { width, height, data } = out;
  if (width === 0 || height === 0) return out;
  const tol2 = tolerance * tolerance;
  const filled = new Uint8Array(width * height);
  const seeds: number[][] = [];
  const stack = new Int32Array(width * height);

  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  for (const corner of corners) {
    if (filled[corner]) continue;
    const ci = corner * 4;
    if ((data[ci + 3] ?? 0) <= ALPHA_EMPTY) continue; // already transparent: nothing to remove here
    const cr = data[ci]!, cg = data[ci + 1]!, cb = data[ci + 2]!;
    seeds.push([cr, cg, cb]);
    let top = 0;
    stack[top++] = corner;
    filled[corner] = 1;
    const visit = (n: number) => {
      if (filled[n]) return;
      const i = n * 4;
      let bg = data[i + 3]! <= ALPHA_EMPTY;
      if (!bg) {
        const dr = data[i]! - cr, dg = data[i + 1]! - cg, db = data[i + 2]! - cb;
        bg = dr * dr + dg * dg + db * db <= tol2;
      }
      if (bg) { filled[n] = 1; stack[top++] = n; }
    };
    while (top > 0) {
      const p = stack[--top]!;
      const x = p % width;
      const y = (p - x) / width;
      if (x > 0) visit(p - 1);
      if (x < width - 1) visit(p + 1);
      if (y > 0) visit(p - width);
      if (y < height - 1) visit(p + width);
    }
  }
  if (seeds.length === 0) return out;

  // Feather: an opaque pixel touching the fill whose colour is still close to a background colour is a
  // fringe; fade it (alpha 0 at `tolerance`, unchanged at 2×tolerance).
  const fade = new Float32Array(width * height).fill(1);
  for (let p = 0; p < width * height; p++) {
    if (filled[p]) continue;
    const x = p % width;
    const y = (p - x) / width;
    const touches = (x > 0 && filled[p - 1]) || (x < width - 1 && filled[p + 1]) || (y > 0 && filled[p - width]) || (y < height - 1 && filled[p + width]);
    if (!touches) continue;
    const i = p * 4;
    let best = Infinity;
    for (const [sr, sg, sb] of seeds as [number, number, number][]) {
      const dr = data[i]! - sr, dg = data[i + 1]! - sg, db = data[i + 2]! - sb;
      best = Math.min(best, Math.sqrt(dr * dr + dg * dg + db * db));
    }
    if (tolerance > 0 && best < tolerance * 2) fade[p] = Math.max(0, Math.min(1, (best - tolerance) / tolerance));
  }
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (filled[p]) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0; }
    else if (fade[p]! < 1) data[i + 3] = Math.round(data[i + 3]! * fade[p]!);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Profiles, gutters, boxes

function runs(profile: ArrayLike<number>): Range[] {
  const out: Range[] = [];
  let start = -1;
  for (let i = 0; i < profile.length; i++) {
    const on = (profile[i] ?? 0) > 0;
    if (on && start < 0) start = i;
    if (!on && start >= 0) { out.push({ start, end: i }); start = -1; }
  }
  if (start >= 0) out.push({ start, end: profile.length });
  return out;
}

function columnProfile(img: RGBAImage, y0: number, y1: number, x0 = 0, x1 = img.width): Uint32Array {
  const out = new Uint32Array(img.width);
  for (let y = y0; y < y1; y++) {
    const row = y * img.width;
    for (let x = x0; x < x1; x++) if (img.data[(row + x) * 4 + 3]! > ALPHA_EMPTY) out[x]!++;
  }
  return out;
}

function rowProfile(img: RGBAImage, x0 = 0, x1 = img.width, y0 = 0, y1 = img.height): Uint32Array {
  const out = new Uint32Array(img.height);
  for (let y = y0; y < y1; y++) {
    const row = y * img.width;
    for (let x = x0; x < x1; x++) if (img.data[(row + x) * 4 + 3]! > ALPHA_EMPTY) { out[y]!++; }
  }
  return out;
}

/** Tight bounding box of the non-empty pixels inside a rectangle, or null when it is empty. */
export function contentBox(img: RGBAImage, x0: number, y0: number, w: number, h: number): Box | null {
  const x1 = Math.min(img.width, x0 + w);
  const y1 = Math.min(img.height, y0 + h);
  let minX = x1, minY = y1, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) {
    const row = y * img.width;
    for (let x = x0; x < x1; x++) {
      if (img.data[(row + x) * 4 + 3]! > ALPHA_EMPTY) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export interface GutterResult {
  /** Tight frame boxes, row-major (top band first, left to right). */
  boxes: Box[];
  /** Vertical bands with content, separated by fully transparent rows. */
  rows: Range[];
  /** Horizontal bands with content over the whole sheet, separated by fully transparent columns. */
  columns: Range[];
}

/**
 * Finds frames separated by transparent gutters: transparent rows split the sheet into bands,
 * transparent columns inside each band split it into frames. Frames that touch each other end up
 * in one box; `detectGrid` is the tool for those sheets.
 */
export function detectGutters(img: RGBAImage): GutterResult {
  const rows = runs(rowProfile(img));
  const columns = runs(columnProfile(img, 0, img.height));
  const boxes: Box[] = [];
  rows.forEach((band, rowIndex) => {
    const cols = runs(columnProfile(img, band.start, band.end));
    cols.forEach((c, columnIndex) => {
      const tight = contentBox(img, c.start, band.start, c.end - c.start, band.end - band.start);
      if (tight) boxes.push({ ...tight, cell: { column: columnIndex, row: rowIndex } });
    });
  });
  return { boxes, rows, columns };
}

// ---------------------------------------------------------------------------------------------
// Grid detection

export interface GridGuess {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  /** 0..1: how empty the internal grid lines are. 0 means nothing fit (a painted background, say). */
  confidence: number;
}

const COMMON_SIZES = [16, 24, 32, 48, 64, 96, 128];
const MIN_CELL = 8;
/** Candidates whose grid lines are at least this empty are all "plausible"; the finest of them wins... */
const PASS = 0.985;
/** ...unless a coarser grid that contains it scores clearly better (a short sprite in a tall cell). */
const NESTED_EPS = 0.005;

function gridCandidates(img: RGBAImage, gutters: GutterResult): { fw: number; fh: number }[] {
  const widths = new Set<number>();
  const heights = new Set<number>();
  for (const s of COMMON_SIZES) {
    if (img.width % s === 0) widths.add(s);
    if (img.height % s === 0) heights.add(s);
  }
  for (let n = 1; n <= 16; n++) {
    const fw = Math.floor(img.width / n);
    const fh = Math.floor(img.height / n);
    if (fw >= MIN_CELL) widths.add(fw);
    if (fh >= MIN_CELL) heights.add(fh);
  }
  const perRow = maxBoxesPerRow(gutters);
  if (perRow >= 1 && img.width % perRow === 0) widths.add(img.width / perRow);
  if (gutters.rows.length >= 1 && img.height % gutters.rows.length === 0) heights.add(img.height / gutters.rows.length);
  const out: { fw: number; fh: number }[] = [];
  for (const fw of widths) for (const fh of heights) {
    const cols = Math.floor(img.width / fw);
    const rows = Math.floor(img.height / fh);
    if (cols < 1 || rows < 1 || cols > 16 || rows > 16 || cols * rows < 2) continue;
    out.push({ fw, fh });
  }
  return out;
}

/** The most frames any gutter band holds: a lower bound on the sheet's column count. */
export function maxBoxesPerRow(g: GutterResult): number {
  const counts = new Map<number, number>();
  for (const b of g.boxes) counts.set(b.cell!.row, (counts.get(b.cell!.row) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

/**
 * True when a detected grid cannot be the sheet's real layout because the gutters show more frames
 * in a row than it has columns (a hand-assembled sheet whose gaps happen to line up somewhere).
 */
export function gridContradictsGutters(grid: GridGuess, g: GutterResult): boolean {
  return g.rows.length === grid.rows && maxBoxesPerRow(g) > grid.columns;
}

/** True when some frame floats more than `slack` px above the bottom of its cell (feet not on the ground). */
export function framesFloat(boxes: Box[], cellH: number, slack = 2): boolean {
  return boxes.some((b) => b.cell !== undefined && (b.cell.row + 1) * cellH - (b.y + b.h) > slack);
}

/**
 * Fraction of transparent pixels on the internal grid lines. Vertical lines test the last column
 * of a cell and the first of the next; horizontal lines test only the first row of the lower cell,
 * because feet touch the bottom row of a well-made frame while heads leave a gap above.
 */
export function gridLineEmptiness(img: RGBAImage, fw: number, fh: number): number {
  const cols = Math.floor(img.width / fw);
  const rows = Math.floor(img.height / fh);
  const usedW = cols * fw;
  const usedH = rows * fh;
  let total = 0, empty = 0;
  const test = (x: number, y: number) => { total++; if (img.data[(y * img.width + x) * 4 + 3]! <= ALPHA_EMPTY) empty++; };
  for (let k = 1; k < cols; k++) for (const x of [k * fw - 1, k * fw]) for (let y = 0; y < usedH; y++) test(x, y);
  for (let k = 1; k < rows; k++) for (let x = 0; x < usedW; x++) test(x, k * fh);
  return total === 0 ? 0 : empty / total;
}

/**
 * Guesses the frame size of a uniform sheet. Candidates come from common frame sizes, every
 * divisor pair with 1..16 cells per side and the gutter structure; each is scored by how empty
 * its internal grid lines are. Among candidates that pass, the finest grid wins (a 2×4 grid of
 * 96×128 cells is also "empty" on a 4×8 sheet of 48×64 frames, but 48×64 is what the artist
 * meant), except that a grid may not be finer than the gutters show (a 4×8 sheet of squat slimes
 * has empty lines at half height too) and a containing grid that scores clearly better wins.
 */
export function detectGrid(img: RGBAImage): GridGuess {
  const gutters = detectGutters(img);
  const bandRows = gutters.rows.length;
  const bandCols = maxBoxesPerRow(gutters);
  const scored = gridCandidates(img, gutters).map(({ fw, fh }) => {
    const columns = Math.floor(img.width / fw);
    const rows = Math.floor(img.height / fh);
    let score = gridLineEmptiness(img, fw, fh);
    // Gutters are an upper bound on the cell count in that direction (only trustworthy when they exist).
    if ((bandRows >= 2 && rows > bandRows) || (bandCols >= 2 && columns > bandCols)) score *= 0.5;
    return { fw, fh, columns, rows, score, cells: columns * rows };
  });
  if (scored.length === 0) return { frameWidth: img.width, frameHeight: img.height, columns: 1, rows: 1, confidence: 0 };
  const passing = scored.filter((c) => c.score >= PASS);
  const pool = passing.length > 0 ? passing : scored;
  const dominated = (c: typeof pool[number]) => pool.some((o) =>
    o !== c && o.cells < c.cells && o.fw % c.fw === 0 && o.fh % c.fh === 0 && o.score > c.score + NESTED_EPS);
  const ranked = pool.filter((c) => !dominated(c)).sort((a, b) => passing.length > 0
    ? b.cells - a.cells || b.score - a.score
    : b.score - a.score || b.cells - a.cells);
  const best = ranked[0] ?? scored[0]!;
  return { frameWidth: best.fw, frameHeight: best.fh, columns: best.columns, rows: best.rows, confidence: best.score };
}

// ---------------------------------------------------------------------------------------------
// Tile size detection

/**
 * Tiles have no gutters, so look for colour discontinuities that repeat every `size` pixels:
 * the mean neighbour difference across candidate grid lines against the mean everywhere.
 */
export function detectTileSize(img: RGBAImage, candidates = [16, 32, 48, 64], preferred = 32): { tileSize: number; confidence: number } {
  const { width, height, data } = img;
  const lum = (i: number) => (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000 * (data[i + 3]! / 255);
  // Difference between column x-1 and x, summed over rows; same for rows.
  const colDiff = new Float64Array(width);
  for (let x = 1; x < width; x++) for (let y = 0; y < height; y++) colDiff[x] = colDiff[x]! + Math.abs(lum((y * width + x) * 4) - lum((y * width + x - 1) * 4));
  const rowDiff = new Float64Array(height);
  for (let y = 1; y < height; y++) for (let x = 0; x < width; x++) rowDiff[y] = rowDiff[y]! + Math.abs(lum((y * width + x) * 4) - lum(((y - 1) * width + x) * 4));
  const meanAll = (colDiff.reduce((a, b) => a + b, 0) / Math.max(1, width - 1) + rowDiff.reduce((a, b) => a + b, 0) / Math.max(1, height - 1)) / 2;

  let best = { tileSize: preferred, confidence: 0 };
  let bestRatio = 0;
  for (const s of candidates) {
    if (s < MIN_CELL || width % s !== 0 || height % s !== 0) continue;
    if (width / s < 1 || height / s < 1) continue;
    let sum = 0, n = 0;
    for (let x = s; x < width; x += s) { sum += colDiff[x]!; n++; }
    for (let y = s; y < height; y += s) { sum += rowDiff[y]!; n++; }
    if (n === 0) { if (bestRatio === 0 && s === preferred) best = { tileSize: s, confidence: 0 }; continue; }
    const ratio = meanAll > 0 ? (sum / n) / meanAll : 1;
    const bonus = s === preferred ? 0.05 : 0;
    if (ratio + bonus > bestRatio) { bestRatio = ratio + bonus; best = { tileSize: s, confidence: Math.max(0, Math.min(1, (ratio - 1) / 1.5)) }; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Repacking into a uniform grid

export interface Placement { src: Box; x: number; y: number; column: number; row: number }
export interface SheetLayout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  placements: Placement[];
}

/** Tight boxes of the content of every non-empty cell of a uniform grid, tagged with the cell. */
export function trimCells(img: RGBAImage, fw: number, fh: number, columns = Math.floor(img.width / fw), rows = Math.floor(img.height / fh)): Box[] {
  const out: Box[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const box = contentBox(img, c * fw, r * fh, fw, fh);
    if (box) out.push({ ...box, cell: { column: c, row: r } });
  }
  return out;
}

/** Cell size that fits every box, rounded up to a multiple of 8 (tile-friendly). */
export function suggestCellSize(boxes: Box[], multiple = 8): { cellWidth: number; cellHeight: number } {
  const up = (n: number) => Math.max(multiple, Math.ceil(n / multiple) * multiple);
  return { cellWidth: up(Math.max(1, ...boxes.map((b) => b.w))), cellHeight: up(Math.max(1, ...boxes.map((b) => b.h))) };
}

/** Rows of boxes by vertical overlap (boxes with `cell` use it), each row sorted left to right. */
function groupRows(boxes: Box[]): Box[][] {
  if (boxes.length > 0 && boxes.every((b) => b.cell)) {
    const rows = new Map<number, Box[]>();
    for (const b of boxes) { const list = rows.get(b.cell!.row) ?? []; list.push(b); rows.set(b.cell!.row, list); }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list.sort((a, b) => a.cell!.column - b.cell!.column));
  }
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Box[][] = [];
  let bottom = -1;
  for (const b of sorted) {
    if (rows.length > 0 && b.y < bottom) { rows[rows.length - 1]!.push(b); bottom = Math.max(bottom, b.y + b.h); }
    else { rows.push([b]); bottom = b.y + b.h; }
  }
  for (const r of rows) r.sort((a, b) => a.x - b.x);
  return rows;
}

/**
 * Repacks frames into a uniform grid: each frame bottom-centred in its cell so feet sit on the
 * cell's bottom edge, which is what the runtime and the collider assume. Frames larger than the
 * cell are centred and clipped when rendered. `force` pins the grid dimensions (keeps trailing
 * empty cells) instead of deriving them from the boxes.
 */
export function normalizeToGrid(boxes: Box[], cellW: number, cellH: number, force?: { columns?: number; rows?: number }): SheetLayout {
  const rows = groupRows(boxes);
  const placements: Placement[] = [];
  rows.forEach((list, rowIndex) => {
    list.forEach((b, i) => {
      const column = b.cell ? b.cell.column : i;
      const row = b.cell ? b.cell.row : rowIndex;
      placements.push({ src: b, column, row, x: column * cellW + Math.floor((cellW - b.w) / 2), y: row * cellH + (cellH - b.h) });
    });
  });
  const columns = Math.max(1, force?.columns ?? 0, ...placements.map((p) => p.column + 1));
  const rowCount = Math.max(1, force?.rows ?? 0, ...placements.map((p) => p.row + 1));
  return { width: columns * cellW, height: rowCount * cellH, columns, rows: rowCount, cellWidth: cellW, cellHeight: cellH, placements };
}

/** Renders a layout: copies every source box into its cell, clipped to the cell. */
export function repack(src: RGBAImage, layout: SheetLayout): RGBAImage {
  const out = createImage(layout.width, layout.height);
  for (const p of layout.placements) {
    const cellX0 = p.column * layout.cellWidth, cellY0 = p.row * layout.cellHeight;
    const cellX1 = cellX0 + layout.cellWidth, cellY1 = cellY0 + layout.cellHeight;
    for (let dy = 0; dy < p.src.h; dy++) {
      const ty = p.y + dy;
      const sy = p.src.y + dy;
      if (ty < cellY0 || ty >= cellY1 || sy < 0 || sy >= src.height) continue;
      for (let dx = 0; dx < p.src.w; dx++) {
        const tx = p.x + dx;
        const sx = p.src.x + dx;
        if (tx < cellX0 || tx >= cellX1 || sx < 0 || sx >= src.width) continue;
        const si = (sy * src.width + sx) * 4;
        const ti = (ty * out.width + tx) * 4;
        out.data[ti] = src.data[si]!; out.data[ti + 1] = src.data[si + 1]!; out.data[ti + 2] = src.data[si + 2]!; out.data[ti + 3] = src.data[si + 3]!;
      }
    }
  }
  return out;
}

/** Crops (or pads with transparency) to exactly `width`×`height` from the top-left. */
export function cropImage(img: RGBAImage, width: number, height: number): RGBAImage {
  if (img.width === width && img.height === height) return img;
  const out = createImage(width, height);
  const w = Math.min(width, img.width), h = Math.min(height, img.height);
  for (let y = 0; y < h; y++) out.data.set(img.data.subarray(y * img.width * 4, (y * img.width + w) * 4), y * width * 4);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Layout presets → animations

export type LayoutPreset = 'beze-v2' | 'rpgmaker' | 'four-rows' | 'single';

export const LAYOUT_PRESETS: { id: LayoutPreset; label: string; hint: string }[] = [
  { id: 'beze-v2', label: 'Beze sheet (4 walk rows + 4 attack rows)', hint: 'Rows: walk down, left, right, up, then attack down, left, right, up. 4 columns.' },
  { id: 'four-rows', label: 'Four rows (down, left, right, up)', hint: 'One walk cycle per row, any number of columns. No attacks.' },
  { id: 'rpgmaker', label: 'RPG Maker (3 columns × 4 rows)', hint: 'Rows down, left, right, up; the middle column stands still, the walk goes 0-1-2-1.' },
  { id: 'single', label: 'Single frame', hint: 'One picture used for every direction. Fine for props and sleepy NPCs.' },
];

/** The preset that fits a detected grid best. */
export function guessPreset(columns: number, rows: number): LayoutPreset {
  if (columns === 1 && rows === 1) return 'single';
  if (rows >= 8 && columns >= 3) return 'beze-v2';
  if (columns === 3 && rows === 4) return 'rpgmaker';
  if (rows >= 4) return 'four-rows';
  return 'single';
}

const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;

export interface PresetOptions { walkFrameRate?: number; attackFrameRate?: number }

/**
 * Builds the Character.animations table for a preset on a `columns`×`rows` sheet. Frame index =
 * row × columns + column. Sheets with fewer rows than the preset wants reuse the last row so the
 * result is always valid.
 */
export function presetAnimations(preset: LayoutPreset, columns: number, rows: number, options: PresetOptions = {}): Character['animations'] {
  const walkRate = options.walkFrameRate ?? 8;
  const attackRate = options.attackFrameRate ?? 10;
  const cols = Math.max(1, columns);
  const rowCount = Math.max(1, rows);
  const rowOf = (i: number) => Math.min(i, rowCount - 1);
  const frame = (row: number, col: number) => rowOf(row) * cols + Math.min(col, cols - 1);
  const still = (f: number) => ({ frames: [f], frameRate: 1, loop: false });
  const cycle = (frames: number[], frameRate: number, loop: boolean) => ({ frames, frameRate, loop });

  const table: Partial<Character['animations']> = {};
  DIRECTIONS.forEach((dir, d) => {
    switch (preset) {
      case 'single': {
        table[`idle_${dir}`] = still(0);
        table[`walk_${dir}`] = cycle([0], walkRate, true);
        break;
      }
      case 'rpgmaker': {
        const mid = Math.min(1, cols - 1);
        table[`idle_${dir}`] = still(frame(d, mid));
        table[`walk_${dir}`] = cycle([0, 1, 2, 1].map((c) => frame(d, c)), walkRate, true);
        break;
      }
      case 'four-rows': {
        table[`idle_${dir}`] = still(frame(d, 0));
        table[`walk_${dir}`] = cycle(Array.from({ length: cols }, (_, c) => frame(d, c)), walkRate, true);
        break;
      }
      case 'beze-v2': {
        const walkCols = Math.min(4, cols);
        table[`idle_${dir}`] = still(frame(d, 0));
        table[`walk_${dir}`] = cycle(Array.from({ length: walkCols }, (_, c) => frame(d, c)), walkRate, true);
        if (rowCount >= 8) {
          const attackCols = Math.min(3, cols);
          table[`attack_${dir}`] = cycle(Array.from({ length: attackCols }, (_, c) => frame(4 + d, c)), attackRate, false);
        }
        break;
      }
    }
  });
  return table as Character['animations'];
}

/** Feet footprint: a box at the bottom centre, half the frame wide and a quarter tall. */
export function suggestCollider(frameWidth: number, frameHeight: number): Character['collider'] {
  const width = Math.max(1, Math.round(frameWidth * 0.5));
  const height = Math.max(1, Math.round(frameHeight * 0.25));
  return { width, height, offsetX: Math.floor((frameWidth - width) / 2), offsetY: frameHeight - height };
}
