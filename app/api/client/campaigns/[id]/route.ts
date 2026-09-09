import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

// Lets a client edit their own campaign's brief and messaging after
// submission (goal, offer, tone, messaging strategy, connection note,
// follow-ups) -- previously the FAQ's honest answer was "not directly from
// your dashboard yet, reach out to your Myntmore contact." Clients have no
// direct table UPDATE grant on outreach.campaigns (see the "Admins update
// campaigns" RLS policy), so this goes through the service-role client with
// an explicit ownership check here, the same pattern as the sibling
// leads/route.ts.
//
// Editing after a campaign has already been configured in Waalaxy (which
// happens by hand, outside this app -- see lib/waalaxy.ts) won't itself
// update anything there, so every successful edit also posts a
// campaign-wide alert. That reuses the exact alert machinery admins already
// see for everything else (the dashboard's top alert banner, the
// unresolved-alert badge next to the campaign's name in the work queue,
// and the alert list inside the campaign's own Manage modal) rather than
// needing any new admin-side UI.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { id: campaignId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { goal, offer, tone, messagingStrategy, connectionNote, followUpCount, followUps } = body as Record<string, unknown>;
  if (typeof connectionNote !== "string" || !connectionNote.trim()) return NextResponse.json({ error: "The connection request note can't be empty." }, { status: 400 });
  if (connectionNote.length > 300) return NextResponse.json({ error: "The connection request note must be 300 characters or fewer." }, { status: 400 });
  if (typeof followUpCount !== "number" || !Number.isInteger(followUpCount) || followUpCount < 1 || followUpCount > 3) return NextResponse.json({ error: "Choose 1 to 3 follow-ups." }, { status: 400 });
  if (!Array.isArray(followUps) || followUps.slice(0, followUpCount).some((message) => typeof message !== "string" || !message.trim())) {
    return NextResponse.json({ error: "Every follow-up needs a message." }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await auth.admin.schema("outreach").from("campaigns").select("id,client_id,status").eq("id", campaignId).single();
  if (campaignError || !campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (campaign.client_id !== auth.userId) return NextResponse.json({ error: "This campaign doesn't belong to you." }, { status: 403 });
  if (campaign.status === "completed") return NextResponse.json({ error: "This campaign is already completed and can't be edited." }, { status: 400 });

  const { error: updateError } = await auth.admin.schema("outreach").from("campaigns").update({
    goal: typeof goal === "string" ? goal : "",
    offer: typeof offer === "string" ? offer : "",
    tone: typeof tone === "string" ? tone : "",
    messaging_strategy: typeof messagingStrategy === "string" ? messagingStrategy : "",
    connection_note: connectionNote,
    follow_up_count: followUpCount,
    follow_up_messages: followUps.slice(0, followUpCount),
  }).eq("id", campaignId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Best-effort: the edit itself already succeeded above, so a failure here
  // shouldn't be reported back as if the whole request failed -- it just
  // means the admin finds out from the client instead of the dashboard.
  await auth.admin.schema("outreach").from("campaign_alerts").insert({
    client_id: auth.userId, campaign_id: campaignId, severity: "warning",
    message: "The client updated this campaign's brief and messaging. Review before continuing outreach.",
    created_by: auth.userId,
  });

  return NextResponse.json({ ok: true });
}
