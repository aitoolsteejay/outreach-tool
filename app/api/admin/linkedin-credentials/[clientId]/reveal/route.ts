import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { decryptSecret } from "@/lib/crypto";

// Deliberately separate from the main GET route: revealing the plaintext
// password is a distinct, audited action (revealed_by/revealed_at), not
// something that happens as a side effect of just loading the panel.
export async function POST(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { clientId } = await params;

  const { data: existing } = await auth.admin.schema("outreach").from("linkedin_credentials").select("encrypted_password,password_iv,password_auth_tag").eq("client_id", clientId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "This client hasn't submitted LinkedIn credentials yet." }, { status: 404 });

  let password: string;
  try {
    password = decryptSecret({ ciphertext: existing.encrypted_password, iv: existing.password_iv, authTag: existing.password_auth_tag });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to decrypt this password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const now = new Date().toISOString();
  await auth.admin.schema("outreach").from("linkedin_credentials").update({ revealed_at: now, revealed_by: auth.userId }).eq("client_id", clientId);

  return NextResponse.json({ password, revealedAt: now });
}
