import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createProject } from '@beze/project-core';
import { parseProject } from '@beze/project-schema';
import { assets, repository } from '../services.js';
import type { ProjectSummary } from '../repository/ProjectRepository.js';
import { toast } from '../ui/Toast.js';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState('');
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
