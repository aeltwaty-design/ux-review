import { useState, type FormEvent } from 'react';
import type { Board } from '../hooks/useBoard';
import { newReviewId, nowIso } from '../lib/format';
import { PLATFORMS, type Review } from '../lib/types';
import { Field, Sheet } from './Sheet';
import { useToast } from './Toast';

export function RequestForm({ review: r, board, meId, onClose }: { review?: Review; board: Board; meId: string | null; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ flow: r?.flow ?? '', platform: r?.platform ?? 'Android', build: r?.build ?? '', screens: r?.screens ?? '', figma: r?.figma ?? '', languages: r?.languages ?? ['AR', 'EN'], reach: r?.reach ?? '', story: r?.story ?? '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v, val: string | string[]) => setV((p) => ({ ...p, [k]: val }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    for (const k of ['flow', 'build', 'screens', 'figma'] as const) if (!v[k].trim()) er[k] = 'Required';
    if (v.figma.trim() && !/^https?:\/\//i.test(v.figma.trim())) er.figma = 'Enter a full link starting with https://';
    setErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const data = { flow: v.flow.trim(), platform: v.platform, build: v.build.trim(), screens: v.screens.trim(), figma: v.figma.trim(), languages: v.languages, reach: v.reach.trim(), story: v.story.trim() };
    let res;
    if (r) { res = await board.updateReview(r.id, data); if (res.ok) toast('Request updated.'); }
    else {
      const id = newReviewId();
      const row: Review = { id, ...data, requested_by: meId, requester_label: null, reviewer: null, reviewer_label: null, status: 'requested', created_at: nowIso(), started_at: null, delivered_at: null, closed_at: null, page: null, source: 'board', slack: {}, updated_at: nowIso() };
      res = await board.createReview(row);
      if (res.ok) { toast('Request raised. The UX team is alerted on Slack.'); location.hash = '#' + id; }
    }
    setBusy(false);
    if (res.ok) onClose(); else toast('Could not save: ' + res.error);
  };

  return (
    <Sheet title={r ? 'Edit request' : 'Request a UX review'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field name="flow" label="Flow" error={err.flow}><input type="text" id="in-flow" value={v.flow} onChange={(e) => set('flow', e.target.value)} placeholder="e.g. Market – vouchers list and details" dir="auto" /></Field>
        <div className="fld"><label>Platform</label><div className="opts">{PLATFORMS.map((p) => <label key={p}><input type="radio" name="platform" value={p} checked={v.platform === p} onChange={() => set('platform', p)} />{p}</label>)}</div></div>
        <Field name="build" label="Build" error={err.build}><input type="text" id="in-build" value={v.build} onChange={(e) => set('build', e.target.value)} placeholder="Version and APK / TestFlight link" dir="auto" /></Field>
        <Field name="screens" label="Screens in the flow" hint="Every screen and state the reviewer should look at" error={err.screens}><textarea id="in-screens" value={v.screens} onChange={(e) => set('screens', e.target.value)} placeholder="One per line" dir="auto" /></Field>
        <Field name="figma" label="Figma link" hint="Link to the page or frame set the build implements" error={err.figma}><input type="url" id="in-figma" value={v.figma} onChange={(e) => set('figma', e.target.value)} placeholder="https://www.figma.com/design/…" dir="ltr" /></Field>
        <div className="fld"><label>Languages ready</label><div className="opts">{['AR', 'EN'].map((l) => <label key={l}><input type="checkbox" checked={v.languages.includes(l)} onChange={(e) => set('languages', e.target.checked ? [...v.languages, l] : v.languages.filter((x) => x !== l))} />{l}</label>)}</div></div>
        <Field name="reach" label="How to reach the flow"><textarea id="in-reach" value={v.reach} onChange={(e) => set('reach', e.target.value)} placeholder="Steps with a test account — no passwords here" dir="auto" /></Field>
        <Field name="story" label="Related story"><input type="text" id="in-story" value={v.story} onChange={(e) => set('story', e.target.value)} placeholder="Jira key or link (optional)" dir="auto" /></Field>
        <div className="sheet-f"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary" disabled={busy}>{r ? 'Save changes' : 'Raise request'}</button></div>
      </form>
    </Sheet>
  );
}
