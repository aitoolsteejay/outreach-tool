import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";

// Mirrors reveal/route.ts's pattern for the password: revealing the client's
// submitted verification code is a distinct, audited action
// (code_revealed_by/code_revealed_at), not something that happens as a side
// effect of loading the panel -- the plain GET route deliberately omits the
// code itself, returning only a has_code boolean.
export async function POST(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { clientId } = await params;

  const { data: existing } = await auth.admin.schema("outreach").from("linkedin_credentials").select("verification_code").eq("client_id", clientId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "This client hasn't submitted LinkedIn credentials yet." }, { status: 404 });
  if (!existing.verification_code) return NextResponse.json({ error: "No code has been submitted yet." }, { status: 400 });

  const now = new Date().toISOString();
  await auth.admin.schema("outreach").from("linkedin_credentials").update({ code_revealed_at: now, code_revealed_by: auth.userId }).eq("client_id", clientId);

  return NextResponse.json({ code: existing.verification_code, revealedAt: now });
}
