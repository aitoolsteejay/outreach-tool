import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";

const SELECT_FIELDS = "waalaxy_campaign_id,waalaxy_list_id,waalaxy_sync_status,waalaxy_sync_error,waalaxy_prospects_imported,waalaxy_synced_at";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { data, error } = await auth.admin.schema("outreach").from("campaigns").select(SELECT_FIELDS).eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { waalaxyCampaignId, waalaxyListId } = await request.json();
  if (!waalaxyCampaignId || !waalaxyListId) {
    return NextResponse.json({ error: "A Waalaxy campaign and prospect list are both required." }, { status: 400 });
  }
  const { data, error } = await auth.admin.schema("outreach").from("campaigns")
    .update({ waalaxy_campaign_id: waalaxyCampaignId, waalaxy_list_id: waalaxyListId, waalaxy_sync_status: "linked", waalaxy_sync_error: null })
    .eq("id", id)
    .select(SELECT_FIELDS)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Unable to link this campaign." }, { status: 500 });
  return NextResponse.json(data);
}
