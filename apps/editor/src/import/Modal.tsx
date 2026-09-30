import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  testId?: string;
}

/** A native <dialog> shown modally. Mount it to open; Escape and the close button call onClose. */
export function Modal({ title, onClose, children, footer, className, testId }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${className ? ` ${className}` : ''}`}
      data-testid={testId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-frame">
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="toast-close" onClick={onClose} aria-label="Close" title="Close">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
