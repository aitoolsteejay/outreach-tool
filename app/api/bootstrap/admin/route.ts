import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

    const authClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { data: signInData } = await authClient.auth.signInWithPassword({ email, password });
    let userId = signInData.user?.id;

    if (!userId) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName?.trim() || "Myntmore Admin" },
      });
      if (error) throw error;
      userId = data.user.id;
    }

    const { error: profileError } = await supabase.schema("outreach").from("profiles").upsert({ id: userId, email, full_name: fullName?.trim() || "Myntmore Admin", role: "admin" });
    if (profileError) throw profileError;
    return NextResponse.json({ id: userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the admin account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
