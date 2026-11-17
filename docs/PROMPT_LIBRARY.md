# Outreach Tool Prompt Library

Copy-paste prompts for making changes to the Outreach Tool with an AI coding assistant (Claude Code or similar). Every prompt is a template: replace the `<ANGLE BRACKETS>`, delete lines that don't apply, keep the rest.

## Contents

0. [How to use this library](#0-how-to-use-this-library)
1. [The guardrails block (paste into every session)](#1-the-guardrails-block)
2. [Map of the codebase (what lives where)](#2-map-of-the-codebase)
3. [Copy and text changes](#3-copy-and-text-changes)
4. [Visual design and theme](#4-visual-design-and-theme)
5. [Login and accounts](#5-login-and-accounts)
6. [Client side: new-campaign wizard](#6-client-side-new-campaign-wizard)
7. [Client side: campaign list, detail, stats](#7-client-side-campaign-list-detail-stats)
8. [Client side: leads, labels, add leads](#8-client-side-leads-labels-add-leads)
9. [Client side: alerts, LinkedIn credentials, help](#9-client-side-alerts-linkedin-credentials-help)
10. [Admin side: work queue and manage campaign](#10-admin-side-work-queue-and-manage-campaign)
11. [Admin side: results upload and replies](#11-admin-side-results-upload-and-replies)
12. [Admin side: accounts and LinkedIn handling](#12-admin-side-accounts-and-linkedin-handling)
13. [Database changes](#13-database-changes)
14. [API routes](#14-api-routes)
15. [CSV and file handling](#15-csv-and-file-handling)
16. [Security hardening](#16-security-hardening)
17. [Integrations and notifications](#17-integrations-and-notifications)
18. [Feature ideas with ready-made prompts](#18-feature-ideas-with-ready-made-prompts)
19. [Testing](#19-testing)
20. [Bug hunting and code review](#20-bug-hunting-and-code-review)
21. [Refactoring and performance](#21-refactoring-and-performance)
22. [Accessibility and responsive design](#22-accessibility-and-responsive-design)
23. [Deploy, live checks, migrations](#23-deploy-live-checks-migrations)
24. [Data operations (seed scripts, cleanup)](#24-data-operations)
25. [Documentation and git hygiene](#25-documentation-and-git-hygiene)
26. [Troubleshooting prompts](#26-troubleshooting-prompts)

---

## 0. How to use this library

**A good prompt has five parts.** Every template below follows this shape:

1. **Goal**: one sentence on what should be different afterwards.
2. **Where**: which screen, file or table (the more specific, the fewer wrong guesses).
3. **Rules**: constraints that must hold (see the guardrails block).
4. **Done when**: how you will know it worked (what you should be able to see or click).
5. **Verify**: what the assistant must run or show before saying "done".

**Tips**

- One change per prompt. Small prompts finish faster and are easier to undo.
- Say what you see, not what you think the cause is. "The button is teal but should be amber" beats "fix the CSS".
- Paste a screenshot whenever the request is visual.
- If you only want a check and not a change, say "do not change any files, just report".
- If something is risky or irreversible (database changes, deleting data, pushing), say "ask me before doing it".
- Ask for the plan first on anything touching the database or security: "Before changing anything, tell me your plan in 5 bullets and wait for my OK."

---

## 1. The guardrails block

Paste this at the start of a session, or append it to any prompt that changes code. It encodes the rules this project has learned the hard way.

```
Project rules for the Outreach Tool (follow all of them):

1. VENDOR NAME: the name of the third-party sending tool must never appear in
   anything a client's browser receives (UI text, CSS class names, JS bundle,
   API paths, error messages). Use "automation tool" or neutral wording.
   After UI changes, rebuild and grep .next/static for the vendor name; it must
   return nothing.

2. NO EM DASHES in any user-visible copy anywhere. Use a comma, colon, period
   or hyphen instead.

3. NEVER INVENT CAPABILITIES in copy. If I ask you to add text claiming a feature
   that does not exist in the code, tell me first, then follow my decision.

4. REAL CLIENT DATA never goes into git. Files matching supabase/seed-*.sql
   (except seed-dummy-client-data.sql) stay untracked. Never run `git add -A`
   or `git add .`; add files by name.

5. DATABASE CHANGES need a NEW migration file in supabase/migrations/ named
   YYYYMMDDHHMMSS_description.sql. Never edit an already-applied migration. Make
   it idempotent (if not exists / guarded DO blocks). Tell me clearly that I must
   run it against the live database, and say whether the deploy order matters.

6. AUTHORIZATION: browser-side database calls are protected only by row-level
   security. Any API route using the service-role client bypasses it, so it must
   verify the caller (requireUser/requireAdmin) AND check ownership of every id it
   touches before reading or writing.

7. app/dashboard/page.tsx is ONE large component for both client and admin views.
   Keep the client and admin branches separate. Do not move logic between them
   without saying so.

8. CSS gotcha: app/globals.css has broad rules like `.modal input, .modal select,
   .modal textarea` that out-rank single-class rules. If a new input or select
   ignores your styles, use !important on the conflicting properties (there is
   precedent in the file).

9. VERIFY BEFORE SAYING DONE, in this order, and show me the results:
   npx tsc --noEmit  ->  npm run lint  ->  npm test  ->  npm run build
   If the dev server shows old styles or old paths, run `rm -rf .next` first.
   I cannot log in on the assistant's side, so for dashboard UI changes build a
   small static HTML mock using the real CSS classes and screenshot it.

10. GIT: do not commit or push unless I ask. When I do ask: write the message to a
    file and use `git commit -F`, end it with the required Co-Authored-By line,
    remove tsconfig.tsbuildinfo, and revert any stray next-env.d.ts change first.

11. macOS: use `sed -i ''` (with the empty string). File paths with [id] in them
    need quoting.
```

---

## 2. Map of the codebase

Include the relevant line(s) in prompts so the assistant goes to the right file immediately.

| What | Where |
| --- | --- |
| The whole logged-in app (client and admin screens) | `app/dashboard/page.tsx` (single large component) |
| Login page and one-time admin setup | `app/login/page.tsx` |
| `/` just redirects to `/login` | `app/page.tsx` |
| Page title, fonts, share image | `app/layout.tsx` |
| All styling | `app/globals.css` (hand-written; palette is teal `#0D9488` and amber `#D97706` on warm stone) |
| CSV parsing, column mapping, export-file parsing | `lib/csv.ts` |
| Encryption of LinkedIn passwords | `lib/crypto.ts` |
| Sending-tool API client (server only) | `lib/automation.ts` |
| Auth check for API routes | `lib/supabase/require-user.ts`, `require-admin.ts` |
| Supabase clients | `lib/supabase/client.ts` (browser), `admin.ts` (service role) |
| API routes | `app/api/admin/**`, `app/api/client/**`, `app/api/bootstrap/admin` |
| Database history | `supabase/migrations/*.sql` |
| Safe fake data | `supabase/seed-dummy-client-data.sql` |
| Tests | `tests/csv.test.ts`, `tests/crypto.test.ts` |
| Public marketing page (separate, static) | `marketing/landing.html` |
| Reference docs | `README.md`, this file |

Useful constants inside `app/dashboard/page.tsx`: `STATUS_OPTIONS` (campaign pipeline), `LEAD_CATEGORY_COLORS` (label swatches), `DEFAULT_FOLLOW_UP_DELAYS`, `CLIENT_FAQS`, `defaultCampaignForm()`, `safeHref()`.

---

## 3. Copy and text changes

### 3.1 Change one piece of text
```
Change the text "<EXACT CURRENT TEXT>" to "<NEW TEXT>".
It appears on the <client dashboard | admin dashboard | login page>. Search the
whole repo for the current text and tell me every place it appears before editing;
change only the one(s) I named: <WHICH ONE>.
Rules: no em dashes; do not mention the sending tool by name.
Done when: the new text shows in the right place and the old text appears nowhere
user-visible. Run the verification pipeline.
```

### 3.2 Rewrite a whole section's tone
```
Rewrite the copy of <SECTION, e.g. the client dashboard hero / the empty state of
the campaign list / the new-campaign wizard step 3 intro> to sound <TONE: warmer |
more professional | more concise | more reassuring>.
Keep the meaning identical. Do not add claims about features that do not exist.
Show me the before and after for every line in a table first, wait for my OK, then
apply it.
```

### 3.3 Audit all copy for a problem
```
Scan every user-visible string in app/dashboard/page.tsx, app/login/page.tsx and
app/layout.tsx and list any that: (a) contain an em dash, (b) mention the sending
tool by name, (c) claim a capability the code does not implement, (d) have typos
or inconsistent terms (for example "lead list" vs "prospect list").
Report only. Do not change anything.
```

### 3.4 Make terminology consistent
```
We call the uploaded spreadsheet a "<TERM>". Find every place the UI says
"lead list", "prospect list", "contact list" or similar for that concept and make
them all say "<TERM>". Only change user-visible text, not variable names.
```

### 3.5 Edit the FAQs and help
```
In app/dashboard/page.tsx, edit CLIENT_FAQS: <ADD | CHANGE | REMOVE> a question.
Question: "<Q>"  Answer: "<A>"
The answer must be true for how the app works today (check the code). No em dashes.
```

### 3.6 Change the "auto-launched every Tuesday" style claims
```
The client dashboard's "Your campaigns" intro says campaigns are auto-launched on
a specific day. Change it to "<NEW WORDING>". Before editing, tell me whether any
code actually schedules launches; I know the answer may be no and I still want the
text changed if I confirm.
```

### 3.7 Change the page title / share preview
```
Change the browser tab title to "<TITLE>" and the description used for link
previews to "<DESCRIPTION>" in app/layout.tsx. Tell me whether public/og.png needs
replacing for the new wording.
```

---

## 4. Visual design and theme

### 4.1 Try a new color palette (preview first)
```
Current palette: teal #0D9488 (primary), amber #D97706 (accent), warm stone
backgrounds. I want to try: <PALETTE NAME + HEX CODES: primary, accent, background,
dark card>.
First, do NOT change app/globals.css. Build 2 static HTML mocks (using a copy of
globals.css with the first @import line removed and the real class names) showing:
the client dashboard hero + stat tiles + campaign list, the admin overview + side
panel, and the login page. Screenshot the current palette and the new one side
by side and show me. Wait for my OK before applying.
```

### 4.2 Apply a palette across the whole app
```
Apply the approved palette across app/globals.css. Map every old color to its
new role (primary, accent, tints, borders, text, backgrounds). Also find any hex
values that do not belong to either palette (leftover blues/purples) and fix them.
Check these surfaces specifically: client dashboard, admin dashboard, login page,
every dialog (new campaign wizard, Help, Lead labels, Manage account, Manage
campaign), buttons in hover and disabled states, status pills, alert colors.
Contrast rule: white text only on backgrounds with at least 4.5:1 contrast.
Verify with static mocks and the pipeline.
```

### 4.3 Restyle one component
```
Restyle <COMPONENT, e.g. the stat tiles on the client dashboard> so that <DESIRED
LOOK, e.g. each tile has a colored left border and the number is larger>.
Only touch CSS for that component. Do not change layout of anything else.
Show a before/after screenshot from a static mock.
```

### 4.4 Make two screens consistent
```
The <login page> and the <client dashboard> should feel like the same product.
List the visual differences (button style, card radius, shadows, spacing, type
sizes, colors), propose a short plan, then apply it in app/globals.css by adding
rules at the END of the file. Do not edit unrelated rules.
```

### 4.5 Button and form styling
```
Make all <primary | secondary | danger> buttons <DESCRIPTION>. Include hover,
focus-visible, active and disabled states. Remember that .modal input/select/
textarea rules out-rank single-class rules, so check forms inside dialogs too.
```

### 4.6 Typography
```
Change the typeface to <FONT NAME> (loaded through next/font/google in
app/layout.tsx, not a <link> tag), keep IBM Plex Mono for code-like text, and make
sure headings, body, buttons, inputs and modals all pick it up. Show me every
place that hard-codes a font family so we catch leftovers.
```

### 4.7 Dark mode
```
Add a dark theme driven by prefers-color-scheme. Move the colors in app/globals.css
into CSS variables first (list them for me), then define dark values. Cover the
client dashboard, admin dashboard, login page and all dialogs. Do not use pure
black backgrounds or pure white text. Provide screenshots of both themes.
```

### 4.8 Icons and logo
```
Replace the <icon name> icon with <DESCRIPTION> in the Icon() component in
app/dashboard/page.tsx (24x24 viewBox, stroke 1.8, round caps, matching the others).
```

### 4.9 Animations and polish
```
Add a subtle <hover | page-load | modal open> animation to <ELEMENTS>. Keep it
under 250ms, respect prefers-reduced-motion, and do not cause layout shift.
```

---

## 5. Login and accounts

### 5.1 Change what the login page says
```
On app/login/page.tsx change <headline | subtext | stats row | steps row> to
"<NEW CONTENT>". The stats row (12k+ meetings etc.) must only contain numbers I
confirm are real: <YOUR NUMBERS>. If I did not give you numbers, ask me; do not
invent any.
```

### 5.2 Password rules
```
Require passwords of at least <N> characters with <RULES> everywhere an account
is created: app/api/admin/users/route.ts, app/api/bootstrap/admin/route.ts and the
matching forms. Validate on the server (the source of truth) and mirror it in the
form with a helpful message. Add tests for the validation function.
```

### 5.3 Add "forgot password"
```
Add a "Forgot password?" link on the login page that uses Supabase's password
reset email. Plan first: which pages and routes are needed, what redirect URL must
be configured in the Supabase dashboard (tell me exactly what to set), and how
revoked accounts are handled. Wait for my OK.
```

### 5.4 Session timeout / auto sign-out
```
Sign users out automatically after <N> minutes of inactivity, with a warning
dialog 1 minute before. Applies to both roles. Redirect to /login with a message
"You were signed out for inactivity."
```

### 5.5 Add a self-service signup (only if truly wanted)
```
Today accounts are created only by admins. I want <INVITE-ONLY SIGNUP via an
emailed link | OPEN SIGNUP WITH ADMIN APPROVAL>. Do not build it yet. Write a
design note: data model changes, new routes, abuse risks, what an admin sees, and
how it interacts with the one-time admin bootstrap and revoked accounts.
```

### 5.6 Roles
```
Add a third role "<ROLE NAME>" (for example a read-only viewer, or a team member
of a client). Plan first: DB check constraint in lib/roles.ts and the profiles
table, RLS policies, requireUser/requireAdmin behavior, which UI each role sees,
and what the set_member_access function must allow. List every file you'd touch.
```

### 5.7 Multiple users per client company
```
A client company should be able to have several logins that share the same
campaigns. Design only: new "organization" concept, how client_id on campaigns,
lead_statuses, lead_categories and alerts would change, the migration and
backfill for existing clients, and the RLS rewrite. Do not implement yet.
```

---

## 6. Client side: new-campaign wizard

### 6.1 Add a field to the wizard
```
Add a "<FIELD LABEL>" field to step <1|2|3> of the new-campaign wizard.
Type: <text | dropdown with options X, Y, Z | number | yes/no>. Required: <yes|no>.
Full path to cover:
 - defaultCampaignForm() and the form state in app/dashboard/page.tsx
 - the wizard step UI and its Continue-button validation
 - submitCampaign() insert
 - a NEW migration adding the column to outreach.campaigns (idempotent; tell me
   to run it)
 - the read-only brief on the client's campaign detail AND the admin's Manage
   campaign view
 - the client's edit-brief form and the PATCH /api/client/campaigns/[id] route
   (validate the field there too)
 - the README data-model table
Show me the plan first.
```

### 6.2 Change the list of goals
```
Change the "Primary goal" options (in the wizard AND in the edit-brief form) to:
<LIST>. Existing campaigns may hold old goal values; tell me how the UI will
display those, and whether we need to keep the old options for old rows.
```

### 6.3 Change follow-up limits
```
Allow up to <N> follow-ups instead of 3. This touches: the number selector, the
follow_up_messages and follow_up_delay_days arrays, the check constraint on
follow_up_count (needs a migration), the API validation, DEFAULT_FOLLOW_UP_DELAYS,
and both read-only displays. List every spot you find, then change them together.
```

### 6.4 Change follow-up wait rules
```
Change the wait-time rule: <e.g. allow 0 days, allow up to 90 days, offer a
dropdown of 1,2,3,5,7,14 instead of a number box>. Update the UI, the clamping in
updateFollowUpDelay/updateEditFollowUpDelay, the API validation in
app/api/client/campaigns/[id]/route.ts and the migration comment. Keep client and
server limits identical.
```

### 6.5 Change the connection note limit or add more placeholders
```
Add a placeholder token {{<token>}} (for example {{job_title}}) to the "Insert
placeholder" buttons in the wizard and edit form. Make sure it maps to a real
column in the lead CSV template. Tell me whether the downstream tool supports it;
if not, do not add it.
```

### 6.5b Message templates
```
Add a "Start from a template" dropdown to wizard step 3 with <N> templates:
<NAMES + TEXTS>. Selecting one fills the connection note and follow-ups (and asks
before overwriting anything the client already typed). Templates live in a
constant at the top of app/dashboard/page.tsx. No em dashes in template text.
```

### 6.6 Better validation and error messages
```
In wizard step <N>, <describe the confusing moment>. Improve the validation so
the error message says exactly what to fix and the field is highlighted. Do not
change what is valid, only how problems are communicated.
```

### 6.7 Save as draft
```
Let clients save a half-finished campaign as a draft and resume later. Design
first: new status value, what is stored (including the uploaded file), RLS impact,
how drafts show in the list, and the admin side (drafts must NOT appear in the
admin's work queue). Then implement after my OK.
```

### 6.8 Duplicate an existing campaign
```
Add a "Duplicate" action on a client's campaign that pre-fills the wizard with
that campaign's brief and messages but asks for a new lead list. Never copy leads
or results. Client-side only; no new routes unless you can justify one.
```

### 6.9 Pre-launch preview
```
Before submitting, show the client a preview of their connection note and each
follow-up rendered with a sample lead (first name Sarah, last name Bennett,
company Solace Health). Use one shared substitution function so preview and any
other place stay consistent.
```

---

## 7. Client side: campaign list, detail, stats

### 7.1 Change what each campaign row shows
```
In the client "Your campaigns" list, show <ADDITIONAL INFO, e.g. submitted date,
acceptance rate, number of replies> on each row. Keep the row clickable as a
whole, keep keyboard access (Enter/Space), and do not put any admin-only data on
the client's row. Verify at 1500px, 900px and 400px widths.
```

### 7.2 Add search and sort to the campaign list
```
Add a search box (by name) and a sort dropdown (newest, oldest, most replies,
status) above the client's campaign list, next to the existing status filter.
All client-side, no new queries. Sorting must be stable.
```

### 7.3 Change the hero stat cards
```
Change the stat tiles on the client dashboard: remove <TILE>, add <TILE> computed
as <FORMULA, using fields that already exist on the Campaign type>. Guard every
division against zero. Keep the existing time and campaign filters working with
the new tile.
```

### 7.4 Add a chart
```
Add a small chart to the client dashboard showing <replies over time | acceptance
rate by campaign | funnel (sent > accepted > replied)>. First tell me which data
we already have (we only store totals per campaign and three dates per lead, no
daily history) and whether the chart is honest with that data. Use a lightweight
inline SVG, no new dependency, theme colors only.
```

### 7.5 Campaign detail page changes
```
In the client's campaign detail page, <add | move | remove> <SECTION>. The page
is a full-width view that leaves the sidebar visible (class campaignPageModal).
Keep one scroll area, a 1120px content width, and the close button behavior.
```

### 7.6 Show more of the progress story
```
Add a timeline to the client's campaign detail showing: Submitted (date), In
review, In setup, Live, Completed, highlighting the current status. We only store
the current status and submitted_at today, so say which dates are unknown and show
those steps without dates rather than inventing any.
```

### 7.7 Campaign archive
```
Let clients archive completed campaigns so they disappear from the main list
behind an "Archived" filter. Prefer a new status-independent flag column
(migration) over a new status. Admin view unchanged.
```

---

## 8. Client side: leads, labels, add leads

### 8.1 Lead list columns and layout
```
In the client's lead list show <COLUMNS> for each lead and hide <COLUMNS>.
Fields available: name, company, job title, stage, label, reply text, conversation
link, email, phone, location. Keep the stage filter tabs, search and expand/collapse.
All links must go through safeHref() so only http(s) URLs become clickable.
```

### 8.2 New filter or sort in the lead list
```
Add a <filter | sort> to the client's lead list: <e.g. "only leads with a phone
number", "sort by most recent reply">. Reset it when another campaign is opened
(see the reset block in openClientCampaignModal). Show counts on the tabs if it is
a tab-style filter.
```

### 8.3 Bulk actions on leads
```
Add checkboxes to the client's lead list and a bulk bar: "Apply label to
selected" and "Clear label". Selecting should work across filtered results only.
Each change goes through PATCH /api/client/lead-statuses/[id]; design a bulk
endpoint instead if you think N separate requests is too slow, with the same
ownership checks per id.
```

### 8.4 Export the client's leads
```
Add "Download leads (CSV)" to the client's campaign detail, including: name,
company, job title, stage, label name, reply text, email,
phone, location. Use rowsToCsv from lib/csv.ts (it escapes properly). The export
only contains the client's own campaign. Name the file after the campaign.
```

### 8.5 Lead labels: defaults, colors, limits
```
Change the lead label system: <default labels to seed, e.g. Hot / Warm / Cold /
Not interested>, <palette to offer>, <maximum number of labels, e.g. 10>.
Remember: defaults are seeded in TWO places (the migration backfill and the
workspace-load effect in app/dashboard/page.tsx, plus the admin-side seeding when
opening a campaign). Existing clients keep their old labels; tell me how to
handle that if I want them migrated.
```

### 8.6 Notes on a lead
```
Let clients add a private note to each lead (free text up to 500 characters).
Plan: new column or table, RLS (client-owned, admin readable), the API route for
saving (ownership check), UI (small note icon opening an inline editor), and
search should include notes. Do not show notes anywhere the vendor name or
other clients could see.
```

### 8.7 "Add leads" flow
```
Change the "Add leads" flow in the client campaign detail so that <e.g. it shows
a preview of how many new vs duplicate leads BEFORE confirming>. The merge logic
lives in app/api/client/campaigns/[id]/leads/route.ts and de-dupes by lower-cased
trimmed linkedin_url. Keep the double-submit race guard intact.
```

### 8.8 Duplicate handling rules
```
Change how duplicates are detected when adding leads: <e.g. also match by email>.
Update the server route, keep the response counts (added, duplicates, total)
accurate, and add unit tests in tests/ for the matching function (extract it into
lib/csv.ts so it is testable).
```

---

## 9. Client side: alerts, LinkedIn credentials, help

### 9.1 Alert display changes
```
Change how alerts appear to clients: <e.g. group by campaign, show the date,
allow clients to "acknowledge" an alert>. Remember the rule: alerts the client
created themselves (the automatic "you edited this campaign" note) must stay hidden
from the client in ALL THREE places: the top banner, the campaign-list warning icon,
and the campaign detail alert list (filter alert.createdBy !== userId).
If adding "acknowledge", clients cannot update the alerts table directly (RLS),
so design an API route with an ownership check.
```

### 9.2 Alert severity styling
```
Restyle info / warning / error alerts so they are distinguishable without color
alone (add an icon or label). Check both the top banner and the in-campaign list.
```

### 9.3 LinkedIn credentials card
```
Change the client's LinkedIn credentials card: <e.g. add a plain-language
explanation of why we need it, add a "remove my credentials" button>. For
removal: design a server route that deletes the row (the table has no browser
grants), confirms with the client first, and logs it. Never display the stored
password anywhere to the client.
```

### 9.4 Help and support modal
```
Update the Help & support dialog: <CHANGES>. Contact email is currently
hello@myntmore.com in the code; change to <EMAIL> everywhere it appears (search
the repo, including marketing/landing.html).
```

### 9.5 Onboarding for first-time clients
```
Add a first-run welcome for clients with zero campaigns: a 3-step checklist
(Download template, Upload leads, Write your messages) that links to the right
part of the wizard. It disappears after the first campaign is submitted. No new
database state: derive it from campaigns.length.
```

---

## 10. Admin side: work queue and manage campaign

### 10.1 Work queue changes
```
In the admin work queue, <add a column / filter / sort>: <e.g. filter by client,
sort by oldest submission, show submitted date>. The list is built from the
campaigns state and visibleCampaigns. Keep the unresolved-alert icon (admins see
ALL alerts, unlike clients) and the Download all campaigns button.
```

### 10.2 Change the status pipeline
```
Change the campaign statuses from Submitted / In review / In setup / Live /
Completed to <NEW LIST>. Touch: STATUS_OPTIONS, status pill CSS classes (they are
generated from the status text, e.g. "in-review"), progress mapping, the
"Completed means not editable" rule in the client PATCH route, the "only
Submitted can be deleted" rule (DB policy AND UI), filters, hero stats that count
specific statuses, and the README. Existing rows keep old values: write the data
migration to map them. List every file first.
```

### 10.3 Add an admin-only field to campaigns
```
Add an admin-only field "<NAME>" (e.g. internal notes, assigned team member, due
date) on campaigns. Clients must never see it: make sure client queries select
columns explicitly (they do, never select *), and write the migration, then add
the input to the admin's Manage campaign view. RLS already restricts updates of
campaigns to admins.
```

### 10.4 Assign campaigns to team members
```
Add an "Assigned to" admin on each campaign, shown in the work queue and
filterable ("My campaigns"). Design the column (references profiles), the picker
(only active admins), and what happens when an admin is revoked.
```

### 10.5 Internal comments thread
```
Add an internal comment thread per campaign visible to admins only (not clients).
New table with RLS that denies clients entirely, a small composer under the
Manage campaign view, author name and time on each comment. Show me the policy SQL.
```

### 10.6 Manage campaign layout
```
Reorganize the admin's Manage campaign view into tabs: Brief, Results, Leads,
Alerts. Keep the full-width page behavior and the active-campaign race guard
(activeManageCampaignIdRef) on every async handler.
```

### 10.7 Bulk status change
```
In the admin work queue add checkboxes and a "Set status" action for several
campaigns at once. Use a single update with the selected ids. Admin-only; show a
confirmation with the count; handle partial failure by reporting which failed.
```

---

## 11. Admin side: results upload and replies

### 11.1 Read a new column from the export file
```
The export file from the sending tool has a column "<HEADER NAME>" that we want
to capture as "<field>" on each lead. Steps:
 1. lib/csv.ts: add it to EXPORT_COLUMNS, the ContactExportRow type and
    parseContactExportCsv (headers are matched case-insensitively, lower-cased).
 2. NEW migration adding the column to outreach.lead_statuses.
 3. app/dashboard/page.tsx: the select lists (3 places), the LeadStatus mapping,
    and the upsert in chooseMetricsCsv. IMPORTANT: only include the key in the
    upsert when at least one lead in the file has a value, so a slimmer export
    never blanks values from an earlier upload.
 4. Display it in the client and admin lead lists.
 5. A unit test in tests/csv.test.ts with a sample row.
Show the plan first.
```

### 11.2 Better error messages for bad export files
```
When an admin uploads a file that is not a valid contact export, the error should
list which required columns are missing AND show the headers it did find, so they
can see they picked the wrong file. Update parseContactExportCsv's messages
(without naming the vendor) and its tests.
```

### 11.3 Preview before applying an export
```
After choosing an export file, show a preview ("This file has N leads: X sent, Y
accepted, Z replied; M new leads, K updated") and require a "Apply" click before
writing anything to lead_statuses. Nothing is written until Apply.
```

### 11.4 Keep history of results
```
Today we only store the latest totals per campaign. Add a results history so we
can chart progress: a new table of snapshots (campaign_id, taken_at, sent,
accepted, replied, positive_replies) written each time an admin saves metrics,
admin-writable and client-readable (own campaigns only). Migration + RLS + a
simple chart on the client detail page.
```

### 11.5 Positive reply tracking
```
Let admins mark individual replies as positive instead of typing one number.
Add a boolean on lead_statuses, a toggle in the admin lead list, and compute
positive_replies from it automatically (still allow manual override). Explain the
migration and how existing manual numbers are preserved.
```

### 11.6 Reply inbox view
```
Add a "Replies" page for the admin (and one for the client) listing every lead
that replied across all campaigns, newest first, with reply text, campaign name,
label and a link to the conversation. Search and campaign filter included. Reuse
existing lead_statuses data; paginate to 50 per page.
```

---

## 12. Admin side: accounts and LinkedIn handling

### 12.1 Account list improvements
```
In the admin "User accounts" list add: search by name/email, filter by role, a
"Show revoked" toggle (default on), and last sign-in time if available. Revoked
accounts must stay reachable, because restoring access is done by opening the
account. Do not remove them from the list.
```

### 12.2 Invite flow
```
When an admin creates a client account, offer to send them a welcome email with
the sign-in link instead of the admin sharing credentials manually. Design: which
email service (list options and what env vars each needs), the template, what
happens if sending fails, and make sure the temporary password is never logged.
Do not implement before I pick the service.
```

### 12.3 Account audit trail
```
Record who changed what on accounts (role changes, revocations, restorations) in
a new audit table written from the API routes with the service-role client, and
show a read-only history in the Manage account dialog. Include actor, target,
action, timestamp. Admins read, nobody writes from the browser.
```

### 12.4 LinkedIn handling workflow
```
Improve the admin's LinkedIn access panel: show a clear status badge with the
meaning of each state (pending, awaiting code, awaiting approval, code submitted,
logged in, failed), a one-line "what to do next" for each, and the time since the
last change. Do not change the API or the reveal-audit behavior.
```

### 12.5 Prevent mistakes with dangerous buttons
```
Review every destructive admin action (revoke access, mark failed, remove campaign)
and make sure each has a two-step confirmation that names the thing being acted
on. List which ones already do and add it where missing.
```

---

## 13. Database changes

Always ask for the plan first, then the migration, then the app code. The migration must be run by you on the live database.

### 13.1 Add a column
```
Add column "<name>" (<type>, default <value>, nullable: <yes/no>) to
outreach.<table>.
Write supabase/migrations/<TIMESTAMP>_<description>.sql, idempotent
(add column if not exists). Then update every place that selects or writes this
table (grep for the table name and list them). Explain deploy order: does the new
code break if it ships before I run the migration, or the reverse? Remind me to run
it.
```

### 13.2 Add a table
```
Create table outreach.<table> for <PURPOSE> with columns <LIST>. Requirements:
 - primary key uuid default gen_random_uuid()
 - client_id references outreach.profiles(id) on delete cascade (if client-owned)
 - enable RLS; write policies matching our pattern:
   clients: client_id = auth.uid() and outreach.has_outreach_access(auth.uid());
   admins: outreach.is_admin_user(auth.uid())
 - explicit grants to authenticated and service_role (no grants to anon)
 - indexes for the columns we filter by
 - idempotent (create table if not exists; drop policy if exists before create)
Explain who can read and write what, in a small table, before writing the SQL.
```

### 13.3 Rename a column or table
```
Rename outreach.<table>.<old> to <new>. Write a guarded migration (only rename
if the old name exists, so re-running is safe), update all code, tests, README
and seed-dummy-client-data.sql. Tell me exactly what breaks if code and migration
go out in the wrong order, and which order is safe.
```

### 13.4 Change an RLS policy
```
Change who can <read|insert|update|delete> outreach.<table>: <NEW RULE>.
Write the policy as a drop-if-exists + create pair in a new migration. Then give
me 6 test scenarios in plain language (a client reading their own rows, a client
reading someone else's, an admin, a revoked client, a logged-out visitor, a
service-role route) with the expected result for each, so I can check them.
```

### 13.5 Backfill existing data
```
Existing rows need <VALUE> in new column <COL>. Write a one-time backfill inside
the migration (idempotent, safe to re-run, no destructive updates), and tell me
how many rows it will touch (give me a SELECT count(*) query to run first).
```

### 13.6 Add an index / fix slowness
```
The query <DESCRIBE> is slow with many rows. Look at how the app queries
<table> (filters and ordering), propose indexes, and write them as
create index if not exists in a new migration. Explain what each index speeds up.
```

### 13.7 Storage rules
```
Change the lead-upload storage bucket rules: <file size limit | allowed file
types | retention>. Storage settings live in the storage.buckets row and
storage.objects policies; write the SQL as a migration, keep the folder-ownership
policy (first path segment = user id), and mirror the limit in lib/csv.ts so the
browser gives a friendly error before the upload.
```

### 13.8 Safe deletion of data
```
Design (do not run) a way to permanently delete a client and everything they own
(campaigns, leads, files in storage, labels, alerts, credentials). List what
cascades automatically via foreign keys and what does not (storage files do not).
Output a checklist and a SQL script I can review. Ask me before executing
anything destructive.
```

---

## 14. API routes

### 14.1 New client route (needs ownership check)
```
Create <METHOD> /api/client/<path> that <WHAT IT DOES>.
Mandatory structure:
 1. requireUser(request); return its response if not ok.
 2. Parse JSON defensively (request.json().catch(() => null)) and validate the type
    and range of EVERY field; return 400 with a clear message.
 3. Load each referenced row with the service-role client and verify
    row.client_id === auth.userId (403 otherwise, 404 if missing).
 4. Do the write; return { ok: true } or the needed fields. Never return secrets.
 5. If it changes the client's brief or messaging, also post an alert for admins,
    created_by = auth.userId (so clients never see it).
Add it to the README route table. Explain in one paragraph why this needs an API
route rather than a direct browser query.
```

### 14.2 New admin route
```
Create <METHOD> /api/admin/<path> that <WHAT IT DOES>, using requireAdmin.
Validate inputs, never trust ids from the browser without loading the row, do not
reveal secrets in responses, write an audit row if it changes access or reveals
anything sensitive. Add to the README route table.
```

### 14.3 Make an existing route stricter
```
Harden <ROUTE PATH>: review input validation (types, lengths, ranges), ownership
checks on every id, error messages that might leak internals, and behavior on
malformed JSON. List each gap you find, fix them, and add a test where the logic
can be extracted into a pure function.
```

### 14.4 Rate limiting
```
Add rate limiting to <login attempts | the credential submit route | the admin
create-user route>. Explain the options that work on Vercel (and their cost and
setup), recommend one, and implement it with a clear 429 message. Do not add a
paid service without asking me.
```

### 14.5 Standardize errors
```
Make all API routes return errors in one shape { error: string } with the correct
HTTP status, never a stack trace or database internals. Audit each route, list the
inconsistent ones, fix them, and make sure the dashboard's readJson() handling
shows the message nicely.
```

---

## 15. CSV and file handling

### 15.1 Change the lead template columns
```
Add a "<column>" column to the lead-upload template. Touch: LEAD_CSV_HEADERS,
LEAD_FIELD_LABELS, LEAD_FIELD_REQUIRED and FIELD_SYNONYMS in lib/csv.ts; the
LeadRow type; buildLeadRows; leadRowsToCsv; the template download string
(downloadTemplate in app/dashboard/page.tsx); the admin lead-CSV download; and
tests. Existing stored CSVs lack the column: confirm the parser tolerates that
for old files (re-parsing happens in the add-leads and download routes).
```

### 15.2 Support Excel files or other formats
```
Let clients upload .xlsx as well as .csv. Evaluate: a library needed (name, size,
license), whether parsing happens in the browser (preferred) or server, how files
are normalized to our canonical CSV before storage (so nothing downstream
changes), and the 10 MB limit. Recommend before adding any dependency.
```

### 15.3 Better column mapping
```
Improve the column-mapping screen: show the first 3 sample values under each
chosen column, remember the mapping for the next upload (localStorage), and
highlight required fields that are unmapped. Keep the conflict check.
```

### 15.4 Validate LinkedIn URLs on upload
```
During upload validation, flag rows whose linkedin_url is not a linkedin.com
profile URL (list the first 5 bad rows with line numbers). Decide with me
whether bad rows block the upload or just warn; default: warn and allow removing
them. Add unit tests for the URL check.
```

### 15.5 Large files and progress
```
For lead files near the 10 MB limit, show an upload progress indicator and
prevent double-submit. Parse in chunks or a worker if parsing freezes the page;
tell me first whether that is actually needed by testing with a 50,000-row file.
```

### 15.6 Parser edge cases
```
Stress-test lib/csv.ts parseCsvRecords with: quoted fields containing commas,
newlines inside quotes, doubled quotes, a UTF-8 BOM, CRLF and LF and CR line
endings, trailing commas, blank lines, a missing final newline, and very long
fields. Write the missing tests, report any failures, and fix real bugs without
changing behavior the existing tests pin down.
```

---

## 16. Security hardening

### 16.1 Encrypt the LinkedIn verification code
```
The verification_code column on outreach.linkedin_credentials is stored in
plaintext while the password is AES-256-GCM encrypted. Encrypt it the same way
using lib/crypto.ts:
 - migration: add code_ciphertext, code_iv, code_auth_tag (text), keep the old
   column for one release, plan the backfill and later drop
 - client code route encrypts before storing
 - reveal-code route decrypts
 - GET status routes derive has_code from the new columns
 - tests for the new helper usage
Explain the deploy order so no code submitted during the rollout is lost.
```

### 16.2 Security review of recent changes
```
Do a security review of everything changed since commit <HASH> (git diff). Look
for: missing ownership checks, service-role routes that trust browser ids, secrets
in responses or logs, unvalidated URLs rendered as links, unescaped HTML, overly
broad RLS policies, and sensitive data in client bundles. Report findings ranked
by severity with the exact file and line and a concrete exploit scenario.
Do not change files unless I say so.
```

### 16.3 Content Security Policy and headers
```
Add security headers in next.config.ts: Content-Security-Policy,
X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options.
Make the CSP strict but compatible with next/font, Supabase (URL from env) and
inline styles we use. Test every page after, and tell me how to roll back quickly
if something breaks.
```

### 16.4 Secrets and environment audit
```
Audit how secrets are handled: confirm SUPABASE_SERVICE_ROLE_KEY and
CREDENTIALS_ENCRYPTION_KEY never reach client bundles (grep the built static
files for their names and for any long key-like strings), that .env* is
gitignored, that nothing logs secrets, and that error responses do not echo
environment values. Report only.
```

### 16.5 Two-factor for admins
```
Require two-factor authentication for admin accounts using Supabase MFA (TOTP).
Plan: enrollment screen, enforcement in requireAdmin (check the assurance level),
recovery path if an admin loses their device without locking out the last admin,
and what clients see (nothing changes). Wait for my approval of the plan.
```

### 16.6 Data privacy and retention
```
Propose a retention policy for lead data and LinkedIn credentials (what we keep,
for how long, how a client's data is deleted on request). Output: a short policy
in plain English, the technical steps to implement deletion (including storage
files), and what must be logged. No code yet.
```

---

## 17. Integrations and notifications

### 17.1 Email notifications
```
Send an email when: (a) a client submits a campaign (to the admin team address
<ADDRESS>), (b) an admin posts an alert (to that client), (c) a campaign goes
Live (to the client). Plan first: provider options with cost and env vars, where
the sending code lives (server routes only, never the browser), templates, failure
handling that never blocks the main action, and an on/off setting per client.
Wait for my choice of provider.
```

### 17.2 Slack or WhatsApp alerts for the team
```
Notify <CHANNEL> when a client submits or edits a campaign. Use an incoming
webhook URL stored in an env var (never in code). Message must contain client
name, campaign name and a link to the admin dashboard, and no lead data.
```

### 17.3 Reconnect the automation tool link
```
The server routes to link a campaign and push leads exist (/api/admin/automation/*)
but there is no UI and AUTOMATION_API_KEY is not set in production. Build an admin
UI for: choosing a campaign and list from dropdowns, saving the link, pushing
leads, and showing the per-code import result. Keep ALL vendor naming out of
anything clients can receive (admin-only code still ships in the same JS bundle,
so use neutral labels and no vendor name in strings or class names).
```

### 17.4 Calendar or CRM sync
```
Design (do not build) pushing replied leads to <CRM NAME>: which fields map, when
it triggers, how duplicates are avoided, auth method, failure handling, and what a
client must do to connect it. Output a one-page design with open questions.
```

### 17.5 Webhooks in
```
Design a secure webhook endpoint that receives results automatically instead of
admins uploading export files: authentication (shared secret or signature),
idempotency, payload validation, mapping to lead_statuses, rate limits, and
failure logging. No code yet; list what the sending tool must support first.
```

---

## 18. Feature ideas with ready-made prompts

Each follows: design first, then implement after approval.

### 18.1 Activity feed
```
Add an "Activity" feed for each client showing: campaign submitted, status
changed, alert posted, leads added, results updated. Needs an events table written
by existing code paths. Design the table, which actions write to it, RLS (client
sees own, admin sees all), and a compact feed UI on the client dashboard.
```

### 18.2 Weekly summary
```
Generate a weekly summary per client (new replies, acceptance rate change, best
campaign). Decide whether it is an email, an in-app card, or both. Describe the
data we have versus what is missing (we do not keep history, see 11.4).
```

### 18.3 Campaign templates for admins
```
Let admins save a campaign brief as a reusable template (goal, offer, tone,
messages, delays) that new clients can start from. Table, admin UI, and a
"Start from a Myntmore template" option in the client wizard.
```

### 18.4 In-app messaging
```
Add a simple two-way message thread between a client and the admin team per
campaign (instead of one-way alerts). Design table, RLS, unread counts, how it
differs from alerts, and notification hooks. Keep it plain text only.
```

### 18.5 Client branding
```
Allow the client's company logo to show in their dashboard header. Storage bucket
for logos (client-owned folder), allowed types and size, how it is displayed, and a
fallback to initials.
```

### 18.6 Usage limits and plans
```
Add per-client limits (campaigns, leads per campaign) controlled by admins, shown
to the client as "X of Y used." Enforce on the server (wizard insert path currently
goes through the browser client, so decide where enforcement must live).
```

### 18.7 Public status link
```
Give each campaign an optional read-only share link showing high-level results
(counts only, no lead names) that a client can send to their boss. Token design,
expiry, revocation, what is hidden, and rate limiting.
```

### 18.8 Time zone and date formats
```
Show dates in the viewer's time zone with a consistent format
(<FORMAT, e.g. 12 Nov 2026>) across the whole app. Find every toLocaleDateString
call and every date string we render, and centralize them in one helper.
```

---

## 19. Testing

### 19.1 Add tests for a pure function
```
Write tests in tests/<file>.test.ts (node:test, same style as the existing files)
for <FUNCTION in lib/...>. Cover: normal cases, empty input, malformed input,
boundary values, and the specific bugs we have had before. If the function lives
inside app/dashboard/page.tsx, first extract it to lib/ without changing behavior.
Run npm test and show the output.
```

### 19.2 Test the API routes
```
Set up tests for the API routes by mocking requireUser/requireAdmin and the
service-role client. Start with app/api/client/campaigns/[id]/route.ts and
lead-statuses/[id]/route.ts. Cover: not logged in, wrong owner (403), missing row
(404), invalid body (400), success. Explain the approach and any dev dependency
you want to add before adding it.
```

### 19.3 End-to-end plan
```
Propose an end-to-end test plan using Playwright against a dedicated test
Supabase project (not production): the top 10 user journeys for client and admin,
how test users and data are created and cleaned up, and how it would run in CI.
Plan only; list what I must set up.
```

### 19.4 Regression test for a fixed bug
```
We fixed: <BUG DESCRIPTION>. Write a test that fails on the old behavior and
passes on the new. If the logic is not testable where it lives, extract it. Show me
the test failing against the old code first (temporarily revert the fix to prove
it).
```

### 19.5 Manual test checklist
```
Produce a manual QA checklist (as a table: step, expected result) for <FEATURE>
that a non-developer can follow on the live site, covering the client role, the
admin role, a revoked account and a logged-out visitor.
```

---

## 20. Bug hunting and code review

### 20.1 Full bug check
```
Do a full bug check of the Outreach Tool. First run tsc, lint, tests and build.
Then review, in this order, reading the actual code (not just grepping):
 1. everything changed since commit <HASH> (git log / git diff)
 2. app/dashboard/page.tsx client branch, then admin branch
 3. every route under app/api/** (auth, ownership checks, validation)
 4. lib/csv.ts, lib/crypto.ts, lib/automation.ts
 5. every migration for internal consistency
Look for: logic errors, stale closures (state set then read in the same handler),
race conditions between overlapping async calls (switching campaigns quickly),
missing loading/error states, client/server validation mismatches, unvalidated
URLs in links, data overwritten by partial uploads, and docs that no longer match
the code.
Report each finding with file:line, a one-sentence summary and a concrete failure
scenario. Fix the clear bugs, list the rest for my decision, and do not pad the
list with style nitpicks.
```

### 20.2 Review a specific diff
```
Review the changes in <COMMIT RANGE or "the uncommitted changes"> as a skeptical
senior engineer. Check correctness, security (ownership checks, XSS, secrets),
edge cases, and whether the client and admin views are both still correct.
Return a ranked list; do not edit files.
```

### 20.3 Hunt a class of bug
```
Search the whole repo for <BUG CLASS>, for example:
 - state updated and then read in the same event handler (stale closure)
 - <a href> built from data we did not author
 - queries that select * or expose columns clients should not see
 - places that trust an id from the browser without an ownership check
 - strings that mention the vendor name
 - dates parsed or shown inconsistently
List every instance with file:line and whether it is a real problem.
```

### 20.4 Reproduce first
```
Bug: <WHAT I SEE>. Steps: <STEPS>. Expected: <EXPECTED>. Role: <client|admin>.
Before fixing, find the code path responsible, explain the cause in plain
language, and tell me how you confirmed it (not just a guess). Then fix it with
the smallest change and add a regression test if the logic is testable.
```

### 20.5 Check the docs against the code
```
Compare README.md and docs/PROMPT_LIBRARY.md against the current code. List every
statement that is now false or outdated (routes, columns, features, constants,
file names). Fix the docs, not the code.
```

---

## 21. Refactoring and performance

### 21.1 Split the giant dashboard file
```
app/dashboard/page.tsx is one ~2,000 line component. Plan a safe split without
changing behavior: shared types and constants to separate files, pure helpers to
lib/, then the client view, the admin view and each dialog into components in
app/dashboard/components/. Constraints: keep the active-campaign race guards,
keep the client/admin separation, no behavior or visual changes, and do it in
SMALL steps with the pipeline green after each. Give me the ordered step list
first and do only step 1 until I say continue.
```

### 21.2 Extract data hooks
```
Extract the data loading and mutation functions (campaigns, alerts, lead statuses,
categories, accounts) from page.tsx into custom hooks. Keep each hook's state
local to what needs it. Show before/after line counts and confirm no behavior
changed (same network calls, in the same order).
```

### 21.3 Pagination for long lists
```
The lead list renders every lead at once and the campaigns list loads everything.
Add pagination or "load more" with page size 50 for <LEADS | CAMPAIGNS>. Server
side (range queries) rather than client side slicing. Keep filters, search and
counts correct: explain how counts are computed with pagination.
```

### 21.4 Performance audit
```
Audit performance of the logged-in app: number of requests on load, payload
sizes, re-render hot spots, large lists, unnecessary effects, bundle size per route
(from the build output). Rank the top 5 improvements by impact with estimated
effort. Do not change code yet.
```

### 21.5 Reduce repeated code
```
Find duplicated logic between the client and admin branches (lead filtering,
stage computation, lead-row rendering). Propose a shared helper or component for
each, apply the safe ones, and confirm output is identical.
```

### 21.6 Remove dead code
```
Find unused code: exports never imported, state never read, CSS classes never
referenced, API routes with no caller, constants never used. List them with
evidence (grep results). Remove only what is clearly dead, and flag routes that
are intentionally API-only.
```

---

## 22. Accessibility and responsive design

### 22.1 Responsive pass
```
Check <SCREEN> at widths 1500, 1100, 900, 640 and 400px using static mocks or
browser emulation. List every layout problem (overflow, overlapping, tiny tap
targets, sidebar behavior) with a screenshot, then fix them in app/globals.css
using the existing breakpoints (900px: collapsed sidebar, 640px: top bar).
```

### 22.2 Accessibility audit
```
Audit app/login/page.tsx and app/dashboard/page.tsx for accessibility: form labels
tied to inputs, button names, focus visible styles, keyboard operation of every
clickable row and dialog (Escape to close, focus trap, return focus), color
contrast, aria-live for errors, heading order. Output a prioritized list, then
fix the high-priority ones.
```

### 22.3 Keyboard-only walkthrough
```
Walk through the full client journey (log in, create a campaign, open it, label a
lead, sign out) using only the keyboard by reading the code and any mocks. List
every place focus gets lost or an action cannot be reached.
```

### 22.4 Mobile client experience
```
Make the client dashboard comfortable on a phone: the campaign list, campaign
detail, lead list with filters, and the wizard. Priorities: no horizontal scroll,
44px tap targets, sticky primary action in the wizard. Provide screenshots at 390px.
```

### 22.5 Translations
```
Prepare the app for a second language (<LANGUAGE>). Do not translate yet. Inventory
every user-visible string by screen, propose a minimal approach that fits a single
large component (a strings object per language), and estimate the work.
```

---

## 23. Deploy, live checks, migrations

### 23.1 Pre-deploy checklist
```
Before I deploy, run: tsc, lint, tests, build. Then check: new migration files
since the last deploy (list them and say what each does and whether order
matters), new or renamed environment variables (list names, not values), changes
that need a Vercel setting, and a vendor-name grep of the built client bundle.
Output a go/no-go summary.
```

### 23.2 Check the live site
```
Check the live site <https://outreach.myntmore.com>: the latest deployment status
(vercel ls), that / redirects to /login, /login and /dashboard load, no console
errors, the old/removed API paths return 404 and the current ones return 401
without a login, and the live JavaScript/CSS contain no vendor name. Also confirm
the new migrations are applied by querying the REST API with the public key and
reading the error codes (permission denied means the column exists; "does not
exist" means it does not). Report only.
```

### 23.3 Migration run sheet
```
Give me a run sheet for the new migrations since <DATE/COMMIT>: for each file, the
purpose, whether it is safe to re-run, what could go wrong, a SQL query to check
before, and a SQL query to confirm after. Order them. I will run them in the
Supabase SQL editor.
```

### 23.4 Roll back
```
The last deploy broke <WHAT>. Tell me the safest way to restore service: which
Vercel deployment to promote, whether any migration needs reversing (and the
exact reverse SQL, written but not run), and what data could be affected. Ask
before running anything.
```

### 23.5 Environment variables
```
List every environment variable the app reads (grep process.env), which are
required vs optional, what happens when each is missing, where it must be set
(Vercel project, local .env.local), and which must NEVER be public. Compare with
.env.example and fix any difference.
```

### 23.6 Staging environment
```
Design a staging setup: a second Supabase project and a Vercel preview
environment with its own env vars, how migrations are applied there first, safe
test data (use supabase/seed-dummy-client-data.sql), and a short procedure for
promoting changes to production.
```

---

## 24. Data operations

### 24.1 Seed script for a new client from a CSV export
```
Write a SQL script that adds <N> campaigns to the existing client <EMAIL> from
these export files: <FILE PATHS>. Pattern to follow: look up client_id by email,
upsert the campaign by name, set goal/offer/tone/messaging_strategy to '' explicitly
(some live columns lack defaults), then upsert every lead into
outreach.lead_statuses on conflict (campaign_id, linkedin_url). Compute sent /
accepted / replied / positive counts from the files and set campaign progress and
status as <VALUES>. Idempotent, safe to re-run. Generate it with a one-off script,
send me the file, and DO NOT commit it (it contains real client data).
```

### 24.2 Fix bad data
```
Some rows have <PROBLEM, e.g. campaigns with lead_count not matching their lead
file, duplicate lead_statuses differing by case in the URL>. Write a diagnostic
SELECT that shows the bad rows and how many there are, then a fix script in a
transaction that I can review. Do not run anything.
```

### 24.3 Reports for the team
```
Write SQL queries (read-only) for: campaigns per client, average acceptance rate
per client, campaigns stuck in "In review" for more than 3 days, clients with no
campaigns, and revoked accounts. Output them as a documented file under
supabase/queries/ with a one-line explanation each.
```

### 24.4 Clean up storage
```
Find files in the outreach-leads bucket that no lead_files row points to (orphans
from failed uploads) and the pending/ folders older than 7 days. Give me a report
query/script first. Deletion only after I approve the list.
```

### 24.5 Dummy data
```
Extend supabase/seed-dummy-client-data.sql with a realistic fake client that has:
3 campaigns in different statuses, 40 leads each at different stages with replies
and labels, 2 alerts (one resolved), and a revoked account. All names, companies
and URLs must be obviously fake. This file is safe to commit.
```

---

## 25. Documentation and git hygiene

### 25.1 Update the README after a change
```
I just changed <FEATURE>. Update README.md: the feature descriptions, data-model
table, route table, directory tree, environment variables and known limitations.
Keep the table of contents anchors working. Do not mention the vendor name.
```

### 25.2 Write a changelog entry
```
Summarize the commits since <TAG/COMMIT> as a changelog grouped into: New, Changed,
Fixed, Needs action (migrations to run, env vars to set). Write for the Myntmore
team, not for developers: plain language, no jargon.
```

### 25.3 Onboarding doc for a new teammate
```
Write docs/ONBOARDING.md for a new developer: set up in 15 minutes (accounts
needed, env vars, running locally, loading dummy data), a tour of the 5 files that
matter most, how to make and verify a change, how deploys and migrations work, and
the 10 rules from the guardrails block explained with the reason behind each.
```

### 25.4 Commit and push safely
```
Commit and push my current changes. First show git status and confirm no
supabase/seed-*.sql file (other than seed-dummy-client-data.sql) is staged. Stage
files by name. Run the verification pipeline. Write the commit message to a file
(subject under 72 characters, a body explaining why, and the Co-Authored-By
trailer) and use git commit -F. Revert any stray next-env.d.ts change and delete
tsconfig.tsbuildinfo first. Then push to main and show me the result.
```

### 25.5 Pull request description
```
Write a pull request description for the current branch: what changed and why,
screenshots to attach (list which), how to test (client and admin steps),
migrations to run, env vars, risks, and rollback. End with the required
"Generated with Claude Code" line.
```

### 25.6 Keep branches tidy
```
List local and remote branches and git worktrees, which are merged into main,
and which have unmerged work. Suggest what is safe to delete. Delete nothing
without my confirmation.
```

---

## 26. Troubleshooting prompts

### 26.1 "I changed the CSS but see the old styles"
```
After editing app/globals.css the browser still shows old styles (dev server).
Check for a stale .next cache or a stale stylesheet being served: stop the dev
server, remove .next, restart, reload, and confirm the new rule appears in the
served stylesheet. Then check whether a more specific rule is overriding mine.
```

### 26.2 "It works locally but not on the live site"
```
<FEATURE> works locally but not on <LIVE URL>. Check, in order: is the latest
commit deployed (vercel ls), are required migrations applied (query the REST API
for the new column), are env vars present in Vercel (names only), does the live
bundle contain the change, and are there errors in the deployment's runtime logs.
Report what you find before changing anything.
```

### 26.3 "Clients can't see their data"
```
A client reports an empty dashboard. Walk through the possible causes: access
revoked (access_revoked_at set), missing profile row, RLS policy mismatch after a
recent migration, wrong client_id on campaigns, or a failed load shown as empty.
Give me read-only SQL queries to check each against client <EMAIL>, and what
result means what.
```

### 26.4 "A route returns 401/403/404/500"
```
<METHOD PATH> returns <STATUS> when <ACTION>. Trace the request: which route
file handles it, which check produces that status, what the browser sends in the
Authorization header, and what each condition in the route would need to be true.
Tell me the cause and the smallest fix.
```

### 26.5 "The build fails"
```
npm run build fails with: <PASTE ERROR>. Find the cause, fix it minimally, then
run tsc, lint, tests and build again and show all four passing. If the error is
a stale generated type under .next, say so and clear it (rm -rf .next) instead of
editing code.
```

### 26.6 "A migration errored"
```
Running <MIGRATION FILE> in the Supabase SQL editor failed with: <PASTE ERROR>.
Explain what it means, whether any part of the migration was applied (migrations
run as one batch but check for partial effects), how to check the current state,
and a corrected version of the migration. Do not run SQL yourself.
```

### 26.7 "Something looks different after a deploy"
```
The live site looks different from my local copy for <SCREEN>. Compare the
deployed commit with local HEAD, diff globals.css and the relevant component, and
check for uncommitted local changes. Tell me which is newer and why they differ.
```

### 26.8 "I don't understand this part of the code"
```
Explain <FILE or FUNCTION> to me like I am a smart non-developer: what problem it
solves, what goes in, what comes out, what other parts depend on it, and what
would break if I changed <X>. Use an example with a made-up client. No code
changes.
```

---

## Appendix A: A reusable "change request" skeleton

```
GOAL
<one sentence: what is different afterwards>

WHERE
<screen / role / file / table>

CURRENT BEHAVIOR
<what happens now, with a screenshot if visual>

DESIRED BEHAVIOR
<what should happen, including edge cases>

RULES
<paste the guardrails block, plus anything specific>

DONE WHEN
<observable checks, for example "as a client I can ... and as an admin I see ...">

PLAN FIRST?
<yes: show a plan and wait / no: just do it>

AFTER
<verify pipeline, show screenshots, do or do not commit, remind me of migrations>
```

## Appendix B: Words that save time

| Say | It makes the assistant |
| --- | --- |
| "Plan only, wait for my OK" | stop before editing |
| "Report only, change nothing" | audit without touching files |
| "Smallest possible change" | avoid refactoring around the fix |
| "Show the before and after" | prove what changed |
| "List every file you will touch" | surface hidden work early |
| "Explain the deploy order" | tell you if code and migration must ship in a certain sequence |
| "Don't guess, confirm it in the code" | read the source instead of assuming |
| "Ask me before anything irreversible" | pause on deletes, pushes, live data |
