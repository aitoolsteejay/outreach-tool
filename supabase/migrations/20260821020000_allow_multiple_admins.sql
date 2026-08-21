-- The first admin is bootstrapped publicly once. After that, authenticated
-- admins may grant the admin role to additional Outreach members.
drop index if exists outreach.one_bootstrap_admin;
