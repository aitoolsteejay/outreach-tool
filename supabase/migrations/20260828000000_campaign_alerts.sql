-- Lets admins post operational issues that clients see on their dashboard:
-- account-wide ("LinkedIn login failed, please log in again"), campaign-wide
-- ("this campaign is paused pending your reply"), or tied to one specific
-- lead within a campaign ("row 14: LinkedIn URL incorrect, please check").
--
-- campaign_id is nullable: null means an account-wide alert for that client,
-- not scoped to any one campaign. lead_reference is only meaningful when
-- campaign_id is set, and identifies the lead in plain text (there's no
-- per-lead table -- leads only ever exist as rows inside the uploaded CSV --
-- so this is typically the lead's name or LinkedIn URL as the client/admin
-- would recognize it from that file).

create table if not exists outreach.campaign_alerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references outreach.profiles(id) on delete cascade,
  campaign_id uuid references outreach.campaigns(id) on delete cascade,
  lead_reference text,
  severity text not null default 'error' check (severity in ('info', 'warning', 'error')),
  message text not null,
  resolved boolean not null default false,
  created_by uuid references outreach.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists campaign_alerts_client_idx on outreach.campaign_alerts (client_id, resolved);
create index if not exists campaign_alerts_campaign_idx on outreach.campaign_alerts (campaign_id);

alter table outreach.campaign_alerts enable row level security;

drop policy if exists "Clients see their own alerts, admins see all" on outreach.campaign_alerts;
create policy "Clients see their own alerts, admins see all" on outreach.campaign_alerts
  for select to authenticated
  using (client_id = auth.uid() or outreach.is_admin_user(auth.uid()));

drop policy if exists "Admins manage alerts" on outreach.campaign_alerts;
create policy "Admins manage alerts" on outreach.campaign_alerts
  for all to authenticated
  using (outreach.is_admin_user(auth.uid()))
  with check (outreach.is_admin_user(auth.uid()));

grant select, insert, update, delete on outreach.campaign_alerts to authenticated;
grant all on outreach.campaign_alerts to service_role;
