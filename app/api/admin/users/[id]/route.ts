import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { VALID_ROLES } from "@/lib/roles";

async function countAdmins(admin: ReturnType<typeof createAdminClient>) {
  const { count } = await admin.schema("outreach").from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { admin, userId: callerId } = auth;
  const { id } = await params;

  if (id === callerId) return NextResponse.json({ error: "You can't change your own account type here." }, { status: 400 });

  const { role } = await request.json();
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid account type." }, { status: 400 });

  const { data: target } = await admin.schema("outreach").from("profiles").select("role").eq("id", id).single();
  if (!target) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  if (target.role === "admin" && role === "client") {
    const adminCount = await countAdmins(admin);
    if (adminCount <= 1) return NextResponse.json({ error: "Can't demote the only remaining admin." }, { status: 400 });
  }

  const { data, error } = await admin.schema("outreach").from("profiles").update({ role }).eq("id", id).select("id,email,full_name,role,created_at").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Unable to update this account." }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { admin, userId: callerId } = auth;
  const { id } = await params;

  if (id === callerId) return NextResponse.json({ error: "You can't remove your own access." }, { status: 400 });

  const { data: target } = await admin.schema("outreach").from("profiles").select("role").eq("id", id).single();
  if (!target) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  if (target.role === "admin") {
    const adminCount = await countAdmins(admin);
    if (adminCount <= 1) return NextResponse.json({ error: "Can't remove the only remaining admin." }, { status: 400 });
  }

  // Deletes only the outreach.profiles row -- NOT the underlying auth.users
  // account, which is shared across other Myntmore tools (see
  // supabase/migrations/20260821010000_scope_auth_to_outreach.sql). This
  // revokes Outreach access without touching their login elsewhere.
  const { error } = await admin.schema("outreach").from("profiles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}
