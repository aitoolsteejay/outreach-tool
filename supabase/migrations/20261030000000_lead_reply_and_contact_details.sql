-- Add reply content, conversation links, and contact details to outreach.lead_statuses,
-- populated from Waalaxy contact exports.

alter table outreach.lead_statuses
  add column if not exists reply_text text,
  add column if not exists conversation_url text,
  add column if not exists job_title text default '',
  add column if not exists email text default '',
  add column if not exists phone text default '',
  add column if not exists location text default '';

-- Ensure admins can manage lead categories for any client (to add/rename/delete
-- labels when categorizing leads on behalf of a client).
drop policy if exists "Active clients manage their own lead categories, admins read all" on outreach.lead_categories;
create policy "Active clients and admins manage lead categories" on outreach.lead_categories for all to authenticated
  using ((client_id = auth.uid() and outreach.has_outreach_access(auth.uid())) or outreach.is_admin_user(auth.uid()))
  with check ((client_id = auth.uid() and outreach.has_outreach_access(auth.uid())) or outreach.is_admin_user(auth.uid()));
