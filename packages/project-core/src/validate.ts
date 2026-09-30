import type { Action, Condition, Project, Scene, TileMap } from '@beze/project-schema';

export type Severity = 'error' | 'warning';
export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  path: string;
}

/**
 * Referential integrity and structural invariants that Zod cannot express.
 * Errors block Play and Export; warnings are shown in the editor.
 */
export function validateProject(p: Project): Diagnostic[] {
  const out: Diagnostic[] = [];
  const error = (code: string, path: string, message: string) => out.push({ severity: 'error', code, path, message });
  const warn = (code: string, path: string, message: string) => out.push({ severity: 'warning', code, path, message });

  const checkKeys = (collection: Record<string, { id: string }>, name: string) => {
    for (const [key, value] of Object.entries(collection)) {
      if (value.id !== key) error('keyMismatch', `${name}.${key}.id`, `${name} key "${key}" does not match id "${value.id}"`);
    }
  };
  checkKeys(p.assets, 'assets');
  checkKeys(p.tilesets, 'tilesets');
  checkKeys(p.maps, 'maps');
  checkKeys(p.characters, 'characters');
  checkKeys(p.scenes, 'scenes');
  checkKeys(p.dialogues, 'dialogues');
  checkKeys(p.quests, 'quests');
  checkKeys(p.variables, 'variables');

  const asset = (id: string | undefined, path: string, kind: 'image' | 'audio' = 'image') => {
    if (id === undefined) return;
    const a = p.assets[id];
    if (!a) error('missingAsset', path, `asset "${id}" does not exist`);
    else if (a.kind !== kind) error('assetKind', path, `asset "${id}" is ${a.kind}, expected ${kind}`);
  };
  const variable = (id: string, path: string) => {
    if (!p.variables[id]) error('missingVariable', path, `variable "${id}" does not exist`);
  };
  const condition = (c: Condition, path: string) => {
    variable(c.variableId, `${path}.variableId`);
    const v = p.variables[c.variableId];
    if (v && typeof c.value !== v.type) error('conditionType', `${path}.value`, `condition compares ${v.type} variable "${v.name}" with a ${typeof c.value}`);
  };
  const action = (a: Action, path: string) => {
    switch (a.type) {
      case 'startDialogue':
        if (!p.dialogues[a.dialogueId]) error('missingDialogue', `${path}.dialogueId`, `dialogue "${a.dialogueId}" does not exist`);
        break;
      case 'changeScene':
        if (!p.scenes[a.sceneId]) error('missingScene', `${path}.sceneId`, `scene "${a.sceneId}" does not exist`);
        break;
      case 'setVariable': {
        variable(a.variableId, `${path}.variableId`);
        const v = p.variables[a.variableId];
        if (v && typeof a.value !== v.type) error('variableType', `${path}.value`, `cannot assign a ${typeof a.value} to ${v.type} variable "${v.name}"`);
        if (v && a.op === 'add' && v.type !== 'number') error('variableOp', `${path}.op`, `"add" needs a number variable`);
        break;
      }
      case 'setPlayerCharacter':
        if (!p.characters[a.characterId]) error('missingCharacter', `${path}.characterId`, `character "${a.characterId}" does not exist`);
        break;
      case 'removeEntity':
        if (!Object.values(p.scenes).some((s) => s.entities[a.entityId])) error('missingEntity', `${path}.entityId`, `entity "${a.entityId}" does not exist in any scene`);
        break;
      case 'notify':
        break;
      case 'playAnimation':
        break;
      case 'startQuest':
        if (!p.quests[a.questId]) error('missingQuest', `${path}.questId`, `quest "${a.questId}" does not exist`);
        break;
      case 'completeQuestStep': {
        const q = p.quests[a.questId];
        if (!q) error('missingQuest', `${path}.questId`, `quest "${a.questId}" does not exist`);
        else if (!q.steps.some((st) => st.id === a.stepId)) error('missingStep', `${path}.stepId`, `quest "${q.name}" has no step "${a.stepId}"`);
        break;
      }
      case 'sequence':
        a.actions.forEach((s, i) => action(s, `${path}.actions.${i}`));
        break;
    }
  };

  if (!p.scenes[p.startSceneId]) error('missingScene', 'startSceneId', `start scene "${p.startSceneId}" does not exist`);
  if (p.settings.attackKey === p.settings.interactKey) error('keyClash', 'settings.attackKey', `attack key and interact key are both ${p.settings.attackKey}`);
  const abilityKey = p.settings.abilityKey ?? 'X';
  if (abilityKey === p.settings.attackKey) error('keyClash', 'settings.abilityKey', `ability key and attack key are both ${abilityKey}`);
  if ((abilityKey as string) === p.settings.interactKey) error('keyClash', 'settings.abilityKey', `ability key and interact key are both ${abilityKey}`);
  if (p.settings.economy) {
    const eco = p.settings.economy;
    const numberVar = (id: string | undefined, at: string) => {
      if (id === undefined) return;
      const v = p.variables[id];
      if (!v) error('missingVariable', at, `variable "${id}" does not exist`);
      else if (v.type !== 'number') error('variableType', at, `"${v.name}" must be a number variable`);
    };
    numberVar(eco.moneyVariableId, 'settings.economy.moneyVariableId');
    numberVar(eco.xpVariableId, 'settings.economy.xpVariableId');
    numberVar(eco.reputationVariableId, 'settings.economy.reputationVariableId');
  }

  for (const [id, t] of Object.entries(p.tilesets)) {
    asset(t.imageAssetId, `tilesets.${id}.imageAssetId`);
    const a = p.assets[t.imageAssetId];
    if (a?.width !== undefined && a.height !== undefined) {
      const cols = Math.floor((a.width - 2 * t.margin + t.spacing) / (t.tileWidth + t.spacing));
      const rows = Math.floor((a.height - 2 * t.margin + t.spacing) / (t.tileHeight + t.spacing));
      if (t.columns > cols || t.tileCount > cols * rows) error('tilesetSize', `tilesets.${id}`, `tileset "${t.name}" declares more tiles than its image holds`);
    }
    for (const key of Object.keys(t.tileProperties)) {
      if (Number(key) >= t.tileCount) error('tileIndex', `tilesets.${id}.tileProperties.${key}`, `tile ${key} is outside the tileset`);
    }
    (t.stamps ?? []).forEach((st, i) => {
      const sp = `tilesets.${id}.stamps.${i}`;
      if (st.tiles.length !== st.width * st.height) error('stampSize', `${sp}.tiles`, `stamp "${st.name}" has ${st.tiles.length} cells, expected ${st.width * st.height}`);
      if (st.above && st.above.length !== st.tiles.length) error('stampSize', `${sp}.above`, `stamp "${st.name}" above[] must match tiles[]`);
      if (st.tiles.some((x) => x >= t.tileCount)) error('tileIndex', `${sp}.tiles`, `stamp "${st.name}" references a tile outside the tileset`);
    });
  }

  for (const [id, m] of Object.entries(p.maps)) validateMap(p, m, `maps.${id}`, error);

  for (const [id, c] of Object.entries(p.characters)) {
    asset(c.spriteSheetAssetId, `characters.${id}.spriteSheetAssetId`);
    asset(c.portraitAssetId, `characters.${id}.portraitAssetId`);
    const a = p.assets[c.spriteSheetAssetId];
    if (a?.width !== undefined && a.height !== undefined) {
      const frameCount = Math.floor(a.width / c.frameWidth) * Math.floor(a.height / c.frameHeight);
      for (const [anim, def] of Object.entries(c.animations)) {
        if (!def) continue;
        const bad = def.frames.find((f) => f >= frameCount);
        if (bad !== undefined) error('frameIndex', `characters.${id}.animations.${anim}`, `frame ${bad} is outside the sheet (${frameCount} frames)`);
      }
    }
    if (c.collider.offsetX + c.collider.width > c.frameWidth || c.collider.offsetY + c.collider.height > c.frameHeight) {
      warn('colliderBounds', `characters.${id}.collider`, `collider extends outside the frame`);
    }
  }

  for (const [id, s] of Object.entries(p.scenes)) validateScene(p, s, `scenes.${id}`, { error, warn, asset, action, condition });

  for (const [id, d] of Object.entries(p.dialogues)) {
    const path = `dialogues.${id}`;
    if (!d.nodes[d.startNodeId]) error('missingNode', `${path}.startNodeId`, `start node "${d.startNodeId}" does not exist`);
    const ref = (target: string | null, at: string) => {
      if (target !== null && !d.nodes[target]) error('missingNode', at, `node "${target}" does not exist in dialogue "${d.name}"`);
    };
    for (const [nid, n] of Object.entries(d.nodes)) {
      const np = `${path}.nodes.${nid}`;
      if (n.id !== nid) error('keyMismatch', `${np}.id`, `node key "${nid}" does not match id "${n.id}"`);
      switch (n.type) {
        case 'line':
          ref(n.next, `${np}.next`);
          asset(n.portraitAssetId, `${np}.portraitAssetId`);
          break;
        case 'choice':
          n.options.forEach((o, i) => {
            ref(o.next, `${np}.options.${i}.next`);
            if (o.condition) condition(o.condition, `${np}.options.${i}.condition`);
          });
          break;
        case 'set': {
          ref(n.next, `${np}.next`);
          action({ type: 'setVariable', variableId: n.variableId, op: n.op, value: n.value }, np);
          break;
        }
        case 'branch':
          condition(n.condition, `${np}.condition`);
          ref(n.ifTrue, `${np}.ifTrue`);
          ref(n.ifFalse, `${np}.ifFalse`);
          break;
        case 'action':
          action(n.action, `${np}.action`);
          ref(n.next, `${np}.next`);
          break;
        case 'end':
          break;
      }
    }
  }

  for (const [id, v] of Object.entries(p.variables)) {
    if (typeof v.initial !== v.type) error('variableType', `variables.${id}.initial`, `initial value of "${v.name}" is not a ${v.type}`);
  }
  const names = new Map<string, string>();
  for (const [id, v] of Object.entries(p.variables)) {
    const other = names.get(v.name);
    if (other) error('duplicateVariable', `variables.${id}.name`, `variable name "${v.name}" is also used by ${other}`);
    names.set(v.name, id);
  }

  for (const [id, q] of Object.entries(p.quests)) {
    q.steps.forEach((s, i) => { if (s.completeWhen) condition(s.completeWhen, `quests.${id}.steps.${i}.completeWhen`); });
    (q.rewards ?? []).forEach((a, i) => action(a, `quests.${id}.rewards.${i}`));
    (q.onFail ?? []).forEach((a, i) => action(a, `quests.${id}.onFail.${i}`));
    const stepIds = new Set<string>();
    for (const st of q.steps) {
      if (stepIds.has(st.id)) error('duplicateStep', `quests.${id}.steps`, `quest "${q.name}" repeats step id "${st.id}"`);
      stepIds.add(st.id);
    }
  }

  return out;
}

function validateMap(p: Project, m: TileMap, path: string, error: (c: string, p: string, m: string) => void) {
  const cells = m.width * m.height;
  if (m.collision.length !== cells) error('gridSize', `${path}.collision`, `collision grid has ${m.collision.length} cells, expected ${cells}`);
  const ranges: Array<{ first: number; last: number }> = [];
  let prevFirst = 0;
  m.tilesets.forEach((ref, i) => {
    const t = p.tilesets[ref.tilesetId];
    if (!t) { error('missingTileset', `${path}.tilesets.${i}`, `tileset "${ref.tilesetId}" does not exist`); return; }
    if (ref.firstGid <= prevFirst) error('gidOrder', `${path}.tilesets.${i}.firstGid`, `firstGid values must be strictly increasing`);
    prevFirst = ref.firstGid;
    ranges.push({ first: ref.firstGid, last: ref.firstGid + t.tileCount - 1 });
  });
  const seen = new Set<string>();
  m.layers.forEach((l, i) => {
    const lp = `${path}.layers.${i}`;
    if (seen.has(l.id)) error('duplicateLayer', `${lp}.id`, `layer id "${l.id}" is used twice`);
    seen.add(l.id);
    if (l.data.length !== cells) { error('gridSize', `${lp}.data`, `layer "${l.name}" has ${l.data.length} cells, expected ${cells}`); return; }
    for (let c = 0; c < l.data.length; c++) {
      const gid = l.data[c]!;
      if (gid === 0) continue;
      if (!ranges.some((r) => gid >= r.first && gid <= r.last)) {
        error('badGid', `${lp}.data.${c}`, `tile id ${gid} is not in any tileset of map "${m.name}"`);
        break;
      }
    }
  });
}

interface SceneHelpers {
  error: (c: string, p: string, m: string) => void;
  warn: (c: string, p: string, m: string) => void;
  asset: (id: string | undefined, path: string) => void;
  action: (a: Action, path: string) => void;
  condition: (c: Condition, path: string) => void;
}

function validateScene(p: Project, s: Scene, path: string, h: SceneHelpers) {
  if (s.mapId !== null && !p.maps[s.mapId]) h.error('missingMap', `${path}.mapId`, `map "${s.mapId}" does not exist`);
  h.asset(s.backgroundAssetId, `${path}.backgroundAssetId`);

  const ids = Object.keys(s.entities);
  const orderSet = new Set(s.entityOrder);
  if (orderSet.size !== s.entityOrder.length) h.error('entityOrder', `${path}.entityOrder`, `entityOrder contains duplicates`);
  for (const id of ids) if (!orderSet.has(id)) h.error('entityOrder', `${path}.entityOrder`, `entity "${id}" is missing from entityOrder`);
  for (const id of s.entityOrder) if (!s.entities[id]) h.error('entityOrder', `${path}.entityOrder`, `entityOrder lists unknown entity "${id}"`);

  let players = 0;
  for (const [id, e] of Object.entries(s.entities)) {
    const ep = `${path}.entities.${id}`;
    if (e.id !== id) h.error('keyMismatch', `${ep}.id`, `entity key "${id}" does not match id "${e.id}"`);
    const types = new Set<string>();
    e.components.forEach((c, i) => {
      const cp = `${ep}.components.${i}`;
      if (types.has(c.type)) h.error('duplicateComponent', cp, `entity "${e.name}" has two ${c.type} components`);
      types.add(c.type);
      switch (c.type) {
        case 'sprite':
          if (!p.characters[c.characterId]) h.error('missingCharacter', `${cp}.characterId`, `character "${c.characterId}" does not exist`);
          break;
        case 'playerControl':
          players++;
          break;
        case 'interactable':
          h.action(c.action, `${cp}.action`);
          break;
        case 'trigger':
          h.action(c.onEnter, `${cp}.onEnter`);
          break;
        case 'enemy':
          if (c.onDefeat) h.action(c.onDefeat, `${cp}.onDefeat`);
          break;
        case 'property': {
          const v = p.variables[c.ownedVariableId];
          if (!v) h.error('missingVariable', `${cp}.ownedVariableId`, `variable "${c.ownedVariableId}" does not exist`);
          else if (v.type !== 'boolean') h.error('variableType', `${cp}.ownedVariableId`, `"${v.name}" must be a boolean variable`);
          if (!p.settings.economy) h.error('noEconomy', cp, `property "${c.name}" needs settings.economy`);
          break;
        }
        case 'shop':
          if (!p.settings.economy) h.error('noEconomy', cp, `shop "${c.name}" needs settings.economy`);
          [...c.sells, ...c.buys].forEach((line, li) => {
            const v = p.variables[line.variableId];
            if (!v) h.error('missingVariable', `${cp}.${li}`, `variable "${line.variableId}" does not exist`);
            else if (v.type !== 'number') h.error('variableType', `${cp}.${li}`, `shop line "${v.name}" must be a number variable`);
          });
          break;
        case 'pickup': {
          const v = p.variables[c.variableId];
          if (!v) h.error('missingVariable', `${cp}.variableId`, `variable "${c.variableId}" does not exist`);
          else if (v.type !== 'number') h.error('variableType', `${cp}.variableId`, `pickup "${v.name}" must be a number variable`);
          break;
        }
        case 'lock':
          h.condition(c.condition, `${cp}.condition`);
          break;
        case 'mapMarker':
          break;
        case 'body':
        case 'wander':
        case 'health':
          break;
      }
    });
    if (types.has('playerControl') && !types.has('sprite')) h.warn('playerNoSprite', ep, `player "${e.name}" has no sprite`);
    if (types.has('enemy') && !types.has('sprite')) h.error('enemyNoSprite', ep, `enemy "${e.name}" needs a sprite`);
    if (types.has('enemy') && !types.has('health')) h.error('enemyNoHealth', ep, `enemy "${e.name}" needs health`);
    if (types.has('enemy') && types.has('playerControl')) h.error('enemyIsPlayer', ep, `"${e.name}" cannot be both the player and an enemy`);
  }
  if (players > 1) h.error('multiplePlayers', path, `scene "${s.name}" has ${players} player-controlled entities; only one is allowed`);
  if (players === 0 && s.mapId !== null) {
    if (s.id === p.startSceneId) h.error('noPlayer', path, `start scene "${s.name}" has no player`);
    else h.warn('noPlayer', path, `scene "${s.name}" has no player`);
  }
}

export const hasErrors = (d: Diagnostic[]): boolean => d.some((x) => x.severity === 'error');
