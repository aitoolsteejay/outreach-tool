import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";

// Lets an admin pull the exact CSV a client uploaded, to import into Waalaxy
// by hand -- Waalaxy's API can't set message content or handle 2FA, so
// admins run the actual send manually (see lib/waalaxy.ts).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { id } = await params;

  const { data: campaign, error: campaignError } = await admin.schema("outreach").from("campaigns").select("name").eq("id", id).single();
  if (campaignError || !campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const { data: leadFile, error: leadFileError } = await admin.schema("outreach").from("lead_files").select("storage_path,original_name,content_type").eq("campaign_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (leadFileError) return NextResponse.json({ error: leadFileError.message }, { status: 500 });
  if (!leadFile) return NextResponse.json({ error: "No lead list has been uploaded for this campaign yet." }, { status: 404 });

  const { data: fileBlob, error: downloadError } = await admin.storage.from("outreach-leads").download(leadFile.storage_path);
  if (downloadError || !fileBlob) return NextResponse.json({ error: downloadError?.message || "Unable to download the uploaded lead file." }, { status: 500 });

  const safeName = (campaign.name || "campaign").replace(/[^a-zA-Z0-9._-]/g, "_") || "campaign";
  const fileName = leadFile.original_name || `${safeName}-leads.csv`;
  return new NextResponse(fileBlob, {
    headers: {
      "Content-Type": leadFile.content_type || "text/csv",
      "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
    },
  });
}
