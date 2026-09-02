import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

type RequireUserResult =
  | { ok: true; admin: ReturnType<typeof createAdminClient>; userId: string; role: string }
  | { ok: false; response: NextResponse };

// Bearer-token check for any signed-in, non-revoked Outreach member (client
// or admin) -- the client-facing counterpart to requireAdmin. Used by routes
// a client calls on their own behalf, where we still need the service-role
// client server-side (e.g. to write an encrypted secret).
export async function requireUser(request: Request): Promise<RequireUserResult> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };

  const authClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return { ok: false, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };

  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); }
  catch { return { ok: false, response: NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 }) }; }

  const { data: profile } = await admin.schema("outreach").from("profiles").select("role").eq("id", user.id).is("access_revoked_at", null).single();
  if (!profile) return { ok: false, response: NextResponse.json({ error: "This account does not have Outreach access." }, { status: 403 }) };

  return { ok: true, admin, userId: user.id, role: profile.role };
}
