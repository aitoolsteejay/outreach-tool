import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";

// Keep in sync with the `role` check constraint on outreach.profiles in
// supabase/migrations/20260821000000_admin_accounts.sql -- if they ever
// drift, the 23514 handling below keeps the response a clean 400 instead of
// a raw constraint-violation 500.
const VALID_ROLES = ["admin", "client"] as const;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  let createdNewAuthUser = false;
  let userId: string | undefined;
  try {
    const { email, password, fullName, role = "client" } = await request.json();
    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: "Use a valid email and a password with at least 8 characters." }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid account type." }, { status: 400 });
    const normalizedEmail = email.trim().toLowerCase();

    const { data: foundRows, error: lookupError } = await admin.schema("outreach").rpc("find_auth_user_by_email", { lookup_email: normalizedEmail });
    if (lookupError) throw lookupError;
    const existingUserId: string | undefined = foundRows?.[0]?.id;
    userId = existingUserId;
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true, user_metadata: { full_name: fullName?.trim() || normalizedEmail.split("@")[0] } });
      if (error) throw error;
      userId = data.user.id;
      createdNewAuthUser = true;
    }
    const { error: profileError } = await admin.schema("outreach").from("profiles").upsert({ id: userId, email: normalizedEmail, full_name: fullName?.trim() || normalizedEmail.split("@")[0], role });
    if (profileError) {
      if (createdNewAuthUser) await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw profileError;
    }
    return NextResponse.json({ id: userId, email: normalizedEmail, role, existing: Boolean(existingUserId) });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "23514") return NextResponse.json({ error: "Invalid account type." }, { status: 400 });
    const message = error instanceof Error ? error.message : "Unable to create the user account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
