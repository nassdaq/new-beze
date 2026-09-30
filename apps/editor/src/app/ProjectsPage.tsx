import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createProject, newId } from '@beze/project-core';
import { parseProject, type Project } from '@beze/project-schema';
import { assets, repository } from '../services.js';
import type { ProjectSummary } from '../repository/ProjectRepository.js';
import { TEMPLATES, type GameTemplate } from '../templates.js';
import { toast } from '../ui/Toast.js';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => repository.list().then(setProjects).catch((e: Error) => toast.error('Could not list projects', [e.message]));
  useEffect(() => { void refresh(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim() || 'My game';
    try {
      await assets.ready();
      const project = createProject(trimmed, assets.starterPack());
      await repository.save(project, null);
      navigate(`/p/${project.id}`);
    } catch (err) {
      toast.error('Could not create project', [(err as Error).message]);
    }
  };

  const fromTemplate = async (t: GameTemplate) => {
    if (creating) return;
    setCreating(t.id);
    try {
      await assets.ready();
      const raw = await fetchTemplateJson(t.project);
      const parsed = parseProject(raw);
      if (!parsed.ok) {
        toast.error(`The ${t.name} template is not a valid project`, parsed.issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`));
        return;
      }
      if (t.pack) await assets.loadPack(t.pack);
      const now = new Date().toISOString();
      const project: Project = { ...parsed.value, id: newId('prj'), name: name.trim() || parsed.value.name || t.name, meta: { ...parsed.value.meta, createdAt: now, updatedAt: now } };
      await repository.save(project, null);
      navigate(`/p/${project.id}`);
    } catch (err) {
      toast.error(`Could not create a game from the ${t.name} template`, [(err as Error).message]);
    } finally {
      setCreating(null);
    }
  };

  const openFile = async (file: File) => {
    try {
      const parsed = parseProject(JSON.parse(await file.text()));
      if (!parsed.ok) {
        toast.error('This file is not a valid Beze project', parsed.issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`));
        return;
      }
      await repository.save(parsed.value, null);
      navigate(`/p/${parsed.value.id}`);
    } catch (err) {
      toast.error('Could not open file', [(err as Error).message]);
    }
  };

  const remove = async (p: ProjectSummary) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    await repository.remove(p.id);
    void refresh();
  };

  return (
    <main className="projects">
      <h1>Beze</h1>
      <p className="muted">Make a tiny anime game in your browser. Projects are stored in this browser until you download them.</p>
      <form className="projects-new" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your game" aria-label="Game name" data-testid="new-name" />
        <button type="submit" className="primary" data-testid="new-game">New game</button>
        <button type="button" onClick={() => fileRef.current?.click()}>Open project file…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); e.target.value = ''; }} />
      </form>
      <h2 className="projects-subhead">Start from a template</h2>
      <div className="template-cards" data-testid="template-cards">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="template-card" data-testid={`template-${t.id}`} disabled={creating !== null} onClick={() => void fromTemplate(t)}>
            <span className="template-name">{t.name}</span>
            <span className="muted small">{t.description}</span>
            <span className="template-cta">{creating === t.id ? 'Creating…' : 'Create game'}</span>
          </button>
        ))}
      </div>
      <h2 className="projects-subhead">Your games</h2>
      {projects === null ? <p className="muted">Loading…</p> : projects.length === 0 ? <p className="muted">No projects yet.</p> : (
        <ul className="projects-list">
          {projects.map((p) => (
            <li key={p.id}>
              <button className="link" onClick={() => navigate(`/p/${p.id}`)}>{p.name}</button>
              <span className="muted">{new Date(p.updatedAt).toLocaleString()}</span>
              <button className="danger small" onClick={() => remove(p)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** Fetches a template file; a dev server answers a missing file with the app's HTML, so parse failures read as "missing". */
async function fetchTemplateJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Template files are missing: ${url} (${res.status})`);
  const text = await res.text();
  try { return JSON.parse(text) as unknown; } catch { throw new Error(`Template files are missing or not JSON: ${url}`); }
}
