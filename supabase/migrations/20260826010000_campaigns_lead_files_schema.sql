-- outreach.campaigns, outreach.lead_files, and the outreach-leads storage
-- bucket are read and written throughout the app (see app/page.tsx) but were
-- never created by a migration in this repo -- they exist only because
-- someone created them by hand in the Supabase dashboard. That means their
-- RLS policies (the thing actually enforcing "clients only see their own
-- campaigns") live outside version control and can't be verified or
-- reproduced from this repo.
--
-- Every statement here is written idempotently (`if not exists` / drop+create
-- for policies) so this is a safe no-op against the existing live database,
-- while giving a fresh database the full schema and guaranteed-correct RLS.

create table if not exists outreach.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references outreach.profiles(id) on delete cascade,
  name text not null,
  goal text not null default '',
  offer text not null default '',
  tone text not null default '',
  messaging_strategy text not null default '',
  connection_note text not null default '',
  follow_up_count integer not null default 1 check (follow_up_count between 1 and 3),
  follow_up_messages jsonb not null default '[]'::jsonb,
  lead_count integer not null default 0,
  status text not null default 'submitted',
  progress integer not null default 0 check (progress between 0 and 100),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists outreach.lead_files (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references outreach.campaigns(id) on delete cascade,
  client_id uuid not null references outreach.profiles(id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  content_type text not null default 'text/csv',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table outreach.campaigns enable row level security;
alter table outreach.lead_files enable row level security;

drop policy if exists "Clients see their own campaigns, admins see all" on outreach.campaigns;
create policy "Clients see their own campaigns, admins see all" on outreach.campaigns
  for select to authenticated
  using (client_id = auth.uid() or outreach.is_admin_user(auth.uid()));

drop policy if exists "Clients insert their own campaigns" on outreach.campaigns;
create policy "Clients insert their own campaigns" on outreach.campaigns
  for insert to authenticated
  with check (client_id = auth.uid());

drop policy if exists "Admins update campaigns" on outreach.campaigns;
create policy "Admins update campaigns" on outreach.campaigns
  for update to authenticated
  using (outreach.is_admin_user(auth.uid()))
  with check (outreach.is_admin_user(auth.uid()));

drop policy if exists "Clients see their own lead files, admins see all" on outreach.lead_files;
create policy "Clients see their own lead files, admins see all" on outreach.lead_files
  for select to authenticated
  using (client_id = auth.uid() or outreach.is_admin_user(auth.uid()));

drop policy if exists "Clients insert their own lead files" on outreach.lead_files;
create policy "Clients insert their own lead files" on outreach.lead_files
  for insert to authenticated
  with check (client_id = auth.uid());

grant usage on schema outreach to authenticated;
grant select, insert on outreach.campaigns to authenticated;
grant all on outreach.campaigns to service_role;
grant select, insert on outreach.lead_files to authenticated;
grant all on outreach.lead_files to service_role;

insert into storage.buckets (id, name, public)
values ('outreach-leads', 'outreach-leads', false)
on conflict (id) do nothing;

drop policy if exists "Clients manage their own lead uploads" on storage.objects;
create policy "Clients manage their own lead uploads" on storage.objects
  for all to authenticated
  using (bucket_id = 'outreach-leads' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'outreach-leads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Admins manage all lead uploads" on storage.objects;
create policy "Admins manage all lead uploads" on storage.objects
  for all to authenticated
  using (bucket_id = 'outreach-leads' and outreach.is_admin_user(auth.uid()))
  with check (bucket_id = 'outreach-leads' and outreach.is_admin_user(auth.uid()));
