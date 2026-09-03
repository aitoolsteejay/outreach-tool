import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";

// verification_code is deliberately excluded here -- like the password, it's
// only ever returned by a dedicated, audited reveal action (see
// reveal-code/route.ts), not as a side effect of loading this panel.
const SELECT_FIELDS = "linkedin_email,status,verification_code,code_requested_at,code_submitted_at,last_attempt_at,failure_reason,revealed_at,code_revealed_at,updated_at";

const ACTIONS = ["request_code", "request_approval", "mark_logged_in", "mark_failed", "reset"] as const;
type Action = (typeof ACTIONS)[number];

export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { clientId } = await params;
  const { data } = await auth.admin.schema("outreach").from("linkedin_credentials").select(SELECT_FIELDS).eq("client_id", clientId).maybeSingle();
  if (!data) return NextResponse.json(null);
  const { verification_code, ...rest } = data;
  return NextResponse.json({ ...rest, has_code: Boolean(verification_code) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { clientId } = await params;
  const { action, reason } = await request.json();
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const { data: existing } = await auth.admin.schema("outreach").from("linkedin_credentials").select("status").eq("client_id", clientId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "This client hasn't submitted LinkedIn credentials yet." }, { status: 404 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { last_attempt_at: now, last_attempt_by: auth.userId, updated_at: now };
  const typedAction = action as Action;
  if (typedAction === "request_code" || typedAction === "request_approval") {
    update.status = typedAction === "request_code" ? "awaiting_code" : "awaiting_approval";
    update.verification_code = null;
    update.code_requested_at = now;
    update.code_submitted_at = null;
    update.failure_reason = null;
  } else if (typedAction === "mark_logged_in") {
    update.status = "logged_in";
    update.verification_code = null;
    update.failure_reason = null;
  } else if (typedAction === "mark_failed") {
    update.status = "failed";
    update.verification_code = null;
    update.failure_reason = typeof reason === "string" && reason.trim() ? reason.trim() : "Login attempt failed.";
  } else if (typedAction === "reset") {
    update.status = "pending";
    update.verification_code = null;
    update.code_requested_at = null;
    update.code_submitted_at = null;
    update.failure_reason = null;
  }

  const { data, error } = await auth.admin.schema("outreach").from("linkedin_credentials").update(update).eq("client_id", clientId).select(SELECT_FIELDS).single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Unable to update this record." }, { status: 500 });
  const { verification_code, ...rest } = data;
  return NextResponse.json({ ...rest, has_code: Boolean(verification_code) });
}
