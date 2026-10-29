import type { ReactNode } from 'react';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="panel" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-h"><h2>{title}</h2><button type="button" className="btn sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

export function Field({ name, label, hint, error, children }: { name: string; label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <div className={'fld' + (error ? ' err' : '')}>
      <label htmlFor={'in-' + name}>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="msg">{error}</div>}
    </div>
  );
}
