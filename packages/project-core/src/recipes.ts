import type { Dialogue, Direction, Operation, Project } from '@beze/project-schema';
import { newId } from './ids.js';
import { feetAlignedY } from './createProject.js';

/**
 * Coarse, human-sized compositions of fine-grained operations. Used by the editor's buttons
 * and offered to AI as tools alongside the raw catalog.
 */

export interface NpcInput {
  sceneId: string;
  characterId: string;
  name: string;
  tileX: number;
  tileY: number;
  facing?: Direction;
}

export function placeCharacter(project: Project, input: NpcInput): { ops: Operation[]; entityId: string } {
  const character = project.characters[input.characterId];
  if (!character) throw new Error(`character "${input.characterId}" does not exist`);
  const entityId = newId('ent');
  return {
    entityId,
    ops: [{
      op: 'createEntity',
      sceneId: input.sceneId,
      entity: {
        id: entityId,
        name: input.name,
        x: input.tileX * project.settings.tileSize,
        y: feetAlignedY(input.tileY, project.settings.tileSize, character),
        facing: input.facing ?? 'down',
        components: [
          { type: 'sprite', characterId: input.characterId },
          { type: 'body', solid: true },
        ],
      },
    }],
  };
}

export interface LinearDialogueInput {
  name: string;
  speaker: string;
  portraitAssetId?: string;
  lines: string[];
}

/** A dialogue that says each line in order and ends. */
export function linearDialogue(input: LinearDialogueInput): Dialogue {
  const id = newId('dlg');
  const ids = input.lines.map(() => newId('nod'));
  const endId = newId('nod');
  const nodes: Dialogue['nodes'] = {};
  input.lines.forEach((text, i) => {
    const nodeId = ids[i]!;
    nodes[nodeId] = {
      id: nodeId,
      type: 'line',
      speaker: input.speaker,
      ...(input.portraitAssetId ? { portraitAssetId: input.portraitAssetId } : {}),
      text,
      next: ids[i + 1] ?? endId,
    };
  });
  nodes[endId] = { id: endId, type: 'end' };
  return { id, name: input.name, startNodeId: ids[0] ?? endId, nodes };
}

/** Creates a dialogue and wires an entity to start it when the player interacts. */
export function giveDialogue(project: Project, sceneId: string, entityId: string, input: LinearDialogueInput): { ops: Operation[]; dialogueId: string } {
  const scene = project.scenes[sceneId];
  const entity = scene?.entities[entityId];
  if (!entity) throw new Error(`entity "${entityId}" does not exist`);
  const dialogue = linearDialogue(input);
  return {
    dialogueId: dialogue.id,
    ops: [
      { op: 'createDialogue', dialogue },
      { op: 'setComponent', sceneId, entityId, component: { type: 'interactable', action: { type: 'startDialogue', dialogueId: dialogue.id }, prompt: 'Talk' } },
    ],
  };
}

export function createNpcWithDialogue(project: Project, npc: NpcInput, dialogue: LinearDialogueInput): { ops: Operation[]; entityId: string; dialogueId: string } {
  const placed = placeCharacter(project, npc);
  const dlg = linearDialogue(dialogue);
  return {
    entityId: placed.entityId,
    dialogueId: dlg.id,
    ops: [
      ...placed.ops,
      { op: 'createDialogue', dialogue: dlg },
      { op: 'setComponent', sceneId: npc.sceneId, entityId: placed.entityId, component: { type: 'interactable', action: { type: 'startDialogue', dialogueId: dlg.id }, prompt: 'Talk' } },
    ],
  };
}

export interface EnemyInput extends NpcInput {
  health?: number;
  damage?: number;
  speed?: number;
  aggroRadius?: number;
}

/** A chasing enemy with health. Defaults make a weak, slow foe. */
export function placeEnemy(project: Project, input: EnemyInput): { ops: Operation[]; entityId: string } {
  const placed = placeCharacter(project, input);
  return {
    entityId: placed.entityId,
    ops: [
      ...placed.ops,
      { op: 'setComponent', sceneId: input.sceneId, entityId: placed.entityId, component: { type: 'health', max: input.health ?? 2 } },
      { op: 'setComponent', sceneId: input.sceneId, entityId: placed.entityId, component: { type: 'enemy', speed: input.speed ?? 48, aggroRadius: input.aggroRadius ?? 128, damage: input.damage ?? 1, attackCooldownMs: 800 } },
    ],
  };
}
