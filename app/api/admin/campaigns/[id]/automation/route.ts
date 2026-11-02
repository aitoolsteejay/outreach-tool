import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";

const SELECT_FIELDS = "automation_campaign_id,automation_list_id,automation_sync_status,automation_sync_error,automation_prospects_imported,automation_synced_at";

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
  const { automationCampaignId, automationListId } = await request.json();
  if (!automationCampaignId || !automationListId) {
    return NextResponse.json({ error: "An automation tool campaign and prospect list are both required." }, { status: 400 });
  }
  const { data, error } = await auth.admin.schema("outreach").from("campaigns")
    .update({ automation_campaign_id: automationCampaignId, automation_list_id: automationListId, automation_sync_status: "linked", automation_sync_error: null })
    .eq("id", id)
    .select(SELECT_FIELDS)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Unable to link this campaign." }, { status: 500 });
  return NextResponse.json(data);
}
