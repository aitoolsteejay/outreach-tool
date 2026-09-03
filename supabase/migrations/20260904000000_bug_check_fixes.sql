-- Fixes for issues confirmed still open in a follow-up bug check:
--
-- 1. outreach.campaigns had select/insert/delete granted to authenticated
--    but never update, despite an "Admins update campaigns" RLS policy
--    existing since 20260826010000 -- Postgres checks table grants before
--    RLS, so the admin status/progress save in the app has been silently
--    permission-denied this whole time.
grant update on outreach.campaigns to authenticated;

-- 2. outreach.lead_files' insert policy only ever checked that the caller
--    owned client_id, never that the campaign_id they're attaching the file
--    to actually belongs to them -- a client could insert a lead_files row
--    against another client's campaign_id.
drop policy if exists "Active clients insert their own lead files" on outreach.lead_files;
drop policy if exists "Clients insert their own lead files" on outreach.lead_files;
create policy "Active clients insert their own lead files for their own campaigns" on outreach.lead_files
  for insert to authenticated
  with check (
    client_id = auth.uid()
    and outreach.has_outreach_access(auth.uid())
    and exists (select 1 from outreach.campaigns c where c.id = campaign_id and c.client_id = auth.uid())
  );

-- 3. Clients can delete their own campaign any time it's still 'submitted',
--    which cascade-deletes any campaign_alerts row tied to it -- silently
--    destroying an admin-flagged issue the moment the client deletes the
--    campaign it was posted against. Block deletion while an unresolved
--    alert exists instead.
drop policy if exists "Active clients delete incomplete own campaigns" on outreach.campaigns;
create policy "Active clients delete incomplete own campaigns" on outreach.campaigns
  for delete to authenticated
  using (
    client_id = auth.uid()
    and outreach.has_outreach_access(auth.uid())
    and status = 'submitted'
    and not exists (select 1 from outreach.campaign_alerts a where a.campaign_id = campaigns.id and not a.resolved)
  );

-- 4. The LinkedIn verification code a client submits was returned by the
--    plain admin GET -- fetched automatically every time an admin opens any
--    client's Manage Account modal -- with no audit trail, unlike the
--    password, which deliberately requires a separate "reveal" action. Add
--    matching audit columns so revealing the code becomes its own explicit,
--    logged action too.
alter table outreach.linkedin_credentials
  add column if not exists code_revealed_at timestamptz,
  add column if not exists code_revealed_by uuid references outreach.profiles(id) on delete set null;

-- 5. push-to-waalaxy's route sets waalaxy_sync_status to 'partial' when only
--    some prospects import successfully, but the check constraint added in
--    20260827000000_waalaxy_sync_columns.sql never allowed that value --
--    every partial sync silently failed this particular status update (the
--    route doesn't check that call's error), so the campaign kept showing
--    whatever sync status it had before the partial push.
alter table outreach.campaigns drop constraint if exists campaigns_waalaxy_sync_status_check;
alter table outreach.campaigns add constraint campaigns_waalaxy_sync_status_check
  check (waalaxy_sync_status in ('not_linked', 'linked', 'syncing', 'synced', 'partial', 'failed'));
