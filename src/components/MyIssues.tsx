import { useState } from 'react';
import type { Board } from '../hooks/useBoard';
import { fmtDate, sortReviews } from '../lib/format';
import { STATUS, type Finding } from '../lib/types';
import { FindingRow } from './FindingRow';

type Tab = 'open' | 'done' | 'all';

/** The engineer's whole board: only the findings assigned to them, grouped by review. */
export function MyIssues({ board, meId, onOpenImage }: { board: Board; meId: string | null; onOpenImage: (src: string, cap: string) => void }) {
  const [tab, setTab] = useState<Tab>('open');
  if (!board.loaded) return <div className="empty">Loading your issues…</div>;
  const mine = [...board.findings.values()].filter((f) => f.assignee === meId);
  const open = mine.filter((f) => f.state === 'open');
  const done = mine.filter((f) => f.state !== 'open');
  const shown = tab === 'open' ? open : tab === 'done' ? done : mine;
  const chip = (k: Tab, l: string, n: number) => <button key={k} type="button" className="fchip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}<span className="n">{n}</span></button>;

  const byReview = new Map<string, Finding[]>();
  shown.forEach((f) => { (byReview.get(f.review_id) ?? byReview.set(f.review_id, []).get(f.review_id)!).push(f); });
  const reviews = sortReviews([...byReview.keys()].map((id) => board.reviews.get(id)).filter((r): r is NonNullable<typeof r> => !!r));

  return (
    <>
      <div className="toolbar"><h2 style={{ fontSize: 18, marginRight: 6 }}>My issues</h2><div className="chips">{chip('open', 'Open', open.length)}{chip('done', 'Done', done.length)}{chip('all', 'All', mine.length)}</div></div>
      {mine.length === 0 ? (
        <div className="empty"><h3>No issues assigned to you</h3>When the UX team assigns you a finding it appears here.</div>
      ) : shown.length === 0 ? (
        <div className="empty">{tab === 'open' ? 'Nothing open. All your issues are solved or marked.' : 'Nothing here yet.'}</div>
      ) : reviews.map((r) => {
        const list = (byReview.get(r.id) ?? []).sort((a, b) => (b.sev - a.sev) || (a.sort_order - b.sort_order));
        return (
          <section className="fsec" key={r.id} style={{ marginBottom: 22 }}>
            <div className="rhead" style={{ marginBottom: 8 }}>
              <div>
                <h3 style={{ fontSize: 17, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{r.flow}<span className="chip plat">{board.appName(r.app_id)}</span><span className="chip plat">{r.platform}</span></h3>
                <div className="rsub"><span className={'pill st-' + r.status}>{STATUS[r.status]}</span><span>{list.length} of your {tab === 'all' ? 'issues' : tab === 'open' ? 'open issues' : 'done issues'}{r.delivered_at && <> · delivered {fmtDate(r.delivered_at)}</>}{(r.reviewer || r.reviewer_label) && <> · reviewer: {board.nameOf(r.reviewer, r.reviewer_label)}</>}</span></div>
              </div>
            </div>
            <div className="list">{list.map((f) => <FindingRow key={f.id} f={f} board={board} meId={meId} onEdit={() => undefined} onOpenImage={onOpenImage} />)}</div>
          </section>
        );
      })}
    </>
  );
}
