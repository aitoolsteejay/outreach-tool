-- Manual-outreach support: admins now pull a campaign's brief, messages, and
-- lead CSV to configure Waalaxy by hand (its API can't set message content
-- or handle 2FA reliably -- see lib/waalaxy.ts), then record performance
-- metrics back once outreach is running. The brief/lead-file columns and
-- read access already exist; this adds the metrics columns.
alter table outreach.campaigns
  add column if not exists connections_sent integer not null default 0 check (connections_sent >= 0),
  add column if not exists connections_accepted integer not null default 0 check (connections_accepted >= 0 and connections_accepted <= connections_sent),
  add column if not exists replies_received integer not null default 0 check (replies_received >= 0),
  add column if not exists positive_replies integer not null default 0 check (positive_replies >= 0 and positive_replies <= replies_received),
  add column if not exists metrics_updated_at timestamptz;

-- No new grants/policies needed: outreach.campaigns already has select
-- granted (clients see their own, admins see all) and update granted with
-- an "Admins update campaigns" RLS policy, which covers these new columns.
