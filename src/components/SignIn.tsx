import { ALLOWED_DOMAIN } from '../lib/supabase';

export function SignIn({ onSignIn, error }: { onSignIn: () => void; error: string | null }) {
  return (
    <div className="signin"><div className="signin-card">
      <h2>UX Reviews</h2>
      <p>The UX team reviews every build and routes each finding to the team that owns it — Engineering, Data, Marketing, Marketplace, Support, Success, Business, Management — and everyone tracks what is solved. Sign in with your {ALLOWED_DOMAIN} Google account. Anyone at WalaPlus can open a review link; the board itself opens once an admin approves your account.</p>
      {error && <div className="note-bar" style={{ marginBottom: 14 }}>{error}</div>}
      <button className="btn primary" type="button" onClick={onSignIn}>Sign in with Google</button>
    </div></div>
  );
}
