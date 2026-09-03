export const LEAD_CSV_HEADERS = ["first_name", "last_name", "job_title", "company", "linkedin_url", "email", "notes"] as const;
export const MAX_LEAD_FILE_BYTES = 10 * 1024 * 1024;

export type LeadRow = { firstName: string; lastName: string; jobTitle: string; company: string; linkedinUrl: string; email: string; notes: string };

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else inQuotes = false;
      } else field += char;
    } else if (char === '"' && field === "") inQuotes = true;
    else if (char === ",") { record.push(field.trim()); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field.trim());
      if (record.some(Boolean)) records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (inQuotes) throw new Error("The CSV contains an unclosed quoted field.");
  record.push(field.trim());
  if (record.some(Boolean)) records.push(record);
  return records;
}

export function validateAndParseLeadsCsv(text: string): LeadRow[] {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (records.length < 2) throw new Error("The CSV must include a header and at least one lead.");
  const header = records[0].map((column) => column.toLowerCase());
  const missing = LEAD_CSV_HEADERS.filter((column) => !header.includes(column));
  if (missing.length) throw new Error(`Missing required CSV column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  const at = (name: string) => header.indexOf(name);
  const rows = records.slice(1).map((cells) => ({
    firstName: cells[at("first_name")] || "", lastName: cells[at("last_name")] || "", jobTitle: cells[at("job_title")] || "",
    company: cells[at("company")] || "", linkedinUrl: cells[at("linkedin_url")] || "", email: cells[at("email")] || "", notes: cells[at("notes")] || "",
  }));
  const missingUrls = rows.reduce<number[]>((items, row, index) => row.linkedinUrl ? items : [...items, index + 2], []);
  if (missingUrls.length) throw new Error(`Every lead needs a linkedin_url. Check row${missingUrls.length === 1 ? "" : "s"} ${missingUrls.slice(0, 5).join(", ")}${missingUrls.length > 5 ? "…" : ""}.`);
  return rows;
}

export function parseLeadsCsv(text: string): LeadRow[] { return validateAndParseLeadsCsv(text); }
