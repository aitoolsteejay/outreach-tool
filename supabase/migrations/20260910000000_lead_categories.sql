-- Lets a client tag each of their own leads (Hot / Cold / whatever they
-- define) independently of the date-derived pipeline stage already shown
-- in outreach.lead_statuses (Not yet sent / Sent / Accepted / Replied).
-- That stage is admin-authoritative, built from Waalaxy's own dates; this
-- is purely the client's own judgment call, and the set of available
-- labels is theirs to manage (add/rename/delete), not fixed by us.
--
-- Kept as a real lookup table (not a plain text column on lead_statuses) so
-- renaming a category updates every lead using it, rather than leads
-- carrying copies of a label that can drift out of sync with what the
-- client renamed it to.

create table if not exists outreach.lead_categories (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references outreach.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  color text not null default '#8B897F',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (client_id, name)
);

create index if not exists lead_categories_client_idx on outreach.lead_categories (client_id, position);

-- Nullable and on delete set null: deleting a category (or a lead simply
-- never having been tagged) just leaves the lead uncategorized, never
-- blocks the delete or removes the lead itself.
alter table outreach.lead_statuses add column if not exists category_id uuid references outreach.lead_categories(id) on delete set null;
create index if not exists lead_statuses_category_idx on outreach.lead_statuses (category_id);

alter table outreach.lead_categories enable row level security;

-- Fully client-owned config, no admin write path needed (this is
-- explicitly the client's own categorization scheme) -- admins can still
-- read it (e.g. to make sense of a category_id they see on a lead) via the
-- same is_admin_user check used everywhere else.
drop policy if exists "Active clients manage their own lead categories, admins read all" on outreach.lead_categories;
create policy "Active clients manage their own lead categories, admins read all" on outreach.lead_categories for all to authenticated
  using ((client_id = auth.uid() and outreach.has_outreach_access(auth.uid())) or outreach.is_admin_user(auth.uid()))
  with check (client_id = auth.uid() and outreach.has_outreach_access(auth.uid()));

grant select, insert, update, delete on outreach.lead_categories to authenticated;
grant all on outreach.lead_categories to service_role;

-- One-time backfill: every existing client gets Hot/Cold to start with,
-- matching the two labels actually requested. New clients get seeded the
-- same way lazily from the app the first time their workspace loads and
-- has none yet -- see the workspace-load effect in app/dashboard/page.tsx
-- -- so this table is never silently empty for a client who's opened the
-- app at all.
insert into outreach.lead_categories (client_id, name, color, position)
select id, 'Hot', '#C2410C', 0 from outreach.profiles where role = 'client'
on conflict (client_id, name) do nothing;
insert into outreach.lead_categories (client_id, name, color, position)
select id, 'Cold', '#3B5BDB', 1 from outreach.profiles where role = 'client'
on conflict (client_id, name) do nothing;
