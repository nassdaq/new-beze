import type { Project } from '@beze/project-schema';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface LoadedProject {
  project: Project;
  /** null when the backing store has no revisions (local-only). */
  revisionId: string | null;
}

/** Where projects live. Slice 1 ships the IndexedDB implementation; the API one arrives in slice 2. */
export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  load(projectId: string): Promise<LoadedProject | null>;
  save(project: Project, baseRevisionId: string | null): Promise<{ revisionId: string | null }>;
  remove(projectId: string): Promise<void>;
}
