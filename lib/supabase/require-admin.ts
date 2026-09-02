import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

type RequireAdminResult =
  | { ok: true; admin: ReturnType<typeof createAdminClient>; userId: string }
  | { ok: false; response: NextResponse };

// Shared bearer-token + role check for admin-only API routes. Verifies the
// caller's Supabase session token, then checks their outreach.profiles role.
export async function requireAdmin(request: Request): Promise<RequireAdminResult> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };

  const authClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return { ok: false, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };

  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); }
  catch { return { ok: false, response: NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 }) }; }
  const { data: profile } = await admin.schema("outreach").from("profiles").select("role").eq("id", user.id).is("access_revoked_at", null).single();
  if (profile?.role !== "admin") return { ok: false, response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };

  return { ok: true, admin, userId: user.id };
}
