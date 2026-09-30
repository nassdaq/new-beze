import { z } from 'zod';
import {
  AssetSchema, CharacterSchema, ComponentSchema, ComponentTypeSchema, DialogueNodeSchema, DialogueSchema, DirectionSchema,
  EntitySchema, GameVariableSchema, IdSchema, ProjectSettingsSchema, QuestSchema, SceneSchema,
  TileLayerSchema, TileMapSchema, TilesetSchema,
} from './project.js';

const Int = z.number().int();
const Name = z.string().min(1).max(120);

/**
 * The write API of a project document. Editor commands, AI proposals and imports are all
 * batches of these. Every operation has a total inverse (see @beze/project-core).
 */
export const OperationSchema = z.discriminatedUnion('op', [
  // project
  z.object({ op: z.literal('updateSettings'), patch: ProjectSettingsSchema.partial() }),
  z.object({ op: z.literal('renameProject'), name: Name }),
  // characters
  z.object({ op: z.literal('createCharacter'), character: CharacterSchema }),
  z.object({ op: z.literal('updateCharacter'), id: IdSchema, patch: CharacterSchema.omit({ id: true }).partial() }),
  z.object({ op: z.literal('deleteCharacter'), id: IdSchema }),
  // tilesets and maps
  z.object({ op: z.literal('createTileset'), tileset: TilesetSchema }),
  z.object({ op: z.literal('updateTileset'), id: IdSchema, patch: TilesetSchema.omit({ id: true }).partial() }),
  z.object({ op: z.literal('deleteTileset'), id: IdSchema }),
  z.object({ op: z.literal('createMap'), map: TileMapSchema }),
  z.object({ op: z.literal('deleteMap'), id: IdSchema }),
  z.object({
    op: z.literal('paintTiles'), mapId: IdSchema, layerId: IdSchema,
    cells: z.array(z.object({ x: Int.min(0), y: Int.min(0), gid: Int.min(0) })).min(1).max(40000),
  }),
  /** Fills a rectangle of tiles. Cheaper to express than a cell list; humans and AI both use it. */
  z.object({
    op: z.literal('paintRect'), mapId: IdSchema, layerId: IdSchema,
    x: Int.min(0), y: Int.min(0), width: Int.min(1).max(200), height: Int.min(1).max(200), gid: Int.min(0),
  }),
  z.object({
    op: z.literal('setCollision'), mapId: IdSchema,
    cells: z.array(z.object({ x: Int.min(0), y: Int.min(0), solid: z.boolean() })).min(1).max(40000),
  }),
  z.object({
    op: z.literal('setCollisionRect'), mapId: IdSchema,
    x: Int.min(0), y: Int.min(0), width: Int.min(1).max(200), height: Int.min(1).max(200), solid: z.boolean(),
  }),
  z.object({ op: z.literal('addLayer'), mapId: IdSchema, layer: TileLayerSchema, index: Int.min(0).optional() }),
  z.object({ op: z.literal('deleteLayer'), mapId: IdSchema, layerId: IdSchema }),
  // scenes and entities
  z.object({ op: z.literal('createScene'), scene: SceneSchema }),
  z.object({ op: z.literal('updateScene'), id: IdSchema, patch: SceneSchema.pick({ name: true, mapId: true, backgroundAssetId: true }).partial() }),
  z.object({ op: z.literal('deleteScene'), id: IdSchema }),
  z.object({ op: z.literal('setStartScene'), sceneId: IdSchema }),
  z.object({ op: z.literal('createEntity'), sceneId: IdSchema, entity: EntitySchema, index: Int.min(0).optional() }),
  z.object({ op: z.literal('placeEntity'), sceneId: IdSchema, entityId: IdSchema, x: Int, y: Int, facing: DirectionSchema.optional() }),
  z.object({ op: z.literal('modifyEntity'), sceneId: IdSchema, entityId: IdSchema, patch: EntitySchema.pick({ name: true, facing: true }).partial() }),
  z.object({ op: z.literal('setComponent'), sceneId: IdSchema, entityId: IdSchema, component: ComponentSchema }),
  z.object({ op: z.literal('removeComponent'), sceneId: IdSchema, entityId: IdSchema, componentType: ComponentTypeSchema }),
  z.object({ op: z.literal('deleteEntity'), sceneId: IdSchema, entityId: IdSchema }),
  // dialogues
  z.object({ op: z.literal('createDialogue'), dialogue: DialogueSchema }),
  z.object({ op: z.literal('updateDialogue'), id: IdSchema, patch: DialogueSchema.pick({ name: true, startNodeId: true }).partial() }),
  z.object({ op: z.literal('setDialogueNode'), dialogueId: IdSchema, node: DialogueNodeSchema }),
  z.object({ op: z.literal('deleteDialogueNode'), dialogueId: IdSchema, nodeId: IdSchema }),
  z.object({ op: z.literal('deleteDialogue'), id: IdSchema }),
  // variables and quests
  z.object({ op: z.literal('createVariable'), variable: GameVariableSchema }),
  z.object({ op: z.literal('updateVariable'), id: IdSchema, patch: GameVariableSchema.omit({ id: true }).partial() }),
  z.object({ op: z.literal('deleteVariable'), id: IdSchema }),
  z.object({ op: z.literal('createQuest'), quest: QuestSchema }),
  z.object({ op: z.literal('updateQuest'), id: IdSchema, patch: QuestSchema.omit({ id: true }).partial() }),
  z.object({ op: z.literal('deleteQuest'), id: IdSchema }),
  // assets (metadata only; bytes go through the asset store)
  z.object({ op: z.literal('registerAsset'), asset: AssetSchema }),
  z.object({ op: z.literal('unregisterAsset'), id: IdSchema }),
]);

export type Operation = z.infer<typeof OperationSchema>;
export type OperationName = Operation['op'];
export const OperationBatchSchema = z.array(OperationSchema).max(500);
