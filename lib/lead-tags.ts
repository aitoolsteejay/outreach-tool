// The fixed set of tags the Myntmore team applies to a client's prospects.
// Clients see these read-only; only admins assign them. Order here is the
// display order (stored as `position`). Keep supabase/migrations/
// 20261117000000_standard_lead_tags.sql in sync if this list changes.
export const DEFAULT_LEAD_TAGS: { name: string; color: string }[] = [
  { name: "Follow up 1 sent", color: "#CA8A04" },
  { name: "Follow up 2 sent", color: "#EA580C" },
  { name: "Follow up 3 sent", color: "#9A3412" },
  { name: "Hot lead", color: "#E11D48" },
  { name: "Not interested", color: "#6B7280" },
  { name: "Calendly sent", color: "#0891B2" },
  { name: "Details shared", color: "#2563EB" },
  { name: "Meeting scheduled", color: "#7C3AED" },
  { name: "Meeting done", color: "#047857" },
  { name: "To follow up", color: "#DB2777" },
  { name: "Email communication", color: "#0D9488" },
  { name: "Whatsapp Communication", color: "#65A30D" },
];

export function defaultLeadTagRows(clientId: string) {
  return DEFAULT_LEAD_TAGS.map((tag, position) => ({ client_id: clientId, name: tag.name, color: tag.color, position }));
}
