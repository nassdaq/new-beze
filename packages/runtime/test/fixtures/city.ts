import { parseProject, type Project } from '@beze/project-schema';

const HASH = 'b63a2341639945b90ad5ef9e006594a06c1201a7eca180c0d8014f516343df54';
const anim = (frames: number[], loop = true, frameRate = 8) => ({ frames, frameRate, loop });

/**
 * A tiny Hacho-style town: a 24x16 grass map, the hero, one money pickup, one property, one shop, one lock, one map
 * marker and a two-step quest started by a trigger. Valid against the v3 schema.
 */
export function cityProject(): Project {
  const W = 24;
  const H = 16;
  const raw = {
    schemaVersion: 3,
    id: 'prj_city_test',
    name: 'Hacho test town',
    settings: {
      title: 'Hacho test town', viewport: { width: 480, height: 270 }, tileSize: 32, pixelArt: true, defaultMoveSpeed: 96,
      interactKey: 'E', attackKey: 'SPACE', backgroundColor: '#1a1a2e',
      economy: { moneyVariableId: 'var_money', xpVariableId: 'var_xp', reputationVariableId: 'var_rep', currencyPrefix: 'TSh ', dayLengthMs: 60000, levelThresholds: [100, 300, 600] },
    },
    startSceneId: 'scn_town',
    assets: {
      ast_starter_tileset: { id: 'ast_starter_tileset', kind: 'image', name: 'Outdoor tileset', mime: 'image/png', width: 256, height: 192, hash: HASH, origin: 'starter' },
      ast_starter_hero: { id: 'ast_starter_hero', kind: 'image', name: 'Hero sheet', mime: 'image/png', width: 192, height: 512, hash: HASH, origin: 'starter' },
    },
    tilesets: {
      tls_outdoor: { id: 'tls_outdoor', name: 'Outdoor', imageAssetId: 'ast_starter_tileset', tileWidth: 32, tileHeight: 32, columns: 8, tileCount: 48, margin: 0, spacing: 0, tileProperties: { '0': { tag: 'grass' }, '8': { tag: 'path' }, '25': { solid: true, tag: 'tree' } } },
    },
    maps: {
      map_town: {
        id: 'map_town', name: 'Town', width: W, height: H, tileWidth: 32, tileHeight: 32, tilesets: [{ tilesetId: 'tls_outdoor', firstGid: 1 }],
        layers: [{ id: 'lyr_ground', name: 'Ground', visible: true, aboveEntities: false, data: Array.from({ length: W * H }, (_, i) => (Math.floor(i / W) === 5 ? 9 : 1)) }],
        collision: Array.from({ length: W * H }, () => 0),
      },
    },
    characters: {
      chr_hero: {
        id: 'chr_hero', name: 'Hero', spriteSheetAssetId: 'ast_starter_hero', frameWidth: 48, frameHeight: 64,
        animations: {
          idle_down: anim([0]), walk_down: anim([0, 1, 2, 3]), idle_left: anim([4]), walk_left: anim([4, 5, 6, 7]),
          idle_right: anim([8]), walk_right: anim([8, 9, 10, 11]), idle_up: anim([12]), walk_up: anim([12, 13, 14, 15]),
          attack_down: anim([16, 17, 18], false, 14), celebrate: anim([16, 17, 18, 17], true, 6),
        },
        collider: { width: 24, height: 16, offsetX: 12, offsetY: 48 },
      },
    },
    scenes: {
      scn_town: {
        id: 'scn_town', name: 'Town', mapId: 'map_town',
        entities: {
          ent_hero: { id: 'ent_hero', name: 'Hero', x: 64, y: 96, facing: 'down', components: [{ type: 'sprite', characterId: 'chr_hero' }, { type: 'body', solid: true }, { type: 'playerControl' }] },
          ent_coin: { id: 'ent_coin', name: 'Coins', x: 192, y: 128, facing: 'down', components: [{ type: 'pickup', variableId: 'var_money', amount: 500, once: true }] },
          ent_kiosk: { id: 'ent_kiosk', name: 'Kiosk', x: 96, y: 224, facing: 'down', components: [{ type: 'property', name: 'Mama Ntilie Kiosk', price: 25000, incomePerDay: 8000, ownedVariableId: 'var_own_kiosk' }, { type: 'mapMarker', label: 'Kiosk', icon: 'shop', discoverXp: 25 }] },
          ent_cafe: { id: 'ent_cafe', name: 'Cafe', x: 288, y: 224, facing: 'down', components: [{ type: 'property', name: 'Bus Cafe', price: 750000, incomePerDay: 25000, ownedVariableId: 'var_own_cafe' }, { type: 'mapMarker', label: 'Bus Cafe', icon: 'food', discoverXp: 25 }] },
          ent_shop: { id: 'ent_shop', name: 'Duka', x: 288, y: 64, facing: 'down', components: [{ type: 'shop', name: 'Duka la Juma', sells: [{ variableId: 'var_parcel', price: 500 }], buys: [{ variableId: 'var_parcel', price: 100 }] }, { type: 'mapMarker', label: 'Duka', icon: 'market' }] },
          ent_gate: { id: 'ent_gate', name: 'East gate', x: 352, y: 160, facing: 'down', components: [{ type: 'lock', condition: { variableId: 'var_own_kiosk', op: 'eq', value: true }, lockedText: 'Buy the kiosk first to open the east road.' }] },
          ent_quest: { id: 'ent_quest', name: 'Quest trigger', x: 64, y: 64, facing: 'down', components: [{ type: 'trigger', width: 64, height: 64, onEnter: { type: 'startQuest', questId: 'qst_first' }, once: true }] },
        },
        entityOrder: ['ent_hero', 'ent_coin', 'ent_kiosk', 'ent_cafe', 'ent_shop', 'ent_gate', 'ent_quest'],
      },
    },
    dialogues: {},
    quests: {
      qst_first: {
        id: 'qst_first', name: 'First Shilling', description: 'Pick up the coins on the road, then buy the kiosk.',
        steps: [
          { id: 'stp_coins', text: 'Find the coins on the road', completeWhen: { variableId: 'var_money', op: 'gte', value: 50500 } },
          { id: 'stp_kiosk', text: 'Buy the kiosk', completeWhen: { variableId: 'var_own_kiosk', op: 'eq', value: true } },
        ],
        rewards: [{ type: 'setVariable', variableId: 'var_xp', op: 'add', value: 50 }, { type: 'notify', text: 'Karibu Hacho!', kind: 'reward' }],
      },
      qst_timed: {
        id: 'qst_timed', name: 'Quick Delivery', description: 'Deliver before the timer runs out.',
        steps: [{ id: 'stp_deliver', text: 'Hand over the parcel' }],
        timeLimitMs: 10000, onFail: [{ type: 'setVariable', variableId: 'var_rep', op: 'add', value: -1 }], repeatable: true,
      },
    },
    variables: {
      var_money: { id: 'var_money', name: 'money', type: 'number', initial: 50000, label: 'Money', category: 'stat' },
      var_xp: { id: 'var_xp', name: 'xp', type: 'number', initial: 0, label: 'XP', category: 'stat' },
      var_rep: { id: 'var_rep', name: 'reputation', type: 'number', initial: 3, label: 'Reputation', category: 'stat' },
      var_parcel: { id: 'var_parcel', name: 'parcel', type: 'number', initial: 0, label: 'Parcel', category: 'item' },
      var_own_kiosk: { id: 'var_own_kiosk', name: 'ownKiosk', type: 'boolean', initial: false, category: 'flag' },
      var_own_cafe: { id: 'var_own_cafe', name: 'ownCafe', type: 'boolean', initial: false, category: 'flag' },
    },
    meta: { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', generator: 'test' },
  };
  const parsed = parseProject(raw);
  if (!parsed.ok) throw new Error(`city fixture invalid: ${parsed.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
  return parsed.value;
}
