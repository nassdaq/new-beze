import { useRef, useState } from 'react';
import type { Operation, ProjectSettings } from '@beze/project-schema';
import { useEditor, useProject } from '../../store/editorStore.js';
import { assets } from '../../services.js';
import { Field } from '../../ui/Field.js';
import { toast } from '../../ui/Toast.js';

type Audio = NonNullable<ProjectSettings['audio']>;
export const MOOD_OPTIONS: ReadonlyArray<{ value: NonNullable<Audio['music']>; label: string }> = [
  { value: 'auto', label: 'Auto (city by day, night after dark; calm without an economy)' },
  { value: 'city', label: 'City (upbeat, hip-hop pulse)' },
  { value: 'night', label: 'Night (slow, moody)' },
  { value: 'calm', label: 'Calm (soft pads)' },
  { value: 'tense', label: 'Tense (driving)' },
  { value: 'title', label: 'Title (heroic)' },
  { value: 'none', label: 'None' },
];

/** Project-level sound: the generated music mood or an uploaded track, and the two volumes. */
export function AudioSettings() {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const a: Audio = project.settings.audio ?? {};
  const tracks = Object.values(project.assets).filter((x) => x.kind === 'audio');

  const run = (label: string, ops: Operation[]) => {
    const r = dispatch(label, ops);
    if (!r.ok) toast.error('Change rejected', r.errors.map((e) => e.message));
  };
  const patch = (label: string, next: Partial<Audio>, extra: Operation[] = []) => {
    const merged: Audio = { ...a, ...next };
    for (const k of Object.keys(merged) as Array<keyof Audio>) if (merged[k] === undefined) delete merged[k];
    run(label, [...extra, { op: 'updateSettings', patch: { audio: merged } }]);
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const asset = await assets.putAudio(file, { name: file.name.replace(/\.[^.]+$/, '') });
      patch('Music track', { musicAssetId: asset.id }, [{ op: 'registerAsset', asset }]);
      toast.info(`Track "${asset.name}" is now the game's music.`);
    } catch (err) {
      toast.error('Could not import the track', [(err as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h4 className="subhead">Sound</h4>
      <Field label="Music">
        <select value={a.musicAssetId ? 'track' : (a.music ?? 'auto')} onChange={(e) => {
          if (e.target.value === 'track') return;
          patch('Music', { music: e.target.value as Audio['music'], musicAssetId: undefined });
        }}>
          {MOOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {tracks.length > 0 && <option value="track">Uploaded track</option>}
        </select>
      </Field>
      {tracks.length > 0 && (
        <Field label="Uploaded track">
          <select value={a.musicAssetId ?? ''} onChange={(e) => patch('Music track', { musicAssetId: e.target.value || undefined })}>
            <option value="">(use generated music)</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      )}
      <div className="field-row">
        <button type="button" className="small" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Importing…' : 'Upload a track (OGG/MP3)…'}</button>
        <input ref={fileRef} type="file" accept="audio/ogg,audio/mpeg,.ogg,.mp3" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      </div>
      <div className="field-row">
        <Field label="Music volume"><input type="range" min={0} max={1} step={0.05} value={a.musicVolume ?? 0.45} onChange={(e) => patch('Music volume', { musicVolume: Number(e.target.value) })} /></Field>
        <Field label="Effects volume"><input type="range" min={0} max={1} step={0.05} value={a.sfxVolume ?? 0.8} onChange={(e) => patch('Effects volume', { sfxVolume: Number(e.target.value) })} /></Field>
      </div>
      <p className="muted small">Sound effects are synthesized in the game (no files). Generated music brings in drums and a lead when enemies are close; a scene can pick its own music in the Scene section.</p>
    </>
  );
}
