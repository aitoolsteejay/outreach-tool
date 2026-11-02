-- Renames the third-party-named sync columns on outreach.campaigns to
-- neutral names, so the vendor name doesn't live in the schema. Pure
-- rename: no data changes, no semantics changes. Each rename is guarded so
-- re-running this against an already-renamed database is a no-op.
do $$
declare
  pair text[];
  pairs text[][] := array[
    ['waalaxy_campaign_id', 'automation_campaign_id'],
    ['waalaxy_list_id', 'automation_list_id'],
    ['waalaxy_sync_status', 'automation_sync_status'],
    ['waalaxy_sync_error', 'automation_sync_error'],
    ['waalaxy_prospects_imported', 'automation_prospects_imported'],
    ['waalaxy_synced_at', 'automation_synced_at']
  ];
begin
  foreach pair slice 1 in array pairs loop
    if exists (select 1 from information_schema.columns where table_schema = 'outreach' and table_name = 'campaigns' and column_name = pair[1]) then
      execute format('alter table outreach.campaigns rename column %I to %I', pair[1], pair[2]);
    end if;
  end loop;

  if exists (select 1 from pg_constraint where conname = 'campaigns_waalaxy_sync_status_check') then
    alter table outreach.campaigns rename constraint campaigns_waalaxy_sync_status_check to campaigns_automation_sync_status_check;
  end if;
end
$$;
