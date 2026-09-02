import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { encryptSecret } from "@/lib/crypto";

const SELECT_FIELDS = "linkedin_email,status,code_requested_at,code_submitted_at,failure_reason,updated_at";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { data } = await auth.admin.schema("outreach").from("linkedin_credentials").select(SELECT_FIELDS).eq("client_id", auth.userId).maybeSingle();
  return NextResponse.json(data || null);
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { email, password } = await request.json();
  const normalizedEmail = typeof email === "string" ? email.trim() : "";
  if (!normalizedEmail || !password || typeof password !== "string" || password.length < 4) {
    return NextResponse.json({ error: "Enter your LinkedIn email and password." }, { status: 400 });
  }
  const encrypted = encryptSecret(password);
  const { data, error } = await auth.admin.schema("outreach").from("linkedin_credentials").upsert({
    client_id: auth.userId,
    linkedin_email: normalizedEmail,
    encrypted_password: encrypted.ciphertext,
    password_iv: encrypted.iv,
    password_auth_tag: encrypted.authTag,
    status: "pending",
    verification_code: null,
    code_requested_at: null,
    code_submitted_at: null,
    failure_reason: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "client_id" }).select(SELECT_FIELDS).single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Unable to save your LinkedIn details." }, { status: 500 });
  return NextResponse.json(data);
}
