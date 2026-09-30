import { useNavigate } from 'react-router';
import { validateProject, hasErrors } from '@beze/project-core';
import { useEditor, type Tool } from '../store/editorStore.js';
import { saveNow } from '../store/autosave.js';
import { downloadGame, downloadProjectFile } from '../export/downloadGame.js';
import { toast } from '../ui/Toast.js';

const TOOL_LABELS: Array<{ tool: Tool; label: string; key: string }> = [
  { tool: 'select', label: 'Select', key: 'V' },
  { tool: 'tileBrush', label: 'Tiles', key: 'B' },
  { tool: 'eraser', label: 'Erase', key: 'E' },
  { tool: 'collision', label: 'Collision', key: 'C' },
  { tool: 'placeEntity', label: 'Place', key: 'P' },
];

export function TopBar() {
  const navigate = useNavigate();
  const project = useEditor((s) => s.project);
  const saveState = useEditor((s) => s.saveState);
  const activeTool = useEditor((s) => s.activeTool);
  const setTool = useEditor((s) => s.setTool);
  const canUndo = useEditor((s) => s.history.undo.length > 0);
  const canRedo = useEditor((s) => s.history.redo.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const play = useEditor((s) => s.play.status);
  const setPlay = useEditor((s) => s.setPlay);
  const dispatch = useEditor((s) => s.dispatch);
  if (!project) return null;

  const validated = (): boolean => {
    const errors = validateProject(project).filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      toast.error('Fix these before playing', errors.map((d) => d.message));
      return false;
    }
    return true;
  };

  const onPlay = async () => {
    if (play !== 'stopped') { setPlay({ status: 'stopped', error: null }); return; }
    if (!validated()) return;
    await saveNow();
    setPlay({ status: 'starting', error: null });
  };

  const onExport = async () => {
    if (!validated()) return;
    await saveNow();
    try {
      await downloadGame(project);
      toast.info('Game downloaded');
    } catch (e) {
      toast.error('Export failed', [(e as Error).message]);
    }
  };

  const rename = () => {
    const name = prompt('Project name', project.name)?.trim();
    if (name && name !== project.name) dispatch('Rename project', [{ op: 'renameProject', name }, { op: 'updateSettings', patch: { title: name } }]);
  };

  return (
    <header className="topbar">
      <button className="link" onClick={() => navigate('/projects')} title="All projects">← Projects</button>
      <button className="link topbar-name" onClick={rename} title="Rename" data-testid="project-name">{project.name}</button>
      <span className={`save-state save-${saveState}`} data-testid="save-state">{{ saved: 'Saved', unsaved: 'Unsaved', saving: 'Saving…', error: 'Save failed' }[saveState]}</span>
      <div className="toolbar tools" role="toolbar" aria-label="Tools">
        {TOOL_LABELS.map((t) => (
          <button
            key={t.tool}
            className={`tool${activeTool === t.tool ? ' active' : ''}`}
            onClick={() => setTool(t.tool)}
            title={`${t.label} (${t.key})`}
            aria-pressed={activeTool === t.tool}
            aria-keyshortcuts={t.key}
            data-testid={`tool-${t.tool}`}
          >
            {t.label}<kbd className="key-hint" aria-hidden="true">{t.key}</kbd>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
      </div>
      <div className="spacer" />
      <button onClick={() => downloadProjectFile(project)} title="Download the project file (.beze.json)">Download project</button>
      <button onClick={onExport} title="Download the game as a static website" data-testid="export">Export game</button>
      <button className={play === 'stopped' ? 'primary' : 'danger'} onClick={onPlay} data-testid="play">{play === 'stopped' ? '▶ Play' : '■ Stop'}</button>
      {!hasErrors(validateProject(project)) ? null : <span className="badge-error" title="The project has errors">!</span>}
    </header>
  );
}
