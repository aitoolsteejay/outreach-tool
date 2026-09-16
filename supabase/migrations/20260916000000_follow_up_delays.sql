-- Lets a client set how many days to wait before each follow-up goes out,
-- instead of every campaign silently using whatever cadence Waalaxy
-- defaults to. Stored the same way follow_up_messages already is -- a JSON
-- array, only the first follow_up_count entries meaningful -- rather than a
-- fixed schedule, since every campaign's cadence is the client's own call.
--
-- Semantics: index 0 is the wait after the connection request is accepted;
-- every later index is the wait after the follow-up before it (not a
-- cumulative offset from the connection request).
alter table outreach.campaigns
  add column if not exists follow_up_delay_days jsonb not null default '[3,3,3]'::jsonb;
