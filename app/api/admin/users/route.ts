import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const authClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.schema("outreach").from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

    const { email, password, fullName } = await request.json();
    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: "Use a valid email and a password with at least 8 characters." }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    const existingUser = usersPage.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
    let userId = existingUser?.id;
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true, user_metadata: { full_name: fullName?.trim() || normalizedEmail.split("@")[0] } });
      if (error) throw error;
      userId = data.user.id;
    }
    const { error: profileError } = await admin.schema("outreach").from("profiles").upsert({ id: userId, email: normalizedEmail, full_name: fullName?.trim() || normalizedEmail.split("@")[0], role: "client" });
    if (profileError) throw profileError;
    return NextResponse.json({ id: userId, email: normalizedEmail, existing: Boolean(existingUser) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the user account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
