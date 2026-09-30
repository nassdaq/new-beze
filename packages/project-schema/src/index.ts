import { z } from 'zod';
import { ProjectSchema, type Project } from './project.js';
import { OperationBatchSchema, type Operation } from './operations.js';
import { migrateProject } from './migrate.js';

export * from './project.js';
export * from './operations.js';
export * from './migrate.js';

export type ParseIssue = { path: string; message: string };
export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: ParseIssue[] };

function issuesOf(error: z.ZodError): ParseIssue[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}

/** Shape validation only. Runs migrations first. Referential integrity lives in @beze/project-core. */
export function parseProject(input: unknown): ParseResult<Project> {
  let migrated: unknown;
  try {
    migrated = migrateProject(input);
  } catch (e) {
    return { ok: false, issues: [{ path: 'schemaVersion', message: (e as Error).message }] };
  }
  const r = ProjectSchema.safeParse(migrated);
  return r.success ? { ok: true, value: r.data } : { ok: false, issues: issuesOf(r.error) };
}

export function parseOperations(input: unknown): ParseResult<Operation[]> {
  const r = OperationBatchSchema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, issues: issuesOf(r.error) };
}
