# WalaPlus UX Reviews

The review loop between the UX team and the teams that own what it finds — Engineering, Product team, Data, Marketing, Marketplace, Customer support, Customer success, Business, Management, UX team — as one web app: the UX team raises a review request when a build is ready, reviews it against Figma and delivers findings (with masked screenshots) routed to the team that owns each one, that team ticks each finding **Solved** as it is fixed, and Slack is told when a request is raised, delivered or closed.

**Stack:** Vite + React + TypeScript · Supabase (Postgres, Google sign-in restricted to `walaplus.com`, private storage bucket, realtime, one edge function for Slack) · Vercel.

## How it works

| Step | Who | Status |
|---|---|---|
| **Request a review** — app, flow, platform, build, screens, Figma link, languages, how to reach the flow | admin | `requested` → Slack `:new:` |
| Status → **In progress** (admin sets the reviewer) | admin | `in_progress` |
| Findings written on the board, screenshots attached (mask personal data first) | UX (with Claude) | |
| Status → **Delivered** | admin | `delivered` → Slack `:white_check_mark:` with counts |
| Tick **Solved** per finding, or set *Won't fix* / *Needs design decision* with a note | owner team | |
| **Close review** (Reopen possible) | either | `done` → Slack `:tada:` |

Board home: KPI tiles, open findings by flow × severity, open findings by team, progress per review, turnaround. Each review: open findings by screen, progress, filters (Open · Solved · Won't fix / design · All, severity, search), add/edit/delete findings, screenshots. Everything updates live for everyone who has the page open.

The first review (`uxr-audit-2026-10`) is the Android app audit of Oct 2026 with its 142 gap findings — `supabase/seed.sql`.

## Set up (once, ~30 minutes)

### 1. Supabase project
1. Create a project at supabase.com (region: closest to KSA, e.g. Frankfurt).
2. **SQL editor** → run `supabase/migrations/0001_init.sql`, `0002_apps.sql`, `0003_roles.sql`, `0004_invites.sql`, `0005_assignments.sql`, `0006_product_owners.sql`, `0007_link_viewers.sql`, `0008_status_rules.sql`, `0009_approvals.sql`, `0010_admin_edits.sql`, `0011_ux_reviewer_only.sql`, `0012_teams.sql`, `0013_roles_simplified.sql`, `0014_teams_product_ux.sql`, then `supabase/seed.sql`. (All are safe to re-run.) Then make yourself admin: `update public.profiles set role = 'admin' where email = 'you@walaplus.com';` after your first sign-in (or pre-assign it: `insert into public.role_assignments (email, role) values ('you@walaplus.com', 'admin');`).
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
- `reviews` — one per request: app_id, flow, platform, build, screens, figma, languages, reach, story, requested_by, reviewer, status, dates, `slack` (events already posted).
- `findings` — `id = '<review id>.<code>'`: screen, type, lang, sev (3 major · 2 minor · 1 cosmetic), description (`**bold**`, `` `code` ``), prod/figma refs, `team_id` (owner team) + `assignee`, state (`open` · `solved` · `wontfix` · `design`) with who/when, note with who/when, `images` (paths in the private `screenshots` bucket), sort_order, source.
- Access: any `walaplus.com` Google account can sign in. A new account is **pending** ("Waiting admin approval") until an admin approves it and sets its role (People → Waiting admin approval → Approve); a pending account can open any **review link** (`<app URL>#<review id>` — every review page, link view and "My issues" group has a **Copy link** button) read-only and nothing else (no tables are readable; the link view goes through the `review_by_link` function). Any member can **Invite** a colleague with a suggested role (and products for a Product Owner); the invitation waits for an admin, who approves it as is or changes the role. An admin's own invitation (People → Invite) is approved at once, so that account is active from its first sign-in. Approving upgrades a signed-in pending account immediately (`apply_role_assignment` trigger). Admins can remove access later (`profiles.active = false`), which blocks every read, write and link.
- Roles (`profiles.role`) — the team says who someone is (`profiles.team_id`: Engineering, Product team, Data, Marketing, Marketplace, Customer support, Customer success, Business, Management, UX team), the role says what they may do: **pending** (every new account until approved) opens review links only; **viewer** reads every finding owned by their team ("<Team> inbox", *Mine* / *Whole team*, Open / Done / All) and changes nothing; **editor** also works them — takes unassigned team findings, releases their own, marks Solved / Won't fix / Needs design decision, notes, screenshots; **admin** does everything else: raises requests, is the reviewer, moves a review through Requested / In progress / Delivered / Closed, edits or withdraws requests, adds/edits/deletes findings, routes each finding (owner team + optional person, per finding or in bulk per review), manages approvals, roles, teams and the apps list (People). Roles and teams can be pre-assigned by email in `role_assignments` before a colleague's first sign-in. Enforced by row-level security and triggers (`guard_review_update`, `guard_finding_update`), not just the UI. Screenshots are readable by any active walaplus.com account (so a link works), uploaded by admins and editors of the team, deleted by their uploader. A review link opened by someone whose board does not carry that review gets the read-only view. Realtime is on for profiles, reviews and findings.

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
