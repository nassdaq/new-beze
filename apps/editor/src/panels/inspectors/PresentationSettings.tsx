import type { Operation, ProjectSettings } from '@beze/project-schema';
import { useEditor, useProject } from '../../store/editorStore.js';
import { Field } from '../../ui/Field.js';
import { toast } from '../../ui/Toast.js';

type Presentation = NonNullable<ProjectSettings['presentation']>;

/** Project-level look and feel: title screen, lighting and day/night, bloom, vignette. Every field defaults to on. */
export function PresentationSettings() {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  if (!project) return null;
  const p: Presentation = project.settings.presentation ?? {};

  const run = (label: string, ops: Operation[]) => {
    const r = dispatch(label, ops);
    if (!r.ok) toast.error('Change rejected', r.errors.map((e) => e.message));
  };
  const patch = (label: string, next: Partial<Presentation>) => {
    const merged: Presentation = { ...p, ...next };
    for (const k of Object.keys(merged) as Array<keyof Presentation>) if (merged[k] === undefined) delete merged[k];
    run(label, [{ op: 'updateSettings', patch: { presentation: merged } }]);
  };
  const toggle = (key: 'titleScreen' | 'lighting' | 'dayNight' | 'bloom' | 'vignette', label: string) => (
    <label className="check" key={key}><input type="checkbox" checked={p[key] !== false} onChange={(e) => patch(label, { [key]: e.target.checked ? undefined : false })} /> {label}</label>
  );
  const images = Object.values(project.assets).filter((a) => a.kind === 'image');

  return (
    <>
      <h4 className="subhead">Presentation</h4>
      {toggle('titleScreen', 'Title screen (exports open on it)')}
      <Field label="Tagline (under the title)">
        <input value={p.tagline ?? ''} maxLength={120} placeholder="A line about the game" onChange={(e) => patch('Tagline', { tagline: e.target.value || undefined })} />
      </Field>
      <Field label="Title backdrop image (optional)">
        <select value={p.titleBackgroundAssetId ?? ''} onChange={(e) => patch('Title backdrop', { titleBackgroundAssetId: e.target.value || undefined })}>
          <option value="">(night skyline)</option>
          {images.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {toggle('lighting', 'Lighting (lamps and signs glow at night)')}
      {toggle('dayNight', 'Day / night cycle')}
      <div className="field-row">
        <Field label="Opens at (hour)">
          <input type="number" min={0} max={23} value={p.startHour ?? 6} onChange={(e) => patch('Start hour', { startHour: Math.min(23, Math.max(0, Math.round(Number(e.target.value)) || 0)) })} />
        </Field>
        {!project.settings.economy && (
          <Field label="Day length (s)">
            <input type="number" min={5} max={3600} value={Math.round((p.dayLengthMs ?? 120_000) / 1000)} onChange={(e) => patch('Day length', { dayLengthMs: Math.min(3_600_000, Math.max(5000, (Math.round(Number(e.target.value)) || 120) * 1000)) })} />
          </Field>
        )}
      </div>
      {toggle('bloom', 'Bloom (soft glow on bright things)')}
      {toggle('vignette', 'Vignette (darkened corners)')}
      <p className="muted small">With an economy the day/night cycle follows its day clock. Effects switch off by themselves on slow (software) graphics.</p>
    </>
  );
}
