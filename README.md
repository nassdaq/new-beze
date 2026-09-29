# Beze

A browser-based tool for making small 2D anime-style games. Create characters, maps,
NPCs, dialogue and simple logic visually, press Play, then download the game as a static
web build. AI will assist creation; the editor stays in charge.

## Status: vertical slice 1

The first end-to-end slice is implemented and runs entirely in the browser with no backend:

```
CREATE PROJECT → CREATE SCENE → ADD PLAYER → MOVE PLAYER → ADD NPC → DIALOGUE → PLAY → EXPORT
```

## Run it locally

Requirements: Node 22, pnpm 10, Python 3 (only for regenerating the starter art).

```sh
pnpm install
pnpm dev          # builds the runtime, then serves the editor at http://localhost:5173
```

Then: **New game** → press **▶ Play** and walk with the arrow keys or WASD. Stop, pick
**Place**, choose *Villager*, click a tile, press **New** next to "Talks" in the inspector,
edit the lines below, press **Play** again, walk up to the villager and press **E**.
**Export game** downloads a zip that is a static website (serve it with `npx serve .`).

Other commands:

```sh
pnpm test         # unit and property tests (schema, core, runtime interpreter, editor store)
pnpm typecheck
pnpm build        # runtime bundle + editor to apps/editor/dist
pnpm e2e          # Playwright: the whole slice in a headless browser (needs pnpm build first)
pnpm schemas      # regenerate schemas/*.json from the Zod source of truth
pnpm starter      # regenerate the CC0 starter art from scripts/generate_starter_assets.py
```

## Layout

| Path | What |
|------|------|
| `packages/project-schema` | Zod schemas, TypeScript types, `parseProject`, migrations, JSON Schema export |
| `packages/project-core` | `applyOperations` with total inverses, integrity validator, limits, project factory, recipes, export bundle layout |
| `packages/runtime` | Phaser 3 interpreter for project documents; builds one IIFE used by both the editor's Play iframe and exports |
| `apps/editor` | React editor: Canvas 2D viewport, tools, inspectors, list-based dialogue editor, sandboxed Play, IndexedDB persistence, zip export |
| `schemas/` | Generated JSON Schema for the document and the operation catalog (the AI tool definitions, later) |
| `scripts/` | Starter art generator |
| `docs/` | Architecture and the slice spec |

Read [docs/FOUNDATION.md](docs/FOUNDATION.md) for the architecture and
[docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md) for the slice's scope and acceptance criteria.
`docs/examples/hello-aiko.project.json` is the golden fixture the runtime and tests use.

## Shape of the system

```
Editor (React, Canvas 2D)  ──operations──▶  Project document (JSON, Zod-validated)
        │                                            │
        │ Play (sandboxed iframe)                    │ Export (copy runtime + json + assets)
        ▼                                            ▼
Runtime (Phaser, interprets the document)   Static web build
```

Planned backend (slice 2 onward): FastAPI, PostgreSQL, S3-compatible storage, one Python
worker for asset validation, AI generation and export jobs.
