# WalaPlus UX Reviews

The review loop between engineers and the UX team, as one web app: an engineer raises a review request when a flow is ready, the UX team reviews it against Figma and delivers findings (with masked screenshots), the engineer ticks each finding **Solved** as it is fixed, and Slack is told when a request is raised, delivered or closed.

**Stack:** Vite + React + TypeScript · Supabase (Postgres, Google sign-in restricted to `walaplus.com`, private storage bucket, realtime, one edge function for Slack) · Vercel.

## How it works

| Step | Who | Status |
|---|---|---|
| **Request a review** — flow, platform, build, screens, Figma link, languages, how to reach the flow | engineer | `requested` → Slack `:new:` |
| **Start review** (you become the reviewer) | UX | `in_progress` |
| Findings written on the board, screenshots attached (mask personal data first) | UX (with Claude) | |
| **Mark delivered** | UX | `delivered` → Slack `:white_check_mark:` with counts |
| Tick **Solved** per finding, or set *Won't fix* / *Needs design decision* with a note | engineer | |
| **Close review** (Reopen possible) | either | `done` → Slack `:tada:` |

Board home: KPI tiles, open findings by flow × severity, progress per review, turnaround. Each review: open findings by screen, progress, filters (Open · Solved · Won't fix / design · All, severity, search), add/edit/delete findings, screenshots. Everything updates live for everyone who has the page open.

The first review (`uxr-audit-2026-10`) is the Android app audit of Oct 2026 with its 142 gap findings — `supabase/seed.sql`.

## Set up (once, ~30 minutes)

### 1. Supabase project
1. Create a project at supabase.com (region: closest to KSA, e.g. Frankfurt).
2. **SQL editor** → run `supabase/migrations/0001_init.sql`, `0002_apps.sql`, `0003_roles.sql`, `0004_invites.sql`, then `supabase/seed.sql`. (All are safe to re-run.) Then make yourself admin: `update public.profiles set role = 'admin' where email = 'you@walaplus.com';` after your first sign-in (or pre-assign it: `insert into public.role_assignments (email, role) values ('you@walaplus.com', 'admin');`).
3. **Authentication → Providers → Google**: enable it. In Google Cloud Console create an OAuth client (Web application) with the authorized redirect URI shown by Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`); paste client id and secret into Supabase. Only `walaplus.com` accounts can sign up — the database rejects everything else.
4. **Authentication → URL configuration**: Site URL = your Vercel URL; Redirect URLs = that URL and `http://localhost:5173` for local work.
5. **Settings → API**: copy the Project URL and the `anon` public key (used in step 3 below).

### 2. Slack alerts (edge function)
1. Create the Slack app from `slack/app-manifest.json` (api.slack.com/apps → Create New App → From a manifest), then Incoming Webhooks → *Add New Webhook to Workspace* → `#ux-review` → copy the webhook URL.
2. With the Supabase CLI (`npm i -g supabase`, `supabase login`, `supabase link --project-ref <ref>`):
   ```bash
   supabase secrets set SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..." APP_URL="https://<your-vercel-domain>"
   supabase functions deploy slack-alert
   ```
   The function only accepts calls from signed-in members; the app calls it after a request is raised, delivered or closed, and it posts only events not yet marked in `reviews.slack` (so it is safe to call again).

### 3. Vercel
1. Import this repository (Vercel detects Vite; `vercel.json` has the SPA rewrite).
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (from step 1.5). Both are public values; row-level security protects the data.
3. Deploy. Put the final URL into Supabase's URL configuration (step 1.4) and `APP_URL` (step 2).

### Local development
```bash
npm install
cp .env.example .env.local   # fill in the two VITE_ values
npm run dev                  # http://localhost:5173
```

## Data model (`supabase/migrations/`)
- `apps` — the products the board covers (WalaPlus, WalaOne, Doam). Add a row to add an app; the filter, request form and Slack alerts pick it up.
- `profiles` — one per Google account (name, avatar), kept in sync by a trigger on `auth.users`.
- `reviews` — one per request: app_id, flow, platform, build, screens, figma, languages, reach, story, requested_by, reviewer, status, dates, page, `slack` (events already posted).
- `findings` — `id = '<review id>.<code>'`: screen, type, lang, sev (3 major · 2 minor · 1 cosmetic), description (`**bold**`, `` `code` ``), prod/figma refs, state (`open` · `solved` · `wontfix` · `design`) with who/when, note with who/when, `images` (paths in the private `screenshots` bucket), sort_order, source.
- Access is **invitation only**: a `walaplus.com` account can sign in only after an admin invited the email (People → Invite, stored in `role_assignments`); admins can remove access later (`profiles.active = false`), which blocks every read and write.
- Roles (`profiles.role`): **engineer** (default) raises requests, edits/withdraws their own open request, marks findings Solved / Won't fix / Needs design decision, writes notes and attaches screenshots; **ux** also starts, delivers, closes and reopens reviews and adds/edits/deletes findings; **admin** also manages roles (People button) and the apps list. Roles can be pre-assigned by email in `role_assignments` before a colleague's first sign-in. Enforced by row-level security and triggers, not just the UI. Screenshots are readable by members and deletable by their uploader. Realtime is on for profiles, reviews and findings.

## Reviewing with Claude
The `ux-review` skill (Claude) reads a request, compares the build with the Figma frames and writes the findings. To let it write to this database, connect the Supabase MCP server in claude.ai (Settings → Connectors) and point the skill at the `reviews` and `findings` tables; until then the reviewer pastes Claude's findings in with **Add finding**.

## Repository layout
```
src/                 React app (hooks/useBoard.ts = data + realtime + writes, components/ = UI)
supabase/migrations  schema, access rules, storage bucket, realtime
supabase/seed.sql    the Oct 2026 Android audit as the first review
supabase/functions/slack-alert   Slack webhook poster
scripts/seed.mjs     optional: apply migration + seed with psql
```
