import { useEffect, useState } from 'react';
import type { Asset } from '@beze/project-schema';
import { fetchArt, searchArt, type ArtHit } from '../api/client.js';
import { assets } from '../services.js';
import { Modal } from '../import/Modal.js';
import { toast } from '../ui/Toast.js';

export interface FindArtDialogProps {
  title: string;
  /** Search box prefill. */
  initialQuery: string;
  onClose(): void;
  /** Called with the registered asset once the picked image is imported. */
  onPicked(asset: Asset): void;
}

const MAX_SIDE = 2048;

/**
 * "Find art": searches Pixabay through the API service and imports the picked image as a WebP asset (Pixabay
 * serves JPEG; the editor stores PNG/WebP). Used for title backdrops and scene backgrounds.
 */
export function FindArtDialog({ title, initialQuery, onClose, onPicked }: FindArtDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<'all' | 'photo' | 'illustration' | 'vector'>('all');
  const [hits, setHits] = useState<ArtHit[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (q = query) => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchArt(q.trim(), kind);
      setHits(r.hits);
      setTotal(r.total);
    } catch (e) {
      setError((e as Error).message);
      setHits([]);
      setTotal(null);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void search(initialQuery); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (hit: ArtHit) => {
    setImporting(hit.id);
    try {
      const blob = await fetchArt(hit.image);
      const webp = await toWebp(blob);
      const asset = await assets.put(webp, { name: `Pixabay ${hit.id}: ${hit.tags.split(',')[0]?.trim() ?? 'image'}`, license: `Pixabay Content License (by ${hit.author})` });
      onPicked(asset);
      toast.info(`Imported "${asset.name}".`);
      onClose();
    } catch (e) {
      toast.error('Could not import the image', [(e as Error).message]);
    } finally {
      setImporting(null);
    }
  };

  return (
    <Modal title={title} onClose={onClose} className="modal-wide" testId="find-art">
      <form className="find-art-search" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="city skyline night, alley, rooftop…" aria-label="Search" autoFocus />
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind">
          <option value="all">Any</option><option value="photo">Photos</option><option value="illustration">Illustrations</option><option value="vector">Vectors</option>
        </select>
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {error && <p className="muted small">{error}</p>}
      {total !== null && !error && <p className="muted small">{total.toLocaleString()} results on Pixabay · free to use, no attribution required</p>}
      <div className="find-art-grid">
        {hits.map((h) => (
          <button key={h.id} type="button" className="find-art-hit" disabled={importing !== null} onClick={() => void pick(h)} title={`${h.tags}\nby ${h.author} · ${h.width}×${h.height}`}>
            <img src={h.preview} alt={h.tags} loading="lazy" />
            <span className="find-art-caption">{importing === h.id ? 'Importing…' : `${h.width}×${h.height}`}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Re-encodes an image blob as WebP, downscaled so its longest side is at most MAX_SIDE. */
async function toWebp(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * k));
  canvas.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode the image'))), 'image/webp', 0.9));
}
