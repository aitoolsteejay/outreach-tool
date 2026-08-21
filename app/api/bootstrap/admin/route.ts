import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { email, password, fullName } = await request.json();
    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: "Use a valid email and a password with at least 8 characters." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existingAdmin, error: lookupError } = await supabase.schema("outreach").from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    if (existingAdmin) return NextResponse.json({ error: "An admin account already exists." }, { status: 409 });

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName?.trim() || "Myntmore Admin", bootstrap_admin: true },
    });
    if (error) throw error;
    return NextResponse.json({ id: data.user.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the admin account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
