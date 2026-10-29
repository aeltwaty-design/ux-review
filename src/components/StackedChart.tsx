import { useState, type ReactNode } from 'react';

export interface Series { key: string; label: string; color: string }
export interface Part { key: string; v: number; text?: string }
export interface Row { label: string; parts: Part[]; total: number; valueNode?: ReactNode }

/** Horizontal stacked bars in plain HTML: thin marks, 2px surface gaps, rounded data-end, labels in text tokens, tooltip + table view. */
export function StackedChart({ id, title, sub, series, rows, rowName = 'Row', meter = false, empty = 'Nothing to show yet.' }:
  { id: string; title: string; sub?: string; series: Series[]; rows: Row[]; rowName?: string; meter?: boolean; empty?: string }) {
  const [table, setTable] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; v: string; s: string; row: string; color: string } | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const show = (el: HTMLElement, x: number, p: Part, s: Series, row: string) => {
    const r = el.getBoundingClientRect();
    setTip({ x, y: r.top, v: p.text ?? String(p.v), s: s.label, row, color: s.color });
  };
  return (
    <div className="chart" data-chart={id}>
      <div className="chart-h">
        <h3>{title}{sub && <span className="sub">{sub}</span>}</h3>
        {rows.length > 0 && <button type="button" className="fchip" aria-pressed={table} onClick={() => setTable(!table)}>Table</button>}
      </div>
      {rows.length === 0 ? <div className="cempty">{empty}</div> : (
        <>
          {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.key}><i className="sw" style={{ background: s.color }} />{s.label}</span>)}</div>}
          {!table && (
            <div className="bars">
              {rows.map((r) => {
                const parts = r.parts.filter((p) => p.v > 0);
                const last = parts.length ? parts[parts.length - 1].key : null;
                return (
                  <div className="brow" key={r.label}>
                    <span className="blabel" title={r.label}>{r.label}</span>
                    <div className={'btrack' + (meter ? ' meter' : '')}>
                      {parts.map((p) => {
                        const s = series.find((x) => x.key === p.key) ?? { key: p.key, label: p.key, color: 'var(--off)' };
                        return (
                          <button type="button" key={p.key} className={'seg' + (p.key === last ? ' last' : '')} aria-label={`${p.text ?? p.v} ${s.label}, ${r.label}`}
                            style={{ width: `${((100 * p.v) / max).toFixed(2)}%` }}
                            onPointerEnter={(e) => show(e.currentTarget, e.clientX, p, s, r.label)} onPointerMove={(e) => show(e.currentTarget, e.clientX, p, s, r.label)}
                            onPointerLeave={() => setTip(null)} onFocus={(e) => { const b = e.currentTarget.getBoundingClientRect(); show(e.currentTarget, b.left + b.width / 2, p, s, r.label); }} onBlur={() => setTip(null)}>
                            <i style={{ background: s.color }} />
                          </button>
                        );
                      })}
                    </div>
                    <span className="bval">{r.valueNode ?? <b>{r.total}</b>}</span>
                  </div>
                );
              })}
            </div>
          )}
          {table && (
            <table className="ctable"><thead><tr><th>{rowName}</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}{series.length > 1 && <th>Total</th>}</tr></thead>
              <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td>{series.map((s) => { const p = r.parts.find((x) => x.key === s.key); return <td key={s.key}>{p ? p.text ?? p.v : 0}</td>; })}{series.length > 1 && <td>{r.total}</td>}</tr>)}</tbody></table>
          )}
        </>
      )}
      {tip && (
        <div className="tip" style={{ left: Math.max(8, Math.min(window.innerWidth - 268, tip.x - 90)), top: Math.max(8, tip.y - 44) }}>
          <i className="k" style={{ background: tip.color }} /><b>{tip.v}</b> {tip.s} · {tip.row}
        </div>
      )}
    </div>
  );
}

/** Group counts into rows, fold the tail into "Other", order parts by key descending (severity 3 → 1). */
export function foldRows(map: Record<string, Record<string, number>>, limit: number): Row[] {
  const rows: Row[] = Object.entries(map)
    .map(([label, parts]) => ({ label, parts: Object.entries(parts).map(([key, v]) => ({ key, v })), total: Object.values(parts).reduce((a, b) => a + b, 0) }))
    .filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  if (rows.length > limit) {
    const rest = rows.splice(limit - 1);
    const o: Record<string, number> = {};
    rest.forEach((r) => r.parts.forEach((p) => { o[p.key] = (o[p.key] || 0) + p.v; }));
    rows.push({ label: `Other (${rest.length})`, parts: Object.entries(o).map(([key, v]) => ({ key, v })), total: rest.reduce((a, r) => a + r.total, 0) });
  }
  rows.forEach((r) => r.parts.sort((a, b) => Number(b.key) - Number(a.key)));
  return rows;
}
