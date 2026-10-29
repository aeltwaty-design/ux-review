import { useEffect, useState, type FormEvent } from 'react';
import type { Board } from '../hooks/useBoard';
import { ALLOWED_DOMAIN } from '../lib/supabase';
import { ROLES, type Role, type RoleAssignment } from '../lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/** Admin only: change the role of people who have signed in, and pre-assign roles by email for people who have not yet. */
export function PeoplePanel({ board, meId, onClose }: { board: Board; meId: string | null; onClose: () => void }) {
  const toast = useToast();
  const [pending, setPending] = useState<RoleAssignment[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('ux');
  const [busy, setBusy] = useState(false);
  const refresh = () => board.listAssignments().then(setPending);
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const people = [...board.profiles.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const signedIn = new Set(people.map((p) => p.email.toLowerCase()));

  const change = async (id: string, r: Role) => { const res = await board.setRole(id, r); toast(res.ok ? 'Role updated.' : 'Could not change the role: ' + res.error); };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!v.endsWith('@' + ALLOWED_DOMAIN)) return toast(`Only ${ALLOWED_DOMAIN} addresses.`);
    setBusy(true);
    const res = await board.assignRole(v, role);
    setBusy(false);
    if (!res.ok) return toast('Could not save: ' + res.error);
    const existing = people.find((p) => p.email.toLowerCase() === v);
    if (existing) await board.setRole(existing.id, role);
    setEmail(''); toast(existing ? 'Role updated.' : 'Saved. The role applies when they first sign in.'); refresh();
  };
  const remove = async (em: string) => { const res = await board.removeAssignment(em); if (!res.ok) toast('Could not remove: ' + res.error); refresh(); };

  return (
    <Sheet title="People and roles" onClose={onClose}>
      <form onSubmit={add}>
        <p className="hint" style={{ margin: 0 }}>Engineers raise requests and mark fixes. The UX team starts, delivers and closes reviews and writes findings. Admins also manage this list.</p>
        <h3 style={{ fontSize: 15, margin: '6px 0 0' }}>Signed in</h3>
        {people.length === 0 && <p className="hint">Nobody has signed in yet.</p>}
        {people.map((p) => (
          <div key={p.id} className="brow" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <span style={{ minWidth: 0 }}><strong>{p.name || p.email}</strong>{p.id === meId && ' (you)'}<br /><span className="hint">{p.email}</span></span>
            <select className="ctl" value={p.role} onChange={(e) => change(p.id, e.target.value as Role)} aria-label={'Role of ' + (p.name || p.email)}>
              {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            </select>
          </div>
        ))}
        <h3 style={{ fontSize: 15, margin: '10px 0 0' }}>Assign by email</h3>
        <p className="hint" style={{ margin: 0 }}>For colleagues who have not signed in yet; the role is applied at their first sign-in.</p>
        <div className="fld"><div className="opts" style={{ gap: 8 }}>
          <input type="email" id="in-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={'name@' + ALLOWED_DOMAIN} style={{ flex: '1 1 200px', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)' }} dir="ltr" />
          <select className="ctl" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">{(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select>
          <button type="submit" className="btn primary" disabled={busy || !email.trim()}>Save</button>
        </div></div>
        {pending.filter((a) => !signedIn.has(a.email)).map((a) => (
          <div key={a.email} className="brow" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
            <span className="hint" style={{ overflowWrap: 'anywhere' }}>{a.email}</span><span className="chip type">{ROLES[a.role]}</span>
            <button type="button" className="btn sm" onClick={() => remove(a.email)}>Remove</button>
          </div>
        ))}
        <div className="sheet-f"><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </form>
    </Sheet>
  );
}
