import type { User } from '@supabase/supabase-js';
import type { Profile } from '../lib/types';

export function TopBar({ user, profile, onNew, onSignOut }: { user: User | null; profile: Profile | null; onNew: () => void; onSignOut: () => void }) {
  const name = profile?.name || user?.user_metadata?.full_name || user?.email || '';
  const avatar = profile?.avatar_url || user?.user_metadata?.avatar_url || '';
  return (
    <header className="top"><div className="top-in">
      <div className="brand"><span className="eyebrow">Engineering ↔ UX · all apps</span><h1>UX Reviews</h1></div>
      <nav>
        {user && <a className="btn" href="#queue">Queue</a>}
        {user && <button className="btn primary" type="button" onClick={onNew}>Request a review</button>}
        {user && (
          <span className="me">{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : null}<span>{name}</span>
            <button className="btn sm" type="button" onClick={onSignOut}>Sign out</button></span>
        )}
      </nav>
    </div></header>
  );
}
