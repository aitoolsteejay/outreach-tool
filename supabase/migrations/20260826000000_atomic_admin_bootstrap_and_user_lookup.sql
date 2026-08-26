-- Two hardening fixes for the admin-account API routes:
--
-- 1. outreach.claim_bootstrap_admin: the one-time "create the first admin"
--    endpoint used to do a plain SELECT-then-INSERT with no locking, so two
--    concurrent requests could both pass the check and both become admin
--    (the DB-level uniqueness that used to prevent this was intentionally
--    dropped in 20260821020000_allow_multiple_admins.sql so existing admins
--    can promote others later). This function makes the *bootstrap* claim
--    atomic via an advisory lock, independent of that later multi-admin
--    change: only the first caller to reach this function while no admin
--    exists can succeed, everyone after gets `false`.
--
--    SECURITY: only ever grant EXECUTE to service_role. This function is
--    SECURITY DEFINER and takes an arbitrary admin_id with no ownership
--    check of its own — if the anon/authenticated role could call it
--    directly, anyone could hand any uuid the admin role.
create or replace function outreach.claim_bootstrap_admin(admin_id uuid, admin_email text, admin_full_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('outreach_bootstrap_admin')::bigint);
  if exists (select 1 from outreach.profiles where role = 'admin') then
    return false;
  end if;
  insert into outreach.profiles (id, email, full_name, role)
  values (admin_id, admin_email, admin_full_name, 'admin')
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, role = 'admin';
  return true;
end;
$$;

revoke all on function outreach.claim_bootstrap_admin(uuid, text, text) from public;
grant execute on function outreach.claim_bootstrap_admin(uuid, text, text) to service_role;

-- 2. outreach.find_auth_user_by_email: the admin "create user" route used to
--    call auth.admin.listUsers({ perPage: 1000 }) and scan the first page for
--    a matching email. Auth is shared across other Myntmore tools, so past
--    1000 shared users this silently stopped finding real matches and the
--    "grant Outreach access to an existing login" path started failing with
--    a duplicate-email error instead of succeeding. This does a direct,
--    indexed lookup instead.
create or replace function outreach.find_auth_user_by_email(lookup_email text)
returns table(id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(lookup_email) limit 1;
$$;

revoke all on function outreach.find_auth_user_by_email(text) from public;
grant execute on function outreach.find_auth_user_by_email(text) to service_role;
