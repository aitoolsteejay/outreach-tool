import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { listAutomationCampaigns, AutomationApiError, AutomationNotConfiguredError } from "@/lib/automation";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const campaigns = await listAutomationCampaigns();
    return NextResponse.json({ campaigns: campaigns.map((c) => ({ id: c._id, name: c.name })) });
  } catch (error) {
    if (error instanceof AutomationNotConfiguredError) return NextResponse.json({ error: error.message, configured: false }, { status: 501 });
    if (error instanceof AutomationApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Unable to load the automation tool campaigns.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
