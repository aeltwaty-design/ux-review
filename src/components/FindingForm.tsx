import { useState, type FormEvent } from 'react';
import type { Board } from '../hooks/useBoard';
import { nowIso, sanitizeCode } from '../lib/format';
import { SEV, TYPES, type Finding, type Sev } from '../lib/types';
import { Field, Sheet } from './Sheet';
import { useToast } from './Toast';

export function FindingForm({ reviewId, finding: f, board, meId, onClose }: { reviewId: string; finding?: Finding; board: Board; meId: string | null; onClose: () => void }) {
  const toast = useToast();
  const existing = [...board.findings.values()].filter((x) => x.review_id === reviewId);
  const [v, setV] = useState({ code: f?.code ?? 'F-' + String(existing.length + 1).padStart(2, '0'), screen: f?.screen ?? '', type: f?.type ?? 'Copy', sev: (f?.sev ?? 2) as Sev, lang: f?.lang ?? 'Both', description: f?.description ?? '', prod: f?.prod ?? '', figma: f?.figma ?? '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v, val: string | number) => setV((p) => ({ ...p, [k]: val }));
  const types = TYPES.includes(v.type) ? TYPES : [...TYPES, v.type];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!v.screen.trim()) er.screen = 'Required';
    if (!v.description.trim()) er.description = 'Required';
    const code = sanitizeCode(v.code.trim()) || 'F-' + Date.now().toString(36);
    const id = `${reviewId}.${code}`;
    if (!f && board.findings.has(id)) er.code = 'This code is already used in this review.';
    setErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const data = { screen: v.screen.trim(), type: v.type, sev: v.sev, lang: v.lang, description: v.description.trim(), prod: v.prod.trim(), figma: v.figma.trim() };
    let res;
    if (f) { res = await board.updateFinding(f.id, data); if (res.ok) toast('Finding updated.'); }
    else {
      const order = Math.max(0, ...existing.map((x) => x.sort_order || 0)) + 1;
      const row: Finding = { id, review_id: reviewId, code, flow_group: '', flow: '', ...data, state: 'open', state_by: null, state_label: null, state_at: null, note: '', note_by: null, note_label: null, note_at: null, images: [], created_by: meId, created_label: null, created_at: nowIso(), updated_at: nowIso(), sort_order: order, source: 'board' };
      res = await board.addFinding(row);
      if (res.ok) toast('Finding added.');
    }
    setBusy(false);
    if (res.ok) onClose(); else toast('Could not save: ' + res.error);
  };

  return (
    <Sheet title={f ? 'Edit finding ' + f.code : 'Add a finding'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {!f && <Field name="code" label="Code" hint="Short id used in Slack and the tracker: letters, digits and dashes" error={err.code}><input type="text" id="in-code" value={v.code} onChange={(e) => set('code', e.target.value)} dir="ltr" /></Field>}
        <Field name="screen" label="Screen" error={err.screen}><input type="text" id="in-screen" value={v.screen} onChange={(e) => set('screen', e.target.value)} placeholder="e.g. Voucher details" dir="auto" /></Field>
        <div className="fld"><label htmlFor="in-type">Type</label><select id="in-type" value={v.type} onChange={(e) => set('type', e.target.value)}>{types.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="fld"><label>Severity</label><div className="opts">{([3, 2, 1] as Sev[]).map((s) => <label key={s}><input type="radio" name="sev" checked={v.sev === s} onChange={() => set('sev', s)} />{SEV[s]}</label>)}</div></div>
        <div className="fld"><label>Language</label><div className="opts">{['AR', 'EN', 'Both'].map((l) => <label key={l}><input type="radio" name="lang" checked={v.lang === l} onChange={() => set('lang', l)} />{l}</label>)}</div></div>
        <Field name="description" label="Finding" hint="Use **bold** for emphasis and `code` for exact strings" error={err.description}><textarea id="in-description" value={v.description} onChange={(e) => set('description', e.target.value)} placeholder="What differs or fails, with exact strings and numbers" dir="auto" /></Field>
        <Field name="prod" label="Production refs"><input type="text" id="in-prod" value={v.prod} onChange={(e) => set('prod', e.target.value)} placeholder="Capture names, e.g. ar/12, en/12" dir="ltr" /></Field>
        <Field name="figma" label="Figma refs"><input type="text" id="in-figma" value={v.figma} onChange={(e) => set('figma', e.target.value)} placeholder="Node ids, e.g. 2389:70378" dir="ltr" /></Field>
        {!f && <p className="hint">Screenshots can be added on the finding after it is saved.</p>}
        <div className="sheet-f"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary" disabled={busy}>{f ? 'Save changes' : 'Add finding'}</button></div>
      </form>
    </Sheet>
  );
}
