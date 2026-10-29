import type { Finding, Review, ReviewStats } from './types';

export const nowIso = () => new Date().toISOString();

export function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString('en-GB', o);
}

export const fmtDays = (d: number) => (d < 10 && !Number.isInteger(d) ? d.toFixed(1) : String(Math.round(d)));

export function daysBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 864e5;
  return isNaN(d) ? null : d;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function statsFor(findings: Iterable<Finding>, reviewId: string): ReviewStats {
  const st: ReviewStats = { total: 0, open: 0, solved: 0, wontfix: 0, design: 0, s3: 0, s2: 0, s1: 0 };
  for (const f of findings) {
    if (f.review_id !== reviewId) continue;
    st.total++;
    st[f.state]++;
    if (f.state === 'open') st[`s${f.sev}` as 's1' | 's2' | 's3']++;
  }
  return st;
}

export function newReviewId(): string {
  return 'uxr-' + nowIso().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6);
}

export const sanitizeCode = (s: string) => s.replace(/[^A-Za-z0-9_\-.~:@+]+/g, '-').replace(/^[.\-]+|[.\-]+$/g, '');

export function sortReviews(rs: Review[]): Review[] {
  return [...rs].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}
