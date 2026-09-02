import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  let supabase: ReturnType<typeof createAdminClient>;
  try { supabase = createAdminClient(); }
  catch { return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 }); }
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

    const { data: foundRows, error: findError } = await supabase.schema("outreach").rpc("find_auth_user_by_email", { lookup_email: normalizedEmail });
    if (findError) throw findError;
    userId = foundRows?.[0]?.id;
    if (userId) {
      const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({ email: normalizedEmail, password });
      if (verifyError || verified.user.id !== userId) return NextResponse.json({ error: "That email already has a Myntmore login. Enter its existing password to grant it Outreach admin access." }, { status: 401 });
    } else {
      const { data, error: createError } = await supabase.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true, user_metadata: { full_name: normalizedFullName } });
      if (createError) throw createError;
      userId = data.user.id;
      createdNewAuthUser = true;
    }

    const { data: claimed, error: claimError } = await supabase.schema("outreach").rpc("claim_bootstrap_admin", { admin_id: userId, admin_email: normalizedEmail, admin_full_name: normalizedFullName });
    if (claimError) throw claimError;
    if (!claimed) {
      if (createdNewAuthUser) await supabase.auth.admin.deleteUser(userId).catch(() => {});
      return NextResponse.json({ error: "An admin account already exists." }, { status: 409 });
    }

    return NextResponse.json({ id: userId });
  } catch (error) {
    if (createdNewAuthUser && userId) await supabase.auth.admin.deleteUser(userId).catch(() => {});
    const message = error instanceof Error ? error.message : "Unable to create the admin account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
