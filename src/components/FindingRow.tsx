import { useEffect, useRef, useState } from 'react';
import type { Board } from '../hooks/useBoard';
import { useSignedUrl } from '../hooks/useBoard';
import { fmtDate, nowIso } from '../lib/format';
import { FSTATE, SEV, type FState, type Finding, type ShotRef } from '../lib/types';
import { Md } from './Md';
import { useToast } from './Toast';

export function FindingRow({ f, board, meId, onEdit, onOpenImage }: { f: Finding; board: Board; meId: string | null; onEdit: (f: Finding) => void; onOpenImage: (src: string, cap: string) => void }) {
  const toast = useToast();
  const [confirmDel, setConfirmDel] = useState(false);
  const [note, setNote] = useState(f.note || '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const noteTimer = useRef<number | undefined>(undefined);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setNote(f.note || ''); }, [f.note]);

  const st = f.state || 'open';
  const t = nowIso();
  const setState = async (state: FState) => {
    if (state === st) return;
    const res = await board.updateFinding(f.id, { state, state_by: meId, state_label: null, state_at: t });
    if (!res.ok) toast('Could not save: ' + res.error);
  };
  const saveNote = (val: string) => {
    editing.current = false;
    if ((f.note || '') === val.trim()) return;
    board.updateFinding(f.id, { note: val.trim(), note_by: meId, note_label: null, note_at: nowIso() }).then((res) => { if (!res.ok) toast('Could not save the note: ' + res.error); });
  };
  const onNote = (val: string) => { editing.current = true; setNote(val); window.clearTimeout(noteTimer.current); noteTimer.current = window.setTimeout(() => saveNote(val), 900); };
  const del = async () => { setConfirmDel(false); const res = await board.deleteFinding(f.id); toast(res.ok ? 'Finding deleted.' : 'Could not delete: ' + res.error); };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { toast(file.name + ': only PNG, JPEG, WebP or GIF.'); continue; }
      if (file.size > 20 * 1024 * 1024) { toast(file.name + ' is over 20 MB.'); continue; }
      const res = await board.uploadShot(f, file);
      if (!res.ok) toast('Upload failed: ' + res.error);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const meta = [
    st !== 'open' && (f.state_by || f.state_at || f.state_label) ? `${FSTATE[st]} by ${board.nameOf(f.state_by, f.state_label)}${f.state_at ? ' · ' + fmtDate(f.state_at) : ''}` : '',
    f.note && (f.note_by || f.note_label) ? `Note by ${board.nameOf(f.note_by, f.note_label)}${f.note_at ? ' · ' + fmtDate(f.note_at) : ''}` : '',
    f.source !== 'audit' && (f.created_by || f.created_label) ? `Added by ${board.nameOf(f.created_by, f.created_label)} · ${fmtDate(f.created_at)}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <article className={`fnd sev-${f.sev} fs-${st}`} id={'fr-' + f.id}>
      <label className="fcheck"><input type="checkbox" checked={st === 'solved'} onChange={(e) => setState(e.target.checked ? 'solved' : 'open')} /><span>Solved</span></label>
      <div className="fbody">
        <div className="fhead">
          <span className="code">{f.code}</span><span className={`chip sev-${f.sev}`}>{SEV[f.sev]}</span>
          {f.type && <span className="chip type">{f.type}</span>}{f.lang && <span className="chip lang">{f.lang}</span>}
          {(st === 'wontfix' || st === 'design') && <span className={'chip fs-' + st}>{FSTATE[st]}</span>}
          <span className="fscreen">{[f.flow, f.screen].filter(Boolean).join(' › ')}</span>
        </div>
        <div className="fdesc" dir="auto"><Md text={f.description} /></div>
        {(f.prod || f.figma) && <div className="frefs">{[f.prod && 'Prod: ' + f.prod, f.figma && 'Figma: ' + f.figma].filter(Boolean).join(' · ')}</div>}
        <div className="shots">
          {(f.images || []).map((im, i) => <Shot key={im.path} im={im} index={i} f={f} board={board} meId={meId} onOpen={onOpenImage} />)}
          <span className="upl">
            <button type="button" className="btn sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : f.images?.length ? 'Add image' : 'Add screenshot'}</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => upload(e.target.files)} />
          </span>
        </div>
        <div className="fctl">
          <select className="ctl" value={st} onChange={(e) => setState(e.target.value as FState)}>{(Object.keys(FSTATE) as FState[]).map((k) => <option key={k} value={k}>{FSTATE[k]}</option>)}</select>
          <textarea rows={1} value={note} placeholder="Note for the reviewer, e.g. why it stays open" dir="auto" onChange={(e) => onNote(e.target.value)} onBlur={(e) => { window.clearTimeout(noteTimer.current); saveNote(e.target.value); }} />
          <button type="button" className="btn sm" onClick={() => onEdit(f)}>Edit</button>
          {confirmDel ? (
            <span className="confirm">Delete this finding? <button type="button" className="btn sm danger" onClick={del}>Delete</button><button type="button" className="btn sm" onClick={() => setConfirmDel(false)}>Keep</button></span>
          ) : <button type="button" className="btn sm" onClick={() => setConfirmDel(true)}>Delete</button>}
        </div>
        {meta && <div className="fmeta">{meta}</div>}
      </div>
    </article>
  );
}

function Shot({ im, index, f, board, meId, onOpen }: { im: ShotRef; index: number; f: Finding; board: Board; meId: string | null; onOpen: (src: string, cap: string) => void }) {
  const toast = useToast();
  const url = useSignedUrl(im.path);
  const [missing, setMissing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const cap = im.name + (im.by ? ' · ' + board.nameOf(im.by) : '');
  const remove = async () => { setConfirm(false); const res = await board.removeShot(f, index); toast(res.ok ? 'Image removed.' : 'Could not remove: ' + res.error); };
  if (missing) return <span className="shot missing">Image not available</span>;
  return (
    <span className="shotwrap">
      <button type="button" className="shot" onClick={() => url && onOpen(url, cap)} aria-label={'Open ' + im.name}>
        {url ? <img src={url} alt={im.name} loading="lazy" onError={() => setMissing(true)} /> : <span style={{ display: 'block', width: 96, height: 96 }} />}
        <span className="cap">{im.name}</span>
      </button>
      {confirm ? (
        <span className="confirm" style={{ position: 'absolute', left: 0, top: 0, zIndex: 2 }}>Remove? <button type="button" className="btn sm danger" onClick={remove}>Remove</button><button type="button" className="btn sm" onClick={() => setConfirm(false)}>Keep</button></span>
      ) : (im.by === meId || !im.by) && <button type="button" className="shot-x" title="Remove image" aria-label="Remove image" onClick={() => setConfirm(true)}>×</button>}
    </span>
  );
}
