import { produce, current, isDraft } from 'immer';
import type { Component, ComponentType, Operation, Project } from '@beze/project-schema';
import { type Result, ok, err } from './result.js';
import { validateProject, hasErrors, type Diagnostic } from './validate.js';
import { checkLimits } from './limits.js';

export interface OperationError {
  /** Index of the failing operation in the batch, or -1 when the assembled document fails validation. */
  opIndex: number;
  code: string;
  message: string;
  path?: string;
}

export interface ApplyResult {
  project: Project;
  /** Applying these to `project` restores the input document. */
  inverse: Operation[];
}

export interface ApplyOptions {
  /** Skip integrity validation of the final document. Used only by tests of the raw engine. */
  skipValidation?: boolean;
}

class OpFailure extends Error {
  constructor(public code: string, message: string, public path?: string) {
    super(message);
  }
}

const COMPONENT_ORDER: ComponentType[] = ['sprite', 'body', 'playerControl', 'interactable', 'trigger', 'wander', 'health', 'enemy', 'property', 'shop', 'pickup', 'lock', 'mapMarker'];

/** Components are kept in a fixed order so that documents compare structurally regardless of edit history. */
export function canonicalComponents(components: Component[]): Component[] {
  return [...components].sort((a, b) => COMPONENT_ORDER.indexOf(a.type) - COMPONENT_ORDER.indexOf(b.type));
}

/**
 * Applies a batch atomically. Either every operation applies and the result passes integrity
 * validation and limits, or nothing changes and the errors describe why.
 */
export function applyOperations(project: Project, ops: Operation[], options: ApplyOptions = {}): Result<ApplyResult, OperationError[]> {
  let current = project;
  const inverse: Operation[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    try {
      let inv: Operation[] = [];
      current = produce(current, (draft) => {
        inv = applyOne(draft, op);
      });
      inverse.unshift(...inv);
    } catch (e) {
      if (e instanceof OpFailure) {
        const failure: OperationError = { opIndex: i, code: e.code, message: e.message };
        if (e.path !== undefined) failure.path = e.path;
        return err([failure]);
      }
      throw e;
    }
  }
  if (!options.skipValidation) {
    const diagnostics = [...validateProject(current), ...checkLimits(current)];
    if (hasErrors(diagnostics)) return err(diagnostics.filter((d) => d.severity === 'error').map(toOpError));
  }
  return ok({ project: current, inverse });
}

function toOpError(d: Diagnostic): OperationError {
  return { opIndex: -1, code: d.code, message: d.message, path: d.path };
}

/** Plain deep copy of a value that may be an Immer draft. Documents are JSON, so JSON cloning is exact. */
function clone<T>(value: T): T {
  const plain: unknown = isDraft(value) ? current(value as object) : value;
  return JSON.parse(JSON.stringify(plain)) as T;
}

function must<T>(value: T | undefined, code: string, message: string, path?: string): T {
  if (value === undefined) throw new OpFailure(code, message, path);
  return value;
}

/**
 * Builds the inverse of an `update*` patch: the previous values of the patched keys. When a
 * patched key did not exist before (optional field), the inverse falls back to delete + create.
 */
type Patch<T> = { [K in keyof T]?: T[K] | undefined };

function patchInverse<T extends object>(prev: T, patch: Patch<T>): Patch<T> | null {
  const out: Patch<T> = {};
  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (patch[key] === undefined) continue;
    if (!(key in prev)) return null;
    out[key] = prev[key];
  }
  return out;
}

function applyOne(d: Project, op: Operation): Operation[] {
  switch (op.op) {
    case 'updateSettings': {
      const inv = patchInverse(d.settings, op.patch) ?? { ...d.settings };
      Object.assign(d.settings, op.patch);
      return [{ op: 'updateSettings', patch: inv }];
    }
    case 'renameProject': {
      const prev = d.name;
      d.name = op.name;
      return [{ op: 'renameProject', name: prev }];
    }

    case 'createCharacter': {
      if (d.characters[op.character.id]) throw new OpFailure('exists', `character "${op.character.id}" already exists`);
      d.characters[op.character.id] = op.character;
      return [{ op: 'deleteCharacter', id: op.character.id }];
    }
    case 'updateCharacter': {
      const prev = must(d.characters[op.id], 'missing', `character "${op.id}" does not exist`);
      const inv = patchInverse(prev, op.patch);
      const snapshot = clone(prev);
      Object.assign(prev, op.patch);
      return inv ? [{ op: 'updateCharacter', id: op.id, patch: inv }] : [{ op: 'deleteCharacter', id: op.id }, { op: 'createCharacter', character: snapshot }];
    }
    case 'deleteCharacter': {
      const prev = must(d.characters[op.id], 'missing', `character "${op.id}" does not exist`);
      const snapshot = clone(prev);
      delete d.characters[op.id];
      return [{ op: 'createCharacter', character: snapshot }];
    }

    case 'createTileset': {
      if (d.tilesets[op.tileset.id]) throw new OpFailure('exists', `tileset "${op.tileset.id}" already exists`);
      d.tilesets[op.tileset.id] = op.tileset;
      return [{ op: 'deleteTileset', id: op.tileset.id }];
    }
    case 'updateTileset': {
      const prev = must(d.tilesets[op.id], 'missing', `tileset "${op.id}" does not exist`);
      const inv = patchInverse(prev, op.patch);
      const snapshot = clone(prev);
      Object.assign(prev, op.patch);
      return inv ? [{ op: 'updateTileset', id: op.id, patch: inv }] : [{ op: 'deleteTileset', id: op.id }, { op: 'createTileset', tileset: snapshot }];
    }
    case 'deleteTileset': {
      const prev = must(d.tilesets[op.id], 'missing', `tileset "${op.id}" does not exist`);
      const snapshot = clone(prev);
      delete d.tilesets[op.id];
      return [{ op: 'createTileset', tileset: snapshot }];
    }
    case 'addMapTileset': {
      const map = must(d.maps[op.mapId], 'missing', `map "${op.mapId}" does not exist`);
      must(d.tilesets[op.tilesetId], 'missing', `tileset "${op.tilesetId}" does not exist`);
      if (map.tilesets.some((r) => r.tilesetId === op.tilesetId)) throw new OpFailure('exists', `map already uses tileset "${op.tilesetId}"`);
      const last = map.tilesets[map.tilesets.length - 1];
      const lastEnd = last ? last.firstGid + (d.tilesets[last.tilesetId]?.tileCount ?? 0) : 1;
      if (op.firstGid < lastEnd) throw new OpFailure('gidOrder', `firstGid must be at least ${lastEnd}`);
      map.tilesets.push({ tilesetId: op.tilesetId, firstGid: op.firstGid });
      return [{ op: 'removeMapTileset', mapId: op.mapId, tilesetId: op.tilesetId }];
    }
    case 'removeMapTileset': {
      const map = must(d.maps[op.mapId], 'missing', `map "${op.mapId}" does not exist`);
      const i = map.tilesets.findIndex((r) => r.tilesetId === op.tilesetId);
      if (i < 0) throw new OpFailure('missing', `map does not use tileset "${op.tilesetId}"`);
      if (i !== map.tilesets.length - 1) throw new OpFailure('notLast', `only the last tileset of a map can be removed`);
      const [removed] = map.tilesets.splice(i, 1);
      return [{ op: 'addMapTileset', mapId: op.mapId, tilesetId: op.tilesetId, firstGid: removed!.firstGid }];
    }
    case 'createMap': {
      if (d.maps[op.map.id]) throw new OpFailure('exists', `map "${op.map.id}" already exists`);
      d.maps[op.map.id] = op.map;
      return [{ op: 'deleteMap', id: op.map.id }];
    }
    case 'deleteMap': {
      const prev = must(d.maps[op.id], 'missing', `map "${op.id}" does not exist`);
      const snapshot = clone(prev);
      delete d.maps[op.id];
      return [{ op: 'createMap', map: snapshot }];
    }
    case 'paintTiles': {
      const map = must(d.maps[op.mapId], 'missing', `map "${op.mapId}" does not exist`);
      const layer = must(map.layers.find((l) => l.id === op.layerId), 'missing', `layer "${op.layerId}" does not exist`);
      const maxGid = map.tilesets.reduce((m, ref) => {
        const t = d.tilesets[ref.tilesetId];
        return t ? Math.max(m, ref.firstGid + t.tileCount - 1) : m;
      }, 0);
      const prevCells: Array<{ x: number; y: number; gid: number }> = [];
      const seen = new Set<number>();
      for (const c of op.cells) {
        if (c.x >= map.width || c.y >= map.height) throw new OpFailure('outOfBounds', `cell (${c.x}, ${c.y}) is outside the map`);
        if (c.gid > maxGid) throw new OpFailure('badGid', `tile id ${c.gid} is not in any tileset of this map`);
        const i = c.y * map.width + c.x;
        if (!seen.has(i)) {
          seen.add(i);
          prevCells.push({ x: c.x, y: c.y, gid: layer.data[i]! });
        }
        layer.data[i] = c.gid;
      }
      return [{ op: 'paintTiles', mapId: op.mapId, layerId: op.layerId, cells: prevCells }];
    }
    case 'paintRect': {
      const map = must(d.maps[op.mapId], 'missing', `map "${op.mapId}" does not exist`);
      const layer = must(map.layers.find((l) => l.id === op.layerId), 'missing', `layer "${op.layerId}" does not exist`);
      if (op.x + op.width > map.width || op.y + op.height > map.height) throw new OpFailure('outOfBounds', `rectangle leaves the map`);
      const maxGid = map.tilesets.reduce((m, ref) => {
        const t = d.tilesets[ref.tilesetId];
        return t ? Math.max(m, ref.firstGid + t.tileCount - 1) : m;
      }, 0);
      if (op.gid > maxGid) throw new OpFailure('badGid', `tile id ${op.gid} is not in any tileset of this map`);
      const prevCells: Array<{ x: number; y: number; gid: number }> = [];
      for (let y = op.y; y < op.y + op.height; y++) {
        for (let x = op.x; x < op.x + op.width; x++) {
          const i = y * map.width + x;
          prevCells.push({ x, y, gid: layer.data[i]! });
          layer.data[i] = op.gid;
        }
      }
      return [{ op: 'paintTiles', mapId: op.mapId, layerId: op.layerId, cells: prevCells }];
    }
    case 'setCollisionRect': {
      const map = must(d.maps[op.mapId], 'missing', `map "${op.mapId}" does not exist`);
      if (op.x + op.width > map.width || op.y + op.height > map.height) throw new OpFailure('outOfBounds', `rectangle leaves the map`);
      const prevCells: Array<{ x: number; y: number; solid: boolean; climbable?: boolean }> = [];
      for (let y = op.y; y < op.y + op.height; y++) {
        for (let x = op.x; x < op.x + op.width; x++) {
          const i = y * map.width + x;
          prevCells.push(collisionCell(x, y, map.collision[i]!));
          map.collision[i] = collisionValue(op.solid, op.climbable);
        }
      }
      return [{ op: 'setCollision', mapId: op.mapId, cells: prevCells }];
    }
    case 'setCollision': {
      const map = must(d.maps[op.mapId], 'missing', `map "${op.mapId}" does not exist`);
      const prevCells: Array<{ x: number; y: number; solid: boolean; climbable?: boolean }> = [];
      const seen = new Set<number>();
      for (const c of op.cells) {
        if (c.x >= map.width || c.y >= map.height) throw new OpFailure('outOfBounds', `cell (${c.x}, ${c.y}) is outside the map`);
        const i = c.y * map.width + c.x;
        if (!seen.has(i)) {
          seen.add(i);
          prevCells.push(collisionCell(c.x, c.y, map.collision[i]!));
        }
        map.collision[i] = collisionValue(c.solid, c.climbable);
      }
      return [{ op: 'setCollision', mapId: op.mapId, cells: prevCells }];
    }
    case 'addLayer': {
      const map = must(d.maps[op.mapId], 'missing', `map "${op.mapId}" does not exist`);
      if (map.layers.some((l) => l.id === op.layer.id)) throw new OpFailure('exists', `layer "${op.layer.id}" already exists`);
      const index = Math.min(op.index ?? map.layers.length, map.layers.length);
      map.layers.splice(index, 0, op.layer);
      return [{ op: 'deleteLayer', mapId: op.mapId, layerId: op.layer.id }];
    }
    case 'deleteLayer': {
      const map = must(d.maps[op.mapId], 'missing', `map "${op.mapId}" does not exist`);
      const index = map.layers.findIndex((l) => l.id === op.layerId);
      if (index < 0) throw new OpFailure('missing', `layer "${op.layerId}" does not exist`);
      const [removed] = map.layers.splice(index, 1);
      return [{ op: 'addLayer', mapId: op.mapId, layer: clone(removed!), index }];
    }

    case 'createScene': {
      if (d.scenes[op.scene.id]) throw new OpFailure('exists', `scene "${op.scene.id}" already exists`);
      d.scenes[op.scene.id] = {
        ...op.scene,
        entities: Object.fromEntries(Object.entries(op.scene.entities).map(([k, e]) => [k, { ...e, components: canonicalComponents(e.components) }])),
      };
      return [{ op: 'deleteScene', id: op.scene.id }];
    }
    case 'updateScene': {
      const prev = must(d.scenes[op.id], 'missing', `scene "${op.id}" does not exist`);
      const inv = patchInverse(prev, op.patch);
      const snapshot = clone(prev);
      Object.assign(prev, op.patch);
      return inv ? [{ op: 'updateScene', id: op.id, patch: inv }] : [{ op: 'deleteScene', id: op.id }, { op: 'createScene', scene: snapshot }];
    }
    case 'deleteScene': {
      const prev = must(d.scenes[op.id], 'missing', `scene "${op.id}" does not exist`);
      const snapshot = clone(prev);
      delete d.scenes[op.id];
      return [{ op: 'createScene', scene: snapshot }];
    }
    case 'setStartScene': {
      const prev = d.startSceneId;
      d.startSceneId = op.sceneId;
      return [{ op: 'setStartScene', sceneId: prev }];
    }
    case 'createEntity': {
      const scene = must(d.scenes[op.sceneId], 'missing', `scene "${op.sceneId}" does not exist`);
      if (scene.entities[op.entity.id]) throw new OpFailure('exists', `entity "${op.entity.id}" already exists`);
      scene.entities[op.entity.id] = { ...op.entity, components: canonicalComponents(op.entity.components) };
      const index = Math.min(op.index ?? scene.entityOrder.length, scene.entityOrder.length);
      scene.entityOrder.splice(index, 0, op.entity.id);
      return [{ op: 'deleteEntity', sceneId: op.sceneId, entityId: op.entity.id }];
    }
    case 'placeEntity': {
      const e = entity(d, op.sceneId, op.entityId);
      const inv: Operation = { op: 'placeEntity', sceneId: op.sceneId, entityId: op.entityId, x: e.x, y: e.y, facing: e.facing };
      e.x = op.x;
      e.y = op.y;
      if (op.facing) e.facing = op.facing;
      return [inv];
    }
    case 'modifyEntity': {
      const e = entity(d, op.sceneId, op.entityId);
      const inv = patchInverse(e, op.patch) ?? {};
      Object.assign(e, op.patch);
      return [{ op: 'modifyEntity', sceneId: op.sceneId, entityId: op.entityId, patch: inv }];
    }
    case 'setComponent': {
      const e = entity(d, op.sceneId, op.entityId);
      const i = e.components.findIndex((c) => c.type === op.component.type);
      const inv: Operation = i >= 0
        ? { op: 'setComponent', sceneId: op.sceneId, entityId: op.entityId, component: clone(e.components[i]!) }
        : { op: 'removeComponent', sceneId: op.sceneId, entityId: op.entityId, componentType: op.component.type };
      if (i >= 0) e.components[i] = op.component;
      else e.components.push(op.component);
      e.components = canonicalComponents(e.components);
      return [inv];
    }
    case 'removeComponent': {
      const e = entity(d, op.sceneId, op.entityId);
      const i = e.components.findIndex((c) => c.type === op.componentType);
      if (i < 0) throw new OpFailure('missing', `entity has no ${op.componentType} component`);
      const [removed] = e.components.splice(i, 1);
      return [{ op: 'setComponent', sceneId: op.sceneId, entityId: op.entityId, component: clone(removed!) }];
    }
    case 'deleteEntity': {
      const scene = must(d.scenes[op.sceneId], 'missing', `scene "${op.sceneId}" does not exist`);
      const prev = must(scene.entities[op.entityId], 'missing', `entity "${op.entityId}" does not exist`);
      const snapshot = clone(prev);
      const index = scene.entityOrder.indexOf(op.entityId);
      delete scene.entities[op.entityId];
      if (index >= 0) scene.entityOrder.splice(index, 1);
      return [{ op: 'createEntity', sceneId: op.sceneId, entity: snapshot, index: Math.max(index, 0) }];
    }

    case 'createDialogue': {
      if (d.dialogues[op.dialogue.id]) throw new OpFailure('exists', `dialogue "${op.dialogue.id}" already exists`);
      d.dialogues[op.dialogue.id] = op.dialogue;
      return [{ op: 'deleteDialogue', id: op.dialogue.id }];
    }
    case 'updateDialogue': {
      const prev = must(d.dialogues[op.id], 'missing', `dialogue "${op.id}" does not exist`);
      const inv = patchInverse(prev, op.patch) ?? {};
      Object.assign(prev, op.patch);
      return [{ op: 'updateDialogue', id: op.id, patch: inv }];
    }
    case 'setDialogueNode': {
      const dlg = must(d.dialogues[op.dialogueId], 'missing', `dialogue "${op.dialogueId}" does not exist`);
      const prev = dlg.nodes[op.node.id];
      const inv: Operation = prev
        ? { op: 'setDialogueNode', dialogueId: op.dialogueId, node: clone(prev) }
        : { op: 'deleteDialogueNode', dialogueId: op.dialogueId, nodeId: op.node.id };
      dlg.nodes[op.node.id] = op.node;
      return [inv];
    }
    case 'deleteDialogueNode': {
      const dlg = must(d.dialogues[op.dialogueId], 'missing', `dialogue "${op.dialogueId}" does not exist`);
      const prev = must(dlg.nodes[op.nodeId], 'missing', `node "${op.nodeId}" does not exist`);
      const snapshot = clone(prev);
      delete dlg.nodes[op.nodeId];
      return [{ op: 'setDialogueNode', dialogueId: op.dialogueId, node: snapshot }];
    }
    case 'deleteDialogue': {
      const prev = must(d.dialogues[op.id], 'missing', `dialogue "${op.id}" does not exist`);
      const snapshot = clone(prev);
      delete d.dialogues[op.id];
      return [{ op: 'createDialogue', dialogue: snapshot }];
    }

    case 'createVariable': {
      if (d.variables[op.variable.id]) throw new OpFailure('exists', `variable "${op.variable.id}" already exists`);
      d.variables[op.variable.id] = op.variable;
      return [{ op: 'deleteVariable', id: op.variable.id }];
    }
    case 'updateVariable': {
      const prev = must(d.variables[op.id], 'missing', `variable "${op.id}" does not exist`);
      const inv = patchInverse(prev, op.patch) ?? {};
      Object.assign(prev, op.patch);
      return [{ op: 'updateVariable', id: op.id, patch: inv }];
    }
    case 'deleteVariable': {
      const prev = must(d.variables[op.id], 'missing', `variable "${op.id}" does not exist`);
      const snapshot = clone(prev);
      delete d.variables[op.id];
      return [{ op: 'createVariable', variable: snapshot }];
    }
    case 'createQuest': {
      if (d.quests[op.quest.id]) throw new OpFailure('exists', `quest "${op.quest.id}" already exists`);
      d.quests[op.quest.id] = op.quest;
      return [{ op: 'deleteQuest', id: op.quest.id }];
    }
    case 'updateQuest': {
      const prev = must(d.quests[op.id], 'missing', `quest "${op.id}" does not exist`);
      const inv = patchInverse(prev, op.patch) ?? {};
      Object.assign(prev, op.patch);
      return [{ op: 'updateQuest', id: op.id, patch: inv }];
    }
    case 'deleteQuest': {
      const prev = must(d.quests[op.id], 'missing', `quest "${op.id}" does not exist`);
      const snapshot = clone(prev);
      delete d.quests[op.id];
      return [{ op: 'createQuest', quest: snapshot }];
    }

    case 'registerAsset': {
      if (d.assets[op.asset.id]) throw new OpFailure('exists', `asset "${op.asset.id}" already exists`);
      d.assets[op.asset.id] = op.asset;
      return [{ op: 'unregisterAsset', id: op.asset.id }];
    }
    case 'unregisterAsset': {
      const prev = must(d.assets[op.id], 'missing', `asset "${op.id}" does not exist`);
      const snapshot = clone(prev);
      delete d.assets[op.id];
      return [{ op: 'registerAsset', asset: snapshot }];
    }
  }
}

function entity(d: Project, sceneId: string, entityId: string) {
  const scene = must(d.scenes[sceneId], 'missing', `scene "${sceneId}" does not exist`);
  return must(scene.entities[entityId], 'missing', `entity "${entityId}" does not exist in scene "${scene.name}"`);
}

/** Collision grid value for a cell: 0 walkable, 1 solid, 2 climbable-solid (v4). */
function collisionValue(solid: boolean, climbable: boolean | undefined): 0 | 1 | 2 {
  return solid ? (climbable ? 2 : 1) : 0;
}

/** The inverse cell of a collision edit: what the grid held, as a setCollision cell. */
function collisionCell(x: number, y: number, value: number): { x: number; y: number; solid: boolean; climbable?: boolean } {
  return value === 2 ? { x, y, solid: true, climbable: true } : { x, y, solid: value === 1 };
}
