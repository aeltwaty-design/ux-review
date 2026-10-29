import { useEffect, useState, type FormEvent } from 'react';
import type { Board } from '../hooks/useBoard';
import { ALLOWED_DOMAIN } from '../lib/supabase';
import { ROLES, type Role, type RoleAssignment } from '../lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/** Admin only. Invite people by email (required before they can sign in), set roles, remove or restore access. */
export function PeoplePanel({ board, meId, onClose }: { board: Board; meId: string | null; onClose: () => void }) {
  const toast = useToast();
  const [invites, setInvites] = useState<RoleAssignment[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('engineer');
  const [busy, setBusy] = useState(false);
  const refresh = () => board.listAssignments().then(setInvites);
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const people = [...board.profiles.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const signedIn = new Set(people.map((p) => p.email.toLowerCase()));

  const change = async (id: string, r: Role) => { const res = await board.setRole(id, r); toast(res.ok ? 'Role updated.' : 'Could not change the role: ' + res.error); };
  const toggleAccess = async (id: string, active: boolean, em: string) => {
    const res = await board.setActive(id, active);
    if (!res.ok) return toast('Could not change access: ' + res.error);
    if (!active) await board.removeAssignment(em.toLowerCase()); else await board.assignRole(em, board.profiles.get(id)?.role ?? 'engineer');
    toast(active ? 'Access restored.' : 'Access removed.'); refresh();
  };
  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!v.endsWith('@' + ALLOWED_DOMAIN)) return toast(`Only ${ALLOWED_DOMAIN} addresses.`);
    setBusy(true);
    const res = await board.assignRole(v, role);
    setBusy(false);
    if (!res.ok) return toast('Could not save: ' + res.error);
    const existing = people.find((p) => p.email.toLowerCase() === v);
    if (existing) { await board.setRole(existing.id, role); if (!existing.active) await board.setActive(existing.id, true); }
    setEmail(''); toast(existing ? 'Updated.' : 'Invited. They can sign in now.'); refresh();
  };
  const uninvite = async (em: string) => { const res = await board.removeAssignment(em); if (!res.ok) toast('Could not remove: ' + res.error); refresh(); };

  return (
    <Sheet title="People and access" onClose={onClose}>
      <form onSubmit={invite}>
        <p className="hint" style={{ margin: 0 }}>Invitation only: a {ALLOWED_DOMAIN} account can sign in only after it is invited here. Engineers raise requests and mark fixes; the UX team starts, delivers and closes reviews and writes findings; admins also manage this list.</p>
        <h3 style={{ fontSize: 15, margin: '6px 0 0' }}>Invite</h3>
        <div className="fld"><div className="opts" style={{ gap: 8 }}>
          <input type="email" id="in-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={'name@' + ALLOWED_DOMAIN} style={{ flex: '1 1 200px', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)' }} dir="ltr" />
          <select className="ctl" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">{(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select>
          <button type="submit" className="btn primary" disabled={busy || !email.trim()}>Invite</button>
        </div></div>
        {invites.filter((a) => !signedIn.has(a.email)).length > 0 && <h3 style={{ fontSize: 15, margin: '10px 0 0' }}>Invited, not signed in yet</h3>}
        {invites.filter((a) => !signedIn.has(a.email)).map((a) => (
          <div key={a.email} className="brow" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
            <span className="hint" style={{ overflowWrap: 'anywhere' }}>{a.email}</span><span className="chip type">{ROLES[a.role]}</span>
            <button type="button" className="btn sm" onClick={() => uninvite(a.email)}>Cancel invite</button>
          </div>
        ))}
        <h3 style={{ fontSize: 15, margin: '10px 0 0' }}>Members</h3>
        {people.length === 0 && <p className="hint">Nobody has signed in yet.</p>}
        {people.map((p) => (
          <div key={p.id} className="brow" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto', opacity: p.active ? 1 : 0.6 }}>
            <span style={{ minWidth: 0 }}><strong>{p.name || p.email}</strong>{p.id === meId && ' (you)'}{!p.active && <span className="chip fs-wontfix" style={{ marginLeft: 6 }}>access removed</span>}<br /><span className="hint">{p.email}</span></span>
            <select className="ctl" value={p.role} disabled={!p.active} onChange={(e) => change(p.id, e.target.value as Role)} aria-label={'Role of ' + (p.name || p.email)}>
              {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            </select>
            {p.id === meId ? <span /> : p.active
              ? <button type="button" className="btn sm danger" onClick={() => toggleAccess(p.id, false, p.email)}>Remove access</button>
              : <button type="button" className="btn sm" onClick={() => toggleAccess(p.id, true, p.email)}>Restore</button>}
          </div>
        ))}
        <div className="sheet-f"><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </form>
    </Sheet>
  );
}
