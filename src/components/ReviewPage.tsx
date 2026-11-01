import { useMemo, useState } from 'react';
import type { Board } from '../hooks/useBoard';
import { fmtDate, nowIso, statsFor } from '../lib/format';
import { PROGRESS_SERIES, SEV, SEV_SERIES, STATUS, type Finding, type Review, type Status } from '../lib/types';
import { FindingRow } from './FindingRow';
import { Md } from './Md';
import { StackedChart, foldRows, type Row } from './StackedChart';
import { useToast } from './Toast';
import { CopyLink } from './CopyLink';

type Tab = 'open' | 'solved' | 'other' | 'all';

export function ReviewPage({ review: r, board, meId, onEditRequest, onAddFinding, onEditFinding, onOpenImage }:
  { review: Review; board: Board; meId: string | null; onEditRequest: (r: Review) => void; onAddFinding: (rid: string) => void; onEditFinding: (f: Finding) => void; onOpenImage: (src: string, cap: string) => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('open');
  const [sevF, setSevF] = useState<Set<number>>(new Set());
  const [teamF, setTeamF] = useState<string | null>(null); // team id, '' = no team, null = all
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'flow' | 'sev'>('flow');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const st = statsFor(board.findings.values(), r.id);

  const all = useMemo(() => [...board.findings.values()].filter((f) => f.review_id === r.id), [board.findings, r.id]);
  const tabs = { open: all.filter((f) => f.state === 'open'), solved: all.filter((f) => f.state === 'solved'), other: all.filter((f) => f.state === 'wontfix' || f.state === 'design'), all };
  const q = query.trim().toLowerCase();
  let list = tabs[tab];
  if (sevF.size) list = list.filter((f) => sevF.has(f.sev));
  if (teamF !== null) list = list.filter((f) => (f.team_id ?? '') === teamF);
  if (q) list = list.filter((f) => [f.code, f.screen, f.description, f.type, f.flow, f.note].join(' ').toLowerCase().includes(q));
  list = [...list].sort((a, b) => (sort === 'sev' ? (b.sev - a.sev) || (a.sort_order - b.sort_order) : (a.sort_order - b.sort_order) || a.created_at.localeCompare(b.created_at)));

  const t = nowIso();
  const act = async (patch: Partial<Review>, msg: string, alert = false) => {
    const res = await board.updateReview(r.id, patch);
    if (!res.ok) return toast('Could not save: ' + res.error);
    toast(msg);
    if (alert) board.notify(r.id);
  };
  // Any status can be chosen, forward or back; dates are kept when moving back to a stage already reached and cleared for stages undone.
  const setStatus = (next: Status) => {
    if (next === r.status) return;
    const patch: Partial<Review> = { status: next };
    if (next === 'requested') Object.assign(patch, { started_at: null, delivered_at: null, closed_at: null });
    if (next === 'in_progress') Object.assign(patch, { started_at: r.started_at ?? t, delivered_at: null, closed_at: null });
    if (next === 'delivered') Object.assign(patch, { started_at: r.started_at ?? t, delivered_at: r.delivered_at ?? t, closed_at: null });
    if (next === 'done') Object.assign(patch, { started_at: r.started_at ?? t, delivered_at: r.delivered_at ?? t, closed_at: r.closed_at ?? t });
    act(patch, 'Status set to ' + STATUS[next] + '.', next === 'delivered' || next === 'done');
  };
  const withdraw = async () => {
    setConfirmWithdraw(false);
    const res = await board.deleteReview(r.id);
    if (!res.ok) return toast('Could not withdraw: ' + res.error);
    toast('Request withdrawn.'); location.hash = '#queue';
  };

  const byScreen: Record<string, Record<string, number>> = {};
  for (const f of all) { if (f.state !== 'open') continue; const k = f.screen || 'Unspecified'; (byScreen[k] ??= {})[String(f.sev)] = (byScreen[k][String(f.sev)] || 0) + 1; }
  const prog: Row[] = st.total ? [{ label: 'All findings', parts: [{ key: 'solved', v: st.solved }, { key: 'other', v: st.wontfix + st.design }, { key: 'open', v: st.open }], total: st.total, valueNode: <><b>{Math.round((100 * st.solved) / st.total)}%</b> · {st.solved}/{st.total}</> }] : [];

  // Teams present in this review's findings (by open count), for the filter chips.
  const teamsHere = (() => { const c = new Map<string, number>(); all.forEach((f) => { const k = f.team_id ?? ''; c.set(k, (c.get(k) || 0) + (f.state === 'open' ? 1 : 0)); }); return [...c].sort((a, b) => b[1] - a[1]); })();
  const link = (u: string) => <a href={u} target="_blank" rel="noopener noreferrer">{u.replace(/^https?:\/\//, '').slice(0, 60)}{u.length > 68 ? '…' : ''}</a>;
  const dd = (label: string, v: React.ReactNode, wide = false) => (v ? <div className={wide ? 'wide' : undefined}><dt>{label}</dt><dd>{v}</dd></div> : null);
  const ux = board.isAdmin;
  const canAssign = board.isAdmin;
  // Admins move the status anywhere (this page is theirs; editors and viewers work from the team inbox);
  // closing and reopening are the admin's. Enforced again by the guard_review_update trigger.
  // Admins, and the assigned reviewer, edit the review and its findings (never close/withdraw unless admin); other UX members only read.
  const canEdit = board.isAdmin;
  const canMove = board.isAdmin;
  const stages = (Object.keys(STATUS) as Status[]).filter((k) => k !== 'done' || board.isAdmin);
  const closed = r.status === 'done' && !board.isAdmin;

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
          <CopyLink id={r.id} />
          {confirmWithdraw ? (
            <span className="confirm">Withdraw this request? <button type="button" className="btn sm danger" onClick={withdraw}>Withdraw</button><button type="button" className="btn sm" onClick={() => setConfirmWithdraw(false)}>Keep</button></span>
          ) : canMove ? (
            <>
              <select className="btn primary status-cta" value={r.status} disabled={closed} aria-label="Review status" title={closed ? 'Closed. Only an admin can reopen a review.' : board.isAdmin ? 'Move the review to any stage, forward or back' : 'Move the review up to Delivered; an admin closes it'} onChange={(e) => setStatus(e.target.value as Status)}>
                {(closed ? (Object.keys(STATUS) as Status[]) : stages).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
              </select>
              {closed && <span className="hint">Only an admin can reopen.</span>}
              {canEdit && r.status !== 'done' && <button type="button" className="btn" onClick={() => onEditRequest(r)}>Edit request</button>}
              {board.isAdmin && r.status === 'requested' && <button type="button" className="btn" onClick={() => setConfirmWithdraw(true)}>Withdraw</button>}
            </>
          ) : r.status === 'requested' ? <span className="hint">Waiting for the UX team to start the review.</span>
            : r.status === 'in_progress' ? <span className="hint">The UX team is reviewing.</span>
            : r.status === 'delivered' ? <span className="hint">{canAssign ? 'Route each finding to its team below; an admin closes the review.' : 'Tick each finding Solved as you fix it; the UX team closes the review.'}</span>
            : null}
        </div>
      </div>
      <dl className="meta">
        {canEdit ? (
          <div><dt><label htmlFor={'reviewer-' + r.id}>Reviewer</label></dt><dd>
            <select className="ctl" id={'reviewer-' + r.id} value={r.reviewer ?? ''} onChange={async (e) => { const id = e.target.value || null; const res = await board.updateReview(r.id, { reviewer: id, reviewer_label: id ? null : r.reviewer_label }); toast(res.ok ? (id ? 'Reviewer set to ' + board.nameOf(id, null) + '.' : 'Reviewer cleared.') : 'Could not save: ' + res.error); }}>
              <option value="">{r.reviewer_label || '— not assigned —'}</option>
              {board.assignable.filter((p) => p.role === 'admin').map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
            </select>
            {r.started_at && <span className="hint"> · started {fmtDate(r.started_at)}</span>}
          </dd></div>
        ) : dd('Reviewer', <>{board.nameOf(r.reviewer, r.reviewer_label)}{r.started_at && <> · started {fmtDate(r.started_at)}</>}</>)}
        {dd('Delivered', r.delivered_at ? `${fmtDate(r.delivered_at)} · ${st.total} findings` : r.status === 'requested' ? 'not started' : 'in progress')}
        {dd('Closed', r.closed_at ? fmtDate(r.closed_at) : '')}
        {dd('Build', r.build && <Md text={r.build} />)}
        {dd('Figma', r.figma && link(r.figma))}
        {dd('Languages', (r.languages || []).join(', '))}
        {dd('Related story', r.story && <Md text={r.story} />)}
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
          {teamsHere.length > 0 && <div className="chips" role="group" aria-label="Team">{teamsHere.map(([id, n]) => <button key={id || 'none'} type="button" className="fchip" aria-pressed={teamF === id} onClick={() => setTeamF(teamF === id ? null : id)}>{id ? board.teamName(id) : 'No team'}<span className="n">{n}</span></button>)}</div>}
          <input className="search" type="search" id="f-search" placeholder="Search code, screen, text" value={query} onChange={(e) => setQuery(e.target.value)} dir="auto" />
          <select className="ctl" id="f-sort" value={sort} onChange={(e) => setSort(e.target.value as 'flow' | 'sev')}><option value="flow">Order: flow</option><option value="sev">Order: severity</option></select>
          {canEdit && <button type="button" className="btn" onClick={() => onAddFinding(r.id)}>Add finding</button>}
          {canAssign && all.some((f) => f.state === 'open' && !f.team_id) && (
            <select className="ctl" id="team-all" value="" aria-label="Route all open findings without a team" onChange={async (e) => { const id = e.target.value; if (!id) return; const ids = all.filter((f) => f.state === 'open' && !f.team_id).map((f) => f.id); const res = await board.setTeam(ids, id); toast(res.ok ? `Routed ${ids.length} findings to ${board.teamName(id)}.` : 'Could not route: ' + res.error); }}>
              <option value="">Route all open without a team to…</option>
              {board.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {canAssign && all.some((f) => f.state === 'open' && !f.assignee) && (
            <select className="ctl" id="assign-all" value="" aria-label="Assign all open, unassigned findings" onChange={async (e) => { const id = e.target.value; if (!id) return; const p = board.profiles.get(id); const ids = all.filter((f) => f.state === 'open' && !f.assignee && (teamF === null ? true : (f.team_id ?? '') === teamF)).map((f) => f.id); const res = await board.assign(ids, id); if (res.ok && p?.team_id) await board.setTeam(ids.filter((fid) => !board.findings.get(fid)?.team_id), p.team_id); toast(res.ok ? `Assigned ${ids.length} findings.` : 'Could not assign: ' + res.error); }}>
              <option value="">{teamF ? `Assign open, unassigned ${board.teamName(teamF)} findings to…` : 'Assign all open, unassigned to…'}</option>
              {board.assignableFor(teamF || null).map((p) => <option key={p.id} value={p.id}>{p.name || p.email}{p.team_id ? ' · ' + board.teamName(p.team_id) : ''}</option>)}
            </select>
          )}
        </div>
        <p className="hint" style={{ margin: '-6px 0 10px' }}>{canAssign ? 'Route each finding to the team that owns it; editors see every finding of their team and take or get assigned the ones to fix, viewers only read. Screenshots: mask names, phone numbers and emails before uploading.' : 'Screenshots: mask names, phone numbers and emails before uploading.'}</p>
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
