import { useEffect, useState, type FormEvent } from 'react';
import type { Board } from '../hooks/useBoard';
import { ALLOWED_DOMAIN } from '../lib/supabase';
import { GRANTABLE_ROLES, ROLES, type Role, type RoleAssignment } from '../lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/** Admin only. Approve waiting accounts and set their roles, invite people directly, change roles and products, remove or restore access. */
export function PeoplePanel({ board, meId, onClose }: { board: Board; meId: string | null; onClose: () => void }) {
  const toast = useToast();
  const [invites, setInvites] = useState<RoleAssignment[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('engineer');
  const [inviteApps, setInviteApps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = () => board.listAssignments().then(setInvites);
  useEffect(() => { refresh(); }, [board.profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = [...board.profiles.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const signedIn = new Set(people.map((p) => p.email.toLowerCase()));
  const inviteOf = (em: string) => invites.find((a) => a.email === em.toLowerCase());
  const waitingProfiles = people.filter((p) => p.role === 'pending' && p.active);
  const waitingInvites = invites.filter((a) => !a.approved && !signedIn.has(a.email));
  const approvedInvites = invites.filter((a) => a.approved && !signedIn.has(a.email));

  const change = async (id: string, r: Role) => { const res = await board.setRole(id, r); toast(res.ok ? 'Role updated.' : 'Could not change the role: ' + res.error); };
  const toggleApp = async (id: string, appId: string, on: boolean) => {
    const cur = board.profileApps.get(id) ?? [];
    const next = on ? [...new Set([...cur, appId])] : cur.filter((a) => a !== appId);
    const res = await board.setProfileAppIds(id, next);
    if (!res.ok) toast('Could not change products: ' + res.error);
  };
  const toggleAccess = async (id: string, active: boolean, em: string) => {
    const res = await board.setActive(id, active);
    if (!res.ok) return toast('Could not change access: ' + res.error);
    if (!active) await board.removeAssignment(em.toLowerCase()); else await board.assignRole(em, board.profiles.get(id)?.role ?? 'engineer', board.profileApps.get(id) ?? []);
    toast(active ? 'Access restored.' : 'Access removed.'); refresh();
  };
  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!v.endsWith('@' + ALLOWED_DOMAIN)) return toast(`Only ${ALLOWED_DOMAIN} addresses.`);
    if (role === 'product_owner' && !inviteApps.length) return toast('Pick at least one product for a Product Owner.');
    setBusy(true);
    const res = await board.assignRole(v, role, role === 'product_owner' ? inviteApps : []);
    setBusy(false);
    if (!res.ok) return toast('Could not save: ' + res.error);
    const existing = people.find((p) => p.email.toLowerCase() === v);
    if (existing && existing.role !== 'pending') {
      await board.setRole(existing.id, role);
      if (role === 'product_owner') await board.setProfileAppIds(existing.id, inviteApps);
      if (!existing.active) await board.setActive(existing.id, true);
    }
    setEmail(''); setInviteApps([]); toast(existing ? 'Approved.' : 'Invited and approved. They can sign in now.'); refresh();
  };
  const uninvite = async (em: string) => { const res = await board.removeAssignment(em); if (!res.ok) toast('Could not remove: ' + res.error); refresh(); };
  const appNames = (ids: string[]) => ids.map((a) => board.appName(a)).join(', ');
  const invitedBy = (a?: RoleAssignment) => (a?.invited_by ? ' · invited by ' + board.nameOf(a.invited_by, null) : '');

  return (
    <Sheet title="People and access" onClose={onClose}>
      <form onSubmit={invite}>
        <p className="hint" style={{ margin: 0 }}>Any {ALLOWED_DOMAIN} account can sign in; it waits here until you approve it and set its role. Members can invite colleagues with a suggested role; you confirm or change it. Engineers see and fix the findings assigned to them. Product Owners see everything about their products and assign findings. The UX team raises, runs and delivers reviews; admins also close them and manage this list.</p>

        {(waitingProfiles.length > 0 || waitingInvites.length > 0) && <h3 style={{ fontSize: 15, margin: '10px 0 0' }}>Waiting admin approval <span className="chip sev-3" style={{ marginLeft: 6 }}>{waitingProfiles.length + waitingInvites.length}</span></h3>}
        {waitingProfiles.map((p) => <ApproveRow key={p.id} email={p.email} title={p.name || p.email} sub={p.email + invitedBy(inviteOf(p.email))} suggested={inviteOf(p.email)} board={board} onApprove={refresh} onDecline={() => toggleAccess(p.id, false, p.email)} declineLabel="Decline" />)}
        {waitingInvites.map((a) => <ApproveRow key={a.email} email={a.email} title={a.email} sub={'not signed in yet' + invitedBy(a)} suggested={a} board={board} onApprove={refresh} onDecline={() => uninvite(a.email)} declineLabel="Cancel invite" />)}

        <h3 style={{ fontSize: 15, margin: '10px 0 0' }}>Invite and approve at once</h3>
        <div className="fld"><div className="opts" style={{ gap: 8 }}>
          <input type="email" id="in-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={'name@' + ALLOWED_DOMAIN} style={{ flex: '1 1 200px', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)' }} dir="ltr" />
          <select className="ctl" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">{GRANTABLE_ROLES.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select>
          <button type="submit" className="btn primary" disabled={busy || !email.trim()}>Invite</button>
        </div>
        {role === 'product_owner' && (
          <div className="opts" style={{ marginTop: 6 }}><span className="hint">Products:</span>{board.apps.map((a) => <label key={a.id}><input type="checkbox" checked={inviteApps.includes(a.id)} onChange={(e) => setInviteApps(e.target.checked ? [...inviteApps, a.id] : inviteApps.filter((x) => x !== a.id))} />{a.name}</label>)}</div>
        )}</div>
        {approvedInvites.length > 0 && <h3 style={{ fontSize: 15, margin: '10px 0 0' }}>Approved, not signed in yet</h3>}
        {approvedInvites.map((a) => (
          <div key={a.email} className="brow" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
            <span className="hint" style={{ overflowWrap: 'anywhere' }}>{a.email}{a.role === 'product_owner' && a.apps?.length ? ' · ' + appNames(a.apps) : ''}</span><span className="chip type">{ROLES[a.role]}</span>
            <button type="button" className="btn sm" onClick={() => uninvite(a.email)}>Cancel invite</button>
          </div>
        ))}
        <h3 style={{ fontSize: 15, margin: '10px 0 0' }}>Members</h3>
        {people.filter((p) => p.role !== 'pending').length === 0 && <p className="hint">Nobody has been approved yet.</p>}
        {people.filter((p) => p.role !== 'pending').map((p) => (
          <div key={p.id} style={{ opacity: p.active ? 1 : 0.6 }}>
            <div className="brow" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
              <span style={{ minWidth: 0 }}><strong>{p.name || p.email}</strong>{p.id === meId && ' (you)'}{!p.active && <span className="chip fs-wontfix" style={{ marginLeft: 6 }}>access removed</span>}<br /><span className="hint">{p.email}</span></span>
              <select className="ctl" value={p.role} disabled={!p.active} onChange={(e) => change(p.id, e.target.value as Role)} aria-label={'Role of ' + (p.name || p.email)}>
                {GRANTABLE_ROLES.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
              </select>
              {p.id === meId ? <span /> : p.active
                ? <button type="button" className="btn sm danger" onClick={() => toggleAccess(p.id, false, p.email)}>Remove access</button>
                : <button type="button" className="btn sm" onClick={() => toggleAccess(p.id, true, p.email)}>Restore</button>}
            </div>
            {p.role === 'product_owner' && p.active && (
              <div className="opts" style={{ margin: '2px 0 8px' }}><span className="hint">Products:</span>{board.apps.map((a) => <label key={a.id}><input type="checkbox" checked={(board.profileApps.get(p.id) ?? []).includes(a.id)} onChange={(e) => toggleApp(p.id, a.id, e.target.checked)} />{a.name}</label>)}</div>
            )}
          </div>
        ))}
        <div className="sheet-f"><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </form>
    </Sheet>
  );
}

/** One waiting account or invitation: pick the role (prefilled with the inviter's suggestion) and approve, or decline. */
function ApproveRow({ email, title, sub, suggested, board, onApprove, onDecline, declineLabel }: { email: string; title: string; sub: string; suggested?: RoleAssignment; board: Board; onApprove: () => void; onDecline: () => void; declineLabel: string }) {
  const toast = useToast();
  const [role, setRole] = useState<Role>(suggested?.role && suggested.role !== 'pending' ? suggested.role : 'engineer');
  const [apps, setApps] = useState<string[]>(suggested?.apps ?? []);
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    if (role === 'product_owner' && !apps.length) return toast('Pick at least one product for a Product Owner.');
    setBusy(true);
    const res = await board.assignRole(email, role, role === 'product_owner' ? apps : []);
    setBusy(false);
    if (!res.ok) return toast('Could not approve: ' + res.error);
    toast(`Approved ${email} as ${ROLES[role]}.`); onApprove();
  };
  return (
    <div>
      <div className="brow" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto auto' }}>
        <span style={{ minWidth: 0 }}><strong>{title}</strong><br /><span className="hint" style={{ overflowWrap: 'anywhere' }}>{sub}</span></span>
        <select className="ctl" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label={'Role for ' + email}>{GRANTABLE_ROLES.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}</select>
        <button type="button" className="btn sm primary" disabled={busy} onClick={approve}>Approve</button>
        <button type="button" className="btn sm" onClick={onDecline}>{declineLabel}</button>
      </div>
      {role === 'product_owner' && (
        <div className="opts" style={{ margin: '2px 0 8px' }}><span className="hint">Products:</span>{board.apps.map((a) => <label key={a.id}><input type="checkbox" checked={apps.includes(a.id)} onChange={(e) => setApps(e.target.checked ? [...apps, a.id] : apps.filter((x) => x !== a.id))} />{a.name}</label>)}</div>
      )}
    </div>
  );
}
