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
  /** URL of a pack manifest listing extra image files the project's assets refer to. Omit when the
   * template only uses starter-pack assets. */
  pack?: string;
}

export const TEMPLATES: readonly GameTemplate[] = [
  {
    id: 'hacho',
    name: 'Hacho',
    description: 'A Tanzanian town: missions, money, properties.',
    project: '/templates/hacho/project.json',
  },
  {
    id: 'webslinger',
    name: 'Webslinger',
    description: 'A spider hero in the big city: web thugs, zip onto rooftops, save the day.',
    project: '/templates/webslinger/project.json',
    pack: '/templates/webslinger/pack.json',
  },
];

export function findTemplate(id: string): GameTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
