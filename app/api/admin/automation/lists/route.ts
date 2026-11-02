import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { listAutomationProspectLists, AutomationApiError, AutomationNotConfiguredError } from "@/lib/automation";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const lists = await listAutomationProspectLists();
    return NextResponse.json({ lists: lists.map((l) => ({ id: l._id, name: l.name })) });
  } catch (error) {
    if (error instanceof AutomationNotConfiguredError) return NextResponse.json({ error: error.message, configured: false }, { status: 501 });
    if (error instanceof AutomationApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Unable to load the automation tool lists.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
