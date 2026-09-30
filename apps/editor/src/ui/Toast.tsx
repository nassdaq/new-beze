import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'info' | 'error';
  title: string;
  lines?: string[];
}

interface ToastState {
  toasts: Toast[];
  push(kind: Toast['kind'], title: string, lines?: string[]): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push(kind, title, lines) {
    const id = nextId++;
    const toast: Toast = lines ? { id, kind, title, lines } : { id, kind, title };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (kind === 'info') setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (title: string) => useToasts.getState().push('info', title),
  error: (title: string, lines?: string[]) => useToasts.getState().push('error', title, lines),
};

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} data-testid="toast">
          <div className="toast-title">
            <span>{t.title}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
          </div>
          {t.lines && t.lines.length > 0 && (
            <ul className="toast-lines">{t.lines.slice(0, 8).map((l, i) => <li key={i}>{l}</li>)}</ul>
          )}
        </div>
      ))}
    </div>
  );
}
