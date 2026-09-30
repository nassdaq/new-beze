import { useEffect } from 'react';
import { useEditor } from './editorStore.js';
import { repository } from '../services.js';

const DEBOUNCE_MS = 2000;

/** Saves the project 2 s after the last change, and immediately when the tab hides. */
export function useAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = async () => {
      timer = null;
      const { project, saveState } = useEditor.getState();
      if (!project || saveState === 'saved' || saveState === 'saving') return;
      useEditor.getState().setSaveState('saving');
      const versionAtSave = useEditor.getState().version;
      try {
        await repository.save(project, null);
        if (useEditor.getState().version === versionAtSave) useEditor.getState().setSaveState('saved');
        else useEditor.getState().setSaveState('unsaved');
      } catch {
        useEditor.getState().setSaveState('error');
      }
    };
    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (state.version !== prev.version && state.project) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(save, DEBOUNCE_MS);
      }
    });
    const onHide = () => { if (document.visibilityState === 'hidden') void save(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
      if (timer) clearTimeout(timer);
    };
  }, []);
}

export async function saveNow(): Promise<void> {
  const { project } = useEditor.getState();
  if (!project) return;
  useEditor.getState().setSaveState('saving');
  try {
    await repository.save(project, null);
    useEditor.getState().setSaveState('saved');
  } catch {
    useEditor.getState().setSaveState('error');
  }
}
