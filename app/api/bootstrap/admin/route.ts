import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = createAdminClient();
  let createdNewAuthUser = false;
  let userId: string | undefined;
  try {
    const { email, password, fullName } = await request.json();
    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: "Use a valid email and a password with at least 8 characters." }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFullName = fullName?.trim() || "Myntmore Admin";

    // Cheap, non-authoritative fast path -- avoids creating an auth user for
    // the common case where an admin obviously already exists. The actual
    // guarantee is the atomic claim_bootstrap_admin() call below.
    const { data: existingAdmin, error: lookupError } = await supabase.schema("outreach").from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    if (existingAdmin) return NextResponse.json({ error: "An admin account already exists." }, { status: 409 });

    // Always create a brand-new, dedicated auth identity for this email --
    // never sign in as (and thereby grant admin to) whatever pre-existing
    // account, from any Myntmore tool, happens to already own this email.
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: normalizedFullName },
    });
    if (createError) {
      if (/already.*(registered|exists)/i.test(createError.message)) {
        return NextResponse.json({ error: "This email already has a Myntmore login. Ask an existing Outreach admin to grant it admin access instead." }, { status: 409 });
      }
      throw createError;
    }
    userId = data.user.id;
    createdNewAuthUser = true;

    const { data: claimed, error: claimError } = await supabase.schema("outreach").rpc("claim_bootstrap_admin", { admin_id: userId, admin_email: normalizedEmail, admin_full_name: normalizedFullName });
    if (claimError) throw claimError;
    if (!claimed) {
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
      return NextResponse.json({ error: "An admin account already exists." }, { status: 409 });
    }

    return NextResponse.json({ id: userId });
  } catch (error) {
    if (createdNewAuthUser && userId) await supabase.auth.admin.deleteUser(userId).catch(() => {});
    const message = error instanceof Error ? error.message : "Unable to create the admin account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
