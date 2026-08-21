create table if not exists outreach.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

create unique index if not exists one_bootstrap_admin on outreach.profiles (role) where role = 'admin';
alter table outreach.profiles enable row level security;

drop function if exists outreach.is_admin(uuid);
create or replace function outreach.is_admin_user(check_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from outreach.profiles where id = check_user_id and role = 'admin');
$$;

create or replace function outreach.has_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from outreach.profiles where role = 'admin');
$$;

create or replace function outreach.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare selected_role text := 'client';
begin
  if new.raw_user_meta_data ->> 'bootstrap_admin' = 'true' and not exists (select 1 from outreach.profiles where role = 'admin') then
    selected_role := 'admin';
  end if;
  insert into outreach.profiles (id, email, full_name, role)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''), selected_role)
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_outreach on auth.users;
create trigger on_auth_user_created_outreach after insert or update of email, raw_user_meta_data on auth.users for each row execute function outreach.handle_new_user();

insert into outreach.profiles (id, email, full_name, role)
select id, coalesce(email, ''), coalesce(raw_user_meta_data ->> 'full_name', ''), 'client' from auth.users
on conflict (id) do nothing;

drop policy if exists "Users can view their own profile" on outreach.profiles;
create policy "Users can view their own profile" on outreach.profiles for select to authenticated using (id = auth.uid() or outreach.is_admin_user(auth.uid()));

grant usage on schema outreach to anon, authenticated, service_role;
grant select on outreach.profiles to authenticated, service_role;
grant execute on function outreach.has_admin() to anon, authenticated;
grant execute on function outreach.is_admin_user(uuid) to authenticated;
