-- Preserve historical campaign data when Outreach access is revoked.
alter table outreach.profiles add column if not exists access_revoked_at timestamptz;

create or replace function outreach.has_outreach_access(check_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from outreach.profiles where id = check_user_id and access_revoked_at is null);
$$;

create or replace function outreach.is_admin_user(check_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from outreach.profiles where id = check_user_id and role = 'admin' and access_revoked_at is null);
$$;

create or replace function outreach.has_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from outreach.profiles where role = 'admin' and access_revoked_at is null);
$$;

-- The lock makes last-admin role changes and revocations race-safe.
create or replace function outreach.set_member_access(target_id uuid, requested_role text, revoke_access boolean default false)
returns table(id uuid, email text, full_name text, role text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare target outreach.profiles%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('outreach_admin_membership')::bigint);
  select * into target from outreach.profiles where outreach.profiles.id = target_id for update;
  if not found then raise exception 'Account not found.' using errcode = 'P0002'; end if;
  if target.role = 'admin' and (revoke_access or requested_role = 'client') and
     (select count(*) from outreach.profiles where role = 'admin' and access_revoked_at is null) <= 1 then
    raise exception 'Cannot remove or demote the only remaining admin.' using errcode = 'P0001';
  end if;
  update outreach.profiles
  set role = case when revoke_access then role else requested_role end,
      access_revoked_at = case when revoke_access then now() else null end
  where outreach.profiles.id = target_id;
  return query select p.id, p.email, p.full_name, p.role, p.created_at from outreach.profiles p where p.id = target_id;
end;
$$;

revoke all on function outreach.set_member_access(uuid, text, boolean) from public;
grant execute on function outreach.set_member_access(uuid, text, boolean) to service_role;
grant execute on function outreach.has_outreach_access(uuid) to authenticated;

create or replace function outreach.claim_bootstrap_admin(admin_id uuid, admin_email text, admin_full_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('outreach_bootstrap_admin')::bigint);
  if exists (select 1 from outreach.profiles where role = 'admin' and access_revoked_at is null) then return false; end if;
  insert into outreach.profiles (id, email, full_name, role, access_revoked_at)
  values (admin_id, admin_email, admin_full_name, 'admin', null)
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, role = 'admin', access_revoked_at = null;
  return true;
end;
$$;
revoke all on function outreach.claim_bootstrap_admin(uuid, text, text) from public;
grant execute on function outreach.claim_bootstrap_admin(uuid, text, text) to service_role;

drop policy if exists "Users can view their own profile" on outreach.profiles;
create policy "Active users view their own profile, admins view active members" on outreach.profiles for select to authenticated
  using ((id = auth.uid() and access_revoked_at is null) or outreach.is_admin_user(auth.uid()));

drop policy if exists "Clients see their own campaigns, admins see all" on outreach.campaigns;
create policy "Active clients see their own campaigns, admins see all" on outreach.campaigns for select to authenticated
  using ((client_id = auth.uid() and outreach.has_outreach_access(auth.uid())) or outreach.is_admin_user(auth.uid()));
drop policy if exists "Clients insert their own campaigns" on outreach.campaigns;
create policy "Active clients insert their own campaigns" on outreach.campaigns for insert to authenticated
  with check (client_id = auth.uid() and outreach.has_outreach_access(auth.uid()));
create policy "Active clients delete incomplete own campaigns" on outreach.campaigns for delete to authenticated
  using (client_id = auth.uid() and outreach.has_outreach_access(auth.uid()) and status = 'submitted');

drop policy if exists "Clients see their own lead files, admins see all" on outreach.lead_files;
create policy "Active clients see their own lead files, admins see all" on outreach.lead_files for select to authenticated
  using ((client_id = auth.uid() and outreach.has_outreach_access(auth.uid())) or outreach.is_admin_user(auth.uid()));
drop policy if exists "Clients insert their own lead files" on outreach.lead_files;
create policy "Active clients insert their own lead files" on outreach.lead_files for insert to authenticated
  with check (client_id = auth.uid() and outreach.has_outreach_access(auth.uid()));

drop policy if exists "Clients see their own alerts, admins see all" on outreach.campaign_alerts;
create policy "Active clients see their own alerts, admins see all" on outreach.campaign_alerts for select to authenticated
  using ((client_id = auth.uid() and outreach.has_outreach_access(auth.uid())) or outreach.is_admin_user(auth.uid()));

drop policy if exists "Clients manage their own lead uploads" on storage.objects;
create policy "Active clients manage their own lead uploads" on storage.objects for all to authenticated
  using (bucket_id = 'outreach-leads' and (storage.foldername(name))[1] = auth.uid()::text and outreach.has_outreach_access(auth.uid()))
  with check (bucket_id = 'outreach-leads' and (storage.foldername(name))[1] = auth.uid()::text and outreach.has_outreach_access(auth.uid()));

grant delete on outreach.campaigns to authenticated;
