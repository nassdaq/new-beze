/**
 * Game templates: complete projects shipped under /templates/<id>/ with a pack of image files.
 * The registry is static so the card shows even before a template's files exist; creating from
 * a template fetches `project` (a v3 project document) and `pack` (see assets/pack.ts).
 */
export interface GameTemplate {
  id: string;
  name: string;
  description: string;
  /** URL of the project document. */
  project: string;
  /** URL of the pack manifest listing the image files the project's assets refer to. */
  pack: string;
}

export const TEMPLATES: readonly GameTemplate[] = [
  {
    id: 'hacho',
    name: 'Hacho',
    description: 'A Tanzanian town: missions, money, properties.',
    project: '/templates/hacho/project.json',
    pack: '/templates/hacho/pack.json',
  },
];

export function findTemplate(id: string): GameTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
