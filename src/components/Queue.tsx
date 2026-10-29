import { useState } from 'react';
import type { Board } from '../hooks/useBoard';
import { daysBetween, fmtDate, fmtDays, sortReviews, statsFor } from '../lib/format';
import { PROGRESS_SERIES, SEV_SERIES, STATUS } from '../lib/types';
import { StackedChart, foldRows, type Row } from './StackedChart';

type Filter = 'active' | 'closed' | 'all';

export function Queue({ board, allApps, missing, onNew }: { board: Board; allApps: boolean; missing: string | null; onNew: () => void }) {
  const [filter, setFilter] = useState<Filter>('active');
  if (!board.loaded) return <div className="empty">Loading reviews…</div>;
  const all = sortReviews([...board.reviews.values()]);
  const shown = all.filter((r) => filter === 'all' || (filter === 'active' ? r.status !== 'done' : r.status === 'done'));
  const cnt = { active: all.filter((r) => r.status !== 'done').length, closed: all.filter((r) => r.status === 'done').length, all: all.length };
  const chip = (k: Filter, l: string) => <button key={k} type="button" className="fchip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}<span className="n">{cnt[k]}</span></button>;
  return (
    <>
      {missing && <div className="note-bar" style={{ marginBottom: 12 }}>No review with the id <code>{missing}</code>. It may have been withdrawn.</div>}
      {all.length > 0 && <QueueCharts board={board} allApps={allApps} />}
      <div className="toolbar"><h2 style={{ fontSize: 18, marginRight: 6 }}>Review queue</h2><div className="chips">{chip('active', 'Active')}{chip('closed', 'Closed')}{chip('all', 'All')}</div></div>
      {all.length === 0 ? (
        <div className="empty"><h3>No review requests yet</h3>When a flow is ready for UX review, raise the first request. The UX team is alerted on Slack.<p><button type="button" className="btn primary" onClick={onNew}>Request a review</button></p></div>
      ) : shown.length === 0 ? (
        <div className="empty">Nothing {filter === 'closed' ? 'closed' : 'active'} right now.</div>
      ) : (
        <div className="list">
          {shown.map((r) => {
            const st = statsFor(board.findings.values(), r.id);
            return (
              <a className="row" href={'#' + r.id} key={r.id}>
                <span className={'pill st-' + r.status}>{STATUS[r.status]}</span>
                <span className="row-main">
                  <span className="row-title">{r.flow}<span className="chip plat">{board.appName(r.app_id)}</span><span className="chip plat">{r.platform}</span></span>
                  <span className="row-meta">Requested by {board.nameOf(r.requested_by, r.requester_label)} · {fmtDate(r.created_at)}
                    {(r.reviewer || r.reviewer_label) && <> · Reviewer: {board.nameOf(r.reviewer, r.reviewer_label)}</>}
                    {r.status === 'done' && <> · closed {fmtDate(r.closed_at)}</>}</span>
                </span>
                <span className="row-f">
                  {st.total ? <><b>{st.open}</b> open / {st.total}<span className="dots">{st.s3 > 0 && <i className="dot s3" title={`${st.s3} major open`} />}{st.s2 > 0 && <i className="dot s2" title={`${st.s2} minor open`} />}{st.s1 > 0 && <i className="dot s1" title={`${st.s1} cosmetic open`} />}</span></>
                    : r.status === 'requested' || r.status === 'in_progress' ? 'no findings yet' : 'no findings'}
                </span>
                <span className="chev">›</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

function QueueCharts({ board, allApps }: { board: Board; allApps: boolean }) {
  const rs = [...board.reviews.values()];
  const active = new Set(rs.filter((r) => r.status !== 'done').map((r) => r.id));
  // All apps: one row per app. One app selected: one row per flow group.
  const byFlow: Record<string, Record<string, number>> = {};
  for (const f of board.findings.values()) {
    if (f.state !== 'open' || !active.has(f.review_id)) continue;
    const r = board.reviews.get(f.review_id);
    const k = allApps ? board.appName(r?.app_id) || 'Other' : f.flow_group || r?.flow || 'Other';
    (byFlow[k] ??= {})[String(f.sev)] = (byFlow[k][String(f.sev)] || 0) + 1;
  }
  const withF = sortReviews(rs.filter((r) => statsFor(board.findings.values(), r.id).total > 0)).slice(0, 8);
  const progRows: Row[] = withF.map((r) => { const st = statsFor(board.findings.values(), r.id); const pct = Math.round((100 * st.solved) / st.total);
    return { label: r.flow, parts: [{ key: 'solved', v: st.solved }, { key: 'other', v: st.wontfix + st.design }, { key: 'open', v: st.open }], total: st.total, valueNode: <><b>{pct}%</b> · {st.solved}/{st.total}</> }; });
  const turn: Row[] = rs.filter((r) => r.created_at && r.delivered_at).sort((a, b) => (b.delivered_at || '').localeCompare(a.delivered_at || '')).slice(0, 8)
    .map((r) => { const d = daysBetween(r.created_at, r.delivered_at) ?? 0; return { label: r.flow, parts: [{ key: 'd', v: d, text: fmtDays(d) }], total: d, valueNode: <><b>{fmtDays(d)}</b> d</> }; });
  return (
    <section className="charts" aria-label="Charts">
      <StackedChart id="byflow" title={allApps ? 'Open findings by app' : 'Open findings by flow'} sub="active reviews, by severity" series={SEV_SERIES} rows={foldRows(byFlow, 8)} rowName={allApps ? 'App' : 'Flow'} empty="No open findings in active reviews." />
      <StackedChart id="progress" title="Progress per review" sub="share of findings solved" series={PROGRESS_SERIES} rows={progRows} rowName="Review" meter empty="No findings delivered yet." />
      <StackedChart id="turnaround" title="Turnaround" sub="days from request to findings" series={[{ key: 'd', label: 'Days', color: 'var(--accent)' }]} rows={turn} rowName="Review" empty="No delivered reviews yet." />
    </section>
  );
}
