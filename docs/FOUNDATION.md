# Beze: Technical Foundation

Status: v0.1, 2026-09-29. This is the founding architecture document. It is meant to be
read top to bottom once, then used as a reference. Sections are numbered to match the
original brief. Decisions are stated as decisions, with the reason and the condition
under which we would revisit them.

Beze is a browser-based tool for making small 2D anime-style games. The product is the
editor. AI is one capability inside it. The output is a real game that runs in any
browser and can be downloaded as a static site.

---

## 0. The ten decisions that shape everything else

| # | Decision | Why | Revisit when |
|---|----------|-----|--------------|
| 1 | **The runtime interprets a project document. It never generates or executes code.** | Safe export, safe AI, one code path for "Play" in the editor and the exported game. No sandboxing of user code needed because there is no user code. | Never for the core. A sandboxed expression language may be added on top later. |
| 2 | **Phaser 3 is the runtime engine.** | Mature tilemaps, arcade physics, sprite animation, input, cameras, scene management. Building these ourselves adds months for no product value. | Phaser 4 stabilises its tilemap and physics layers; the runtime wraps Phaser behind our own interpreter so this is a one-package change. |
| 3 | **One project document (JSON). Zod schemas in TypeScript are the source of truth; JSON Schema is generated from them.** | Editor, runtime, operations and export all live in TypeScript. Python validates shape via the generated JSON Schema and otherwise treats the document as opaque data. | A second TypeScript-free consumer needs semantic validation. Then the isomorphic core runs in a Node worker. |
| 4 | **Every mutation of a project is an `Operation`. User edits, AI proposals and imports all go through `applyOperations`.** | One pipeline to validate, undo, log, replay and test. AI tools are literally the operation catalog. | Never. |
| 5 | **Editor viewport is a Canvas 2D renderer we own. Play preview runs the real runtime in a sandboxed iframe.** | Editing needs (grid, tiles, sprites, selection) are small. Phaser is a poor editing canvas. The iframe guarantees "what you preview is what you export". | Viewport needs thousands of animated objects or effects. Then swap to PixiJS behind the same `ViewportRenderer` interface. |
| 6 | **Backend is FastAPI + PostgreSQL + S3-compatible storage. One Python worker for AI and export jobs. No Redis, no Rust in the MVP.** | The user's strengths, the AI provider ecosystem, and one fewer moving part each. A Postgres job table with `SKIP LOCKED` is enough for thousands of jobs a day. | Redis: when we need pub/sub progress or cross-instance rate limits. Rust: when asset processing or export packaging becomes a measured bottleneck. |
| 7 | **Assets are content-addressed, validated and re-encoded on the server, and referenced from the document by id, never by URL.** | Portability (export, import, duplicate), cache-forever URLs, and a single choke point for image safety. | Never. |
| 8 | **Export copies a prebuilt, versioned runtime bundle next to `project.json` and `assets/`. There is no build step.** | No server-side code execution, trivially reproducible, works for hosting later. | Never for the base export. Platform wrappers (PWA, desktop) layer on top. |
| 9 | **The first vertical slice runs with no backend at all.** | Forces the editor/runtime/schema boundary to be real, ships the "I made a game" moment fastest, and the persistence adapter is swapped later, not rewritten. | Slice 2 adds the API behind the same `ProjectRepository` interface. |
| 10 | **Own auth (email + password, server-side sessions, HttpOnly cookies). Projects have exactly one owner in the MVP.** | No vendor lock-in, revocable sessions, simplest correct authorization model. | Teams: add `project_members`. OAuth providers: add alongside password. |

---

## 1. Product architecture

### 1.1 The three nouns

- **Project**: a single JSON document plus a set of binary assets. Everything the user makes is in it. It can be saved, loaded, versioned, diffed, exported and imported.
- **Runtime**: a fixed, versioned program (`@beze/runtime`) that takes a project and makes it playable. It knows nothing about the editor.
- **Editor**: a web application that displays and mutates the project document and can mount the runtime to preview it.

The editor is a document editor with a game preview. This framing keeps it simple even as the document grows.

### 1.2 The game model the user sees

| Concept | What the user thinks it is | What it is in the document |
|---------|----------------------------|-----------------------------|
| Character | "A person I can put in the game" | A sprite sheet asset plus animation and collider metadata |
| Map | "The ground, walls, trees" | Tile layers over one or more tilesets, plus a collision grid |
| Scene | "A place in the game" | A map plus placed entities and scene settings |
| Entity | "A thing in a scene" | Position plus a list of components (sprite, body, player control, interactable, trigger) |
| NPC | "A character that talks" | An entity with a sprite component and an interactable component whose action starts a dialogue |
| Dialogue | "What they say and what I can answer" | A graph of line, choice, set-variable, branch and end nodes |
| Quest | "A goal" | Named steps that complete when conditions on variables hold (schema reserved; runtime support in milestone 3) |
| Variable | "Something the game remembers" | Typed value with an initial state, read by conditions and written by actions |
| Asset | "An image I uploaded or generated" | A content-addressed binary with metadata |

### 1.3 How the listed genres map onto this model

The same primitives cover every target genre without a genre switch:

- Top-down adventure / anime RPG: scenes with maps, player entity, NPCs, triggers for doors, dialogues, variables, quests.
- Visual novel: a scene whose map is a single background image and whose "player" has no movement; the whole game is dialogue graphs with branches driven by variables.
- Farming game: variables plus a `timer` component and a `tileState` component added in a later milestone. No new top-level concept.
- Dungeon crawler and simple action: `enemy` behaviour components plus a `health` variable convention, added later.
- Dialogue/choice game: a visual novel with no images.

What this means for the schema: it must be easy to add a new component type or dialogue node type without touching anything else. That is why entities are component lists and dialogues are node maps with discriminated unions.

### 1.4 Where AI sits

AI is a panel in the editor called "Ask". The user types intent. The system returns a proposal, which is a list of operations and, for assets, generated images. The user sees a summary and a preview, then accepts or rejects. Accepted proposals are applied through the normal command pipeline and are undoable. Nothing AI produces bypasses the schema, the limits or the user.

---

## 2. System architecture

```
                         Browser
 ┌─────────────────────────────────────────────────────────────┐
 │  Editor SPA (React)                                          │
 │   ├─ @beze/project-schema   types, zod, migrations           │
 │   ├─ @beze/project-core     operations, validate, undo       │
 │   ├─ ViewportRenderer       Canvas 2D                        │
 │   ├─ ProjectRepository      Local (IndexedDB) | Api          │
 │   └─ Play panel ──iframe(sandbox)──▶ @beze/runtime (Phaser)  │
 └───────────────┬─────────────────────────────┬───────────────┘
                 │ HTTPS JSON                   │ presigned PUT/GET
                 ▼                              ▼
 ┌──────────────────────────┐        ┌────────────────────────┐
 │  api (FastAPI)           │        │  Object storage (S3)   │
 │   auth, projects,        │◀──────▶│   assets/ exports/     │
 │   revisions, assets,     │        │   runtime/<version>/   │
 │   jobs, exports          │        └────────────────────────┘
 └───────────┬──────────────┘
             │ SQL
             ▼
 ┌──────────────────────────┐        ┌────────────────────────┐
 │  PostgreSQL              │◀──────▶│  worker (Python)        │
 │   users, projects,       │  jobs  │   ai generation,        │
 │   revisions, assets,     │        │   asset post-processing │
 │   generation_jobs,       │        │   export packaging      │
 │   exports, usage         │        └───────────┬────────────┘
 └──────────────────────────┘                    │ HTTPS
                                                 ▼
                                      ┌────────────────────────┐
                                      │  Model providers        │
                                      │  (text, image) behind   │
                                      │  provider interfaces    │
                                      └────────────────────────┘
```

### 2.1 Deployable units in the MVP

| Unit | Contents | Scales by |
|------|----------|-----------|
| `web` | Static files: editor SPA, runtime bundle, starter assets | CDN |
| `api` | FastAPI, stateless | Replicas behind a load balancer |
| `worker` | Same Python codebase, runs the job loop | Replicas; each claims jobs with `SKIP LOCKED` |
| `postgres` | All relational state | Managed service later |
| `objectstore` | MinIO locally, any S3-compatible service in production | Provider |

Five units. No service mesh, no message broker, no separate AI microservice. The AI code is a Python package inside the worker. "Separate service" is enforced at the package boundary (the API never imports provider SDKs), not the network boundary. When the worker needs different hardware or scaling, it is already a separate process.

### 2.2 The five data flows

1. **Load / save**: editor `GET /projects/{id}/document` → document + head revision id. Editor mutates locally. Autosave `PUT /projects/{id}/document` with `baseRevisionId`. Server validates shape and size, writes a new revision row, advances head. `409` on conflict.
2. **Asset upload**: editor `POST /projects/{id}/assets/uploads` → asset id + presigned PUT. Browser uploads. Editor `POST .../complete`. Worker validates, re-encodes, writes the final object, marks the asset `ready`. The document references the asset id from the first step.
3. **Play**: editor serialises the current in-memory document and an asset URL map, posts them into the runtime iframe. The runtime loads and runs. No server involvement.
4. **Generation**: editor `POST /projects/{id}/generations` with kind, prompt and a compact project context. Worker runs the provider loop, validates output, stores it on the job. Editor polls, shows the proposal, and on accept applies the operations locally and saves.
5. **Export**: editor `POST /projects/{id}/exports`. Worker fetches the revision, copies the runtime bundle and assets into a zip, stores it, and the editor offers a download link.

---

## 3. Repository structure

One monorepo. pnpm workspaces for TypeScript, uv for Python. No Turborepo or Nx until build times hurt.

```
new-beze/
├── apps/
│   ├── editor/                  React SPA (Vite)
│   │   ├── src/
│   │   │   ├── app/             routes, providers, shell layout
│   │   │   ├── store/           editor store, history, selection
│   │   │   ├── viewport/        Canvas 2D renderer, tools, input
│   │   │   ├── panels/          Project, Scene, Inspector, Assets, Dialogue, Ask
│   │   │   ├── play/            iframe host and message protocol
│   │   │   ├── repository/      ProjectRepository: local and api implementations
│   │   │   ├── assets/          AssetResolver implementations
│   │   │   └── ui/              small shared components
│   │   └── public/starter/      CC0 starter pack (tilesets, characters, portraits)
│   └── api/                     FastAPI + worker (one Python package, two entrypoints)
│       ├── beze_api/
│       │   ├── main.py          app factory
│       │   ├── auth/            sessions, password hashing, dependencies
│       │   ├── projects/        routes, repository, revision logic
│       │   ├── assets/          upload, validation, storage adapter
│       │   ├── generation/      job routes, context builder
│       │   ├── exports/         job routes
│       │   ├── jobs/            queue (Postgres), worker loop, job handlers
│       │   ├── ai/              provider interfaces, implementations, pipelines
│       │   ├── db/              SQLAlchemy models, Alembic migrations
│       │   └── settings.py
│       ├── tests/
│       └── pyproject.toml
├── packages/
│   ├── project-schema/          Zod schemas, TS types, SCHEMA_VERSION, migrations,
│   │                            JSON Schema generation (committed to schemas/)
│   ├── project-core/            operations, applyOperations, inverse, validateProject,
│   │                            limits, project factory, id generation, export bundle layout
│   ├── runtime/                 Phaser interpreter; builds beze-runtime.js + index.html
│   └── tsconfig/                shared TS configs
├── schemas/                     generated JSON Schema artifacts (project, operations)
├── infra/
│   ├── compose.yml              postgres, minio, api, worker, web
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── Caddyfile
├── docs/
│   ├── FOUNDATION.md            this file
│   ├── VERTICAL_SLICE.md
│   └── examples/                golden project fixtures
├── package.json                 pnpm workspace root
├── pnpm-workspace.yaml
└── justfile                     dev, test, lint, build, db-migrate
```

Rules that keep the boundaries honest:

- `packages/*` never import from `apps/*`.
- `project-schema` and `project-core` have no DOM, no React, no Phaser and no Node-only imports. They run in the browser, in Node tests and later in a Node worker.
- `runtime` imports `project-schema` for types and validation only. It never imports `project-core` (it does not mutate projects).
- `apps/api` never imports model provider SDKs outside `beze_api/ai/providers/`.
- `schemas/*.json` is generated; CI fails if it is stale.

---

## 4. Frontend architecture

### 4.1 Stack

- TypeScript strict, React 19, Vite.
- State: Zustand with Immer for the editor store. No Redux. No server-state library until the API surface justifies it; a small typed fetch client is enough.
- Styling: CSS Modules plus a handful of Radix primitives (dialog, dropdown, tooltip) when needed. No component framework.
- Routing: React Router, three routes: `/`, `/projects`, `/p/:projectId`.
- Validation at boundaries: every document that enters the store passes through `parseProject` from `project-schema`.

### 4.2 The editor store

```ts
interface EditorState {
  project: Project | null;
  headRevisionId: string | null;      // null when local-only
  dirty: boolean;
  selection: Selection;               // { kind: 'entity', sceneId, entityId } | { kind: 'none' } | ...
  activeSceneId: string | null;
  activeTool: Tool;                    // 'select' | 'tileBrush' | 'eraser' | 'collision' | 'placeEntity'
  history: { undo: Transaction[]; redo: Transaction[] };
  play: { status: 'stopped' | 'starting' | 'running' | 'error'; error?: string };
}

interface Transaction {
  label: string;                       // "Move Aiko", "Paint tiles"
  ops: Operation[];
  inverse: Operation[];
}

// The only way to change the project:
dispatch(label: string, ops: Operation[]): Result<void, OperationError[]>
```

`dispatch` calls `applyOperations(project, ops)` from `project-core`, which returns the new project and the inverse operations, or errors. On success the store swaps the project, pushes the transaction onto `undo`, clears `redo`, sets `dirty`. Undo applies `inverse`; redo applies `ops`. Drags coalesce into one transaction (begin on pointer down, commit on pointer up).

Because `applyOperations` is pure and Immer gives structural sharing, React components subscribe to slices (`project.scenes[activeSceneId]`) and re-render only when their slice changes.

### 4.3 Adapters the editor depends on

```ts
interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  create(name: string): Promise<{ project: Project; revisionId: string | null }>;
  load(projectId: string): Promise<{ project: Project; revisionId: string | null }>;
  save(projectId: string, project: Project, baseRevisionId: string | null): Promise<{ revisionId: string }>;
  remove(projectId: string): Promise<void>;
}

interface AssetStore {
  put(projectId: string, file: File, meta: AssetInput): Promise<AssetRecord>;
  resolveUrl(projectId: string, assetId: string): Promise<string>;   // blob: URL locally, signed URL remotely
  urlMap(projectId: string, assetIds: string[]): Promise<Record<string, string>>;
}
```

Slice 1 ships `LocalProjectRepository` (IndexedDB) and `LocalAssetStore` (IndexedDB blobs plus the starter pack). Slice 2 adds the API implementations. The editor UI never knows which one is active.

### 4.4 Play panel protocol

The play panel mounts `<iframe sandbox="allow-scripts" src="/runtime/index.html">`. Without `allow-same-origin` the iframe has an opaque origin: it cannot read the editor's cookies, storage or DOM. Communication is `postMessage` only:

| Direction | Message | Payload |
|-----------|---------|---------|
| runtime → editor | `beze:ready` | `{ runtimeVersion, supportedSchema: [min, max] }` |
| editor → runtime | `beze:load` | `{ project, assetUrls: Record<assetId, url>, options: { startSceneId?, debug } }` |
| runtime → editor | `beze:loaded` | `{}` |
| runtime → editor | `beze:exit` | `{}` (the player pressed Escape; keyboard focus is inside the iframe, so the editor cannot see it) |
| runtime → editor | `beze:error` | `{ message, path? }` |
| runtime → editor | `beze:log` | `{ level, message }` |
| editor → runtime | `beze:stop` | `{}` |

The exported game uses the same runtime with a different loader: it fetches `project.json` and `assets/manifest.json` from relative paths instead of waiting for a message.

---

## 5. Editor architecture

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Top bar: project name · Save state · [▶ Play] · [Export] · Ask │
├────────────┬──────────────────────────────────┬──────────────┤
│ Project    │ Viewport (active scene)          │ Inspector    │
│  Scenes    │  tools: select · tiles · erase   │  (selected   │
│  Characters│         collision · place        │   thing's    │
│  Dialogues │                                  │   properties)│
│  Variables │                                  │              │
│  Assets    │                                  │              │
├────────────┴──────────────────────────────────┴──────────────┤
│ Bottom: tileset palette (when tile tool) · dialogue editor    │
└──────────────────────────────────────────────────────────────┘
```

Four regions. Panels are plain React components reading the store. There is no docking system; that is a "not yet".

### 5.2 Viewport renderer

`ViewportRenderer` is a class with `attach(canvas)`, `setScene(scene, map, tilesets, assetImages)`, `setCamera({x, y, zoom})`, `setOverlay(selection, tool state)` and `render()`. Internals:

- One offscreen canvas per tile layer, redrawn only when that layer's data changes (the store version counter tells it). The visible frame composites layers, then entities sorted by y, then grid, then selection and tool ghosts.
- Coordinates: world pixels are the truth. Tile coordinates are `floor(px / tileSize)`. Screen coordinates come from the camera. Three small pure functions handle conversions and they are unit-tested.
- Input: a `ToolController` receives pointer events already converted to world coordinates and dispatches operations. Each tool is a small object with `onDown`, `onMove`, `onUp`, `cursor`. Adding a tool does not touch the renderer.

### 5.3 Inspector

Hand-written forms per selection kind (entity, scene, character, variable). Schema-driven form generation is tempting and is a "not yet"; three hand-written forms are faster and look better.

### 5.4 Dialogue editor

MVP is a list editor: nodes appear in a vertical list in flow order; a choice node shows its options as nested rows with a "goes to" selector. It covers linear conversations and small branches fully. A node-graph canvas (React Flow) is a later milestone when dialogues have more than a dozen nodes.

### 5.5 Autosave and conflicts

Save on a 2 s debounce after the last transaction, and on `Play`, `Export`, tab hide and unload. A `409` from the API means another session saved first. MVP behaviour: show "This project changed elsewhere. Reload or overwrite?" Single-editor per project is the supported mode; real-time collaboration is a "not yet".

---

## 6. Game runtime architecture

### 6.1 Public surface

```ts
export interface RuntimeOptions {
  container: HTMLElement;
  project: Project;
  assetUrls: Record<string, string>;
  startSceneId?: string;
  debug?: boolean;
  onEvent?: (e: RuntimeEvent) => void;    // 'loaded' | 'sceneChanged' | 'dialogueStarted' | 'error'
}
export function mountGame(opts: RuntimeOptions): { unmount(): void };
export const RUNTIME_VERSION: string;
export const SUPPORTED_SCHEMA: { min: number; max: number };
```

That is the entire API. Two loaders wrap it: `loader-editor.ts` (postMessage) and `loader-static.ts` (fetch `project.json`). The bundle is built with Vite in library mode to a single IIFE file so exports have one script tag and no module resolution.

### 6.2 Internal structure

```
packages/runtime/src/
├── mount.ts               mountGame, Phaser.Game config (fixed 60 Hz step, pixelArt)
├── scenes/
│   ├── BootScene.ts       loads assets from assetUrls, builds animations from Character data
│   ├── WorldScene.ts      one Phaser scene reused for every project scene; builds map + entities
│   └── DialogueScene.ts   overlay scene: text box, speaker, choices; pauses WorldScene
├── world/
│   ├── buildTilemap.ts    project map → Phaser tilemap layers + collision layer
│   └── spawnEntity.ts     entity components → sprite + arcade body + registrations
├── systems/
│   ├── playerControl.ts   4-direction movement, animation selection
│   ├── interaction.ts     facing-tile probe, interact key → action
│   ├── triggers.ts        overlap zones → actions
│   ├── npcBehavior.ts     idle / wander (wander later)
│   └── camera.ts          follow player, clamp to map bounds
├── dialogue/
│   ├── interpreter.ts     pure: (dialogue, state, input) → next node, effects
│   └── render.ts          Phaser text box drawing
├── state/
│   └── GameState.ts       variables, flags, current scene; serialisable (save games later)
└── actions.ts             executes Action values: startDialogue, changeScene, setVariable
```

Principles:

- Game state lives in `GameState`, a plain object. Phaser objects are views over it. Save games, debugging and tests all read `GameState`.
- The dialogue interpreter is pure and has no Phaser import. It is tested exhaustively without a browser.
- The runtime validates the project on load with `parseProject` and refuses to start on failure, showing the first error. It never patches a broken document silently.
- The runtime declares the schema versions it supports. The editor refuses to send a newer document to an older runtime; the export pins the runtime version in `exports.runtime_version`.
- No DOM text injection. Dialogue text is drawn by Phaser text objects, which are not HTML.

### 6.3 Combat conventions (v2)

- `health` gives an entity hit points. `enemy` chases the player inside `aggroRadius`, hurts on
  contact every `attackCooldownMs`, and otherwise wanders (if it has `wander`) or idles.
- The player attacks with `settings.attackKey`: a hitbox one tile deep in the facing direction
  for one swing, damage from `playerControl.attackDamage`. Hits flash white, knock back, and
  give the player 700 ms of invulnerability. Defeated enemies fade out, run `onDefeat`, and are
  recorded in `GameState.defeated` so they stay gone when the scene is revisited.
- A defeated player sees a retry overlay; the attack key restarts the scene with variables kept.
- Hearts HUD in the top-left whenever the player has health.

### 6.4 Movement and interaction conventions (v1)

- Player moves continuously with arcade physics at `settings.defaultMoveSpeed` pixels per second, 4 directions, no diagonal in v1 (diagonal is a settings flag later).
- Collision comes from the map's collision grid plus entities whose `body.solid` is true.
- Interaction: on the interact key, probe the tile in front of the player's facing direction for entities with an `interactable` component; run its action.
- Scene change: `changeScene` action restarts `WorldScene` with the target scene and spawn point; variables persist in `GameState`.

---

## 7. Project document schema

Source of truth: `packages/project-schema/src/*.ts` using Zod. What follows is the TypeScript view of the v1 schema. Conventions first.

### 7.1 Conventions

- **Ids** are opaque strings. Editor-generated ids are ULIDs with a type prefix (`scn_01J…`, `ent_…`, `chr_…`, `map_…`, `tls_…`, `dlg_…`, `nod_…`, `var_…`, `qst_…`, `ast_…`). AI-supplied ids must match `^[a-z]{3}_[A-Za-z0-9_-]{1,40}$` and be unique. The prefix is documentation, not a validation key.
- **Collections are records keyed by id**, not arrays. Lookups are O(1), diffs are stable, and ordering, where it matters, is an explicit `order` array.
- **Positions** are world pixels, integers. Tile coordinates are derived.
- **Colours** are `#rrggbb` strings.
- **Every top-level collection exists even when empty.** No optional collections.
- `schemaVersion` is an integer. Migrations are pure functions `(doc: unknown) => unknown` run in order by `migrateProject`.

### 7.2 Types

```ts
export const SCHEMA_VERSION = 2;   // v2 added settings.attackKey and the health/enemy components

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  settings: ProjectSettings;
  startSceneId: string;
  assets: Record<string, Asset>;
  tilesets: Record<string, Tileset>;
  maps: Record<string, TileMap>;
  characters: Record<string, Character>;
  scenes: Record<string, Scene>;
  dialogues: Record<string, Dialogue>;
  quests: Record<string, Quest>;
  variables: Record<string, GameVariable>;
  meta: { createdAt: string; updatedAt: string; generator: string };
}

export interface ProjectSettings {
  title: string;
  viewport: { width: number; height: number };   // logical game resolution, e.g. 480x270
  tileSize: number;                               // 16 or 32
  pixelArt: boolean;
  defaultMoveSpeed: number;                        // px/s
  interactKey: 'E' | 'SPACE' | 'ENTER';
  attackKey: 'SPACE' | 'X' | 'J' | 'K';           // v2; must differ from interactKey
  backgroundColor: string;
}

export interface Asset {
  id: string;
  kind: 'image' | 'audio';
  name: string;
  mime: 'image/png' | 'image/webp' | 'audio/ogg' | 'audio/mpeg';
  width?: number;
  height?: number;
  hash: string;                                    // sha256 hex of the stored bytes
  origin: 'starter' | 'upload' | 'generated';
  license?: string;                                // e.g. "CC0-1.0"
}

export interface Tileset {
  id: string;
  name: string;
  imageAssetId: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  margin: number;
  spacing: number;
  tileProperties: Record<number, { solid?: boolean; tag?: string }>;  // by local tile index
}

export interface TileMap {
  id: string;
  name: string;
  width: number;                                   // in tiles
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesets: Array<{ tilesetId: string; firstGid: number }>;   // Tiled-style global ids
  layers: TileLayer[];                             // draw order, bottom first
  collision: number[];                             // width*height, 0 = walkable, 1 = solid, 2 = climbable (v4: solid unless the player has playerControl.climb)
}

export interface TileLayer {
  id: string;
  name: string;
  visible: boolean;
  aboveEntities: boolean;                          // draw over sprites (tree tops, roofs)
  data: number[];                                  // width*height gids, 0 = empty
}

export type Direction = 'down' | 'left' | 'right' | 'up';
export type AnimationName = `${'idle' | 'walk'}_${Direction}`;

export interface Character {
  id: string;
  name: string;
  spriteSheetAssetId: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<AnimationName, { frames: number[]; frameRate: number; loop: boolean }>;
  collider: { width: number; height: number; offsetX: number; offsetY: number };
  portraitAssetId?: string;
}

export interface Scene {
  id: string;
  name: string;
  mapId: string | null;                            // null = no map (visual novel style, later)
  backgroundAssetId?: string;
  entities: Record<string, Entity>;
  entityOrder: string[];                           // stable order for lists and z-ties
}

export interface Entity {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: Direction;
  components: Component[];                         // at most one of each type
}

export type Component =
  | { type: 'sprite'; characterId: string }
  | { type: 'body'; solid: boolean }
  | { type: 'playerControl'; speed?: number; attackDamage?: number }
  | { type: 'interactable'; action: Action; prompt?: string }
  | { type: 'trigger'; width: number; height: number; onEnter: Action; once: boolean }
  | { type: 'wander'; radius: number; speed: number }         // random strolls around the spawn point
  | { type: 'health'; max: number }                             // v2: can be hurt; 0 = defeated
  | { type: 'enemy'; speed: number; aggroRadius: number; damage: number; attackCooldownMs: number; onDefeat?: Action };  // v2

export type Action =
  | { type: 'startDialogue'; dialogueId: string }
  | { type: 'changeScene'; sceneId: string; spawn: { x: number; y: number; facing?: Direction } }
  | { type: 'setVariable'; variableId: string; op: 'set' | 'add'; value: boolean | number | string }
  | { type: 'sequence'; actions: Action[] };

export interface Dialogue {
  id: string;
  name: string;
  startNodeId: string;
  nodes: Record<string, DialogueNode>;
}

export type DialogueNode =
  | { id: string; type: 'line'; speaker?: string; portraitAssetId?: string; text: string; next: string | null }
  | { id: string; type: 'choice'; prompt?: string; options: Array<{ text: string; next: string | null; condition?: Condition }> }
  | { id: string; type: 'set'; variableId: string; op: 'set' | 'add'; value: boolean | number | string; next: string | null }
  | { id: string; type: 'branch'; condition: Condition; ifTrue: string | null; ifFalse: string | null }
  | { id: string; type: 'action'; action: Action; next: string | null }
  | { id: string; type: 'end' };

export interface Condition {
  variableId: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  value: boolean | number | string;
}

export interface GameVariable {
  id: string;
  name: string;
  type: 'boolean' | 'number' | 'string';
  initial: boolean | number | string;
}

// Reserved in v1: validated, stored, shown in the editor as a list, ignored by the runtime
// until milestone 3. Kept minimal on purpose.
export interface Quest {
  id: string;
  name: string;
  description: string;
  steps: Array<{ id: string; text: string; completeWhen: Condition }>;
}
```

### 7.3 Validation levels

1. **Shape**: `parseProject(unknown): Result<Project, ZodError>`. Runs on every load, every AI proposal, every API write (via the generated JSON Schema).
2. **Integrity**: `validateProject(project): Diagnostic[]`. Referential checks (every `characterId` exists, every `next` points to a node in the same dialogue, `startSceneId` exists, exactly one entity with `playerControl` per scene, `layer.data.length === width*height`, gids fall inside a listed tileset). Diagnostics carry a JSON path and a severity. Errors block Play and Export. Warnings show in the editor.
3. **Limits**: `checkLimits(project, limits): Diagnostic[]`. Counts and sizes (section 14). Enforced on save and on AI apply.

### 7.4 Operations

Operations are the write API of the document. They are the editor's commands, the AI's tools and the import format. Each has a Zod schema, a JSON Schema (generated), an `apply` and an `inverse`.

```ts
export type Operation =
  // project
  | { op: 'updateSettings'; patch: Partial<ProjectSettings> }
  | { op: 'renameProject'; name: string }
  // characters
  | { op: 'createCharacter'; character: Character }
  | { op: 'updateCharacter'; id: string; patch: Partial<Omit<Character, 'id'>> }
  | { op: 'deleteCharacter'; id: string }
  // tilesets and maps
  | { op: 'createTileset'; tileset: Tileset }
  | { op: 'deleteTileset'; id: string }
  | { op: 'createMap'; map: TileMap }
  | { op: 'deleteMap'; id: string }
  | { op: 'paintTiles'; mapId: string; layerId: string; cells: Array<{ x: number; y: number; gid: number }> }
  | { op: 'paintRect'; mapId: string; layerId: string; x: number; y: number; width: number; height: number; gid: number }
  | { op: 'setCollisionRect'; mapId: string; x: number; y: number; width: number; height: number; solid: boolean }
  | { op: 'setCollision'; mapId: string; cells: Array<{ x: number; y: number; solid: boolean }> }
  | { op: 'addLayer'; mapId: string; layer: TileLayer; index?: number }
  | { op: 'deleteLayer'; mapId: string; layerId: string }
  // scenes and entities
  | { op: 'createScene'; scene: Scene }
  | { op: 'updateScene'; id: string; patch: Partial<Pick<Scene, 'name' | 'mapId' | 'backgroundAssetId'>> }
  | { op: 'deleteScene'; id: string }
  | { op: 'setStartScene'; sceneId: string }
  | { op: 'createEntity'; sceneId: string; entity: Entity; index?: number }   // index restores order on undo
  | { op: 'placeEntity'; sceneId: string; entityId: string; x: number; y: number; facing?: Direction }
  | { op: 'modifyEntity'; sceneId: string; entityId: string; patch: Partial<Pick<Entity, 'name' | 'facing'>> }
  | { op: 'setComponent'; sceneId: string; entityId: string; component: Component }   // upsert by type
  | { op: 'removeComponent'; sceneId: string; entityId: string; componentType: Component['type'] }
  | { op: 'deleteEntity'; sceneId: string; entityId: string }
  // dialogues
  | { op: 'createDialogue'; dialogue: Dialogue }
  | { op: 'updateDialogue'; id: string; patch: Partial<Pick<Dialogue, 'name' | 'startNodeId'>> }
  | { op: 'setDialogueNode'; dialogueId: string; node: DialogueNode }                   // upsert
  | { op: 'deleteDialogueNode'; dialogueId: string; nodeId: string }
  | { op: 'deleteDialogue'; id: string }
  // variables and quests
  | { op: 'createVariable'; variable: GameVariable }
  | { op: 'updateVariable'; id: string; patch: Partial<Omit<GameVariable, 'id'>> }
  | { op: 'deleteVariable'; id: string }
  | { op: 'createQuest'; quest: Quest }
  | { op: 'updateQuest'; id: string; patch: Partial<Omit<Quest, 'id'>> }
  | { op: 'deleteQuest'; id: string }
  // assets (metadata only; bytes go through the asset store)
  | { op: 'registerAsset'; asset: Asset }
  | { op: 'unregisterAsset'; id: string };

export interface ApplyResult {
  project: Project;
  inverse: Operation[];       // applying these to `project` restores the input
}

export function applyOperations(project: Project, ops: Operation[]): Result<ApplyResult, OperationError[]>;
```

Rules:

- A batch is atomic. If any operation fails (unknown id, integrity violation, limit exceeded), none apply.
- `applyOperations` runs `validateProject` on the result. Operations cannot leave the document inconsistent; a `deleteCharacter` with entities still referencing it fails with a diagnostic listing them. The editor offers "delete and remove 3 sprites" as a composed batch.
- Every operation has a total inverse. The property test in `project-core` is: for any valid project and any generated valid operation batch, `apply(inverse(apply(p, ops))) deepEquals p`. `update*` operations whose patch touches an optional field that was absent invert as delete + create, which is exact.
- Components are stored in a fixed canonical order (`sprite, body, playerControl, interactable, trigger, wander`) so documents compare structurally regardless of edit history.
- The catalog is deliberately fine-grained. Coarse convenience for humans and AI (for example "create an NPC with a dialogue") is a composition of these, built by helper functions in `project-core/recipes.ts`, so the AI can be given either the raw operations or the recipes as tools depending on what works better.

---

## 8. Asset system

### 8.1 Canonical formats

Assets that the editor, runtime and AI all agree on. Everything else is converted into one of these at import time.

| Format | Spec |
|--------|------|
| **Character sheet v2** | PNG, RGBA, 4 columns × 8 rows: walk down/left/right/up (4 frames each, frame 0 doubles as idle) then attack down/left/right/up (3 frames each). Frame size declared in `Character` (starter: 48×64 on 32 px tiles). Attack rows are optional in the schema. Transparent background. Spec and renderer: `scripts/art/README.md`. |
| **Tileset v1** | PNG. Uniform grid, `tileWidth` × `tileHeight`, optional margin and spacing. Local tile index is row-major from 0. Solidity lives in `tileProperties` and is copied into the map collision grid when painting with "auto-collision" on. |
| **Portrait** | PNG or WebP, up to 512×512, shown in dialogue boxes. |
| **Background** | PNG or WebP, up to 2048×2048, for map-less scenes (later). |
| **Audio** | OGG or MP3 (milestone 2). |

Because `Character.animations` is explicit data, a user can import any sheet layout and describe it; the canonical layout only matters for what we generate and ship.

### 8.2 Storage

- Object key: `projects/{projectId}/assets/{sha256}.{ext}`. Same bytes uploaded twice in one project deduplicate on `(project_id, content_hash)`.
- Objects are immutable. Served with `Cache-Control: public, max-age=31536000, immutable` through short-lived signed URLs in the MVP, and through a CDN with signed cookies or a public read bucket for published games later.
- The document stores `Asset.hash` so an export can verify what it packaged and an import can detect missing files.

### 8.3 Upload pipeline

1. Editor: `POST /projects/{id}/assets/uploads` with `{ name, kind, mime, sizeBytes }`. Server checks quota and per-file limits, creates an `assets` row with status `pending`, returns `{ assetId, uploadUrl }` (presigned PUT to `uploads/{assetId}` with a max content length).
2. Browser PUTs the file.
3. Editor: `POST /projects/{id}/assets/{assetId}/complete`.
4. Worker job `asset.validate`: HEAD the object; reject if larger than declared. Sniff magic bytes; reject if they disagree with `mime`. Decode with Pillow under `Image.MAX_IMAGE_PIXELS`; reject if dimensions exceed limits. **Re-encode** to a fresh PNG or WebP (strips metadata, defeats polyglot files, normalises colour mode). Hash the re-encoded bytes. Copy to the final key. Delete the upload object. Set status `ready` with width, height, hash.
5. Editor polls or receives the result on the next asset list fetch, then dispatches `registerAsset`.

Until step 4 finishes the editor shows a placeholder. Failed validation returns a reason the user can read ("Image is 6000 px wide; the limit is 4096").

### 8.4 Resolution

`AssetStore.dataUrls(ids)` gives the runtime what it needs. The Play iframe has an opaque origin, so `blob:` URLs (origin-bound) and cross-origin image fetches (which taint WebGL textures) both fail there; data URLs cross the boundary cleanly and starter assets are small. Remotely the runtime will receive signed URLs from an asset origin that sends CORS headers. Exports rewrite everything to `assets/{id}.{ext}` and write `assets/manifest.json`.

### 8.5 Starter pack

Slice 1 ships a small CC0 pack so the first game needs neither uploads nor AI: one 32 px outdoor tileset, two character sheets (a hero and a villager), two portraits. Licences are recorded in `apps/editor/public/starter/LICENSES.md`. Starter assets are registered in a new project with `origin: 'starter'` and are copied into exports like any other asset.

### 8.6 Garbage collection

Deleting an asset in the editor requires no document references. Orphaned `pending` uploads older than 24 h and objects for deleted projects are removed by a scheduled worker job. Nothing is deleted synchronously in a request.

---

## 9. AI abstraction

Implemented for content generation in `apps/api` (see `docs/AI_AND_GPU.md` for the running
system, the self-hosted GPU path and the asset-generation plan). This section is the design.

### 9.1 Principles

1. AI produces **operations and assets**, never text that a human has to translate, and never code.
2. AI output is **untrusted input**: it goes through the same schema, integrity, limit and asset validation as a hostile upload.
3. The user **accepts or rejects** every proposal. Applied proposals are ordinary undoable transactions and are recorded as revisions with `origin = 'ai'`.
4. Providers are **replaceable by configuration**. The API never talks to a provider; the worker does, through two small interfaces.
5. No AI feature is built before the manual path for the same thing exists in the editor. AI accelerates what the editor can already do.

### 9.2 Two classes of generation

| Class | Input | Output | Hard part |
|-------|-------|--------|-----------|
| **Content** | prompt + compact project context | `Operation[]` | Getting good structure; cheap and fast |
| **Asset** | prompt + asset type + optional reference image | validated asset(s) plus a small `Operation[]` to register and use them | Consistency (four-direction walk cycles from an image model) |

Content generation is milestone 4 and is mostly engineering. Asset generation is milestone 5 and is research-adjacent. The abstraction lets us ship portraits first (single image, easy), then single idle sprites with background removal, then full sheets when a pipeline is good enough. The UI already treats "generate" as async and reviewable, so improving the pipeline changes nothing in the editor.

### 9.3 Interfaces (Python, in the worker)

```python
class TextProvider(Protocol):
    name: str
    async def complete_with_tools(
        self, *, system: str, messages: list[Message], tools: list[ToolSpec],
        max_tokens: int, temperature: float,
    ) -> ToolCallResponse: ...

class ImageProvider(Protocol):
    name: str
    async def generate(self, req: ImageRequest) -> list[ImageResult]: ...     # bytes + metadata

class GenerationPipeline(Protocol):
    kind: str                                    # "content", "portrait", "character_sprite", "tileset"
    async def run(self, job: GenerationJob, ctx: PipelineContext) -> GenerationOutput: ...
```

`ToolSpec` objects are built directly from `schemas/operations.json`: each operation (or recipe) becomes one tool with the generated JSON Schema as its parameters. Adding an operation to `project-core` adds a tool to the AI with no Python change.

### 9.4 Content generation loop

1. **Context**: the API builds a compact summary from the document (names and ids of scenes, characters, dialogues, variables, the active scene's entity list, map size, free tile ids). Token-bounded; never the full document.
2. **Loop**: the worker calls `complete_with_tools` with the operation and recipe tools. Tool calls are **collected, not executed**. Each is validated against its JSON Schema immediately; invalid calls are returned to the model as errors with the message from the validator. Bounded to N iterations and a token budget.
3. **Result**: the batch is stored on the job. The editor receives it, runs `applyOperations` on a copy, and shows the diff summary ("adds NPC Aiko at (12, 8), adds dialogue Lost Sword with 5 lines, adds variable hasSword"). Integrity failures are shown as "the AI proposal could not be applied: …" with a retry that feeds the diagnostics back into a new job.
4. **Accept**: one transaction, one revision, `origin = 'ai'`.

Because the model gets no executor feedback beyond schema validation, it can produce operations that fail integrity (a `next` to a node it never created). Step 3 catches that. When the miss rate matters, the fix is a Node worker running `applyOperations` in the loop, not a Python port of the core.

### 9.5 Asset generation pipeline

Prompt template per asset type (style anchors for "anime, clean lines, flat shading, transparent background, front view, full body"), provider call, then post-processing that is deterministic and provider-independent: background removal, trim, resize to the target frame size, optional palette reduction, assembly into the canonical sheet layout, then the ordinary upload validation. The result is a normal asset with `origin: 'generated'`, and the user can download it, edit it in any tool and re-upload. Assets are never locked to their prompt.

### 9.6 Safety and cost

- Every job carries `user_id`, `project_id`, provider, model and `cost_units`. Quotas are checked before enqueue and usage is recorded on completion.
- The system prompt states that project content is data, not instructions. The tool schemas are the only actions available. There is no tool that reads files, calls URLs or returns free text into the document except the typed string fields, which have length limits.
- Generated text fields pass through a moderation hook (provider moderation endpoint or a local classifier) before the proposal is shown, gated by a setting.
- Provider errors and rate limits surface as job failures with a retry policy; a job never retries more than 3 times and never silently switches providers unless a fallback is configured.

---

## 10. API design

REST over HTTPS, JSON bodies, `/api/v1` prefix. Errors are RFC 9457 `application/problem+json` with a stable `type` slug. Cursor pagination on lists. `Idempotency-Key` header honoured on creating POSTs. All project routes resolve the project through one dependency that enforces ownership and returns `404` for both "missing" and "not yours".

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/register` | email, password, display name → session cookie |
| POST | `/auth/login` | → session cookie |
| POST | `/auth/logout` | revoke session |
| GET | `/auth/me` | current user, plan, quotas |
| GET | `/projects` | list own projects |
| POST | `/projects` | `{ name }` → project with a fresh document (starter assets registered) |
| GET | `/projects/{id}` | summary |
| PATCH | `/projects/{id}` | rename |
| DELETE | `/projects/{id}` | soft delete |
| GET | `/projects/{id}/document` | `{ revisionId, document }` |
| PUT | `/projects/{id}/document` | `{ baseRevisionId, document }` → `{ revisionId }`, `409` on conflict, `422` on schema failure, `413` over size limit |
| GET | `/projects/{id}/revisions` | list (id, seq, origin, author, created_at, size) |
| GET | `/projects/{id}/revisions/{rid}` | full document at a revision |
| POST | `/projects/{id}/revisions/{rid}/restore` | new head from an old revision (append, never rewrite) |
| POST | `/projects/{id}/assets/uploads` | → `{ assetId, uploadUrl, expiresAt }` |
| POST | `/projects/{id}/assets/{aid}/complete` | enqueue validation |
| GET | `/projects/{id}/assets` | list with status |
| GET | `/projects/{id}/assets/{aid}` | metadata + signed `url` |
| DELETE | `/projects/{id}/assets/{aid}` | reject if referenced by head document |
| POST | `/projects/{id}/generations` | `{ kind, prompt, context? }` → `202 { jobId }` |
| GET | `/projects/{id}/generations/{jobId}` | status, output, error |
| POST | `/projects/{id}/exports` | `{ revisionId? }` → `202 { exportId }` |
| GET | `/projects/{id}/exports/{eid}` | status, signed download url, size |
| GET | `/runtime/versions` | available runtime versions and supported schema range |

Save protocol detail: the server does not merge. It checks `baseRevisionId == head`, validates the document against the JSON Schema and size limit, computes the hash, skips writing a revision if the hash equals the head's (no-op saves are free), otherwise inserts and advances.

---

## 11. Database schema

PostgreSQL 16. SQLAlchemy 2 models, Alembic migrations. `citext` for emails. All timestamps `timestamptz`.

```sql
create extension if not exists citext;

create table users (
  id            uuid primary key,
  email         citext not null unique,
  password_hash text,                       -- null when a user only has OAuth (later)
  display_name  text not null,
  plan          text not null default 'free',
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table sessions (
  id           uuid primary key,
  user_id      uuid not null references users(id) on delete cascade,
  token_hash   bytea not null unique,      -- sha256 of the cookie token
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at   timestamptz not null
);
create index sessions_user_idx on sessions(user_id);

create table projects (
  id               uuid primary key,
  owner_id         uuid not null references users(id),
  name             text not null,
  schema_version   int  not null,
  head_revision_id uuid,                    -- fk added below
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index projects_owner_idx on projects(owner_id) where deleted_at is null;

create table project_revisions (
  id            uuid primary key,
  project_id    uuid not null references projects(id) on delete cascade,
  seq           bigint not null,            -- 1, 2, 3 … per project
  parent_id     uuid references project_revisions(id),
  document      jsonb not null,
  document_hash bytea not null,
  size_bytes    int  not null,
  origin        text not null check (origin in ('user', 'ai', 'import', 'migration', 'restore')),
  author_id     uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (project_id, seq)
);
alter table projects add constraint projects_head_fk
  foreign key (head_revision_id) references project_revisions(id);

create table assets (
  id           uuid primary key,
  project_id   uuid not null references projects(id) on delete cascade,
  kind         text not null check (kind in ('image', 'audio')),
  name         text not null,
  mime         text not null,
  status       text not null default 'pending' check (status in ('pending', 'ready', 'rejected')),
  reject_reason text,
  content_hash bytea,                        -- set when ready
  size_bytes   int,
  width        int,
  height       int,
  storage_key  text,                         -- set when ready
  origin       text not null check (origin in ('upload', 'generated', 'starter')),
  metadata     jsonb not null default '{}',
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index assets_project_hash_idx on assets(project_id, content_hash) where content_hash is not null and deleted_at is null;
create index assets_project_idx on assets(project_id) where deleted_at is null;

create table jobs (
  id          uuid primary key,
  kind        text not null,                 -- 'asset.validate' | 'generation.content' | 'generation.asset' | 'export.static' | 'gc.assets'
  status      text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  project_id  uuid references projects(id) on delete cascade,
  user_id     uuid references users(id),
  input       jsonb not null,
  output      jsonb,
  error       text,
  attempts    int not null default 0,
  max_attempts int not null default 3,
  run_after   timestamptz not null default now(),
  locked_at   timestamptz,
  locked_by   text,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);
create index jobs_queue_idx on jobs(run_after, created_at) where status = 'queued';
create index jobs_project_idx on jobs(project_id, created_at desc);

create table generation_jobs (                -- 1:1 extension of jobs for AI runs
  job_id      uuid primary key references jobs(id) on delete cascade,
  provider    text,
  model       text,
  prompt      text not null,
  cost_units  int not null default 0,
  tokens_in   int,
  tokens_out  int
);

create table exports (
  id              uuid primary key,
  project_id      uuid not null references projects(id) on delete cascade,
  revision_id     uuid not null references project_revisions(id),
  job_id          uuid references jobs(id),
  runtime_version text not null,
  status          text not null default 'queued',
  storage_key     text,
  size_bytes      bigint,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz
);

create table usage_counters (
  user_id  uuid not null references users(id) on delete cascade,
  period   date not null,                    -- first day of month
  metric   text not null,                    -- 'generations', 'generation_cost_units', 'storage_bytes', 'exports'
  value    bigint not null default 0,
  primary key (user_id, period, metric)
);
```

Worker claim query:

```sql
update jobs set status = 'running', locked_at = now(), locked_by = :worker, attempts = attempts + 1, started_at = coalesce(started_at, now())
where id = (
  select id from jobs
  where status = 'queued' and run_after <= now()
  order by created_at
  for update skip locked
  limit 1
)
returning *;
```

Revision growth: full snapshots per save, debounced. A 300 KB document saved 500 times is 150 MB. Acceptable for the MVP. Mitigation when needed, in order: keep last 50 plus one per day older than a week (a `gc.revisions` job), then store JSON diffs with periodic snapshots. Both are additive.

---

## 12. Export and build architecture

### 12.1 Bundle layout

```
my-game/
├── index.html                 static loader page, no inline user data
├── runtime/
│   ├── beze-runtime.js        the pinned runtime version, IIFE
│   └── VERSION
├── project.json               the exported revision
├── assets/
│   ├── manifest.json          { assetId: { path, hash, mime, width, height } }
│   ├── ast_….png
│   └── …
└── README.txt                 how to run locally, licence notes for starter assets
```

`index.html` contains a `<div id="game">`, one `<script src="runtime/beze-runtime.js">` and a one-line call to the static loader. Everything user-controlled is in JSON and image files fetched at runtime.

### 12.2 Where it runs

- Slice 1 (local-only): the same `buildStaticBundle(project, assetBytes): Map<path, Blob>` function from `project-core` runs in the browser and zips with a small zip library. This is a real export, not a mock.
- Slice 3 onward: the worker runs the same layout logic in Python (it is file copying, not logic worth sharing): fetch the revision, copy `runtime/{version}/*` from the runtime bucket prefix, stream assets from their keys, write `project.json` with asset ids rewritten to relative paths only in `manifest.json` (the document itself is unchanged), zip to `exports/{exportId}.zip`, store a signed URL with a 24 h expiry.

There is no npm, no bundler and no code generation in the export path. Runtime versions are uploaded to object storage by CI on release and are immutable.

### 12.3 Hosting (later)

Publishing is an export unzipped to `published/{slug}/` behind a CDN on a separate origin (`play.<domain>`). Separate origin so a published game can never read editor cookies. The same bundle works as a download and as a hosted page.

---

## 13. Authentication and project ownership

- Registration and login with email and password. Argon2id hashing. Session token is 32 random bytes, stored hashed, delivered as `HttpOnly; Secure; SameSite=Lax` cookie with a 30 day sliding expiry.
- CSRF: the API only accepts JSON bodies with `Content-Type: application/json` and checks `Origin` on state-changing requests. With `SameSite=Lax` this is sufficient; a double-submit token can be added if we ever accept form posts.
- Authorization model in the MVP: `projects.owner_id`. One dependency, `require_project(role)`, loads the project and checks ownership. Every route uses it. There is no other path to a project.
- Reserved for teams: `project_members(project_id, user_id, role in ('owner','editor','viewer'))`. The dependency grows a join; routes do not change.
- Plans: `users.plan` is a string that maps to a limits table in code. Billing is not in the MVP; the plan field exists so limits are enforced from day one.

---

## 14. Security model

### 14.1 Threats and controls

| Threat | Control |
|--------|---------|
| Malicious AI output (prompt injection via project content, hallucinated operations) | Output is `Operation[]` validated against schema, integrity and limits. No tool has side effects outside the document. User accepts every proposal. Text fields length-limited. |
| Arbitrary code execution via projects | There is no code in projects. The runtime interprets data. Export copies files. No `eval`, no `Function`, no dynamic script loading anywhere in the runtime. |
| Malicious uploads (polyglot images, decompression bombs, wrong MIME) | Size cap before upload, magic-byte sniffing, Pillow decode with pixel cap, mandatory re-encode, served with `Content-Type` from our record and `X-Content-Type-Options: nosniff`, from a separate origin. |
| Cross-project access | Every query is scoped by owner. Object keys are prefixed by project id. Signed URLs are short-lived and bound to one key. Missing and forbidden both return `404`. |
| XSS in the editor from project data | React escapes by default. No `dangerouslySetInnerHTML`. CSP: `default-src 'self'; img-src 'self' blob: data: https://assets.<domain>; connect-src 'self' https://assets.<domain>; frame-src 'self'; object-src 'none'`. |
| The play preview reaching editor state | `sandbox="allow-scripts"` with no `allow-same-origin`. The iframe is an opaque origin. Only `postMessage` with origin checks. |
| Published games reaching the editor | Different origin. |
| Resource exhaustion | Limits below, enforced server-side. Rate limits per user and per IP on auth, save, upload, generation. |
| Cost abuse of AI | Per-plan monthly quotas in `usage_counters`, checked before enqueue. Hard cap on tokens and images per job. |
| Session theft | HttpOnly cookies, hashed at rest, revocable, sliding expiry, logout-all on password change. |
| Secrets in logs | Structured logging with an allow-list of fields. Provider keys only in the worker environment. |

### 14.2 Limits (free plan, MVP defaults)

| Limit | Value |
|-------|-------|
| Document size | 2 MB |
| Scenes per project | 50 |
| Entities per scene | 200 |
| Map size | 200 × 200 tiles |
| Dialogue nodes per dialogue | 200 |
| Text field length | 2 000 characters |
| Image upload | 5 MB, 4096 × 4096 |
| Assets per project | 200, 100 MB total |
| Projects per user | 20 |
| Generations per month | 50 content, 20 images |
| Save rate | 60 per minute per project |
| Export rate | 10 per hour per user |

All limits live in one Python module and one TypeScript module with a test that they agree.

---

## 15. Local development environment

Requirements: Node 22, pnpm 9, Python 3.12, uv, Docker.

```
just setup       pnpm install; uv sync; cp .env.example .env; docker compose up -d postgres minio; just db-migrate; just seed
just dev         editor (Vite, :5173) + runtime watch + api (uvicorn --reload, :8000) + worker
just test        pnpm -r test; uv run pytest
just lint        eslint + tsc --noEmit + ruff + pyright
just schemas     regenerate schemas/*.json from Zod and fail if git diff is non-empty
just build       runtime bundle, editor bundle, api image
```

- Vite proxies `/api` to `:8000` so cookies are same-site in development.
- MinIO console on `:9001`, bucket `beze-dev` created by `just setup`.
- `.env.example` documents every variable. Provider keys are optional; without them the worker uses a `FakeTextProvider` that returns a canned operation batch and a `FakeImageProvider` that returns a placeholder sprite, so the full AI flow is testable offline.
- Slice 1 needs none of the Docker services: `pnpm dev` in `apps/editor` is enough.

---

## 16. Deployment architecture

### 16.1 MVP (one machine)

One Linux VM. Docker Compose with `caddy` (automatic TLS, serves the `web` static files, reverse-proxies `/api`), `api`, `worker`, `postgres` with a mounted volume and nightly `pg_dump` to object storage, and either `minio` or a managed S3-compatible bucket. Images built by GitHub Actions and pushed to a registry; deploy is `docker compose pull && docker compose up -d`. Health endpoints: `/api/healthz` (db ping) and worker heartbeat row.

This serves the first few thousand users. It is boring on purpose.

### 16.2 Growth path (no rewrite)

1. Move Postgres to a managed service. Move assets to a managed bucket plus CDN. Both are configuration.
2. Run `api` and `worker` as separate autoscaled services (Fly, Render, ECS or Kubernetes; the containers do not care). Sessions are in Postgres, so any replica serves any user.
3. Add Redis when the worker needs pub/sub progress streaming or when rate limiting must be shared across many API replicas.
4. Split the AI worker from the asset/export worker by job kind when their hardware needs diverge. Same codebase, different `--kinds` flag.
5. Publish runtime versions and starter assets to the CDN on release.

---

## 17. Testing strategy

| Layer | Tooling | What is tested |
|-------|---------|----------------|
| `project-schema` | Vitest | Every golden fixture in `docs/examples` parses. Migrations from every past version reach the current one. Generated JSON Schema matches the committed file. |
| `project-core` | Vitest + fast-check | Each operation's apply and inverse. Property: apply then inverse is identity. Integrity validator catches each dangling-reference class. Limits. Recipes compose into valid batches. |
| `runtime` | Vitest (Node) for `dialogue/interpreter`, `GameState`, coordinate helpers, `buildTilemap` data prep. Playwright for a smoke run: load the golden project in headless Chromium, move the player with synthetic keys, assert `GameState` via a debug hook, talk to the NPC, assert dialogue text. |
| `editor` | Vitest + Testing Library for the store (dispatch, undo, redo, coalescing) and tools. Playwright end-to-end for the vertical slice: new project → place player → place NPC → write dialogue → Play → walk → talk → text visible. |
| `api` | pytest with a real Postgres and MinIO from Compose. Auth flows, ownership (a second user gets `404`), save conflicts, schema rejection, upload validation with a corpus of bad files (polyglot, bomb, wrong MIME, oversize), job claiming under concurrency, export produces a zip whose contents match the layout. |
| Contracts | A test that the TypeScript and Python limit tables agree. A test that every operation in `schemas/operations.json` has a Python tool spec builder that accepts it. |
| Security | CSP header snapshot. Iframe sandbox attribute snapshot. Fuzz `parseProject` with mutated fixtures. |

CI runs lint, typecheck, unit tests on every push; Playwright and API integration tests on pull requests. The runtime smoke test is the single most valuable test in the repo because it proves the product claim: the game runs.

---

## 18. Evolution from MVP to a serious SaaS

Each row is a trigger and the additive change it causes. None require reworking the foundation.

| When | Add |
|------|-----|
| Users want to share a link | Publishing: unzip export to `play.<domain>/g/{slug}`; `published_games` table. |
| Users want to work together | `project_members`; per-role authorization in the existing dependency. Real-time editing later via per-entity operational transform on the operation log, since every change is already an operation. |
| More genres | New `Component` and `DialogueNode` variants; new runtime systems; schema version bump with migration. |
| Users want custom logic | A visual event sheet (trigger → conditions → actions) stored as data; an `Action` type per verb. If an expression language is ever needed, a sandboxed, non-Turing-complete evaluator over `GameVariable`s, never JS. |
| AI misses references too often | Node "core" worker running `applyOperations` inside the generation loop. |
| AI art quality | Better pipelines behind `ImageProvider` and `GenerationPipeline`. Optional fine-tuned models are provider implementations. |
| Revenue | Stripe subscriptions writing `users.plan`; limits already keyed by plan. |
| Scale | Managed DB, CDN, replicas, Redis, split workers (section 16.2). Revision GC and diff storage (section 11). |
| Community | Public asset packs are projects' assets with a `public` flag and a copy operation; not a marketplace until there is demand. |
| Save games for players | `GameState` is already serialisable; runtime writes it to `localStorage` under the game's slug. |
| Mobile and desktop wrappers | Export is a static site; PWA manifest is a file in the bundle; desktop via Tauri wrapping the same files. |

---

## 19. What NOT to build yet

- A custom engine or renderer. Phaser does it.
- Code generation of any kind. The runtime interprets data.
- A scripting language, node-based logic canvas or "event sheet". Data-driven components and actions first.
- A node-graph dialogue canvas. The list editor covers the first thousand dialogues.
- Real-time collaboration, presence or CRDTs.
- Teams, organisations, roles, sharing links. One owner.
- Billing.
- A plugin or extension system.
- A marketplace or public asset library.
- OAuth providers. Email and password is enough to validate the product.
- Redis, Kubernetes, microservices, a message broker, a GraphQL layer.
- Rust services. Nothing is slow yet.
- Model training or fine-tuning. Provider APIs behind an interface.
- Full-sheet AI character generation before portraits and single sprites work.
- Tiled importer, LDtk importer, audio, particles, lighting, shaders, multiplayer, mobile controls, gamepad, localisation, accessibility beyond keyboard play, analytics dashboards, admin panels.
- Schema-driven inspector forms and a docking panel system.

Each of these has a place in section 18. None help a user finish their first tiny game.

---

## 20. Recommended implementation order

Phases are sequential and each ends in something that runs. Sizes are rough for one strong engineer.

| Phase | Deliverable | Size |
|-------|-------------|------|
| 0. Foundation | Monorepo, tooling, CI, `project-schema` with types, Zod, JSON Schema generation and the golden fixture `docs/examples/hello-aiko.project.json`. `project-core` with `applyOperations`, inverses, validator, limits, property tests. | 1 week |
| 1. Runtime first | `@beze/runtime` plays the golden fixture from a static `index.html`: tilemap, collision, player movement, NPC interaction, dialogue with a choice, variable set, scene change. Playwright smoke test. Publish the "hello Aiko" game as a static folder. | 2 weeks |
| 2. Editor, local-only (Vertical Slice 1) | Editor with local persistence, viewport, tile and collision painting, entity placement, inspector, dialogue list editor, Play panel via iframe, client-side export zip. End-to-end test of the slice. | 3 weeks |
| 3. Backend: accounts and saving | FastAPI, Postgres, auth, projects, revisions, save protocol, `ApiProjectRepository`. Docker Compose. Deploy to one VM. | 2 weeks |
| 4. Assets | Presigned uploads, worker validation and re-encode, `ApiAssetStore`, asset panel with upload, GC job. | 1.5 weeks |
| 5. Server export | Export job, runtime versions in object storage, download links. | 1 week |
| 6. AI content | Provider interfaces, fake providers, tool specs from operation schemas, content pipeline, "Ask" panel with proposal preview, quotas and usage counters. | 2 weeks |
| 7. AI assets | Portrait pipeline, then single-sprite with background removal, then sheet assembly experiments. | 2 to 4 weeks, open-ended |
| 8. Publish and polish | Hosted play links, plan limits UI, onboarding template projects, first public beta. | 2 weeks |

Phase 1 before phase 2 is deliberate. Writing the runtime against a hand-authored document proves the schema, proves the product claim ("it actually runs"), and gives the editor a real target. Every editor feature in phase 2 is then "produce this data", which is much easier to scope.

The first vertical slice, phase 2, is specified in `docs/VERTICAL_SLICE.md`.
