import type { Operation, ProjectSettings } from '@beze/project-schema';
import { useEditor, useProject } from '../../store/editorStore.js';
import { Field } from '../../ui/Field.js';
import { toast } from '../../ui/Toast.js';

type Presentation = NonNullable<ProjectSettings['presentation']>;
type Ambient = NonNullable<ProjectSettings['ambient']>;

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
  const amb: Ambient = project.settings.ambient ?? {};
  const patchAmbient = (label: string, next: Partial<Ambient>) => {
    const merged: Ambient = { ...amb, ...next };
    for (const k of Object.keys(merged) as Array<keyof Ambient>) if (merged[k] === undefined) delete merged[k];
    run(label, [{ op: 'updateSettings', patch: { ambient: merged } }]);
  };
  const ambToggle = (key: 'traffic' | 'birds' | 'fireflies', label: string) => (
    <label className="check" key={key}><input type="checkbox" checked={amb[key] !== false} onChange={(e) => patchAmbient(label, { [key]: e.target.checked ? undefined : false })} /> {label}</label>
  );
  const pedestrians = amb.pedestrians ?? [];
  const playerCharacterIds = new Set(Object.values(project.scenes).flatMap((s) => Object.values(s.entities)).filter((e) => e.components.some((c) => c.type === 'playerControl')).map((e) => e.components.find((c) => c.type === 'sprite')).map((c) => (c && c.type === 'sprite' ? c.characterId : '')));

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
      <h4 className="subhead">Life in the world</h4>
      {ambToggle('traffic', 'Cars on the roads (they stop for the player)')}
      {ambToggle('birds', 'Birds crossing the sky')}
      {ambToggle('fireflies', 'Fireflies over grass at night')}
      <Field label="Weather">
        <select value={amb.weather ?? 'clear'} onChange={(e) => patchAmbient('Weather', { weather: e.target.value === 'rain' ? 'rain' : undefined })}>
          <option value="clear">Clear</option><option value="rain">Rain (with lightning)</option>
        </select>
      </Field>
      <span className="field-label">Pedestrians (characters that pace the sidewalks)</span>
      {Object.values(project.characters).filter((c) => !playerCharacterIds.has(c.id)).map((c) => (
        <label className="check" key={c.id}><input type="checkbox" checked={pedestrians.includes(c.id)} onChange={(e) => patchAmbient('Pedestrians', { pedestrians: e.target.checked ? [...pedestrians, c.id] : pedestrians.filter((id) => id !== c.id) })} /> {c.name}</label>
      ))}
    </>
  );
}
