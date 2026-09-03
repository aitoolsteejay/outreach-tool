export const LEAD_CSV_HEADERS = ["first_name", "last_name", "job_title", "company", "linkedin_url", "email", "notes"] as const;
export const MAX_LEAD_FILE_BYTES = 10 * 1024 * 1024;

export type LeadField = (typeof LEAD_CSV_HEADERS)[number];
export type LeadRow = { firstName: string; lastName: string; jobTitle: string; company: string; linkedinUrl: string; email: string; notes: string };
export type ColumnMapping = Partial<Record<LeadField, string>>;

export const LEAD_FIELD_LABELS: Record<LeadField, string> = {
  first_name: "First name", last_name: "Last name", job_title: "Job title", company: "Company", linkedin_url: "LinkedIn URL", email: "Email", notes: "Notes",
};
export const LEAD_FIELD_REQUIRED: Record<LeadField, boolean> = {
  first_name: false, last_name: false, job_title: false, company: false, linkedin_url: true, email: false, notes: false,
};

// Thrown specifically when the CSV's own header row is missing one or more
// required columns -- callers (the campaign wizard) catch this distinctly
// from other parse errors to offer a column-mapping UI instead of a flat
// rejection, since the data may still be usable under different header names.
export class MissingHeadersError extends Error {
  headers: string[];
  rows: string[][];
  constructor(message: string, headers: string[], rows: string[][]) {
    super(message);
    this.name = "MissingHeadersError";
    this.headers = headers;
    this.rows = rows;
  }
}

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

// Splits a CSV into its raw header row and data rows, with no assumptions
// about which columns are present -- used both by the strict auto-parse path
// below and by the column-mapping UI when the headers don't match.
export function parseCsvHeaderAndRows(text: string): { headers: string[]; rows: string[][] } {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (records.length === 0) throw new Error("The CSV appears to be empty.");
  return { headers: records[0], rows: records.slice(1) };
}

function buildLeadRows(rows: string[][], indexFor: (field: LeadField) => number): LeadRow[] {
  const leadRows = rows.map((cells) => {
    const value = (field: LeadField) => { const index = indexFor(field); return index === -1 ? "" : (cells[index] || ""); };
    return {
      firstName: value("first_name"), lastName: value("last_name"), jobTitle: value("job_title"),
      company: value("company"), linkedinUrl: value("linkedin_url"), email: value("email"), notes: value("notes"),
    };
  });
  const missingUrls = leadRows.reduce<number[]>((items, row, index) => row.linkedinUrl ? items : [...items, index + 2], []);
  if (missingUrls.length) throw new Error(`Every lead needs a linkedin_url. Check row${missingUrls.length === 1 ? "" : "s"} ${missingUrls.slice(0, 5).join(", ")}${missingUrls.length > 5 ? "…" : ""}.`);
  return leadRows;
}

export function validateAndParseLeadsCsv(text: string): LeadRow[] {
  const { headers, rows } = parseCsvHeaderAndRows(text);
  if (rows.length === 0) throw new Error("The CSV must include a header and at least one lead.");
  const lowerHeaders = headers.map((column) => column.toLowerCase());
  const missing = LEAD_CSV_HEADERS.filter((column) => !lowerHeaders.includes(column));
  if (missing.length) throw new MissingHeadersError(`Missing required CSV column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`, headers, rows);
  return buildLeadRows(rows, (field) => lowerHeaders.indexOf(field));
}

export function parseLeadsCsv(text: string): LeadRow[] { return validateAndParseLeadsCsv(text); }

// Best-effort default mapping for the column-mapping UI: matches each of our
// fields against the CSV's actual headers by common synonyms, ignoring case,
// spacing, and punctuation. Anything left unmatched is up to the user.
const FIELD_SYNONYMS: Record<LeadField, string[]> = {
  first_name: ["firstname", "fname", "first"],
  last_name: ["lastname", "lname", "last", "surname"],
  job_title: ["jobtitle", "title", "designation", "role", "position"],
  company: ["company", "companyname", "organization", "organisation", "employer"],
  linkedin_url: ["linkedinurl", "linkedin", "linkedinprofile", "profileurl", "url", "profilelink"],
  email: ["email", "emailaddress", "e-mail"],
  notes: ["notes", "note", "comments", "remarks"],
};
const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

export function guessColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ColumnMapping = {};
  for (const field of LEAD_CSV_HEADERS) {
    const candidates = [field.replace(/_/g, ""), ...FIELD_SYNONYMS[field]];
    const matchIndex = normalized.findIndex((header) => candidates.includes(header));
    if (matchIndex !== -1) mapping[field] = headers[matchIndex];
  }
  return mapping;
}

// Builds lead rows from a user-confirmed column mapping (field -> the CSV's
// actual header text). Reuses the same per-row linkedin_url validation as
// the strict auto-parse path.
export function buildLeadRowsFromMapping(headers: string[], rows: string[][], mapping: ColumnMapping): LeadRow[] {
  return buildLeadRows(rows, (field) => { const source = mapping[field]; return source ? headers.indexOf(source) : -1; });
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Serializes mapped rows back into a CSV with our exact expected headers, so
// the rest of the pipeline (storage upload, admin download, Waalaxy push)
// never needs to know a client's original column names.
export function leadRowsToCsv(rows: LeadRow[]): string {
  const lines = [LEAD_CSV_HEADERS.join(",")];
  for (const row of rows) {
    lines.push([row.firstName, row.lastName, row.jobTitle, row.company, row.linkedinUrl, row.email, row.notes].map(csvEscape).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
