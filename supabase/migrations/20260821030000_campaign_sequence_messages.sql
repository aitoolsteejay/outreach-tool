-- Guarded: outreach.campaigns isn't actually CREATEd until
-- 20260826010000_campaigns_lead_files_schema.sql, which runs *after* this
-- file in migration order -- on a fresh database this ALTER used to fail
-- with "relation does not exist" before that table ever existed, so
-- `supabase db reset` could never succeed. This now no-ops when the table
-- isn't there yet; 20260826010000's own CREATE TABLE already includes these
-- same three columns, so a fresh database still ends up with them either
-- way. On the existing production database (where the table already
-- exists), this runs exactly as it always did.
do $$
begin
  if to_regclass('outreach.campaigns') is not null then
    alter table outreach.campaigns
      add column if not exists connection_note text not null default '',
      add column if not exists follow_up_count integer not null default 1 check (follow_up_count between 1 and 3),
      add column if not exists follow_up_messages jsonb not null default '[]'::jsonb;
  end if;
end
$$;
