import { useEditor } from '../store/editorStore.js';
import { TilePalette } from './TilePalette.js';
import { DialogueEditor } from './DialogueEditor.js';
import { PlacePalette } from './PlacePalette.js';

/** Context panel: tile palette for tile tools, character picker for the place tool, dialogue editor when one is selected. */
export function BottomPanel() {
  const tool = useEditor((s) => s.activeTool);
  const selection = useEditor((s) => s.selection);
  let body: React.ReactNode = null;
  if (tool === 'tileBrush' || tool === 'eraser' || tool === 'collision') body = <TilePalette />;
  else if (tool === 'placeEntity') body = <PlacePalette />;
  else if (selection.kind === 'dialogue') body = <DialogueEditor dialogueId={selection.dialogueId} />;
  if (!body) return null;
  return <div className="panel panel-bottom" data-testid="bottom-panel">{body}</div>;
}
