import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { listWaalaxyProspectLists, WaalaxyApiError, WaalaxyNotConfiguredError } from "@/lib/waalaxy";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const lists = await listWaalaxyProspectLists();
    return NextResponse.json({ lists: lists.map((l) => ({ id: l._id, name: l.name })) });
  } catch (error) {
    if (error instanceof WaalaxyNotConfiguredError) return NextResponse.json({ error: error.message, configured: false }, { status: 501 });
    if (error instanceof WaalaxyApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Unable to load Waalaxy lists.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
