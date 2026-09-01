// Keep in sync with the `role` check constraint on outreach.profiles in
// supabase/migrations/20260821000000_admin_accounts.sql.
export const VALID_ROLES = ["admin", "client"] as const;
export type Role = (typeof VALID_ROLES)[number];
