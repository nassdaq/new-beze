import type { Operation, Project } from '@beze/project-schema';

/** Typed fetch client for the Beze API. Base path is proxied by Vite in development. */

export interface GenerationOutput {
  operations: Operation[];
  summary: string;
  usage: { inputTokens: number; outputTokens: number };
  iterations: number;
  rejectedCalls: number;
  warnings: string[];
  provider: string;
  model: string;
}

export interface GenerationStatus {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  output: GenerationOutput | null;
  error: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError(0, 'The Beze API is not reachable. Start it with `pnpm dev:api`.');
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: { detail?: string } | string };
      detail = typeof body.detail === 'string' ? body.detail : body.detail?.detail ?? detail;
    } catch { /* keep statusText */ }
    if (res.status === 404 && detail === 'Not Found') detail = 'The Beze API is not running. Start it with `pnpm dev:api`.';
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export async function requestGeneration(input: { prompt: string; project: Project; feedback?: string }): Promise<string> {
  const r = await request<{ jobId: string }>('/generations', { method: 'POST', body: JSON.stringify({ kind: 'content', ...input }) });
  return r.jobId;
}

export function getGeneration(jobId: string): Promise<GenerationStatus> {
  return request<GenerationStatus>(`/generations/${jobId}`);
}

export async function waitForGeneration(jobId: string, signal?: AbortSignal, intervalMs = 700): Promise<GenerationStatus> {
  for (;;) {
    const s = await getGeneration(jobId);
    if (s.status === 'succeeded' || s.status === 'failed') return s;
    if (signal?.aborted) throw new ApiError(0, 'cancelled');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
