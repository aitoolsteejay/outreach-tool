-- Tracks the link between a Myntmore campaign and the Waalaxy campaign/list
-- an admin has manually created for it (Waalaxy's API can't create campaigns
-- or set message content, so that step stays manual in the Waalaxy UI --
-- see app/lib/waalaxy.ts for the full explanation). Once linked, admins can
-- push the client's uploaded leads into that Waalaxy campaign from the
-- Myntmore admin dashboard instead of re-uploading the CSV by hand.

alter table outreach.campaigns
  add column if not exists waalaxy_campaign_id text,
  add column if not exists waalaxy_list_id text,
  add column if not exists waalaxy_sync_status text not null default 'not_linked' check (waalaxy_sync_status in ('not_linked', 'linked', 'syncing', 'synced', 'failed')),
  add column if not exists waalaxy_sync_error text,
  add column if not exists waalaxy_prospects_imported integer not null default 0,
  add column if not exists waalaxy_synced_at timestamptz;
