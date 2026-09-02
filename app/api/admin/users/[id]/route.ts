import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { VALID_ROLES } from "@/lib/roles";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { admin, userId: callerId } = auth;
  const { id } = await params;

  if (id === callerId) return NextResponse.json({ error: "You can't change your own account type here." }, { status: 400 });

  const { role } = await request.json();
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid account type." }, { status: 400 });

  const { data, error } = await admin.schema("outreach").rpc("set_member_access", { target_id: id, requested_role: role, revoke_access: false });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "P0002" ? 404 : error.code === "P0001" ? 400 : 500 });
  return NextResponse.json(data?.[0]);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { admin, userId: callerId } = auth;
  const { id } = await params;

  if (id === callerId) return NextResponse.json({ error: "You can't remove your own access." }, { status: 400 });

  const { error } = await admin.schema("outreach").rpc("set_member_access", { target_id: id, requested_role: "client", revoke_access: true });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "P0002" ? 404 : error.code === "P0001" ? 400 : 500 });
  return NextResponse.json({ id });
}
