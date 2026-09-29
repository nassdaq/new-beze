# Vertical Slice 1: "Hello, Aiko"

**Status: implemented.** `pnpm dev` runs it; `pnpm e2e` proves acceptance criterion 7 in a
headless browser. Section 8 lists where the implementation deviates from this spec.

The smallest end-to-end path through the product that ends in a real, playable browser game.

```
CREATE PROJECT → CREATE SCENE → ADD PLAYER → MOVE PLAYER → ADD NPC → DIALOGUE → PLAY
```

It is preceded by Phase 0 (schema and core) and Phase 1 (runtime plays the golden fixture)
from `FOUNDATION.md` section 20. This slice is the editor that produces what the runtime
already plays.

## 1. Scope

**In**

- Editor runs entirely in the browser. No login, no server, no Docker. Projects live in IndexedDB.
- Starter pack bundled: one 32 px outdoor tileset, two character sheets (hero, villager), two portraits. CC0.
- New project = one scene, one 20×15 map pre-filled with grass, a hero already placed as the player, and no NPCs. The user's first action can be "press Play" and walk around. Then they add an NPC and talk to it.
- Viewport tools: select/move, tile brush (from tileset palette), eraser, collision paint, place entity.
- Inspector for scene, entity (name, position, facing, character, "is player", "talks: dialogue"), character (name only), variable.
- Dialogue list editor: line, choice (2 to 4 options), set variable, end. Branch nodes are edited as choice options with conditions.
- Variables panel: create boolean, number, string.
- Play panel: runtime in a sandboxed iframe, Stop button, errors shown in the panel.
- Undo and redo across everything.
- Save: automatic to IndexedDB, plus "Download project" (`.beze.json`) and "Open project" from file.
- Export: "Download game" produces a zip with the bundle layout from `FOUNDATION.md` section 12.

**Out**

- Accounts, API, uploads (starter assets only; upload is phase 4), AI, multiple maps per scene, wander behaviour, audio, quests in the runtime, scene transitions in the UI (schema supports `changeScene`, the inspector does not expose it yet).

## 2. The user's path, step by step

| Step | What the user does | What happens in the system |
|------|--------------------|----------------------------|
| Create project | Clicks "New game", types a name | `createProject(name)` from `project-core` builds a document: settings, starter assets registered, one tileset, one map filled with the grass tile, one scene, one entity `Hero` at the centre with `sprite`, `body`, `playerControl`. Saved to IndexedDB. Route to `/p/:id`. |
| Create scene | Already exists; the user can add another from the Scenes list (name only) | `createMap` + `createScene`. Switching active scene re-targets the viewport. |
| Add player | Already placed; the user can drag it | Pointer down on the entity starts a transaction; pointer up commits one `placeEntity`. |
| Move player | Paints a path and some trees with the tile brush, paints collision on the trees | `paintTiles` batches per stroke; `setCollision` batches per stroke. |
| Add NPC | Selects "Place entity", picks "Villager" from the character list, clicks the map, renames it "Aiko" | `createEntity` with `sprite` + `body` + an empty `interactable` placeholder; `modifyEntity` for the name. |
| Dialogue | In the inspector clicks "Add dialogue". The bottom panel opens with a first line node. Types lines, adds a choice with two options, one option sets `metAiko = true` | `createDialogue`, `setDialogueNode` per edit, `createVariable`, and `setComponent` to wire `interactable.action = startDialogue`. |
| Play | Presses Play. Walks with arrow keys. Presses E facing Aiko. Reads the dialogue, picks an option. | Editor validates (`validateProject` errors block Play with a readable list), posts `beze:load` to the iframe. Runtime mounts, plays. |
| Save | Nothing to do; a "Saved" indicator shows. "Download project" for a file. | Debounced IndexedDB write. `.beze.json` is the raw document plus embedded starter asset references (starter assets are not embedded; they ship with every build). |
| Export | Clicks "Download game" | `buildStaticBundle` + zip in the browser. The user unzips and serves it with any static server. |

## 3. Data flow inside the editor

```
UI event ──▶ Tool / form handler ──▶ dispatch(label, ops)
                                          │
                                          ▼
                             applyOperations(project, ops)   (project-core, pure)
                                          │
                        ┌── errors ◀──────┴──────▶ { project', inverse }
                        ▼                                 │
              toast + no change                           ▼
                                             store.project = project'
                                             history.undo.push({ ops, inverse })
                                             autosave.schedule()
                                                          │
                                                          ▼
                                             ViewportRenderer.render() on next frame
```

Play: `store.project` → `parseProject` → `validateProject` → `assetStore.urlMap(ids)` → `iframe.postMessage({ type: 'beze:load', project, assetUrls })`.

## 4. Files created in this slice

Roughly 40 files. Listed so the size is honest.

```
apps/editor/
  index.html, vite.config.ts, package.json, tsconfig.json
  public/runtime/index.html            built by packages/runtime, copied in
  public/starter/                      tileset.png, hero.png, villager.png, hero_portrait.png, villager_portrait.png, LICENSES.md
  src/main.tsx
  src/app/App.tsx                      routes
  src/app/ProjectsPage.tsx             list, new, open file
  src/app/EditorPage.tsx               shell layout
  src/store/editorStore.ts             state, dispatch, undo, redo
  src/store/autosave.ts
  src/store/selection.ts
  src/repository/ProjectRepository.ts  interface
  src/repository/LocalProjectRepository.ts
  src/assets/AssetStore.ts             interface
  src/assets/LocalAssetStore.ts        starter pack + IndexedDB blobs
  src/viewport/ViewportRenderer.ts
  src/viewport/camera.ts               world/tile/screen conversions
  src/viewport/Viewport.tsx            canvas host, pointer plumbing
  src/viewport/tools/{Tool.ts,SelectTool.ts,TileBrushTool.ts,EraserTool.ts,CollisionTool.ts,PlaceEntityTool.ts}
  src/panels/ProjectPanel.tsx          scenes, characters, dialogues, variables lists
  src/panels/InspectorPanel.tsx        switch on selection kind
  src/panels/inspectors/{EntityInspector.tsx,SceneInspector.tsx,VariableInspector.tsx}
  src/panels/TilePalette.tsx
  src/panels/DialogueEditor.tsx        list editor
  src/play/PlayPanel.tsx
  src/play/protocol.ts                 message types shared with runtime loader
  src/export/downloadGame.ts           buildStaticBundle + zip
  src/ui/{Button.tsx,Field.tsx,Toast.tsx}
packages/project-core/src/
  createProject.ts, recipes.ts (createNpcWithDialogue), exportBundle.ts   (added in this slice)
```

`packages/project-schema`, the rest of `packages/project-core` and `packages/runtime` already exist from phases 0 and 1.

## 5. Acceptance criteria

The slice is done when all of these hold, and the last one is a Playwright test in CI.

1. A new user with no instructions can, in under five minutes, make an NPC that says something and talk to it in Play.
2. Undo works for every action in the slice, including tile strokes and drags, as single steps.
3. Closing the tab and reopening restores the project exactly.
4. `validateProject` errors are shown in plain language and Play is blocked until they are fixed. There is no way to get the runtime to throw on a document the editor allowed.
5. The exported zip, served with `npx serve`, plays identically to the Play panel.
6. The editor bundle (without Phaser) is under 400 KB gzipped; the runtime bundle is under 1.5 MB gzipped.
7. Playwright: new project → place NPC → add dialogue with a choice → Play → arrow keys move the hero (assert via a `window.__beze.state` debug hook enabled by `options.debug`) → E near NPC opens dialogue → choice sets the variable → assert variable value.

## 6. Risks specific to this slice

| Risk | Mitigation |
|------|------------|
| Canvas 2D viewport feels slow when painting | Per-layer offscreen canvases; only the touched layer redraws; requestAnimationFrame coalescing. If it is still slow at 200×200 maps, that is the PixiJS trigger. |
| Iframe sandbox blocks something the runtime needs (audio, fullscreen) | `allow-scripts` is enough for canvas and keyboard. Add specific `allow-*` flags only when a feature needs them. Never `allow-same-origin`. |
| IndexedDB blob URLs leak | `LocalAssetStore` owns the URL cache and revokes on project close. |
| Users expect to open `index.html` from disk | README.txt in the export explains that browsers block `file://` asset loading and gives the one-line command. Hosting solves it in phase 8. |

## 7. What the user should feel at the end

They named a game, painted a path, dropped a character called Aiko onto it, wrote three lines and a choice, pressed Play and walked over to talk to her. Then they downloaded a folder that is their game. That is the whole product in miniature, and every later feature makes one of those steps richer without changing the shape.

## 8. Implementation notes (what differs from the plan above)

- **Styling** is one stylesheet (`apps/editor/src/styles.css`) rather than CSS Modules. The
  component count did not justify per-file styles yet.
- **Assets cross into the Play iframe as data URLs.** The iframe's opaque origin cannot load
  `blob:` URLs from the editor origin, and cross-origin images taint WebGL textures. See
  FOUNDATION.md section 8.4.
- **Escape inside the game** is forwarded as a `beze:exit` message because the editor never
  sees key events that land in the iframe.
- **Interaction and dialogue input are event-driven** (`key.on('down')`), not polled with
  `JustDown`, so a tap shorter than one frame still counts.
- **Branch nodes** are fully editable in the list editor (condition, then, else), not folded
  into choice options.
- The operation catalog gained `deleteMap`, `deleteTileset` and `createEntity.index` so every
  operation has an exact inverse.
- **Starter art** is generated by `scripts/generate_starter_assets.py` (pure Python, CC0)
  rather than sourced from an external pack. It is placeholder quality by design.
- **Runtime bundle** lands in `apps/editor/public/runtime/` (git-ignored); `pnpm dev` and
  `pnpm build` produce it. The exported zip copies it verbatim.

Sizes measured at implementation time: editor 143 KB gzipped, runtime 367 KB gzipped, both
inside the budgets in section 5.

## 9. Slice 2 (implemented): action vocabulary and Ask

Added after slice 1, still local-first:

- **Schema v2** with a v1 → v2 migration: `settings.attackKey`, `health` and `enemy` components,
  `playerControl.attackDamage`, and the `paintRect` / `setCollisionRect` operations.
- **Runtime**: wandering NPCs, chasing enemies with contact damage, player attacks with a swing
  hitbox, hit flash, knockback, invulnerability frames, camera shake, hearts HUD, defeat overlay
  with retry, and persistent defeats. The starter pack gained a slime.
- **Editor**: health, enemy and wander controls in the entity inspector; attack key in settings.
- **Ask** (`apps/api`): prompt → operations through a provider-neutral tool-calling loop; the
  editor previews the batch and applies it as one undoable transaction. Providers: Claude,
  any OpenAI-compatible server (your GPUs), and a deterministic fake used by the e2e test.
- Verified headlessly: the slime is defeated in two swings and increments a counter; the hero
  loses hearts on contact and reaches the retry overlay; a prompt produces an NPC the player
  can talk to; undo reverts the whole proposal.
