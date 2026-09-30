import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useEditor } from '../store/editorStore.js';
import { useAutosave } from '../store/autosave.js';
import { assets, repository } from '../services.js';
import { TopBar } from '../panels/TopBar.js';
import { ProjectPanel } from '../panels/ProjectPanel.js';
import { InspectorPanel } from '../panels/InspectorPanel.js';
import { BottomPanel } from '../panels/BottomPanel.js';
import { Viewport, isTyping } from '../viewport/Viewport.js';
import { PlayPanel } from '../play/PlayPanel.js';
import { toast } from '../ui/Toast.js';

export function EditorPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const loadProject = useEditor((s) => s.loadProject);
  const closeProject = useEditor((s) => s.closeProject);
  const playing = useEditor((s) => s.play.status !== 'stopped');
  useAutosave();

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    Promise.all([assets.ready(), repository.load(projectId!)])
      .then(([, loaded]) => {
        if (cancelled) return;
        if (!loaded) { setStatus('missing'); return; }
        loadProject(loaded.project);
        setStatus('ready');
      })
      .catch((e: Error) => { toast.error('Could not open project', [e.message]); setStatus('missing'); });
    return () => { cancelled = true; closeProject(); };
  }, [projectId, loadProject, closeProject]);

  useShortcuts();

  if (status === 'loading') return <main className="centered muted">Loading…</main>;
  if (status === 'missing') return <main className="centered"><p>Project not found.</p><button onClick={() => navigate('/projects')}>Back to projects</button></main>;

  return (
    <div className="editor">
      <TopBar />
      <ProjectPanel />
      <div className="editor-center">
        <Viewport />
        {playing && <PlayPanel />}
      </div>
      <InspectorPanel />
      <BottomPanel />
    </div>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); return; }
      if (s.play.status !== 'stopped') { if (e.key === 'Escape') s.setPlay({ status: 'stopped', error: null }); return; }
      if (mod) return;
      switch (e.key.toLowerCase()) {
        case 'v': s.setTool('select'); break;
        case 'b': s.setTool('tileBrush'); break;
        case 'e': s.setTool('eraser'); break;
        case 'c': s.setTool('collision'); break;
        case 'p': s.setTool('placeEntity'); break;
        case 'escape': s.setTool('select'); break;
        case 'delete':
        case 'backspace': {
          const sel = s.selection;
          if (sel.kind === 'entity') {
            const r = s.dispatch('Delete entity', [{ op: 'deleteEntity', sceneId: sel.sceneId, entityId: sel.entityId }]);
            if (r.ok) s.select({ kind: 'scene', sceneId: sel.sceneId });
            else toast.error('Cannot delete', r.errors.map((x) => x.message));
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
