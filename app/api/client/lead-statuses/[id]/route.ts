import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

// Lets a client tag one of their own leads with a category (Hot/Cold/
// whatever they've defined) or clear it back to uncategorized. Clients
// have no direct UPDATE grant on outreach.lead_statuses (see
// "Admins manage lead statuses" in its migration) -- the rest of that row
// (connection_request_date, connected_at, replied_at, ...) is
// admin-authoritative, sourced from Waalaxy's own export, and shouldn't be
// touchable from here. Only category_id is ever written by this route.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { id: leadStatusId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { categoryId } = body as Record<string, unknown>;
  if (categoryId !== null && typeof categoryId !== "string") return NextResponse.json({ error: "Invalid category." }, { status: 400 });

  const { data: lead, error: leadError } = await auth.admin.schema("outreach").from("lead_statuses").select("id,client_id").eq("id", leadStatusId).single();
  if (leadError || !lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (lead.client_id !== auth.userId) return NextResponse.json({ error: "This lead doesn't belong to you." }, { status: 403 });

  if (categoryId !== null) {
    const { data: category, error: categoryError } = await auth.admin.schema("outreach").from("lead_categories").select("id,client_id").eq("id", categoryId).single();
    if (categoryError || !category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    if (category.client_id !== auth.userId) return NextResponse.json({ error: "This category doesn't belong to you." }, { status: 403 });
  }

  const { error: updateError } = await auth.admin.schema("outreach").from("lead_statuses").update({ category_id: categoryId }).eq("id", leadStatusId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
