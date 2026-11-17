-- Labels are now a fixed, team-managed set of 12 tags instead of
-- client-editable Hot/Cold. Clients can read them but not change them or
-- assign them to prospects; only admins do.
--
-- Keep the list in sync with lib/lead-tags.ts.

-- 1. Preserve existing assignments: "Hot" becomes "Hot lead" (unless a "Hot
--    lead" row already exists for that client).
update outreach.lead_categories hot
   set name = 'Hot lead', color = '#C2410C'
 where hot.name = 'Hot'
   and not exists (select 1 from outreach.lead_categories x where x.client_id = hot.client_id and x.name = 'Hot lead');

-- 2. Give every client the standard tags (skip any that already exist).
insert into outreach.lead_categories (client_id, name, color, position)
select p.id, t.name, t.color, t.position
  from outreach.profiles p
 cross join (values
   ('Follow up 1 sent', '#D97706', 0),
   ('Follow up 2 sent', '#B45309', 1),
   ('Follow up 3 sent', '#92400E', 2),
   ('Hot lead', '#C2410C', 3),
   ('Not interested', '#6B7280', 4),
   ('Calendly sent', '#0D9488', 5),
   ('Details shared', '#0F766E', 6),
   ('Meeting scheduled', '#15803D', 7),
   ('Meeting done', '#166534', 8),
   ('To follow up', '#A16207', 9),
   ('Email communication', '#0369A1', 10),
   ('Whatsapp Communication', '#16A34A', 11)
 ) as t(name, color, position)
 where p.role = 'client'
on conflict (client_id, name) do nothing;

-- 3. Retire the old default "Cold" tag, but only where no prospect uses it
--    (never silently strip a label someone already applied).
delete from outreach.lead_categories c
 where c.name = 'Cold'
   and not exists (select 1 from outreach.lead_statuses l where l.category_id = c.id);

-- 4. Clients can read their tags; only admins can create, change or delete.
drop policy if exists "Active clients and admins manage lead categories" on outreach.lead_categories;
drop policy if exists "Active clients manage their own lead categories, admins read all" on outreach.lead_categories;
drop policy if exists "Clients read their own lead tags" on outreach.lead_categories;
drop policy if exists "Admins manage lead tags" on outreach.lead_categories;
create policy "Clients read their own lead tags" on outreach.lead_categories for select to authenticated
  using (client_id = auth.uid() and outreach.has_outreach_access(auth.uid()));
create policy "Admins manage lead tags" on outreach.lead_categories for all to authenticated
  using (outreach.is_admin_user(auth.uid()))
  with check (outreach.is_admin_user(auth.uid()));
