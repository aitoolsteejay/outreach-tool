-- One-off demo/dev data for the existing test client (test@gmail.com).
-- Not a schema migration -- run this by hand in the Supabase SQL editor (or
-- `supabase db execute -f supabase/seed-dummy-client-data.sql`) whenever you
-- want sample campaigns to look at. Safe to re-run: it no-ops if the sample
-- campaigns already exist for this client.
--
-- What this does NOT create, on purpose:
--  - Lead CSV files in storage. lead_count is set on each campaign, but
--    there's no real file behind it, so "Download leads (CSV)" on these
--    dummy campaigns will 404 until a real CSV is uploaded through the app.
--  - LinkedIn credentials. Passwords are application-layer encrypted
--    (CREDENTIALS_ENCRYPTION_KEY), which this plain-SQL script can't produce
--    -- submit real ones through the client's LinkedIn card in the app if
--    you want that panel populated too.

do $$
declare
  v_client_id uuid;
  v_admin_id uuid;
  v_campaign_id uuid;
begin
  select id into v_client_id from outreach.profiles where email = 'test@gmail.com' and role = 'client' limit 1;
  if v_client_id is null then
    raise notice 'No client profile found for test@gmail.com -- skipping. Create/promote that account first.';
    return;
  end if;

  if exists (select 1 from outreach.campaigns where client_id = v_client_id and name = 'Q3 SaaS Founders Outreach') then
    raise notice 'Dummy data already present for this client -- skipping.';
    return;
  end if;

  select id into v_admin_id from outreach.profiles where role = 'admin' order by created_at asc limit 1;

  insert into outreach.campaigns (
    client_id, name, goal, offer, tone, messaging_strategy, connection_note, follow_up_count, follow_up_messages,
    lead_count, status, progress, submitted_at, created_at,
    waalaxy_sync_status, waalaxy_prospects_imported, waalaxy_synced_at,
    connections_sent, connections_accepted, replies_received, positive_replies, metrics_updated_at
  ) values
  (
    v_client_id, 'Q3 SaaS Founders Outreach', 'Book qualified discovery calls', 'Free growth audit for early-stage SaaS founders',
    'Warm, credible, and concise', 'Lead with a specific pain point around slow outbound pipeline, then offer the audit as a low-friction next step.',
    'Hi {{first_name}}, I came across your work at {{company}} and would love to connect.', 2,
    '["Thanks for connecting, {{first_name}}! Curious if scaling outbound is on your radar this quarter?", "No worries if now isn''t the right time — happy to share a quick audit whenever useful."]'::jsonb,
    42, 'submitted', 15, now() - interval '2 days', now() - interval '2 days',
    'not_linked', 0, null, 0, 0, 0, 0, null
  ),
  (
    v_client_id, 'Enterprise IT Decision Makers', 'Generate demo requests', 'Free security posture review',
    'Direct, credible, ROI-focused', 'Open with a security-compliance angle relevant to enterprise IT buyers.',
    'Hi {{first_name}}, noticed {{company}} is scaling fast — would love to connect.', 1,
    '["Thanks for connecting! Would a 15-minute security posture review be useful this quarter?"]'::jsonb,
    65, 'in review', 30, now() - interval '5 days', now() - interval '5 days',
    'not_linked', 0, null, 0, 0, 0, 0, null
  ),
  (
    v_client_id, 'Mid-Market Marketing Leaders', 'Book qualified discovery calls', '30-day content pipeline audit',
    'Friendly, consultative', 'Focus on content velocity pain points for mid-market marketing teams.',
    'Hi {{first_name}}, love what your team is doing at {{company}} — mind connecting?', 3,
    '["Thanks for connecting, {{first_name}}! How''s content velocity looking this quarter?", "Happy to share a few ideas if useful — no pressure at all.", "Last note from me — here if you ever want to chat outbound content."]'::jsonb,
    88, 'in setup', 55, now() - interval '9 days', now() - interval '9 days',
    'linked', 0, null, 0, 0, 0, 0, null
  ),
  (
    v_client_id, 'DTC Brand Founders — Q3', 'Book qualified discovery calls', 'Free growth audit for DTC brands',
    'Warm, credible, and concise', 'Lead with a specific, relevant pain point for e-commerce ops leads, then offer the audit as a low-friction next step.',
    'Hi {{first_name}}, I came across your work at {{company}} and would love to connect.', 2,
    '["Thanks for connecting, {{first_name}}! Curious if scaling outbound is on your radar this quarter?", "No worries if now isn''t the right time — happy to share a quick audit whenever useful."]'::jsonb,
    180, 'live', 80, now() - interval '18 days', now() - interval '18 days',
    'synced', 172, now() - interval '3 days', 172, 76, 22, 14, now() - interval '1 day'
  ),
  (
    v_client_id, 'Fintech Ops Leaders — Completed', 'Book qualified discovery calls', 'Free compliance workflow audit',
    'Formal, precise, credible', 'Lead with regulatory/compliance pain points relevant to fintech ops leaders.',
    'Hi {{first_name}}, your work on {{company}}''s ops caught my eye — would love to connect.', 1,
    '["Thanks for connecting! Would a compliance workflow audit be useful this quarter?"]'::jsonb,
    250, 'completed', 100, now() - interval '40 days', now() - interval '40 days',
    'synced', 248, now() - interval '35 days', 248, 131, 52, 31, now() - interval '3 days'
  );

  -- A couple of sample alerts so the Alerts panels have something to show.
  select id into v_campaign_id from outreach.campaigns where client_id = v_client_id and name = 'Mid-Market Marketing Leaders';
  insert into outreach.campaign_alerts (client_id, campaign_id, lead_reference, severity, message, resolved, created_by, created_at) values
    (v_client_id, v_campaign_id, 'linkedin.com/in/jane-doe', 'warning', 'LinkedIn URL redirects to a deactivated profile — please check and resubmit.', false, v_admin_id, now() - interval '1 day');

  select id into v_campaign_id from outreach.campaigns where client_id = v_client_id and name = 'DTC Brand Founders — Q3';
  insert into outreach.campaign_alerts (client_id, campaign_id, lead_reference, severity, message, resolved, created_by, created_at, resolved_at) values
    (v_client_id, v_campaign_id, null, 'info', 'Outreach paused briefly for a LinkedIn safety check — resumed same day, no leads affected.', true, v_admin_id, now() - interval '10 days', now() - interval '9 days');

  raise notice 'Seeded 5 dummy campaigns and 2 alerts for %.', v_client_id;
end
$$;
