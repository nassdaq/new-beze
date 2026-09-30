import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProject, type Project } from '@beze/project-schema';

export function loadFixture(): Project {
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/examples/hello-aiko.project.json'), 'utf8'));
  const r = parseProject(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
