import { useState } from 'react';
import type { Board } from '../hooks/useBoard';
import { fmtDate, sortReviews } from '../lib/format';
import { STATUS, type Finding } from '../lib/types';
import { FindingRow } from './FindingRow';
import { CopyLink } from './CopyLink';

type Scope = 'mine' | 'team';
type Tab = 'open' | 'done' | 'all';

/** A collaborator's whole board: every finding owned by their team, "Mine" selected by default, grouped by review. */
export function TeamInbox({ board, meId, onOpenImage }: { board: Board; meId: string | null; onOpenImage: (src: string, cap: string) => void }) {
  const [scope, setScope] = useState<Scope>('mine');
  const [tab, setTab] = useState<Tab>('open');
  if (!board.loaded) return <div className="empty">Loading your issues…</div>;
  const team = board.myTeam;
  const all = [...board.findings.values()];
  const mine = all.filter((f) => f.assignee === meId);
  const teamAll = team ? all.filter((f) => f.team_id === team || f.assignee === meId) : mine;
  const pool = scope === 'mine' ? mine : teamAll;
  const open = pool.filter((f) => f.state === 'open');
  const done = pool.filter((f) => f.state !== 'open');
  const shown = tab === 'open' ? open : tab === 'done' ? done : pool;
  const unassigned = teamAll.filter((f) => f.state === 'open' && !f.assignee).length;
  const chip = (on: boolean, l: string, n: number, click: () => void) => <button key={l} type="button" className="fchip" aria-pressed={on} onClick={click}>{l}<span className="n">{n}</span></button>;

  const byReview = new Map<string, Finding[]>();
  shown.forEach((f) => { (byReview.get(f.review_id) ?? byReview.set(f.review_id, []).get(f.review_id)!).push(f); });
  const reviews = sortReviews([...byReview.keys()].map((id) => board.reviews.get(id)).filter((r): r is NonNullable<typeof r> => !!r));

  return (
    <>
      <div className="toolbar">
        <h2 style={{ fontSize: 18, marginRight: 6 }}>{team ? board.teamName(team) + ' inbox' : 'My issues'}</h2>
        {team && <div className="chips">{chip(scope === 'mine', 'Mine', mine.filter((f) => f.state === 'open').length, () => setScope('mine'))}{chip(scope === 'team', 'Whole team', teamAll.filter((f) => f.state === 'open').length, () => setScope('team'))}</div>}
        <div className="chips">{chip(tab === 'open', 'Open', open.length, () => setTab('open'))}{chip(tab === 'done', 'Done', done.length, () => setTab('done'))}{chip(tab === 'all', 'All', pool.length, () => setTab('all'))}</div>
      </div>
      {!team && <div className="note-bar" style={{ marginBottom: 12 }}>You are not in a team yet, so only findings assigned to you personally show here. Ask an admin to set your team.</div>}
      {team && scope === 'mine' && unassigned > 0 && <div className="note-bar" style={{ marginBottom: 12 }}>{unassigned} open {unassigned === 1 ? 'finding' : 'findings'} of {board.teamName(team)} {unassigned === 1 ? 'is' : 'are'} not assigned to anyone. <button type="button" className="btn sm" onClick={() => { setScope('team'); setTab('open'); }}>See the whole team</button></div>}
      {pool.length === 0 ? (
        <div className="empty"><h3>{scope === 'mine' ? 'Nothing assigned to you' : 'Nothing for ' + board.teamName(team)}</h3>{scope === 'mine' && team ? 'Findings routed to ' + board.teamName(team) + ' appear under "Whole team"; take one to make it yours.' : 'When the UX team routes a finding to your team it appears here.'}</div>
      ) : shown.length === 0 ? (
        <div className="empty">{tab === 'open' ? 'Nothing open. Everything is solved or marked.' : 'Nothing here yet.'}</div>
      ) : reviews.map((r) => {
        const list = (byReview.get(r.id) ?? []).sort((a, b) => (b.sev - a.sev) || (a.sort_order - b.sort_order));
        return (
          <section className="fsec" key={r.id} style={{ marginBottom: 22 }}>
            <div className="rhead" style={{ marginBottom: 8 }}>
              <div>
                <h3 style={{ fontSize: 17, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{r.flow}<span className="chip plat">{board.appName(r.app_id)}</span><span className="chip plat">{r.platform}</span></h3>
                <div className="rsub"><span className={'pill st-' + r.status}>{STATUS[r.status]}</span><span>{list.length} {tab === 'all' ? 'findings' : tab === 'open' ? 'open' : 'done'}{r.delivered_at && <> · delivered {fmtDate(r.delivered_at)}</>}{(r.reviewer || r.reviewer_label) && <> · reviewer: {board.nameOf(r.reviewer, r.reviewer_label)}</>}</span></div>
              </div>
              <div className="actions"><CopyLink id={r.id} small /></div>
            </div>
            <div className="list">{list.map((f) => <FindingRow key={f.id} f={f} board={board} meId={meId} onEdit={() => undefined} onOpenImage={onOpenImage} />)}</div>
          </section>
        );
      })}
    </>
  );
}
