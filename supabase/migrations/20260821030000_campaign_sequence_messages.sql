alter table outreach.campaigns
  add column if not exists connection_note text not null default '',
  add column if not exists follow_up_count integer not null default 1 check (follow_up_count between 1 and 3),
  add column if not exists follow_up_messages jsonb not null default '[]'::jsonb;
