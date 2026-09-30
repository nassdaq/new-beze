import { z } from 'zod';

export const SCHEMA_VERSION = 4 as const;

/** Opaque id: a three-letter type prefix, an underscore, then up to 40 url-safe characters. */
export const IdSchema = z.string().regex(/^[a-z]{3}_[A-Za-z0-9_-]{1,40}$/, 'invalid id');

export const TEXT_MAX = 2000;
const Text = z.string().max(TEXT_MAX);
const Name = z.string().min(1).max(120);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb');
const Int = z.number().int();
const NonNegInt = Int.min(0);
const PosInt = Int.min(1);

export const DirectionSchema = z.enum(['down', 'left', 'right', 'up']);
export type Direction = z.infer<typeof DirectionSchema>;

export const ANIMATION_NAMES = [
  'idle_down', 'idle_left', 'idle_right', 'idle_up',
  'walk_down', 'walk_left', 'walk_right', 'walk_up',
] as const;
/** Optional animations. The runtime falls back gracefully when a character lacks them. */
export const OPTIONAL_ANIMATION_NAMES = ['attack_down', 'attack_left', 'attack_right', 'attack_up'] as const;
export const AnimationNameSchema = z.enum([...ANIMATION_NAMES, ...OPTIONAL_ANIMATION_NAMES]);
export type AnimationName = z.infer<typeof AnimationNameSchema>;

export const ScalarSchema = z.union([z.boolean(), z.number(), z.string().max(TEXT_MAX)]);
export type Scalar = z.infer<typeof ScalarSchema>;

export const ProjectSettingsSchema = z.object({
  title: Name,
  viewport: z.object({ width: PosInt.max(4096), height: PosInt.max(4096) }),
  tileSize: z.union([z.literal(16), z.literal(32)]),
  pixelArt: z.boolean(),
  defaultMoveSpeed: z.number().positive().max(2000),
  interactKey: z.enum(['E', 'SPACE', 'ENTER']),
  /** v2: the player's attack key. Must differ from interactKey (checked by the validator). */
  attackKey: z.enum(['SPACE', 'X', 'J', 'K']),
  /** Speed factor while the run key (Shift) is held. Default 1.7 when absent. */
  runSpeedMultiplier: z.number().min(1).max(4).optional(),
  /** v4: the key for the player's special ability (`playerControl.ability`). Default X. Must differ from the other keys. */
  abilityKey: z.enum(['X', 'C', 'F', 'Q', 'Z', 'J', 'K']).optional(),
  backgroundColor: Color,
  /** v3: turns on money, XP/level, the day clock and the HUD. Absent = plain adventure. */
  economy: z.object({
    moneyVariableId: IdSchema,
    xpVariableId: IdSchema.optional(),
    reputationVariableId: IdSchema.optional(),
    /** Printed before amounts, e.g. "TSh ". */
    currencyPrefix: z.string().max(12),
    /** Real milliseconds per in-game day. Property income is paid once per day. */
    dayLengthMs: PosInt.min(5000).max(3_600_000),
    /** XP needed for level 2, 3, ... ; level = 1 + number of thresholds reached. */
    levelThresholds: z.array(NonNegInt).max(50).optional(),
  }).optional(),
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const AssetSchema = z.object({
  id: IdSchema,
  kind: z.enum(['image', 'audio']),
  name: Name,
  mime: z.enum(['image/png', 'image/webp', 'audio/ogg', 'audio/mpeg']),
  width: PosInt.optional(),
  height: PosInt.optional(),
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'expected sha256 hex'),
  origin: z.enum(['starter', 'upload', 'generated']),
  license: z.string().max(120).optional(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const TilePropertiesSchema = z.object({
  solid: z.boolean().optional(),
  tag: z.string().max(60).optional(),
  /** v4: a solid tile a climbing player may walk on (walls, roofs). Auto-collision marks it 2 in the grid. */
  climbable: z.boolean().optional(),
});

/**
 * A multi-tile object painted in one click (a two-tile tree, a 2×2 house). `tiles` are local
 * tile indices row-major, -1 for empty. Cells flagged in `above` go on the layer drawn over
 * characters (canopies, roofs) so characters can walk behind them.
 */
export const TileStampSchema = z.object({
  name: Name,
  width: PosInt.max(8),
  height: PosInt.max(8),
  tiles: z.array(Int.min(-1)).min(1).max(64),
  above: z.array(z.boolean()).max(64).optional(),
});
export type TileStamp = z.infer<typeof TileStampSchema>;

export const TilesetSchema = z.object({
  id: IdSchema,
  name: Name,
  imageAssetId: IdSchema,
  tileWidth: PosInt,
  tileHeight: PosInt,
  columns: PosInt,
  tileCount: PosInt,
  margin: NonNegInt,
  spacing: NonNegInt,
  /** keyed by local tile index as a decimal string */
  tileProperties: z.record(z.string().regex(/^\d+$/), TilePropertiesSchema),
  stamps: z.array(TileStampSchema).max(64).optional(),
});
export type Tileset = z.infer<typeof TilesetSchema>;

export const TileLayerSchema = z.object({
  id: IdSchema,
  name: Name,
  visible: z.boolean(),
  aboveEntities: z.boolean(),
  /** width*height global tile ids, row-major, 0 = empty */
  data: z.array(NonNegInt),
});
export type TileLayer = z.infer<typeof TileLayerSchema>;

export const TileMapSchema = z.object({
  id: IdSchema,
  name: Name,
  width: PosInt,
  height: PosInt,
  tileWidth: PosInt,
  tileHeight: PosInt,
  tilesets: z.array(z.object({ tilesetId: IdSchema, firstGid: PosInt })),
  layers: z.array(TileLayerSchema),
  /** width*height, 0 = walkable, 1 = solid, 2 = climbable (v4: solid for everyone except a player with `climb`) */
  collision: z.array(z.union([z.literal(0), z.literal(1), z.literal(2)])),
});
export type TileMap = z.infer<typeof TileMapSchema>;

export const AnimationSchema = z.object({
  frames: z.array(NonNegInt).min(1),
  frameRate: z.number().positive().max(60),
  loop: z.boolean(),
});
export type Animation = z.infer<typeof AnimationSchema>;

export const CharacterSchema = z.object({
  id: IdSchema,
  name: Name,
  spriteSheetAssetId: IdSchema,
  frameWidth: PosInt,
  frameHeight: PosInt,
  /** The 8 directional animations are required; attack_* optional; any other name (emotes such as
   * "celebrate", "map", "point", "interact") is allowed and playable through the playAnimation action. */
  animations: z.object({
    ...(Object.fromEntries(ANIMATION_NAMES.map((n) => [n, AnimationSchema])) as Record<(typeof ANIMATION_NAMES)[number], typeof AnimationSchema>),
    ...(Object.fromEntries(OPTIONAL_ANIMATION_NAMES.map((n) => [n, AnimationSchema.optional()])) as Record<(typeof OPTIONAL_ANIMATION_NAMES)[number], z.ZodOptional<typeof AnimationSchema>>),
  }).catchall(AnimationSchema),
  collider: z.object({ width: PosInt, height: PosInt, offsetX: NonNegInt, offsetY: NonNegInt }),
  portraitAssetId: IdSchema.optional(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const ConditionSchema = z.object({
  variableId: IdSchema,
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
  value: ScalarSchema,
});
export type Condition = z.infer<typeof ConditionSchema>;

export const VariableOpSchema = z.enum(['set', 'add']);

// Action is recursive through `sequence`.
const ActionBase = z.discriminatedUnion('type', [
  z.object({ type: z.literal('startDialogue'), dialogueId: IdSchema }),
  z.object({
    type: z.literal('changeScene'),
    sceneId: IdSchema,
    spawn: z.object({ x: Int, y: Int, facing: DirectionSchema.optional() }),
  }),
  z.object({ type: z.literal('setVariable'), variableId: IdSchema, op: VariableOpSchema, value: ScalarSchema }),
  /** Swap the player's look and speed, e.g. mounting a horse. `speed` overrides move speed while active. */
  z.object({ type: z.literal('setPlayerCharacter'), characterId: IdSchema, speed: z.number().positive().max(2000).optional() }),
  /** Remove an entity from the running scene (the horse you just mounted, a picked-up item). Runtime only; the document is untouched. */
  z.object({ type: z.literal('removeEntity'), entityId: IdSchema }),
  /** v3: a short on-screen message ("Discovered: Market", "+TSh 5,000"). */
  z.object({ type: z.literal('notify'), text: z.string().max(200), kind: z.enum(['info', 'reward', 'warning']).optional() }),
  /** v3: play a named animation on the player (an emote) and lock movement for its duration. */
  z.object({ type: z.literal('playAnimation'), animation: z.string().min(1).max(40), durationMs: PosInt.max(10000).optional() }),
  /** v3: activate a quest (mission). Steps complete automatically when their conditions hold. */
  z.object({ type: z.literal('startQuest'), questId: IdSchema }),
  /** v3: mark a quest step complete explicitly (for steps without a condition). */
  z.object({ type: z.literal('completeQuestStep'), questId: IdSchema, stepId: IdSchema }),
]);
export type Action =
  | z.infer<typeof ActionBase>
  | { type: 'sequence'; actions: Action[] };
export const ActionSchema: z.ZodType<Action> = z.lazy(() =>
  z.union([ActionBase, z.object({ type: z.literal('sequence'), actions: z.array(ActionSchema).max(50) })]),
);

/**
 * v4: the player's special ability, fired with `settings.abilityKey`. `web` shoots a line in the facing direction up
 * to `rangeTiles` tiles: the first enemy it reaches takes `damage` and is webbed (stunned) for `stunMs`; when it
 * reaches a wall instead and `zip` is on, the player zips to the last free cell before it (or onto the wall when it is
 * climbable and the player can climb). Hits on a webbed enemy deal double melee damage.
 */
export const AbilitySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('web'),
    rangeTiles: PosInt.max(16),
    damage: NonNegInt.max(9999),
    cooldownMs: PosInt.max(60000),
    stunMs: NonNegInt.max(60000),
    zip: z.boolean(),
  }),
]);
export type Ability = z.infer<typeof AbilitySchema>;

export const ComponentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sprite'), characterId: IdSchema }),
  z.object({ type: z.literal('body'), solid: z.boolean() }),
  z.object({
    type: z.literal('playerControl'),
    speed: z.number().positive().max(2000).optional(),
    /** Damage dealt by one attack swing. Default 1. */
    attackDamage: PosInt.max(9999).optional(),
    /** v4: special ability on `settings.abilityKey`. */
    ability: AbilitySchema.optional(),
    /** v4: walks over climbable cells (collision value 2): walls and roofs. */
    climb: z.boolean().optional(),
    /** v4: danger sense. An enemy winding up an attack within this many px flashes a warning over the player. */
    senseRadius: PosInt.max(4000).optional(),
  }),
  z.object({ type: z.literal('interactable'), action: ActionSchema, prompt: z.string().max(60).optional() }),
  z.object({ type: z.literal('trigger'), width: PosInt, height: PosInt, onEnter: ActionSchema, once: z.boolean() }),
  /** Walks randomly within `radius` px of its start position. */
  z.object({ type: z.literal('wander'), radius: PosInt.max(2000), speed: z.number().positive().max(2000) }),
  /** Hit points. Entities with health can be hurt; at 0 they are defeated. */
  z.object({ type: z.literal('health'), max: PosInt.max(9999) }),
  /** v3: a purchasable place. Interact to buy; owned properties pay incomePerDay every in-game day. */
  z.object({
    type: z.literal('property'),
    name: Name,
    price: NonNegInt,
    incomePerDay: NonNegInt,
    ownedVariableId: IdSchema,
    description: z.string().max(200).optional(),
  }),
  /** v3: a shop. Interact to open a buy/sell list over item variables. */
  z.object({
    type: z.literal('shop'),
    name: Name,
    sells: z.array(z.object({ variableId: IdSchema, price: NonNegInt })).max(24),
    buys: z.array(z.object({ variableId: IdSchema, price: NonNegInt })).max(24),
  }),
  /** v3: walk over to collect: adds `amount` to a variable and removes the entity (once per session when `once`). */
  z.object({ type: z.literal('pickup'), variableId: IdSchema, amount: z.number(), once: z.boolean() }),
  /** v3: solid until `condition` holds; interacting while locked shows `lockedText`. Unlocks with an effect. */
  z.object({ type: z.literal('lock'), condition: ConditionSchema, lockedText: z.string().max(200) }),
  /** v3: shows on the map screen and names the place for discovery. */
  z.object({ type: z.literal('mapMarker'), label: Name, icon: z.enum(['shop', 'bank', 'food', 'bus', 'home', 'park', 'mission', 'market', 'place']).optional(), discoverXp: NonNegInt.optional() }),
  /** Chases the player within `aggroRadius` px and hurts on contact. Needs sprite + health. */
  z.object({
    type: z.literal('enemy'),
    speed: z.number().positive().max(2000),
    aggroRadius: PosInt.max(4000),
    damage: PosInt.max(9999),
    attackCooldownMs: PosInt.max(60000),
    onDefeat: ActionSchema.optional(),
  }),
]);
export type Component = z.infer<typeof ComponentSchema>;
export const ComponentTypeSchema = z.enum(['sprite', 'body', 'playerControl', 'interactable', 'trigger', 'wander', 'health', 'enemy', 'property', 'shop', 'pickup', 'lock', 'mapMarker']);
export type ComponentType = z.infer<typeof ComponentTypeSchema>;

export const EntitySchema = z.object({
  id: IdSchema,
  name: Name,
  x: Int,
  y: Int,
  facing: DirectionSchema,
  components: z.array(ComponentSchema).max(16),
});
export type Entity = z.infer<typeof EntitySchema>;

export const SceneSchema = z.object({
  id: IdSchema,
  name: Name,
  mapId: IdSchema.nullable(),
  backgroundAssetId: IdSchema.optional(),
  entities: z.record(IdSchema, EntitySchema),
  entityOrder: z.array(IdSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

const NodeRef = IdSchema.nullable();

export const DialogueNodeSchema = z.discriminatedUnion('type', [
  z.object({
    id: IdSchema, type: z.literal('line'),
    speaker: z.string().max(60).optional(),
    portraitAssetId: IdSchema.optional(),
    text: Text,
    next: NodeRef,
  }),
  z.object({
    id: IdSchema, type: z.literal('choice'),
    prompt: Text.optional(),
    options: z.array(z.object({ text: z.string().max(200), next: NodeRef, condition: ConditionSchema.optional() })).min(1).max(6),
  }),
  z.object({ id: IdSchema, type: z.literal('set'), variableId: IdSchema, op: VariableOpSchema, value: ScalarSchema, next: NodeRef }),
  z.object({ id: IdSchema, type: z.literal('branch'), condition: ConditionSchema, ifTrue: NodeRef, ifFalse: NodeRef }),
  z.object({ id: IdSchema, type: z.literal('action'), action: ActionSchema, next: NodeRef }),
  z.object({ id: IdSchema, type: z.literal('end') }),
]);
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;
export type DialogueNodeType = DialogueNode['type'];

export const DialogueSchema = z.object({
  id: IdSchema,
  name: Name,
  startNodeId: IdSchema,
  nodes: z.record(IdSchema, DialogueNodeSchema),
});
export type Dialogue = z.infer<typeof DialogueSchema>;

export const GameVariableSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(60).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'identifier'),
  type: z.enum(['boolean', 'number', 'string']),
  initial: ScalarSchema,
  /** v3: human label for HUD/inventory ("Parcel", "Money"). */
  label: z.string().max(60).optional(),
  /** v3: items show in the inventory; stats in the status screen; flags are hidden. */
  category: z.enum(['item', 'stat', 'flag']).optional(),
});
export type GameVariable = z.infer<typeof GameVariableSchema>;

export const QuestSchema = z.object({
  id: IdSchema,
  name: Name,
  description: Text,
  /** Steps complete in order. A step without completeWhen completes only through completeQuestStep. */
  steps: z.array(z.object({ id: IdSchema, text: Text, completeWhen: ConditionSchema.optional() })).min(1).max(50),
  /** v3: run when the last step completes (setVariable money/xp, notify, playAnimation celebrate). */
  rewards: z.array(ActionSchema).max(20).optional(),
  /** v3: countdown from startQuest; on expiry the quest fails and onFail runs. */
  timeLimitMs: PosInt.max(3_600_000).optional(),
  onFail: z.array(ActionSchema).max(20).optional(),
  /** v3: a quest that can be started again after completion (daily deliveries). */
  repeatable: z.boolean().optional(),
});
export type Quest = z.infer<typeof QuestSchema>;

export const ProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: IdSchema,
  name: Name,
  settings: ProjectSettingsSchema,
  startSceneId: IdSchema,
  assets: z.record(IdSchema, AssetSchema),
  tilesets: z.record(IdSchema, TilesetSchema),
  maps: z.record(IdSchema, TileMapSchema),
  characters: z.record(IdSchema, CharacterSchema),
  scenes: z.record(IdSchema, SceneSchema),
  dialogues: z.record(IdSchema, DialogueSchema),
  quests: z.record(IdSchema, QuestSchema),
  variables: z.record(IdSchema, GameVariableSchema),
  meta: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    generator: z.string().max(60),
  }),
});
export type Project = z.infer<typeof ProjectSchema>;
