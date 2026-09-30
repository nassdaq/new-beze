import { parseProject, type Project } from '@beze/project-schema';
import { idb, STORES } from './idb.js';
import type { LoadedProject, ProjectRepository, ProjectSummary } from './ProjectRepository.js';

interface Row {
  id: string;
  name: string;
  updatedAt: string;
  document: unknown;
}

export class LocalProjectRepository implements ProjectRepository {
  async list(): Promise<ProjectSummary[]> {
    const rows = await idb.getAll<Row>(STORES.projects);
    return rows
      .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(projectId: string): Promise<LoadedProject | null> {
    const row = await idb.get<Row>(STORES.projects, projectId);
    if (!row) return null;
    const parsed = parseProject(row.document);
    if (!parsed.ok) throw new Error(`stored project is invalid: ${parsed.issues[0]?.path} ${parsed.issues[0]?.message}`);
    return { project: parsed.value, revisionId: null };
  }

  async save(project: Project, _baseRevisionId: string | null): Promise<{ revisionId: string | null }> {
    const row: Row = { id: project.id, name: project.name, updatedAt: new Date().toISOString(), document: project };
    await idb.put(STORES.projects, project.id, row);
    return { revisionId: null };
  }

  async remove(projectId: string): Promise<void> {
    await idb.delete(STORES.projects, projectId);
  }
}
