// The fixed set of tags the Myntmore team applies to a client's prospects.
// Clients see these read-only; only admins assign them. Order here is the
// display order (stored as `position`). Keep supabase/migrations/
// 20261117000000_standard_lead_tags.sql in sync if this list changes.
export const DEFAULT_LEAD_TAGS: { name: string; color: string }[] = [
  { name: "Follow up 1 sent", color: "#D97706" },
  { name: "Follow up 2 sent", color: "#B45309" },
  { name: "Follow up 3 sent", color: "#92400E" },
  { name: "Hot lead", color: "#C2410C" },
  { name: "Not interested", color: "#6B7280" },
  { name: "Calendly sent", color: "#0D9488" },
  { name: "Details shared", color: "#0F766E" },
  { name: "Meeting scheduled", color: "#15803D" },
  { name: "Meeting done", color: "#166534" },
  { name: "To follow up", color: "#A16207" },
  { name: "Email communication", color: "#0369A1" },
  { name: "Whatsapp Communication", color: "#16A34A" },
];

export function defaultLeadTagRows(clientId: string) {
  return DEFAULT_LEAD_TAGS.map((tag, position) => ({ client_id: clientId, name: tag.name, color: tag.color, position }));
}
