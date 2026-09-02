-- Stores a client's LinkedIn credentials so an admin can manually sign into
-- Waalaxy on their behalf (Waalaxy has no login API -- this is a real
-- browser-driven sign-in an admin does by hand), plus the back-and-forth
-- needed when LinkedIn challenges the login with a verification code or a
-- "tap Yes" phone approval.
--
-- The password is never stored in plaintext -- it's AES-256-GCM encrypted at
-- the application layer (see lib/crypto.ts) before it ever reaches this
-- table, using a key that only exists in the server environment
-- (CREDENTIALS_ENCRYPTION_KEY), never in the database itself.
--
-- SECURITY: this table gets no RLS grants at all. Every read and write goes
-- through server API routes (app/api/client/linkedin-credentials/*,
-- app/api/admin/linkedin-credentials/*) using the service-role client, which
-- control exactly which fields a client vs. an admin ever sees -- a client
-- can never read another client's row, and only an explicit admin "reveal"
-- action (which is audited via revealed_by/revealed_at) ever returns the
-- decrypted password. Revoking the authenticated/anon grants means even a
-- bug that accidentally used the browser Supabase client here fails closed
-- instead of leaking ciphertext or verification codes.

create table if not exists outreach.linkedin_credentials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references outreach.profiles(id) on delete cascade,
  linkedin_email text not null,
  encrypted_password text not null,
  password_iv text not null,
  password_auth_tag text not null,
  status text not null default 'pending' check (status in ('pending', 'awaiting_code', 'awaiting_approval', 'code_submitted', 'logged_in', 'failed')),
  verification_code text,
  code_requested_at timestamptz,
  code_submitted_at timestamptz,
  last_attempt_at timestamptz,
  last_attempt_by uuid references outreach.profiles(id) on delete set null,
  failure_reason text,
  revealed_at timestamptz,
  revealed_by uuid references outreach.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table outreach.linkedin_credentials enable row level security;
revoke all on outreach.linkedin_credentials from authenticated, anon;
grant all on outreach.linkedin_credentials to service_role;
