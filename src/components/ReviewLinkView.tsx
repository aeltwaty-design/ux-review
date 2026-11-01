import { useEffect, useState } from 'react';
import { useSignedUrl } from '../hooks/useBoard';
import { fmtDate } from '../lib/format';
import { supabase } from '../lib/supabase';
import { FSTATE, SEV, STATUS, type Finding, type Review, type ShotRef } from '../lib/types';
import { Md } from './Md';
import { CopyLink } from './CopyLink';

type Payload = { review: Review; findings: Finding[]; people: Record<string, string>; app: string; teams?: Record<string, string> };

/** Read-only view of one review, for anyone at WalaPlus who has its link. Loaded through review_by_link, never the tables. */
export function ReviewLinkView({ reviewId, meId, hasBoard, onOpenImage }: { reviewId: string; meId: string | null; hasBoard: boolean; onOpenImage: (src: string, cap: string) => void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ok'; data: Payload }>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    supabase.rpc('review_by_link', { rid: reviewId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setState({ status: 'error', message: error.message });
      else if (!data) setState({ status: 'missing' });
      else setState({ status: 'ok', data: data as Payload });
    });
    return () => { cancelled = true; };
  }, [reviewId]);

  if (state.status === 'loading') return <div className="empty">Loading the review…</div>;
  if (state.status === 'missing') return <div className="empty"><h3>No such review</h3>The link may be wrong, or the request was withdrawn.</div>;
  if (state.status === 'error') return <div className="empty"><h3>Could not open this review</h3>{state.message}</div>;
  const { review: r, findings, people, app, teams = {} } = state.data;
  const who = (id: string | null | undefined, label?: string | null) => (id && people[id]) || label || '—';
  const dd = (label: string, v: React.ReactNode, wide = false) => (v ? <div className={wide ? 'wide' : undefined}><dt>{label}</dt><dd>{v}</dd></div> : null);
  const link = (u: string) => <a href={u} target="_blank" rel="noopener noreferrer">{u.replace(/^https?:\/\//, '').slice(0, 60)}{u.length > 68 ? '…' : ''}</a>;
  const open = findings.filter((f) => f.state === 'open').length;
  const mine = meId ? findings.filter((f) => f.assignee === meId && f.state === 'open').length : 0;

  return (
    <>
      {hasBoard && <a className="back" href="#queue">← Back</a>}
      {mine > 0 && <div className="note-bar" style={{ marginBottom: 12 }}>{mine} of these findings {mine === 1 ? 'is' : 'are'} assigned to you. This is the read-only view: mark them solved from <a href="#queue">your board</a>.</div>}
      <div className="rhead">
        <div>
          <h2>{r.flow}<span className="chip plat">{app}</span><span className="chip plat">{r.platform}</span></h2>
          <div className="rsub"><span className={'pill st-' + r.status}>{STATUS[r.status]}</span><span>Requested by {who(r.requested_by, r.requester_label)} on {fmtDate(r.created_at)}</span><span className="chip type">read-only</span></div>
        </div>
        <div className="actions"><CopyLink id={r.id} /></div>
      </div>
      <dl className="meta">
        {dd('Reviewer', <>{who(r.reviewer, r.reviewer_label)}{r.started_at && <> · started {fmtDate(r.started_at)}</>}</>)}
        {dd('Delivered', r.delivered_at ? `${fmtDate(r.delivered_at)} · ${findings.length} findings` : r.status === 'requested' ? 'not started' : 'in progress')}
        {dd('Closed', r.closed_at ? fmtDate(r.closed_at) : '')}
        {dd('Build', r.build && <Md text={r.build} />)}
        {dd('Figma', r.figma && link(r.figma))}
        {dd('Languages', (r.languages || []).join(', '))}
        {dd('Related story', r.story && <Md text={r.story} />)}
        {dd('Screens', r.screens, true)}
        {dd('How to reach the flow', r.reach && <Md text={r.reach} />, true)}
      </dl>
      <section className="fsec">
        <h3>Findings <span className="hint">{open} open · {findings.length - open} solved or marked</span></h3>
        {findings.length === 0 ? <div className="empty"><h3>No findings yet</h3>The reviewer adds findings here when the review is done.</div> : (
          <div className="list">{findings.map((f) => <ReadOnlyFinding key={f.id} f={f} who={who} teams={teams} onOpenImage={onOpenImage} />)}</div>
        )}
      </section>
    </>
  );
}

function ReadOnlyFinding({ f, who, teams, onOpenImage }: { f: Finding; who: (id: string | null | undefined, label?: string | null) => string; teams: Record<string, string>; onOpenImage: (src: string, cap: string) => void }) {
  const st = f.state || 'open';
  const meta = [
    f.team_id ? 'Team: ' + (teams[f.team_id] || f.team_id) : '',
    f.assignee ? 'Assigned to ' + who(f.assignee) : '',
    st !== 'open' ? `${FSTATE[st]} by ${who(f.state_by, f.state_label)}${f.state_at ? ' · ' + fmtDate(f.state_at) : ''}` : '',
    f.note ? 'Note: ' + f.note : '',
  ].filter(Boolean).join(' · ');
  return (
    <article className={`fnd sev-${f.sev} fs-${st}`}>
      <div className="fcheck" aria-hidden="true"><input type="checkbox" checked={st === 'solved'} disabled readOnly /><span>Solved</span></div>
      <div className="fbody">
        <div className="fhead">
          <span className="code">{f.code}</span><span className={`chip sev-${f.sev}`}>{SEV[f.sev]}</span>
          {f.type && <span className="chip type">{f.type}</span>}{f.lang && <span className="chip lang">{f.lang}</span>}
          {(st === 'wontfix' || st === 'design') && <span className={'chip fs-' + st}>{FSTATE[st]}</span>}
          <span className="fscreen">{[f.flow, f.screen].filter(Boolean).join(' › ')}</span>
        </div>
        <div className="fdesc" dir="auto"><Md text={f.description} /></div>
        {(f.prod || f.figma) && <div className="frefs">{[f.prod && 'Prod: ' + f.prod, f.figma && 'Figma: ' + f.figma].filter(Boolean).join(' · ')}</div>}
        {(f.images || []).length > 0 && <div className="shots">{(f.images || []).map((im) => <ReadOnlyShot key={im.path} im={im} onOpen={onOpenImage} />)}</div>}
        {meta && <div className="fmeta">{meta}</div>}
      </div>
    </article>
  );
}

function ReadOnlyShot({ im, onOpen }: { im: ShotRef; onOpen: (src: string, cap: string) => void }) {
  const url = useSignedUrl(im.path);
  const [missing, setMissing] = useState(false);
  if (missing) return <span className="shot missing">Image not available</span>;
  return (
    <button type="button" className="shot" onClick={() => url && onOpen(url, im.name)} aria-label={'Open ' + im.name}>
      {url ? <img src={url} alt={im.name} loading="lazy" onError={() => setMissing(true)} /> : <span style={{ display: 'block', width: 96, height: 96 }} />}
      <span className="cap">{im.name}</span>
    </button>
  );
}
