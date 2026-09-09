-- Per-lead status, visible to the client on their own campaign detail view.
-- Until now leads only ever existed as rows inside the uploaded CSV (see the
-- comment in 20260828000000_campaign_alerts.sql) -- there was no queryable
-- per-lead record, only the aggregate counts on outreach.campaigns. This
-- table is populated by the admin re-uploading Waalaxy's own contact export
-- for a campaign (see summarizeWaalaxyMetricsCsv / chooseMetricsCsv), and is
-- keyed on (campaign_id, linkedin_url) so a re-upload updates existing rows
-- instead of duplicating them.
--
-- Deliberately no "status" text column: the three date columns are the
-- single source of truth, and the display status (Replied / Accepted /
-- Sent) is derived from them wherever this is read, the same way
-- connections_sent/accepted/replied are derived from these same three dates
-- when summarizing the CSV. Storing a redundant status string would let it
-- silently disagree with the dates it's supposed to summarize.

create table if not exists outreach.lead_statuses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references outreach.campaigns(id) on delete cascade,
  client_id uuid not null references outreach.profiles(id) on delete cascade,
  linkedin_url text not null,
  first_name text not null default '',
  last_name text not null default '',
  company text not null default '',
  connection_request_date date,
  connected_at date,
  replied_at date,
  updated_at timestamptz not null default now(),
  unique (campaign_id, linkedin_url)
);

create index if not exists lead_statuses_campaign_idx on outreach.lead_statuses (campaign_id);
create index if not exists lead_statuses_client_idx on outreach.lead_statuses (client_id, campaign_id);

alter table outreach.lead_statuses enable row level security;

drop policy if exists "Active clients see their own lead statuses, admins see all" on outreach.lead_statuses;
create policy "Active clients see their own lead statuses, admins see all" on outreach.lead_statuses for select to authenticated
  using ((client_id = auth.uid() and outreach.has_outreach_access(auth.uid())) or outreach.is_admin_user(auth.uid()));

drop policy if exists "Admins manage lead statuses" on outreach.lead_statuses;
create policy "Admins manage lead statuses" on outreach.lead_statuses for all to authenticated
  using (outreach.is_admin_user(auth.uid()))
  with check (outreach.is_admin_user(auth.uid()));

grant select, insert, update, delete on outreach.lead_statuses to authenticated;
grant all on outreach.lead_statuses to service_role;
