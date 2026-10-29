import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { BUCKET, supabase } from '../lib/supabase';
import type { Finding, Profile, Review, ShotRef } from '../lib/types';
import { nowIso } from '../lib/format';

type Change = { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> };

function applyChange<T extends { id: string }>(set: Dispatch<SetStateAction<Map<string, T>>>, p: Change) {
  set((prev) => {
    const next = new Map(prev);
    if (p.eventType === 'DELETE') { const id = (p.old as Partial<T>).id; if (id) next.delete(id); }
    else { const row = p.new as T; if (row && row.id) next.set(row.id, row); }
    return next;
  });
}

export type WriteResult = { ok: true } | { ok: false; error: string };

export function useBoard(enabled: boolean, meId: string | null) {
  const [reviews, setReviews] = useState<Map<string, Review>>(new Map());
  const [findings, setFindings] = useState<Map<string, Finding>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const findingsRef = useRef(findings);
  findingsRef.current = findings;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const [r, f, p] = await Promise.all([
        supabase.from('reviews').select('*'),
        supabase.from('findings').select('*'),
        supabase.from('profiles').select('id, email, name, avatar_url'),
      ]);
      if (cancelled) return;
      const err = r.error || f.error || p.error;
      if (err) { setError(err.message); setLoaded(true); return; }
      setReviews(new Map((r.data as Review[]).map((x) => [x.id, x])));
      setFindings(new Map((f.data as Finding[]).map((x) => [x.id, x])));
      setProfiles(new Map((p.data as Profile[]).map((x) => [x.id, x])));
      setLoaded(true);
    })();
    const ch = supabase.channel('board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, (pl) => applyChange<Review>(setReviews, pl as unknown as Change))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'findings' }, (pl) => applyChange<Finding>(setFindings, pl as unknown as Change))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (pl) => applyChange<Profile>(setProfiles, pl as unknown as Change))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [enabled]);

  const fail = (e: { message: string } | null): WriteResult => (e ? { ok: false, error: e.message } : { ok: true });

  /** Slack alert for a review's current state (requested / delivered / done). Fire-and-forget; the function dedupes. */
  const notify = useCallback(async (reviewId: string): Promise<boolean> => {
    const { error: e } = await supabase.functions.invoke('slack-alert', { body: { reviewId } });
    if (e) console.warn('slack-alert', e.message);
    return !e;
  }, []);

  const createReview = useCallback(async (row: Review): Promise<WriteResult> => {
    const { error: e } = await supabase.from('reviews').insert(row);
    if (!e) { setReviews((m) => new Map(m).set(row.id, row)); notify(row.id); }
    return fail(e);
  }, [notify]);

  const updateReview = useCallback(async (id: string, patch: Partial<Review>): Promise<WriteResult> => {
    setReviews((m) => { const r = m.get(id); return r ? new Map(m).set(id, { ...r, ...patch }) : m; });
    const { error: e } = await supabase.from('reviews').update(patch).eq('id', id);
    if (e) { const { data } = await supabase.from('reviews').select('*').eq('id', id).maybeSingle(); if (data) setReviews((m) => new Map(m).set(id, data as Review)); }
    return fail(e);
  }, []);

  const deleteReview = useCallback(async (id: string): Promise<WriteResult> => {
    const { error: e } = await supabase.from('reviews').delete().eq('id', id);
    if (!e) { setReviews((m) => { const n = new Map(m); n.delete(id); return n; }); setFindings((m) => new Map([...m].filter(([, f]) => f.review_id !== id))); }
    return fail(e);
  }, []);

  const addFinding = useCallback(async (row: Finding): Promise<WriteResult> => {
    const { error: e } = await supabase.from('findings').insert(row);
    if (!e) setFindings((m) => new Map(m).set(row.id, row));
    return fail(e);
  }, []);

  const updateFinding = useCallback(async (id: string, patch: Partial<Finding>): Promise<WriteResult> => {
    setFindings((m) => { const f = m.get(id); return f ? new Map(m).set(id, { ...f, ...patch }) : m; });
    const { error: e } = await supabase.from('findings').update(patch).eq('id', id);
    if (e) { const { data } = await supabase.from('findings').select('*').eq('id', id).maybeSingle(); if (data) setFindings((m) => new Map(m).set(id, data as Finding)); }
    return fail(e);
  }, []);

  const deleteFinding = useCallback(async (id: string): Promise<WriteResult> => {
    const f = findingsRef.current.get(id);
    const { error: e } = await supabase.from('findings').delete().eq('id', id);
    if (!e) {
      setFindings((m) => { const n = new Map(m); n.delete(id); return n; });
      const paths = (f?.images ?? []).map((im) => im.path);
      if (paths.length) supabase.storage.from(BUCKET).remove(paths).then(() => undefined, () => undefined);
    }
    return fail(e);
  }, []);

  const uploadShot = useCallback(async (finding: Finding, file: File): Promise<WriteResult> => {
    const blob = await toUploadBlob(file);
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60);
    const path = `${finding.review_id}/${finding.code}/${Date.now()}-${safe}`;
    const { error: e } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || file.type, upsert: false });
    if (e) return { ok: false, error: e.message };
    const entry: ShotRef = { path, name: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60), by: meId, at: nowIso() };
    const current = findingsRef.current.get(finding.id) ?? finding;
    return updateFinding(finding.id, { images: [...(current.images ?? []), entry] });
  }, [meId, updateFinding]);

  const removeShot = useCallback(async (finding: Finding, index: number): Promise<WriteResult> => {
    const current = findingsRef.current.get(finding.id) ?? finding;
    const im = current.images?.[index];
    if (!im) return { ok: true };
    const res = await updateFinding(finding.id, { images: current.images.filter((_, j) => j !== index) });
    if (res.ok) supabase.storage.from(BUCKET).remove([im.path]).then(() => undefined, () => undefined);
    return res;
  }, [updateFinding]);

  const nameOf = useCallback((id: string | null | undefined, label?: string | null) => {
    if (id) { if (id === meId) return 'You'; const p = profiles.get(id); return p?.name || p?.email?.split('@')[0] || 'Member'; }
    return label || '—';
  }, [profiles, meId]);

  return useMemo(() => ({ reviews, findings, profiles, loaded, error, nameOf, notify, createReview, updateReview, deleteReview, addFinding, updateFinding, deleteFinding, uploadShot, removeShot }),
    [reviews, findings, profiles, loaded, error, nameOf, notify, createReview, updateReview, deleteReview, addFinding, updateFinding, deleteFinding, uploadShot, removeShot]);
}
export type Board = ReturnType<typeof useBoard>;

/** Large PNG/WebP captures are re-encoded as JPEG to keep storage small; anything else uploads as is. */
async function toUploadBlob(file: File): Promise<Blob> {
  if (file.size <= 1.5e6 || !/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

/** Signed URL for a private screenshot, cached per path for the session. */
const urlCache = new Map<string, { url: string; exp: number }>();
export function useSignedUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => { const c = path ? urlCache.get(path) : null; return c && c.exp > Date.now() ? c.url : null; });
  useEffect(() => {
    if (!path) return;
    const c = urlCache.get(path);
    if (c && c.exp > Date.now()) { setUrl(c.url); return; }
    let cancelled = false;
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (cancelled || !data) return;
      urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3300e3 });
      setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [path]);
  return url;
}
