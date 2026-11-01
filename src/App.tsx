import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useBoard } from './hooks/useBoard';
import { configured } from './lib/supabase';
import type { Finding, Review } from './lib/types';
import { TopBar } from './components/TopBar';
import { SignIn } from './components/SignIn';
import { Kpis } from './components/Kpis';
import { Queue } from './components/Queue';
import { ReviewPage } from './components/ReviewPage';
import { RequestForm } from './components/RequestForm';
import { FindingForm } from './components/FindingForm';
import { Lightbox } from './components/Lightbox';
import { TeamInbox } from './components/TeamInbox';
import { PeoplePanel } from './components/PeoplePanel';
import { InvitePanel } from './components/InvitePanel';
import { ReviewLinkView } from './components/ReviewLinkView';
import { ToastContext, useToastState } from './components/Toast';

export type Panel = { kind: 'request'; review?: Review } | { kind: 'finding'; reviewId: string; finding?: Finding } | { kind: 'people' } | { kind: 'invite' } | null;

function useHash() {
  const [hash, setHash] = useState(() => location.hash.replace(/^#/, ''));
  useEffect(() => {
    const on = () => setHash(location.hash.replace(/^#/, ''));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const auth = useAuth();
  const meId = auth.user?.id ?? null;
  const board = useBoard(Boolean(auth.session), meId);
  const hash = useHash();
  const [panel, setPanel] = useState<Panel>(null);
  const [lightbox, setLightbox] = useState<{ src: string; cap: string } | null>(null);
  const toastState = useToastState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (lightbox) setLightbox(null); else if (panel) setPanel(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox, panel]);

  const openReview = useMemo(() => (hash && hash !== 'queue' ? board.reviews.get(hash) ?? null : null), [hash, board.reviews]);
  const missing = hash && hash !== 'queue' && board.loaded && !openReview ? hash : null;
  // A review link opened by someone whose board does not carry that review (pending, collaborator, product owner of another
  // product) is served read-only through review_by_link. UX and admins see every review, so for them a miss is a miss.
  const linkId = missing && !board.isUx ? missing : null;
  const closePanel = useCallback(() => setPanel(null), []);

  // App filter (All / WalaPlus / WalaOne / Doam …) scopes the KPIs, charts and queue; remembered per browser.
  const [appFilter, setAppFilterState] = useState<string>(() => { try { return localStorage.getItem('uxr-app') || 'all'; } catch { return 'all'; } });
  const setAppFilter = (id: string) => { setAppFilterState(id); try { localStorage.setItem('uxr-app', id); } catch { /* storage unavailable */ } };
  // A product owner's board covers only their products; the chips offer only those.
  const visibleApps = useMemo(() => (board.isPo ? board.apps.filter((a) => board.myApps.includes(a.id)) : board.apps), [board.apps, board.isPo, board.myApps]);
  const scoped = useMemo(() => {
    const ids = visibleApps.some((a) => a.id === appFilter) ? [appFilter] : board.isPo ? board.myApps : null;
    if (!ids) return board;
    const reviews = new Map([...board.reviews].filter(([, r]) => ids.includes(r.app_id)));
    const findings = new Map([...board.findings].filter(([, f]) => reviews.has(f.review_id)));
    return { ...board, reviews, findings };
  }, [board, appFilter, visibleApps]);

  if (!configured) {
    return <div className="signin"><div className="signin-card"><h2>UX Reviews is not configured</h2><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code> and the README), then rebuild.</p></div></div>;
  }

  return (
    <ToastContext.Provider value={toastState.toast}>
      <TopBar user={auth.user} profile={meId ? board.profiles.get(meId) ?? null : null} canRequest={board.isUx} showQueue={board.isUx || board.isPo} onNew={() => setPanel({ kind: 'request' })} onPeople={board.isAdmin ? () => setPanel({ kind: 'people' }) : undefined} onInvite={!board.isAdmin && !board.isPending && !board.accessDenied && board.loaded ? () => setPanel({ kind: 'invite' }) : undefined} onSignOut={auth.signOut} />
      {!auth.ready ? null : !auth.session ? (
        <SignIn onSignIn={auth.signIn} error={auth.authError} />
      ) : board.accessDenied ? (
        <div className="signin"><div className="signin-card">
          <h2>No access</h2>
          <p>Your access to UX Reviews was removed. Ask an admin to restore it, then sign in again.</p>
          <button className="btn" type="button" onClick={auth.signOut}>Sign out</button>
        </div></div>
      ) : linkId ? (
        <div className="wrap">
          <ReviewLinkView reviewId={linkId} meId={meId} hasBoard={!board.isPending} onOpenImage={(src, cap) => setLightbox({ src, cap })} />
        </div>
      ) : board.isPending ? (
        <div className="signin"><div className="signin-card">
          <h2>Waiting for admin approval</h2>
          <p>Your account is signed in but not approved yet. An admin will approve it and set your role; this page updates by itself when that happens. Review links shared with you already open.</p>
          <button className="btn" type="button" onClick={auth.signOut}>Sign out</button>
        </div></div>
      ) : !board.isUx && !board.isPo ? (
        <div className="wrap">
          {board.error && <div className="note-bar" style={{ marginBottom: 12 }}>The board could not load: {board.error}. Reload the page.</div>}
          <TeamInbox board={board} meId={meId} onOpenImage={(src, cap) => setLightbox({ src, cap })} />
        </div>
      ) : (
        <div className="wrap">
          {board.error && <div className="note-bar" style={{ marginBottom: 12 }}>The board could not load: {board.error}. Reload the page.</div>}
          {board.isPo && visibleApps.length === 0 && <div className="note-bar" style={{ marginBottom: 12 }}>No product is assigned to you yet. Ask an admin to add your products under People.</div>}
          {visibleApps.length > 1 && (
            <div className="chips apps" role="group" aria-label="App">
              <button type="button" className="fchip" aria-pressed={!visibleApps.some((a) => a.id === appFilter)} onClick={() => setAppFilter('all')}>{board.isPo ? 'All my products' : 'All apps'}</button>
              {visibleApps.map((a) => <button key={a.id} type="button" className="fchip" aria-pressed={appFilter === a.id} onClick={() => setAppFilter(a.id)}>{a.name}</button>)}
            </div>
          )}
          <Kpis board={scoped} />
          {openReview ? (
            <ReviewPage review={openReview} board={board} meId={meId} onEditRequest={(r) => setPanel({ kind: 'request', review: r })}
              onAddFinding={(rid) => setPanel({ kind: 'finding', reviewId: rid })} onEditFinding={(f) => setPanel({ kind: 'finding', reviewId: f.review_id, finding: f })}
              onOpenImage={(src, cap) => setLightbox({ src, cap })} />
          ) : (
            <Queue board={scoped} allApps={!visibleApps.some((a) => a.id === appFilter)} missing={missing} onNew={() => setPanel({ kind: 'request' })} />
          )}
        </div>
      )}
      {panel?.kind === 'request' && <RequestForm review={panel.review} board={board} meId={meId} defaultApp={appFilter} onClose={closePanel} />}
      {panel?.kind === 'finding' && <FindingForm reviewId={panel.reviewId} finding={panel.finding} board={board} meId={meId} onClose={closePanel} />}
      {panel?.kind === 'people' && board.isAdmin && <PeoplePanel board={board} meId={meId} onClose={closePanel} />}
      {panel?.kind === 'invite' && <InvitePanel board={board} onClose={closePanel} />}
      {lightbox && <Lightbox src={lightbox.src} cap={lightbox.cap} onClose={() => setLightbox(null)} />}
      {toastState.message && <div className="toast" role="status">{toastState.message}</div>}
    </ToastContext.Provider>
  );
}
