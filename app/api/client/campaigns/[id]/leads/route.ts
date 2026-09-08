import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { leadRowsToCsv, parseLeadsCsv } from "@/lib/csv";

// Lets a client top up an existing campaign's lead list (e.g. a fresh batch
// each week) instead of only being able to set leads once at creation. The
// client uploads the new CSV straight to storage first (same as the wizard
// does), then calls this route with just the storage path -- this route
// downloads that file plus the campaign's current lead list, merges them
// (skipping anything whose linkedin_url is already present, so re-exporting
// an overlapping CRM view doesn't queue the same lead twice), and replaces
// the campaign's lead_files entry with the merged result so every other
// consumer (admin's "Download leads" button, push-to-waalaxy) keeps seeing
// one authoritative, up-to-date file per campaign.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { id: campaignId } = await params;
  const { storagePath, originalName } = await request.json();
  if (typeof storagePath !== "string" || !storagePath) return NextResponse.json({ error: "Missing the uploaded file." }, { status: 400 });
  // Defense in depth -- storage RLS already scopes uploads to the caller's
  // own folder, but don't trust a client-supplied path blindly here either.
  // This must be scoped to THIS campaign's own pending-upload folder, not
  // just the caller's user-id prefix: accepting any of the caller's own
  // files would let a client point this route at a DIFFERENT campaign's
  // live lead_files.storage_path, which then gets merged into the wrong
  // campaign and deleted out from under the campaign it actually belongs to.
  if (!storagePath.startsWith(`${auth.userId}/${campaignId}/pending/`)) return NextResponse.json({ error: "Invalid file path." }, { status: 400 });

  const { data: campaign, error: campaignError } = await auth.admin.schema("outreach").from("campaigns").select("id,client_id").eq("id", campaignId).single();
  if (campaignError || !campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (campaign.client_id !== auth.userId) return NextResponse.json({ error: "This campaign doesn't belong to you." }, { status: 403 });

  try {
    const { data: newBlob, error: downloadError } = await auth.admin.storage.from("outreach-leads").download(storagePath);
    if (downloadError || !newBlob) throw new Error(downloadError?.message || "Unable to read the uploaded file.");
    const newRows = parseLeadsCsv(await newBlob.text());

    const { data: existingFile } = await auth.admin.schema("outreach").from("lead_files").select("id,storage_path").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const baseFileId = existingFile?.id ?? null;
    let existingRows: ReturnType<typeof parseLeadsCsv> = [];
    if (existingFile) {
      const { data: existingBlob, error: existingDownloadError } = await auth.admin.storage.from("outreach-leads").download(existingFile.storage_path);
      if (existingDownloadError || !existingBlob) throw new Error(existingDownloadError?.message || "Unable to read this campaign's existing lead list.");
      existingRows = parseLeadsCsv(await existingBlob.text());
    }

    const seen = new Set(existingRows.map((row) => row.linkedinUrl.trim().toLowerCase()));
    let addedCount = 0;
    for (const row of newRows) {
      const key = row.linkedinUrl.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      existingRows.push(row);
      addedCount += 1;
    }
    const duplicateCount = newRows.length - addedCount;

    // Guard against two concurrent "Add leads" submissions both merging onto
    // the same base file: re-check right before writing that no other
    // request has already replaced this campaign's lead file since we read
    // it above. This isn't a true database-level lock, but it closes the
    // common case (double-click, two tabs) where the loser would otherwise
    // silently overwrite the winner's newly-added leads while still
    // reporting success to its own caller.
    const { data: raceCheck } = await auth.admin.schema("outreach").from("lead_files").select("id").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if ((raceCheck?.id ?? null) !== baseFileId) {
      return NextResponse.json({ error: "Someone just added leads to this campaign. Please try again." }, { status: 409 });
    }

    const csvText = leadRowsToCsv(existingRows);
    const csvBytes = new TextEncoder().encode(csvText);
    const mergedPath = `${auth.userId}/${campaignId}/${crypto.randomUUID()}-leads.csv`;
    const { error: uploadError } = await auth.admin.storage.from("outreach-leads").upload(mergedPath, csvBytes, { contentType: "text/csv" });
    if (uploadError) throw new Error(uploadError.message);

    const { error: insertError } = await auth.admin.schema("outreach").from("lead_files").insert({
      campaign_id: campaignId, client_id: auth.userId, storage_path: mergedPath,
      original_name: typeof originalName === "string" && originalName ? originalName : "leads.csv",
      content_type: "text/csv", size_bytes: csvBytes.byteLength,
    });
    if (insertError) {
      // Nothing durably references mergedPath yet -- clean it up rather
      // than leaving an orphaned object in storage forever.
      await auth.admin.storage.from("outreach-leads").remove([mergedPath]).catch(() => {});
      throw new Error(insertError.message);
    }

    const { error: updateError } = await auth.admin.schema("outreach").from("campaigns").update({ lead_count: existingRows.length }).eq("id", campaignId);
    if (updateError) {
      // Roll back the lead_files row and the upload too, so a failure here
      // never leaves the campaign's authoritative file and its lead_count
      // disagreeing -- better to fail the whole request than half-apply it.
      await auth.admin.schema("outreach").from("lead_files").delete().eq("campaign_id", campaignId).eq("storage_path", mergedPath);
      await auth.admin.storage.from("outreach-leads").remove([mergedPath]).catch(() => {});
      throw new Error(updateError.message);
    }

    // The raw just-uploaded batch is now folded into the merged file above --
    // remove it so storage doesn't accumulate an intermediate copy forever.
    await auth.admin.storage.from("outreach-leads").remove([storagePath]);

    return NextResponse.json({ added: addedCount, duplicates: duplicateCount, total: existingRows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add these leads." }, { status: 500 });
  }
}
