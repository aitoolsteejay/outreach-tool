import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { parseLeadsCsv } from "@/lib/csv";
import { pushProspectsToWaalaxy, WaalaxyApiError, WaalaxyNotConfiguredError, type WaalaxyProspectInput } from "@/lib/waalaxy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { id } = await params;

  const { data: campaign, error: campaignError } = await admin.schema("outreach").from("campaigns").select("id,waalaxy_campaign_id,waalaxy_list_id").eq("id", id).single();
  if (campaignError || !campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (!campaign.waalaxy_campaign_id || !campaign.waalaxy_list_id) {
    return NextResponse.json({ error: "Link this campaign to a Waalaxy campaign and prospect list before pushing leads." }, { status: 400 });
  }

  const { data: leadFile, error: leadFileError } = await admin.schema("outreach").from("lead_files").select("storage_path").eq("campaign_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (leadFileError) return NextResponse.json({ error: leadFileError.message }, { status: 500 });
  if (!leadFile) return NextResponse.json({ error: "No lead list has been uploaded for this campaign yet." }, { status: 400 });

  try {
    const { data: fileBlob, error: downloadError } = await admin.storage.from("outreach-leads").download(leadFile.storage_path);
    if (downloadError || !fileBlob) throw new Error(downloadError?.message || "Unable to download the uploaded lead file.");
    const csvText = await fileBlob.text();
    const rows = parseLeadsCsv(csvText);
    if (rows.length === 0) throw new Error("The uploaded CSV has no rows with a LinkedIn URL.");

    const prospects: WaalaxyProspectInput[] = rows.map((row) => ({
      url: row.linkedinUrl,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      customVariables: [
        row.company && { label: "Company", value: row.company },
        row.jobTitle && { label: "Job title", value: row.jobTitle },
        row.notes && { label: "Notes", value: row.notes },
      ].filter((v): v is { label: string; value: string } => Boolean(v)),
    }));

    const results = await pushProspectsToWaalaxy({ prospectListId: campaign.waalaxy_list_id, campaignId: campaign.waalaxy_campaign_id, prospects });
    const importedCount = results.filter((r) => r.importCode === "success").length;

    // "success" is our best-effort read of Waalaxy's importCode values --
    // Waalaxy doesn't publicly document the full set of codes it can return,
    // so this assumption could be wrong for a code we haven't seen before.
    // Always surface the raw per-code breakdown (not just a computed
    // pass/fail count) so an admin can catch it if every prospect actually
    // succeeded under a code this route doesn't recognize as "success".
    const codeCounts = results.reduce<Record<string, number>>((counts, result) => {
      counts[result.importCode] = (counts[result.importCode] || 0) + 1;
      return counts;
    }, {});
    const codeSummary = Object.entries(codeCounts).map(([code, count]) => `${code}×${count}`).join(", ");

    const fullySynced = importedCount === prospects.length;
    const syncMessage = fullySynced ? `Import codes: ${codeSummary}.` : `${prospects.length - importedCount} of ${prospects.length} leads were rejected by Waalaxy. Import codes: ${codeSummary}.`;
    const { error: updateError } = await admin.schema("outreach").from("campaigns").update({
      waalaxy_sync_status: fullySynced ? "synced" : "partial",
      waalaxy_sync_error: syncMessage,
      waalaxy_prospects_imported: importedCount,
      waalaxy_synced_at: new Date().toISOString(),
    }).eq("id", id);
    if (updateError) throw new Error(`Leads were pushed to Waalaxy, but saving the sync status failed: ${updateError.message}`);

    return NextResponse.json({ total: prospects.length, imported: importedCount, status: fullySynced ? "synced" : "partial", error: syncMessage, results });
  } catch (error) {
    const message = error instanceof WaalaxyNotConfiguredError || error instanceof WaalaxyApiError || error instanceof Error ? error.message : "Unable to push leads to Waalaxy.";
    await admin.schema("outreach").from("campaigns").update({ waalaxy_sync_status: "failed", waalaxy_sync_error: message }).eq("id", id);
    const status = error instanceof WaalaxyNotConfiguredError ? 501 : error instanceof WaalaxyApiError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
