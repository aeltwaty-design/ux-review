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
import { ToastContext, useToastState } from './components/Toast';

export type Panel = { kind: 'request'; review?: Review } | { kind: 'finding'; reviewId: string; finding?: Finding } | null;

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
  const closePanel = useCallback(() => setPanel(null), []);

  if (!configured) {
    return <div className="signin"><div className="signin-card"><h2>UX Reviews is not configured</h2><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code> and the README), then rebuild.</p></div></div>;
  }

  return (
    <ToastContext.Provider value={toastState.toast}>
      <TopBar user={auth.user} profile={meId ? board.profiles.get(meId) ?? null : null} onNew={() => setPanel({ kind: 'request' })} onSignOut={auth.signOut} />
      {!auth.ready ? null : !auth.session ? (
        <SignIn onSignIn={auth.signIn} error={auth.authError} />
      ) : (
        <div className="wrap">
          {board.error && <div className="note-bar" style={{ marginBottom: 12 }}>The board could not load: {board.error}. Reload the page.</div>}
          <Kpis board={board} />
          {openReview ? (
            <ReviewPage review={openReview} board={board} meId={meId} onEditRequest={(r) => setPanel({ kind: 'request', review: r })}
              onAddFinding={(rid) => setPanel({ kind: 'finding', reviewId: rid })} onEditFinding={(f) => setPanel({ kind: 'finding', reviewId: f.review_id, finding: f })}
              onOpenImage={(src, cap) => setLightbox({ src, cap })} />
          ) : (
            <Queue board={board} missing={missing} onNew={() => setPanel({ kind: 'request' })} />
          )}
        </div>
      )}
      {panel?.kind === 'request' && <RequestForm review={panel.review} board={board} meId={meId} onClose={closePanel} />}
      {panel?.kind === 'finding' && <FindingForm reviewId={panel.reviewId} finding={panel.finding} board={board} meId={meId} onClose={closePanel} />}
      {lightbox && <Lightbox src={lightbox.src} cap={lightbox.cap} onClose={() => setLightbox(null)} />}
      {toastState.message && <div className="toast" role="status">{toastState.message}</div>}
    </ToastContext.Provider>
  );
}
