import { useMemo, useState } from 'react';
import type { Board } from '../hooks/useBoard';
import { fmtDate, nowIso, statsFor } from '../lib/format';
import { PROGRESS_SERIES, SEV, SEV_SERIES, STATUS, type Finding, type Review } from '../lib/types';
import { FindingRow } from './FindingRow';
import { Md } from './Md';
import { StackedChart, foldRows, type Row } from './StackedChart';
import { useToast } from './Toast';

type Tab = 'open' | 'solved' | 'other' | 'all';

export function ReviewPage({ review: r, board, meId, onEditRequest, onAddFinding, onEditFinding, onOpenImage }:
  { review: Review; board: Board; meId: string | null; onEditRequest: (r: Review) => void; onAddFinding: (rid: string) => void; onEditFinding: (f: Finding) => void; onOpenImage: (src: string, cap: string) => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('open');
  const [sevF, setSevF] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'flow' | 'sev'>('flow');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [page, setPage] = useState<string | null>(null);
  const st = statsFor(board.findings.values(), r.id);

  const all = useMemo(() => [...board.findings.values()].filter((f) => f.review_id === r.id), [board.findings, r.id]);
  const tabs = { open: all.filter((f) => f.state === 'open'), solved: all.filter((f) => f.state === 'solved'), other: all.filter((f) => f.state === 'wontfix' || f.state === 'design'), all };
  const q = query.trim().toLowerCase();
  let list = tabs[tab];
  if (sevF.size) list = list.filter((f) => sevF.has(f.sev));
  if (q) list = list.filter((f) => [f.code, f.screen, f.description, f.type, f.flow, f.note].join(' ').toLowerCase().includes(q));
  list = [...list].sort((a, b) => (sort === 'sev' ? (b.sev - a.sev) || (a.sort_order - b.sort_order) : (a.sort_order - b.sort_order) || a.created_at.localeCompare(b.created_at)));

  const t = nowIso();
  const act = async (patch: Partial<Review>, msg: string, alert = false) => {
    const res = await board.updateReview(r.id, patch);
    if (!res.ok) return toast('Could not save: ' + res.error);
    toast(msg);
    if (alert) board.notify(r.id);
  };
  const withdraw = async () => {
    setConfirmWithdraw(false);
    const res = await board.deleteReview(r.id);
    if (!res.ok) return toast('Could not withdraw: ' + res.error);
    toast('Request withdrawn.'); location.hash = '#queue';
  };
  const savePage = () => { const val = (page ?? r.page ?? '').trim(); if ((r.page || '') !== val) board.updateReview(r.id, { page: val || null }); };

  const byScreen: Record<string, Record<string, number>> = {};
  for (const f of all) { if (f.state !== 'open') continue; const k = f.screen || 'Unspecified'; (byScreen[k] ??= {})[String(f.sev)] = (byScreen[k][String(f.sev)] || 0) + 1; }
  const prog: Row[] = st.total ? [{ label: 'All findings', parts: [{ key: 'solved', v: st.solved }, { key: 'other', v: st.wontfix + st.design }, { key: 'open', v: st.open }], total: st.total, valueNode: <><b>{Math.round((100 * st.solved) / st.total)}%</b> · {st.solved}/{st.total}</> }] : [];

  const link = (u: string) => <a href={u} target="_blank" rel="noopener noreferrer">{u.replace(/^https?:\/\//, '').slice(0, 60)}{u.length > 68 ? '…' : ''}</a>;
  const dd = (label: string, v: React.ReactNode, wide = false) => (v ? <div className={wide ? 'wide' : undefined}><dt>{label}</dt><dd>{v}</dd></div> : null);
  const ux = board.isUx;
  const mineOpen = r.status === 'requested' && r.requested_by != null && r.requested_by === meId; // an engineer may edit or withdraw their own open request

  return (
    <>
      <a className="back" href="#queue">← Queue</a>
      <div className="rhead">
        <div>
          <h2>{r.flow}<span className="chip plat">{board.appName(r.app_id)}</span><span className="chip plat">{r.platform}</span></h2>
          <div className="rsub"><span className={'pill st-' + r.status}>{STATUS[r.status]}</span><span>Requested by {board.nameOf(r.requested_by, r.requester_label)} on {fmtDate(r.created_at)}</span>
            {r.source === 'audit' && <span>· imported from the Android app audit</span>}</div>
        </div>
        <div className="actions">
          {confirmWithdraw ? (
            <span className="confirm">Withdraw this request? <button type="button" className="btn sm danger" onClick={withdraw}>Withdraw</button><button type="button" className="btn sm" onClick={() => setConfirmWithdraw(false)}>Keep</button></span>
          ) : r.status === 'requested' ? (
            <>{ux && <button type="button" className="btn primary" onClick={() => act({ status: 'in_progress', reviewer: meId, reviewer_label: null, started_at: t }, 'Review started. You are the reviewer.')}>Start review</button>}
              {(ux || mineOpen) && <button type="button" className="btn" onClick={() => onEditRequest(r)}>Edit request</button>}
              {(ux || mineOpen) && <button type="button" className="btn" onClick={() => setConfirmWithdraw(true)}>Withdraw</button>}
              {!ux && !mineOpen && <span className="hint">Waiting for the UX team to start the review.</span>}</>
          ) : r.status === 'in_progress' ? (
            ux ? <><button type="button" className="btn primary" onClick={() => act({ status: 'delivered', delivered_at: t }, 'Marked delivered. The engineer is alerted on Slack.', true)}>Mark delivered</button>
              <button type="button" className="btn" onClick={() => onEditRequest(r)}>Edit request</button></> : <span className="hint">The UX team is reviewing.</span>
          ) : r.status === 'delivered' ? (
            ux ? <><button type="button" className="btn primary" onClick={() => act({ status: 'done', closed_at: t }, 'Review closed.', true)}>Close review</button>
              <button type="button" className="btn" onClick={() => act({ status: 'in_progress' }, 'Back to in progress.')}>Back to in progress</button>
              <button type="button" className="btn" onClick={() => onEditRequest(r)}>Edit request</button></> : <span className="hint">Tick each finding Solved as you fix it; the UX team closes the review.</span>
          ) : (
            ux ? <button type="button" className="btn" onClick={() => act({ status: 'delivered', closed_at: null }, 'Reopened.')}>Reopen</button> : null
          )}
        </div>
      </div>
      <dl className="meta">
        {dd('Reviewer', <>{board.nameOf(r.reviewer, r.reviewer_label)}{r.started_at && <> · started {fmtDate(r.started_at)}</>}</>)}
        {dd('Delivered', r.delivered_at ? `${fmtDate(r.delivered_at)} · ${st.total} findings` : r.status === 'requested' ? 'not started' : 'in progress')}
        {dd('Closed', r.closed_at ? fmtDate(r.closed_at) : '')}
        {dd('Build', r.build && <Md text={r.build} />)}
        {dd('Figma', r.figma && link(r.figma))}
        {dd('Languages', (r.languages || []).join(', '))}
        {dd('Related story', r.story && <Md text={r.story} />)}
        {r.status !== 'requested'
          ? dd('Findings page', <input type="url" id={'page-' + r.id} value={page ?? r.page ?? ''} placeholder="https://…" dir="ltr" onChange={(e) => setPage(e.target.value)} onBlur={savePage} />)
          : dd('Findings page', r.page && link(r.page))}
        {dd('Screens', r.screens, true)}
        {dd('How to reach the flow', r.reach && <Md text={r.reach} />, true)}
      </dl>
      {st.total > 0 && (
        <section className="charts" aria-label="Review charts">
          <StackedChart id="byscreen" title="Open findings by screen" sub="by severity" series={SEV_SERIES} rows={foldRows(byScreen, 8)} rowName="Screen" empty="No open findings." />
          <StackedChart id="rprogress" title="Progress" sub={`${st.open} open · ${st.solved} solved · ${st.wontfix + st.design} won't fix / design`} series={PROGRESS_SERIES} rows={prog} rowName="Review" meter />
        </section>
      )}
      <section className="fsec">
        <h3>Findings</h3>
        <div className="toolbar">
          <div className="chips">{(['open', 'solved', 'other', 'all'] as Tab[]).map((k) => <button key={k} type="button" className="fchip" aria-pressed={tab === k} onClick={() => setTab(k)}>{{ open: 'Open', solved: 'Solved', other: "Won't fix / design", all: 'All' }[k]}<span className="n">{tabs[k].length}</span></button>)}</div>
          <div className="chips">{[3, 2, 1].map((s) => <button key={s} type="button" className="fchip" aria-pressed={sevF.has(s)} onClick={() => setSevF((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; })}>{SEV[s as 1 | 2 | 3]}</button>)}</div>
          <input className="search" type="search" id="f-search" placeholder="Search code, screen, text" value={query} onChange={(e) => setQuery(e.target.value)} dir="auto" />
          <select className="ctl" id="f-sort" value={sort} onChange={(e) => setSort(e.target.value as 'flow' | 'sev')}><option value="flow">Order: flow</option><option value="sev">Order: severity</option></select>
          {ux && <button type="button" className="btn" onClick={() => onAddFinding(r.id)}>Add finding</button>}
        </div>
        <p className="hint" style={{ margin: '-6px 0 10px' }}>Screenshots: mask names, phone numbers and emails before uploading.</p>
        {all.length === 0 ? (
          <div className="empty"><h3>No findings yet</h3>{r.status === 'requested' || r.status === 'in_progress' ? 'The reviewer adds findings here when the review is done.' : 'Nothing was recorded for this review.'}</div>
        ) : list.length === 0 ? (
          <div className="empty">No findings match. {tab === 'open' ? 'Everything here is solved or marked.' : ''}</div>
        ) : (
          <div className="list">{list.map((f) => <FindingRow key={f.id} f={f} board={board} meId={meId} onEdit={onEditFinding} onOpenImage={onOpenImage} />)}</div>
        )}
      </section>
    </>
  );
}
