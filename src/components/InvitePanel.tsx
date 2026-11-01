import { useState, type FormEvent } from 'react';
import type { Board } from '../hooks/useBoard';
import { ALLOWED_DOMAIN } from '../lib/supabase';
import { GRANTABLE_ROLES, ROLES, type Role } from '../lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/** Any member can invite a WalaPlus account. The invitation waits for an admin, who approves it and sets the role. */
export function InvitePanel({ board, onClose }: { board: Board; onClose: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('engineer');
  const [apps, setApps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!v.endsWith('@' + ALLOWED_DOMAIN)) return toast(`Only ${ALLOWED_DOMAIN} addresses.`);
    if (role === 'product_owner' && !apps.length) return toast('Pick at least one product for a Product Owner.');
    setBusy(true);
    const res = await board.invite(v, role, role === 'product_owner' ? apps : []);
    setBusy(false);
    if (!res.ok) return toast(res.error === 'already invited' ? 'That address is already invited or a member.' : 'Could not invite: ' + res.error);
    setDone(v); setEmail(''); setApps([]);
  };

  return (
    <Sheet title="Invite a colleague" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="hint" style={{ margin: 0 }}>Any {ALLOWED_DOMAIN} account can sign in. Your invitation records who should get which role; an admin approves it and the account is active from then on. Until then the person sees "Waiting admin approval" (review links still open for them).</p>
        {done && <div className="note-bar" style={{ marginTop: 10 }}>Invitation for <b>{done}</b> recorded as <b>{ROLES[role]}</b>, waiting for an admin. They can sign in with Google now.</div>}
        <div className="fld" style={{ marginTop: 10 }}><div className="opts" style={{ gap: 8 }}>
          <input type="email" id="inv-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={'name@' + ALLOWED_DOMAIN} style={{ flex: '1 1 200px', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)' }} dir="ltr" autoFocus />
          <select className="ctl" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Suggested role">{GRANTABLE_ROLES.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select>
          <button type="submit" className="btn primary" disabled={busy || !email.trim()}>Invite</button>
        </div>
        {role === 'product_owner' && (
          <div className="opts" style={{ marginTop: 6 }}><span className="hint">Products:</span>{board.apps.map((a) => <label key={a.id}><input type="checkbox" checked={apps.includes(a.id)} onChange={(e) => setApps(e.target.checked ? [...apps, a.id] : apps.filter((x) => x !== a.id))} />{a.name}</label>)}</div>
        )}</div>
        <div className="sheet-f"><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </form>
    </Sheet>
  );
}
