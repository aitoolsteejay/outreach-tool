-- Auth users are shared across Myntmore tools. Access to Outreach is granted
-- only by an explicit row in outreach.profiles.
drop trigger if exists on_auth_user_created_outreach on auth.users;

-- The previous migration backfilled every shared Auth user. These rows are only
-- Outreach memberships; deleting them does not delete or modify Auth accounts.
delete from outreach.profiles;

grant select, insert, update, delete on outreach.profiles to service_role;

comment on table outreach.profiles is 'App-scoped memberships for the Myntmore Outreach portal. Auth identities may be shared with other tools.';
