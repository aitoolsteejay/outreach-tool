# Myntmore Outreach Tool

A LinkedIn outreach service, run **for** clients rather than sold **to** them as self-serve software. A client submits a lead list and a message sequence through this app; a person on the Myntmore team reviews it, configures the actual send in [Waalaxy](https://www.waalaxy.com/) by hand, and runs the campaign. This repo is the portal that connects the two sides of that relationship: a client dashboard for submitting and tracking campaigns, and an admin toolkit for running them — plus everything in between (lead-list handling, LinkedIn credential capture and 2FA relay, performance reporting, alerts).

It is **not** a self-serve LinkedIn automation tool. There is no button anywhere in this app that sends a LinkedIn connection request. See [Why Waalaxy is configured by hand](#why-waalaxy-is-configured-by-hand) for exactly where the automation boundary sits and why.

---

## Table of contents

- [What's here](#whats-here)
- [Client-side features, in detail](#client-side-features-in-detail)
- [Admin-side features, in detail](#admin-side-features-in-detail)
- [Architecture](#architecture)
- [Directory structure](#directory-structure)
- [Data model](#data-model)
- [API routes reference](#api-routes-reference)
- [Security model](#security-model)
- [Why Waalaxy is configured by hand](#why-waalaxy-is-configured-by-hand)
- [The standalone marketing page](#the-standalone-marketing-page)
- [Stack](#stack)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Scripts](#scripts)
- [Deploy](#deploy)
- [Known limitations / non-goals](#known-limitations--non-goals)
- [Glossary](#glossary)

---

## What's here

The Next.js app itself has two routes:

- **`/login`** (`app/login/page.tsx`) — email/password sign-in, plus a one-time, public, unauthenticated admin-bootstrap form that disappears forever once the first admin account exists. `/` (`app/page.tsx`) is a plain server-side redirect here — there is no public marketing page inside the app, since it's only ever reached by an existing client or admin. (There *is* a separate marketing page — see [The standalone marketing page](#the-standalone-marketing-page) — it just doesn't live inside this Next.js app.)
- **`/dashboard`** (`app/dashboard/page.tsx`) — the actual tool. This is deliberately **one component**, not a client-side vs. admin-side pair of routes: it fetches the signed-in user's `profiles.role` on mount and renders one of two entirely different UIs from that single branch. See [Architecture](#architecture) for why.

Everything else — encryption, CSV parsing, the Waalaxy API client, Supabase client factories — lives in `lib/`, and every server-side authorization/business-logic endpoint lives under `app/api/`.

## Client-side features, in detail

**Submitting a campaign** (a 3-step wizard):
1. Name the campaign, pick a goal (from a fixed list: book discovery calls, build partnerships, recruit candidates, start investor conversations), describe the offer, and set a voice/tone.
2. Upload a lead-list CSV. The exact expected columns are `first_name, last_name, job_title, company, linkedin_url, email, notes` (only `linkedin_url` is required) — a "Download template" button in the sidebar produces a correctly-headed example file. If the uploaded file's headers don't match, the wizard doesn't just reject it: it offers a column-mapping screen (best-effort auto-guessed from common synonyms, e.g. "Surname" → `last_name`), lets the client remap any column to any field, warns if two fields would read from the same source column, and re-serializes the result into the canonical CSV shape before it's ever uploaded to storage.
3. Write the connection request note (300-character cap, matching LinkedIn's own limit) and 1–3 follow-up messages. Every message field has "Insert placeholder" buttons (`{{first_name}}`, `{{last_name}}`, `{{company}}`) that splice the token in at the cursor's current position (or replace a selection) rather than always appending to the end. Each follow-up also has its own "wait N days" delay (1–60 days, defaulting to 3) — follow-up 1's delay counts from the connection request being accepted, every later one counts from the follow-up before it, not cumulatively from the connection request.

Submitting uploads the lead CSV to private Storage, inserts the `campaigns` row, and inserts the matching `lead_files` row — if any later step fails, the earlier ones are rolled back (the campaign row and the uploaded file are both deleted) rather than left in a half-created state.

**Tracking a campaign** — the campaign list opens a full-page detail view (not a small modal — it shares the viewport with the sidebar so navigating away doesn't require closing it first) showing:
- The brief (goal/offer/tone, connection note, each follow-up and its wait time), editable at any point before the campaign is completed. Editing posts an alert (see below) so the admin team knows to review the change before continuing outreach with the new messaging — since a campaign already configured in Waalaxy won't itself notice the brief changed.
- Performance: raw counts (leads, requests sent, accepted, replied) alongside the computed acceptance rate and positive-reply rate.
- The per-lead list: every lead's derived status (**Not yet sent** → **Sent** → **Accepted** → **Replied**, derived from three date columns, never stored as its own redundant status string) and a label picker (see "Lead labels" below). Expandable past 5 rows.
- **Add leads**: upload another CSV batch into an already-running campaign. Duplicates (matched by `linkedin_url`, case/whitespace-insensitive) are skipped automatically rather than re-queued, and a concurrent double-submit (two tabs, a double-click) is guarded against server-side so the second request doesn't silently clobber the first's newly-added leads.
- Any alerts the admin team has posted against this specific campaign (see below) — except the automatic "you just edited this campaign" one, which is meant for the admin team's eyes, not the client's own.
- A "remove this campaign" action, available only while it's still in the `Submitted` state and has no unresolved alert against it (so a client can't delete their way out from under an admin's open issue).

**Lead labels** — independent of the admin-controlled pipeline stage above, a client can tag any lead with their *own* categories (defaults: Hot / Cold, seeded automatically for every client). Managed from a "Lead labels" item in the sidebar: add, rename, recolor (from a fixed 8-swatch palette, for visual consistency across clients), or delete a label at any time. Deleting a label never touches the leads that had it — they just revert to unlabeled (a `on delete set null` foreign key, mirrored optimistically in the UI so an already-open campaign view doesn't keep showing a label that no longer exists).

**LinkedIn credentials** — a client submits their LinkedIn email/password once (the password is AES-256-GCM encrypted before it's ever written to the database — see [Security model](#security-model)), then the dashboard becomes the channel for whatever LinkedIn throws at the admin's manual login attempt: submitting a 2FA verification code, or just confirming they tapped "Yes" on a phone-approval prompt.

**Alerts** — a client sees whatever the admin team posts to them: account-wide (not tied to any campaign), campaign-wide, or pointed at one specific lead by name/URL. The hero dashboard's top banner and the campaign-list's per-row warning badge both reflect unresolved alerts — but, again, never the client's own self-generated "you edited this campaign" alert.

**Hero stats** — a filterable summary row (all-time or last 7/30/90 days, all campaigns or one specific campaign) showing submitted/live/in-review counts, total leads reached, average progress, and the aggregate acceptance rate / reply rate across whatever's currently selected.

## Admin-side features, in detail

**Work queue** — every client's campaigns in one filterable list (by status), each showing an unresolved-alert indicator. Clicking one opens "Manage campaign":
- The full brief (read-only from the admin's side — a client edits their own).
- Status and progress, editable (`Submitted → In review → In setup → Live → Completed`).
- **Performance metrics entry**, two ways: type the four numbers by hand, or upload Waalaxy's own contact-export CSV for the campaign and let it be parsed automatically — connections sent/accepted/replied are counted from each lead's own date columns (`connectionRequestDate`/`connectedAt`/`lastReplyDetectedDate`) rather than trusted as a pre-aggregated total, and every individual lead's status is refreshed from the same file (upserted, keyed on `(campaign_id, linkedin_url)`, so re-uploading a later export updates existing rows instead of duplicating them). Positive replies stay a manual number, since the export doesn't cleanly encode "positive" vs. any reply.
- **Download this campaign's lead list** as the exact CSV the client uploaded, to import into Waalaxy by hand.
- **Link + push to Waalaxy**: attach the campaign to an existing Waalaxy campaign and prospect list (both picked from live dropdowns, fetched from Waalaxy's own API), then push the lead list into it in one action. The per-prospect import result codes are always shown in full (not just a computed pass/fail count) since Waalaxy's set of possible codes isn't fully documented — this route deliberately doesn't hide a code it doesn't recognize behind a false "success."
- Post or resolve alerts against this campaign.

**Account management** — create a client or admin account (or grant Outreach access to an email that already has a Myntmore login for another tool, verified by asking for that account's existing password rather than trusting the email alone); change anyone's role; revoke access (a soft-delete — their historical campaigns are preserved, not deleted, and their account stays visible with a "Revoked" badge so it can be found again); restore a revoked account's access with one click. The very last active admin can never be demoted or revoked (enforced with a database-level advisory lock, so two concurrent requests can't both slip through).

Per client account, also: LinkedIn credential management (reveal the password or the submitted 2FA code — both a distinct, audited action, not a side effect of just opening the panel — request a fresh code, request phone approval, mark logged in, mark failed with a reason, or ask the client to log in again), and posting/resolving account-wide alerts.

**Export** — every campaign as one CSV (name, client, status, progress, leads, sent/accepted, acceptance rate, replies/positive replies, reply rate), queried fresh at click time rather than reused from whatever the dashboard happened to have cached at page-load.

## Architecture

`app/dashboard/page.tsx` is a single ~1,700-line client component rendering two almost entirely different UIs (client vs. admin) from one `role` branch, rather than two separate routes. This is deliberate, not an accident of growth: the two roles share a lot of underlying state (campaigns, alerts, profile), a lot of visual language (the same modal/card/pill vocabulary), and — critically — a lot of *cross-referencing* (an admin's "Manage campaign" view needs the same campaign object a client's own detail view renders, an alert needs to be filterable from both sides). Splitting it into two routes would mean either duplicating that plumbing or building a shared-state layer just to reunite it. The trade-off is a large file; the mitigation is that the two branches essentially never touch the same JSX or handlers except at the very top (workspace load) and very bottom (shared modals like the lead-labels settings), so the branch itself reads as two mostly-independent halves.

There is no ORM. Every table read/write goes through the Supabase JS client directly — either the **browser** client (`lib/supabase/client.ts`, subject to RLS, used for anything a signed-in user is allowed to touch directly) or the **service-role** client (`lib/supabase/admin.ts`, bypasses RLS entirely, used only inside `app/api/**` routes for the specific operations RLS can't or shouldn't gate on its own — see [Security model](#security-model)).

Verification of a change in this repo, in order: `npx tsc --noEmit` → `npm run lint` → `npm test` → `npm run build`. There's no dev server available with real login credentials in most working contexts, so UI changes to the dashboard/login pages are typically verified by copying `app/globals.css` (with its `@import "tailwindcss"` line stripped) into a small standalone static-HTML mock reusing the real class names, served locally, and screenshotted — not by logging in.

## Directory structure

```
app/
  page.tsx                    -- "/" -> redirect("/login"), nothing else
  layout.tsx                  -- root layout; self-hosted Inter via next/font, metadata/OG tags
  globals.css                 -- hand-written CSS for the login page and dashboard (Tailwind
                                  utilities are also available but most of this app's actual
                                  visual design lives here, not in Tailwind classes)
  login/
    page.tsx                  -- sign-in form + one-time admin-bootstrap form
  dashboard/
    page.tsx                  -- the entire tool (see Architecture above)
  api/
    bootstrap/admin/          -- POST: one-time public admin creation
    admin/
      users/                  -- POST create, PATCH change role ([id]), DELETE revoke ([id])
      campaigns/[id]/
        waalaxy/               -- GET/POST: read or set the Waalaxy campaign+list link
        push-to-waalaxy/       -- POST: import the lead CSV into the linked Waalaxy campaign
        leads-csv/              -- GET: download the client's uploaded lead CSV
      waalaxy/
        campaigns/             -- GET: list Waalaxy campaigns (for the link picker)
        lists/                  -- GET: list Waalaxy prospect lists
      linkedin-credentials/[clientId]/
        route.ts               -- GET status, PATCH transition (request_code/mark_failed/...)
        reveal/                -- POST: decrypt and return the password (audited)
        reveal-code/            -- POST: return the submitted 2FA code (audited)
    client/
      campaigns/[id]/
        route.ts               -- PATCH: edit the campaign's own brief/messaging
        leads/                  -- POST: add another lead-list batch, merging + de-duping
      lead-statuses/[id]/       -- PATCH: set/clear a lead's category_id
      linkedin-credentials/
        route.ts               -- GET own status, POST submit/replace credentials
        code/                   -- POST: submit a 2FA code / confirm phone approval
lib/
  csv.ts                       -- CSV parsing/generation: lead-list upload, column mapping,
                                  Waalaxy contact-export parsing, CSV downloads
  waalaxy.ts                   -- thin server-only Waalaxy REST API client
  crypto.ts                    -- AES-256-GCM encrypt/decrypt for secrets at rest
  roles.ts                     -- the two valid roles, kept in sync with a DB check constraint
  supabase/
    client.ts                  -- browser Supabase client factory (RLS-scoped)
    admin.ts                   -- service-role Supabase client factory (bypasses RLS)
    require-user.ts            -- bearer-token auth check for any signed-in, non-revoked member
    require-admin.ts           -- same, plus requires role = 'admin'
supabase/
  migrations/                  -- see Data model below; applied in filename (timestamp) order
  seed-dummy-client-data.sql   -- tracked, synthetic seed data safe to commit
  seed-*.sql (untracked)       -- real-client seed scripts generated ad hoc from actual CSV
                                  exports; deliberately never committed (see Security model)
tests/
  csv.test.ts                  -- lib/csv.ts: parsing edge cases, column mapping, Waalaxy
                                  contact-export summarization
  crypto.test.ts               -- lib/crypto.ts: round-trip, random IV, tamper detection,
                                  missing/malformed key handling
marketing/
  landing.html                 -- standalone static marketing page; see below, not part of
                                  the Next.js app
  README.md
```

## Data model

Every application table lives in the Postgres **`outreach`** schema, not `public` — this Supabase project's `auth.users` table is shared with other Myntmore tools, and access to *this* app is granted only by an explicit row existing for that user in `outreach.profiles`. Migrations are in `supabase/migrations/`, applied in filename order; every one is written idempotently (`create table if not exists`, `add column if not exists`, drop-then-create for policies) so re-running the whole set against an already-up-to-date database is always a safe no-op.

> **Before touching schema**, know this: `outreach.campaigns` and `outreach.lead_files` (plus a few of their columns) were originally created **by hand** in the Supabase dashboard, before any migration existed for them. The migrations that reference these tables are safe no-ops against that already-existing live database — but that also means a column default *described* in a migration isn't guaranteed to actually be set on the live table if the column predates that migration. If you ever hit `null value in column "x" violates not-null constraint` on one of these older tables, that's usually why: supply the value explicitly rather than trusting the described default.

Tables, roughly in the order they were introduced:

| Table | Purpose | Key columns |
| --- | --- | --- |
| `outreach.profiles` | Outreach membership for a shared Auth identity. No row here = no access to this app, regardless of the Auth account's status elsewhere. | `id` (= `auth.users.id`), `role` (`admin`/`client`), `access_revoked_at` (soft-delete) |
| `outreach.campaigns` | One row per submitted campaign: brief, messaging, follow-ups + their delays, Waalaxy link/sync state, performance metrics. | `client_id`, `goal/offer/tone/messaging_strategy/connection_note`, `follow_up_count/follow_up_messages/follow_up_delay_days` (jsonb arrays), `status`, `progress`, `waalaxy_*`, `connections_sent/accepted`, `replies_received`, `positive_replies` |
| `outreach.lead_files` | One row per uploaded CSV batch for a campaign (private Storage pointer, not the leads themselves). | `campaign_id`, `client_id`, `storage_path` |
| `outreach.campaign_alerts` | Admin → client notices: account-wide (`campaign_id is null`), campaign-wide, or lead-specific (`lead_reference`, plain text). | `client_id`, `campaign_id` (nullable), `severity`, `message`, `resolved`, `created_by` |
| `outreach.linkedin_credentials` | One row per client. Password is AES-256-GCM encrypted at the app layer before it ever reaches this table. **No RLS grants at all** — every access goes through a server API route using the service-role client. | `encrypted_password/password_iv/password_auth_tag`, `status`, `verification_code` (plaintext — see [Known limitations](#known-limitations--non-goals)), audit columns (`revealed_at/by`, `code_revealed_at/by`, `last_attempt_at/by`) |
| `outreach.lead_statuses` | Per-lead derived status, populated by an admin re-uploading a Waalaxy contact export. Deliberately **no status text column** — `connection_request_date/connected_at/replied_at` are the single source of truth everywhere this is read, so a redundant stored status string can never silently disagree with them. | `campaign_id`, `client_id`, `linkedin_url` (unique with `campaign_id`), three date columns, `category_id` |
| `outreach.lead_categories` | A client's own lead labels (Hot/Cold/etc.), fully client-owned. | `client_id`, `name` (unique per client), `color`, `position` |

Key Postgres functions (all `security definer`, `set search_path = ''`):

- `outreach.is_admin_user(uuid)` / `outreach.has_outreach_access(uuid)` / `outreach.has_admin()` — the building blocks nearly every RLS policy is written against.
- `outreach.claim_bootstrap_admin(...)` — the one-time "create the first admin" claim, made atomic via `pg_advisory_xact_lock` so two concurrent bootstrap requests can't both succeed.
- `outreach.find_auth_user_by_email(text)` — an indexed direct lookup, replacing an earlier approach (`auth.admin.listUsers` + scan the first page) that silently stopped finding matches once the *shared* Auth table passed 1,000 users.
- `outreach.set_member_access(target_id, requested_role, revoke_access)` — the only path that changes a member's role or revoked status; locks the row, refuses to demote/revoke the last active admin, and (this is also the *entire* mechanism behind "restore access" — no separate function exists for it) always clears `access_revoked_at` on any successful call where `revoke_access` is `false`, even if the requested role is unchanged.

RLS is the actual authorization boundary for every direct browser→Supabase call: a client can only see/modify rows where `client_id = auth.uid()` (and their own access isn't revoked), an admin (`is_admin_user`) can see/modify everything. Full detail on what bypasses RLS entirely is in [Security model](#security-model).

## API routes reference

Every route below requires a bearer token (the signed-in user's Supabase access token) except the bootstrap one, which is deliberately public. `requireUser` accepts any signed-in, non-revoked member; `requireAdmin` additionally requires `role = 'admin'`.

| Method & path | Auth | What it does |
| --- | --- | --- |
| `POST /api/bootstrap/admin` | **public** | Creates the first admin account. Self-disabling forever once one exists (checked twice: a cheap fast-path lookup, then an atomic claim via `claim_bootstrap_admin`). If the email already has a Myntmore login for another tool, requires that account's existing password to prove ownership before granting it Outreach admin access. |
| `POST /api/admin/users` | admin | Creates a client or admin account, or grants Outreach access to an existing Myntmore login (same email-lookup + upsert pattern as bootstrap, minus the password-proof step — an admin is trusted to do this deliberately). |
| `PATCH /api/admin/users/[id]` | admin | Changes a member's role. Refuses to act on the caller's own account. |
| `DELETE /api/admin/users/[id]` | admin | Revokes access (soft-delete). Refuses to act on the caller's own account. |
| `GET /api/admin/campaigns/[id]/waalaxy` | admin | Reads the campaign's Waalaxy link + sync status. |
| `POST /api/admin/campaigns/[id]/waalaxy` | admin | Links the campaign to a Waalaxy campaign ID + prospect list ID. |
| `POST /api/admin/campaigns/[id]/push-to-waalaxy` | admin | Downloads the campaign's uploaded lead CSV, parses it, and imports every row into the linked Waalaxy campaign/list. Records the per-prospect result codes and an overall `synced`/`partial`/`failed` status back onto the campaign. |
| `GET /api/admin/campaigns/[id]/leads-csv` | admin | Streams back the exact CSV the client uploaded, for manual import into Waalaxy. |
| `GET /api/admin/waalaxy/campaigns` | admin | Lists Waalaxy campaigns (id + name only — Waalaxy's API doesn't expose stats). |
| `GET /api/admin/waalaxy/lists` | admin | Lists Waalaxy prospect lists. |
| `GET /api/admin/linkedin-credentials/[clientId]` | admin | Status fields only — email, status, audit timestamps, and a `has_code` boolean. Never the password or the code itself. |
| `PATCH /api/admin/linkedin-credentials/[clientId]` | admin | Transitions status: `request_code`, `request_approval`, `mark_logged_in`, `mark_failed` (with a reason), `reset`. |
| `POST /api/admin/linkedin-credentials/[clientId]/reveal` | admin | Decrypts and returns the password. A distinct, audited action (`revealed_at/by`), not a side effect of the GET above. |
| `POST /api/admin/linkedin-credentials/[clientId]/reveal-code` | admin | Returns the client's submitted 2FA code. Same audited-reveal pattern as the password. |
| `PATCH /api/client/campaigns/[id]` | user (owner) | Edits the caller's own campaign brief, messaging, follow-ups, and follow-up delays. Verifies ownership and that the campaign isn't already `completed`. Also posts a `campaign_alerts` row so the admin team knows to review the change. |
| `POST /api/client/campaigns/[id]/leads` | user (owner) | Merges a freshly-uploaded CSV batch into the campaign's existing lead list (de-duped by `linkedin_url`), replacing the campaign's single authoritative `lead_files` row. Guards against a concurrent second "add leads" request silently overwriting the first's result. |
| `PATCH /api/client/lead-statuses/[id]` | user (owner) | Sets or clears a lead's `category_id`. Verifies both the lead and the target category belong to the caller — the rest of that row (the derived-status date columns) stays admin-only. |
| `GET /api/client/linkedin-credentials` | user | Returns the caller's own LinkedIn status fields (never the password). |
| `POST /api/client/linkedin-credentials` | user | Submits/replaces LinkedIn email + password. Encrypts the password before it's ever written to the database. |
| `POST /api/client/linkedin-credentials/code` | user | Submits a 2FA verification code (or confirms a phone-approval prompt). Only accepted while the account's status is actually awaiting one. |

## Security model

Two separate mechanisms enforce authorization, deliberately kept distinct rather than layered:

1. **Row-level security (RLS)**, for anything a signed-in user's own browser session touches directly via the Supabase JS client. A client's policies are always shaped `client_id = auth.uid() and has_outreach_access(auth.uid())`; an admin's are always `is_admin_user(auth.uid())`. This is the *only* enforcement for those calls — there's no server code in the loop to double-check them.
2. **Server API routes using the service-role client**, for anything RLS can't or shouldn't gate on its own — usually because the operation needs to write across a client/admin boundary the client's own session isn't allowed to cross directly (e.g. a client editing their campaign's brief goes through `PATCH /api/client/campaigns/[id]` rather than a direct table `UPDATE`, because the rest of that row has admin-only columns an RLS policy can't selectively protect at the column level). The service-role client **bypasses RLS entirely**, so every one of these routes does its own explicit ownership check (`requireUser`/`requireAdmin`, then a `select ... eq("client_id", auth.userId)` style check) before touching anything. When adding a new route like this, that explicit check is not optional — nothing else is protecting it.

Secrets at rest:
- LinkedIn **passwords** are AES-256-GCM encrypted at the application layer (`lib/crypto.ts`) before ever reaching the database, using `CREDENTIALS_ENCRYPTION_KEY` — a key that exists only in the server environment, never in the database, never sent to the browser. A random IV per encryption (so the same password never produces the same ciphertext twice) and the GCM auth tag are verified on every decrypt, so a tampered ciphertext throws rather than returning garbage.
- The `outreach.linkedin_credentials` table has **no RLS grants at all** for `authenticated`/`anon` — every read and write goes through a server API route. Revoking the table grants outright means even a bug that accidentally used the browser client here fails closed instead of leaking ciphertext.
- Revealing a password or a 2FA code is always a distinct, explicitly-audited action (`revealed_at/by`, `code_revealed_at/by`) — never a side effect of just loading the admin panel.
- The LinkedIn **verification code** itself is currently stored in plaintext (unlike the password) — see [Known limitations](#known-limitations--non-goals).

Real client PII never reaches version control: seed SQL scripts generated ad hoc from a client's actual CSV export (real names, companies, LinkedIn URLs) are deliberately left untracked (`supabase/seed-*.sql` outside of `seed-dummy-client-data.sql`) — generated, handed to whoever needs them, never committed.

## Why Waalaxy is configured by hand

Waalaxy's public API is intentionally narrow: it can list campaigns (id + name only, no stats), list prospect lists, and import prospects into a list while enrolling them into an *already-existing* campaign. It cannot create a campaign, set or edit the connection-note/follow-up message text, launch or pause a campaign, handle LinkedIn's 2FA prompts, or return performance analytics. A person on the Myntmore team still has to create the campaign and paste the actual message sequence into Waalaxy's own UI by hand, and log into the client's LinkedIn account through a real browser to get past whatever 2FA challenge comes up.

This app's job is everything *around* that manual step: intake (the brief + lead list), lead-list handling (validation, column mapping, de-duped batch additions), LinkedIn credential capture and the 2FA back-and-forth, linking a campaign to its Waalaxy counterpart and pushing the lead list into it, pulling performance back out (by re-uploading Waalaxy's own contact export), and surfacing all of that to both sides through status tracking and alerts. It is not, and isn't trying to be, a replacement for Waalaxy's own sending engine.

## The standalone marketing page

`marketing/landing.html` is a self-contained static HTML file — no build step, no dependency on the Next.js app, no shared code with it — that serves as Myntmore Outreach's public sales/marketing page. It replaces what used to be a marketing page built directly into this app at `/` (removed once the app itself became login-only, since there was never a real audience landing on `/` who wasn't already a client or admin). It's also published as a Claude Artifact for easy sharing/editing (the link is in `marketing/README.md`) — if you edit one, update the other so they don't drift apart. Its CTAs currently point at a placeholder `mailto:` address; swap in the real sales inbox before actually sending it out anywhere.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**, deployed on Vercel. Built with `next build --webpack` (not Turbopack).
- **Supabase**: Postgres (schema `outreach`, RLS throughout), Auth, and private Storage (the `outreach-leads` bucket, 10 MB file-size limit) for lead-list CSVs.
- **Tailwind v4** is wired in (`@tailwindcss/postcss`) but most of this app's actual visual design lives in hand-written CSS in `app/globals.css`, not Tailwind utility classes — Tailwind is available for anything that's easier to reach for it.
- No ORM anywhere — the Supabase JS client, called directly.

## Getting started

Requires Node 22.13 or newer.

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it will immediately redirect to `/login`. The first time, with no admin account yet, the login page shows a "Create an admin account" link; use it once, then create client accounts from the admin dashboard.

You'll need a Supabase project with the migrations in `supabase/migrations/` applied (in filename order — the Supabase CLI's `supabase db push`/`migration up`, or pasting them into the SQL editor in order, both work, since every migration is idempotent). `supabase/seed-dummy-client-data.sql` is safe, synthetic data you can load afterward to populate a fresh database with something to look at.

### Environment variables

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key (browser + server, RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Bypasses RLS — used by API routes that need to write across a client/admin boundary the caller's own session can't. Never expose this to the browser. |
| `WAALAXY_API_KEY` | Waalaxy's API (limited use — see [Why Waalaxy is configured by hand](#why-waalaxy-is-configured-by-hand)) |
| `CREDENTIALS_ENCRYPTION_KEY` | AES-256-GCM key for encrypting LinkedIn credentials at rest. Generate with `openssl rand -base64 32`. Must decode to exactly 32 bytes. |

Missing `WAALAXY_API_KEY` doesn't crash the app — every Waalaxy-dependent route returns a `501` with a clear "not configured" message instead, so the rest of the tool stays usable without it. Missing `CREDENTIALS_ENCRYPTION_KEY` (or one that isn't a valid 32-byte key) fails loudly the first time anything tries to encrypt/decrypt a LinkedIn credential, rather than silently storing something unsafe.

## Testing

```bash
npm test
```

Runs Node's built-in test runner over `tests/*.test.ts` (no separate test framework). Two files:

- `tests/csv.test.ts` — `lib/csv.ts`: CSV parsing edge cases (quoted fields containing commas/quotes, a stray quote mid-field deliberately *not* opening quote mode, CRLF vs. LF line endings, blank-line skipping), the 10 MB upload-size limit, column-mapping guesses and conflict detection, and the Waalaxy contact-export summarizer (counts sent/accepted/replied from date columns, matches columns case-insensitively regardless of order, rejects a file that isn't actually a Waalaxy export, de-dupes leads by `linkedin_url` keeping the last occurrence).
- `tests/crypto.test.ts` — `lib/crypto.ts`: encrypt/decrypt round-trips, confirms a random IV means the same plaintext never produces the same ciphertext twice, confirms a tampered ciphertext throws rather than returning garbage, and confirms both a missing and a malformed encryption key fail loudly.

There's no test coverage for `app/dashboard/page.tsx` or the API routes — verification there is `tsc` + `lint` + manual/visual checking (see [Architecture](#architecture)).

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build (webpack; see next.config.ts)
npm start       # run a production build
npm run lint    # eslint
npm test        # node's built-in test runner over tests/*.test.ts
```

## Deploy

Import `aitoolsteejay/outreach-tool` into Vercel with Next.js as the detected framework (already declared in `vercel.json`), and set the environment variables above in the project's own settings — keep `SUPABASE_SERVICE_ROLE_KEY` and `CREDENTIALS_ENCRYPTION_KEY` server-only, never as `NEXT_PUBLIC_*`.

Whenever a change adds a new migration file, it needs to be run against the live Supabase project — this repo doesn't apply migrations automatically as part of deploy.

## Known limitations / non-goals

- **No self-serve sending.** Repeating this because it's the single most important thing to understand about this codebase: nothing in this app sends a LinkedIn connection request or message. See [Why Waalaxy is configured by hand](#why-waalaxy-is-configured-by-hand).
- **The LinkedIn verification code is stored in plaintext**, unlike the password (which is AES-256-GCM encrypted). Likely an acceptable trade-off since a code is only ever valid for a few minutes, but it's an inconsistency worth a deliberate decision rather than an oversight.
- **No automated tests for the dashboard UI or API routes** — only the two pure-logic library files (`lib/csv.ts`, `lib/crypto.ts`) have test coverage.
- **`outreach.campaigns` and `outreach.lead_files` predate their own migrations.** See the callout in [Data model](#data-model) — a described column default isn't guaranteed to actually be live on an old production database.
- **Waalaxy's import-result codes aren't fully documented.** `push-to-waalaxy` treats `"success"` as the only known-good code and always shows the raw per-code breakdown rather than hiding an unrecognized code behind a computed pass/fail count, specifically because this assumption could be wrong for a code Myntmore hasn't seen yet.

## Glossary

- **RLS** — Postgres Row-Level Security. Policies that restrict which rows a given database role/user can see or modify, enforced by Postgres itself regardless of what the calling application code does or doesn't check.
- **Service-role client** — a Supabase client authenticated with the project's service-role key, which bypasses RLS entirely. Used only in server-side API routes, never sent to the browser.
- **`outreach` schema** — this app's own Postgres schema, separate from `public`, since the underlying Supabase project's `auth.users` table is shared with other Myntmore tools and this app's own tables shouldn't collide with theirs.
- **Waalaxy** — the third-party LinkedIn automation tool that actually sends connection requests and follow-up messages, configured by hand by the Myntmore team using the brief/lead-list this app produces.
- **Brief** — a campaign's goal, offer, tone, connection note, and follow-up messages (+ delays) — the input a client provides that an admin turns into an actual Waalaxy campaign.
- **Lead status** vs. **lead category/label** — two independent, easily-confused concepts. *Status* (Sent/Accepted/Replied) is admin-authoritative, derived purely from date columns sourced from Waalaxy's own export. *Category/label* (Hot/Cold/etc.) is entirely client-owned and has nothing to do with outreach progress — it's the client's own way of tagging leads.
