# Myntmore Outreach Tool

A LinkedIn outreach service, run for clients rather than sold as self-serve software. A client submits a lead list and a message sequence; a person on the Myntmore team reviews it, configures it in [Waalaxy](https://www.waalaxy.com/) by hand, and runs the campaign. This app is the portal that connects the two sides of that: a client dashboard for submitting and tracking campaigns, and an admin toolkit for running them.

## What's here

The app has two routes:

- **`/login`** — email/password sign-in, plus one-time admin bootstrap. `/` redirects here (`app/page.tsx`) -- there's no public marketing page, since this app is only ever reached by an existing client or admin.
- **`/dashboard`** — the actual tool (`app/dashboard/page.tsx`), a single component that renders either the client or the admin view depending on the signed-in user's role.

### Client side

- Submit a campaign: goal, offer, tone, connection note, up to 3 follow-ups, and a lead list CSV (with column mapping if the file's headers don't match our template).
- Track every campaign's status (Submitted → In review → In setup → Live → Completed), acceptance rate, reply rate, and — per lead — whether they've been sent a request, accepted, or replied.
- Add another batch of leads to a campaign that's already running; duplicates (by LinkedIn URL) are skipped automatically.
- Edit a campaign's brief and messaging after submission. Doing so posts an alert so the admin team knows to review it before continuing outreach.
- Submit LinkedIn credentials for the team to use, and handle any 2FA/verification step LinkedIn asks for, from the dashboard.
- See alerts the admin team posts (account-wide, campaign-wide, or tied to a specific lead).

### Admin side

- A work queue of every client's campaigns, filterable by status, with an unresolved-alert indicator per campaign.
- Per campaign: the full brief, the lead list (download as CSV to import into Waalaxy manually — Waalaxy's API can't set message content or configure a campaign), and a link to the Waalaxy campaign/list once one is created for it.
- Record performance by uploading Waalaxy's own contact export for a campaign: it's parsed to count connections sent/accepted/replied (from each lead's own dates) and to update every lead's individual status, instead of counting by hand.
- Manage each client's LinkedIn credentials (encrypted at rest, revealed only on demand, with an audit trail) and relay 2FA codes/approvals between LinkedIn and the client.
- Post alerts to a client (account-wide, campaign-wide, or lead-specific) and resolve them once addressed.
- Create client accounts, revoke/restore access (soft-delete — a revoked client's historical campaigns are preserved, not deleted).
- Export all campaigns as CSV.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**, deployed on Vercel.
- **Supabase**: Postgres (schema `outreach`, row-level security throughout), Auth, and private Storage for lead-list CSVs.
- **Tailwind v4** for utility classes; the dashboard and login page each also carry their own plain CSS (`app/globals.css`) for anything Tailwind doesn't cover well.
- No ORM — Supabase's JS client, called directly from both client components (subject to RLS) and server API routes (via a service-role client for anything RLS can't or shouldn't gate on its own).

## Getting started

Requires Node 22.13 or newer.

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key (browser + server, RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Bypasses RLS — used by API routes that need to write across a client/admin boundary the client's own session can't. Never expose this to the browser. |
| `WAALAXY_API_KEY` | Waalaxy's API (limited use — see "Why Waalaxy is configured by hand" below) |
| `CREDENTIALS_ENCRYPTION_KEY` | AES-256-GCM key for encrypting LinkedIn credentials at rest. Generate with `openssl rand -base64 32`. |

### Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build (webpack; see next.config.ts)
npm start       # run a production build
npm run lint    # eslint
npm test        # node's built-in test runner over tests/*.test.ts
```

## Database

All application tables live in the `outreach` Postgres schema, not `public`. Migrations are in `supabase/migrations/`, applied in filename order.

Worth knowing before touching schema: `outreach.campaigns`, `outreach.lead_files`, and a few of their columns were originally created by hand in the Supabase dashboard, before any migration existed. Migration files that reference these tables use `create table if not exists` / `add column if not exists` so they're safe no-ops against the existing live database — but that also means a column default described in a migration isn't guaranteed to actually be set on the live table if the column predates that migration. If you hit a `null value in column "x" violates not-null constraint` on a table this old, that's usually why — the fix is to supply the value explicitly rather than relying on the described default.

RLS is the actual authorization boundary for direct browser→Supabase calls: clients can only see/modify their own rows, admins (checked via `outreach.is_admin_user`) can see/modify everything. API routes under `app/api/` that use the service-role client bypass RLS entirely, so authorization there is enforced by the route's own code (`requireUser`/`requireAdmin` plus an explicit ownership check) — this matters when adding a new one.

## Why Waalaxy is configured by hand

Waalaxy's public API can create/read contact lists but can't set a campaign's message content or reliably handle LinkedIn's 2FA prompts. So the actual sequence (connection note + follow-ups) is configured in the Waalaxy UI by a person on the Myntmore team, using the brief and lead list this app hands them. This app's job is everything around that: intake, lead-list handling, LinkedIn credential capture, status tracking, and reporting results back — not running the outreach itself.

## Deploy

Import `aitoolsteejay/outreach-tool` into Vercel with Next.js as the detected framework, and set the environment variables above (keep `SUPABASE_SERVICE_ROLE_KEY` server-only — Vercel's project settings, not `NEXT_PUBLIC_*`).
