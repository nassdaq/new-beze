# Beze

A browser-based tool for making small 2D anime-style games. Create characters, maps,
NPCs, dialogue and simple logic visually, press Play, then download the game as a static
web build. AI assists creation; the editor stays in charge.

## Status

Foundation stage. No application code yet. Start with the documents below.

- [docs/FOUNDATION.md](docs/FOUNDATION.md): product and system architecture, repository
  layout, editor and runtime design, the project schema and operation catalog, asset
  system, AI abstraction, API, database, export, auth, security, dev environment,
  deployment, testing, evolution path, what not to build, and the implementation order.
- [docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md): the first end-to-end slice
  (create project → scene → player → move → NPC → dialogue → play).
- [docs/examples/hello-aiko.project.json](docs/examples/hello-aiko.project.json): the
  golden project fixture that the runtime plays first and the schema tests parse.

## Shape of the system

```
Editor (React, Canvas 2D)  ──operations──▶  Project document (JSON, Zod-validated)
        │                                            │
        │ Play (sandboxed iframe)                    │ Export (copy runtime + json + assets)
        ▼                                            ▼
Runtime (Phaser, interprets the document)   Static web build
```

Backend: FastAPI, PostgreSQL, S3-compatible storage, one Python worker for asset
validation, AI generation and export jobs.
