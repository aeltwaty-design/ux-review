// Slack alerts for the UX Reviews board.
// Called by the app right after a request is raised, delivered or closed (supabase.functions.invoke('slack-alert', { body: { reviewId } })),
// and safe to call any time: it posts only events not yet marked in reviews.slack, then marks them.
// Secrets (Supabase → Edge Functions → Secrets): SLACK_WEBHOOK_URL (incoming webhook for #ux-review), APP_URL (the deployed board, e.g. https://ux-review.vercel.app).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

type Review = {
  id: string; flow: string; platform: string; build: string; status: string; source: string;
  requested_by: string | null; requester_label: string | null; reviewer: string | null; reviewer_label: string | null;
  slack: Record<string, string> | null;
};
type Finding = { sev: number; state: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const hook = Deno.env.get('SLACK_WEBHOOK_URL');
  if (!hook) return json({ error: 'SLACK_WEBHOOK_URL is not set' }, 500);
  const app = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let reviewId: string | undefined;
  try { reviewId = (await req.json())?.reviewId; } catch { /* no body: sweep every review */ }

  let q = sb.from('reviews').select('id, flow, platform, build, status, source, requested_by, requester_label, reviewer, reviewer_label, slack');
  if (reviewId) q = q.eq('id', reviewId);
  const { data: reviews, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const posted: string[] = [];
  for (const r of (reviews ?? []) as Review[]) {
    const slack = r.slack ?? {};
    const event = r.status === 'requested' && !slack.requested ? 'requested'
      : r.status === 'delivered' && !slack.delivered ? 'delivered'
      : r.status === 'done' && !slack.done ? 'done' : null;
    if (!event) continue;
    if (r.source === 'audit' && event !== 'done') continue;

    const ids = [r.requested_by, r.reviewer].filter(Boolean) as string[];
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: ps } = await sb.from('profiles').select('id, name, email').in('id', ids);
      for (const p of ps ?? []) names[p.id] = p.name || p.email;
    }
    const who = (id: string | null, label: string | null) => (id && names[id]) || label || 'a team member';
    const link = `${app}/#${r.id}`;
    let text = '';
    if (event === 'requested') {
      text = `:new: *UX review requested* — ${r.flow} (${r.platform})\nRequested by ${who(r.requested_by, r.requester_label)} · build: ${r.build}\nUX team: open the board to start the review → ${link}`;
    } else {
      const { data: fs } = await sb.from('findings').select('sev, state').eq('review_id', r.id);
      const list = (fs ?? []) as Finding[];
      const n = (fn: (f: Finding) => boolean) => list.filter(fn).length;
      if (event === 'delivered') {
        text = `:white_check_mark: *Findings delivered* — ${r.flow} (${r.platform})\n${list.length} findings: ${n(f => f.sev === 3)} major · ${n(f => f.sev === 2)} minor · ${n(f => f.sev === 1)} cosmetic · reviewer: ${who(r.reviewer, r.reviewer_label)}\nEngineer: tick each finding Solved on the board as you fix → ${link}`;
      } else {
        text = `:tada: *Review closed* — ${r.flow} (${r.platform})\n${n(f => f.state === 'solved')} of ${list.length} solved · ${n(f => f.state === 'wontfix')} won't fix · ${n(f => f.state === 'design')} need a design decision\n${link}`;
      }
    }
    const res = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!res.ok) { console.error('slack', r.id, event, res.status, await res.text()); continue; }
    await sb.from('reviews').update({ slack: { ...slack, [event]: new Date().toISOString() } }).eq('id', r.id);
    posted.push(`${r.id}:${event}`);
  }
  return json({ posted });
});
