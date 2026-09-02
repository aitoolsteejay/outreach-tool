import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

const SELECT_FIELDS = "linkedin_email,status,code_requested_at,code_submitted_at,failure_reason,updated_at";

// A client submits the verification code LinkedIn sent them (or confirms
// they tapped Yes on their phone) so the admin can copy it into Waalaxy's
// real sign-in screen. Only accepted while we're actually waiting on one --
// otherwise there's nothing for an admin to act on yet.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { code } = await request.json();
  const trimmedCode = typeof code === "string" ? code.trim() : "";
  if (!trimmedCode) return NextResponse.json({ error: "Enter the code LinkedIn sent you." }, { status: 400 });

  const { data: existing } = await auth.admin.schema("outreach").from("linkedin_credentials").select("status").eq("client_id", auth.userId).maybeSingle();
  if (!existing || !["awaiting_code", "awaiting_approval"].includes(existing.status)) {
    return NextResponse.json({ error: "We're not currently waiting on a code from you." }, { status: 400 });
  }

  const { data, error } = await auth.admin.schema("outreach").from("linkedin_credentials").update({
    verification_code: trimmedCode,
    status: "code_submitted",
    code_submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("client_id", auth.userId).select(SELECT_FIELDS).single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Unable to submit your code." }, { status: 500 });
  return NextResponse.json(data);
}
