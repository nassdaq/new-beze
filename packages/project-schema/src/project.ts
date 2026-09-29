import { z } from 'zod';

export const SCHEMA_VERSION = 2 as const;

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
export const AnimationNameSchema = z.enum(ANIMATION_NAMES);
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
  backgroundColor: Color,
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
});

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
  /** width*height, 0 = walkable, 1 = solid */
  collision: z.array(z.union([z.literal(0), z.literal(1)])),
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
  animations: z.object(
    Object.fromEntries(ANIMATION_NAMES.map((n) => [n, AnimationSchema])) as Record<AnimationName, typeof AnimationSchema>,
  ),
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
]);
export type Action =
  | z.infer<typeof ActionBase>
  | { type: 'sequence'; actions: Action[] };
export const ActionSchema: z.ZodType<Action> = z.lazy(() =>
  z.union([ActionBase, z.object({ type: z.literal('sequence'), actions: z.array(ActionSchema).max(50) })]),
);

export const ComponentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sprite'), characterId: IdSchema }),
  z.object({ type: z.literal('body'), solid: z.boolean() }),
  z.object({
    type: z.literal('playerControl'),
    speed: z.number().positive().max(2000).optional(),
    /** Damage dealt by one attack swing. Default 1. */
    attackDamage: PosInt.max(9999).optional(),
  }),
  z.object({ type: z.literal('interactable'), action: ActionSchema, prompt: z.string().max(60).optional() }),
  z.object({ type: z.literal('trigger'), width: PosInt, height: PosInt, onEnter: ActionSchema, once: z.boolean() }),
  /** Walks randomly within `radius` px of its start position. */
  z.object({ type: z.literal('wander'), radius: PosInt.max(2000), speed: z.number().positive().max(2000) }),
  /** Hit points. Entities with health can be hurt; at 0 they are defeated. */
  z.object({ type: z.literal('health'), max: PosInt.max(9999) }),
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
export const ComponentTypeSchema = z.enum(['sprite', 'body', 'playerControl', 'interactable', 'trigger', 'wander', 'health', 'enemy']);
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
});
export type GameVariable = z.infer<typeof GameVariableSchema>;

export const QuestSchema = z.object({
  id: IdSchema,
  name: Name,
  description: Text,
  steps: z.array(z.object({ id: IdSchema, text: Text, completeWhen: ConditionSchema })).max(50),
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
