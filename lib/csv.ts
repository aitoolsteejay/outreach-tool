export const LEAD_CSV_HEADERS = ["first_name", "last_name", "job_title", "company", "linkedin_url", "email", "notes"] as const;
export const MAX_LEAD_FILE_BYTES = 10 * 1024 * 1024;

export type LeadField = (typeof LEAD_CSV_HEADERS)[number];
export type LeadRow = { firstName: string; lastName: string; jobTitle: string; company: string; linkedinUrl: string; email: string; notes: string };
// Maps a field to the INDEX of the source CSV column, not its header text --
// text can't disambiguate two columns that happen to share the same header
// (e.g. a CSV with two columns both literally named "Email").
export type ColumnMapping = Partial<Record<LeadField, number>>;

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
  // Header mismatch is checked before the empty-rows check so a template a
  // client started filling out (wrong headers, zero data rows yet) still
  // routes to the column-mapping UI instead of a generic "add a lead" error.
  const lowerHeaders = headers.map((column) => column.toLowerCase());
  const missing = LEAD_CSV_HEADERS.filter((column) => !lowerHeaders.includes(column));
  if (missing.length) throw new MissingHeadersError(`Missing required CSV column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`, headers, rows);
  if (rows.length === 0) throw new Error("The CSV must include a header and at least one lead.");
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
  const used = new Set<number>();
  for (const field of LEAD_CSV_HEADERS) {
    const candidates = [field.replace(/_/g, ""), ...FIELD_SYNONYMS[field]];
    const matchIndex = normalized.findIndex((header, index) => candidates.includes(header) && !used.has(index));
    if (matchIndex !== -1) { mapping[field] = matchIndex; used.add(matchIndex); }
  }
  return mapping;
}

// Display labels for the mapping UI's column dropdowns -- appends a
// disambiguator ("Email (column 3)") only to headers that share their exact
// text with another column, since two identically-labeled <option>s would
// otherwise be indistinguishable to both the user and the browser.
export function describeColumnOptions(headers: string[]): { index: number; label: string }[] {
  const counts = new Map<string, number>();
  for (const header of headers) counts.set(header, (counts.get(header) || 0) + 1);
  return headers.map((header, index) => ({ index, label: (counts.get(header) || 0) > 1 ? `${header} (column ${index + 1})` : header }));
}

// Detects two different fields mapped to the same source column -- e.g.
// linkedin_url and email both pointing at the same "Email" column -- which
// would otherwise silently duplicate one column's data into two fields.
// Returns groups of field labels that collide, or [] if the mapping is clean.
export function findMappingConflicts(mapping: ColumnMapping): string[][] {
  const byIndex = new Map<number, LeadField[]>();
  for (const field of LEAD_CSV_HEADERS) {
    const index = mapping[field];
    if (index === undefined) continue;
    const fields = byIndex.get(index) || [];
    fields.push(field);
    byIndex.set(index, fields);
  }
  return [...byIndex.values()].filter((fields) => fields.length > 1).map((fields) => fields.map((field) => LEAD_FIELD_LABELS[field]));
}

// Builds lead rows from a user-confirmed column mapping (field -> the CSV
// column's index). Reuses the same per-row linkedin_url validation as the
// strict auto-parse path.
export function buildLeadRowsFromMapping(headers: string[], rows: string[][], mapping: ColumnMapping): LeadRow[] {
  return buildLeadRows(rows, (field) => mapping[field] ?? -1);
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

// General-purpose CSV serializer for admin exports that aren't lead lists
// (e.g. a campaigns-overview report) -- same escaping rules as leadRowsToCsv,
// just not tied to the LeadRow shape.
export function rowsToCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map((header) => csvEscape(String(header))).join(",")];
  for (const row of rows) lines.push(row.map((value) => csvEscape(String(value))).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export type WaalaxyMetricsSummary = { total: number; sent: number; accepted: number; replied: number };
// One row's worth of what we keep from a Waalaxy contact export -- enough to
// show a client their own leads' individual status (see outreach.lead_statuses),
// without carrying the export's many other columns (email, phone, tags, ...)
// into a table that isn't meant to be a full CRM record.
export type WaalaxyContactRow = {
  linkedinUrl: string; firstName: string; lastName: string; company: string;
  connectionRequestDate: string; connectedAt: string; repliedAt: string;
};

// The columns Waalaxy's own contact export carries per lead -- matched by
// name (case-insensitively) rather than position, since export column order
// isn't guaranteed to stay the same between Waalaxy versions.
const WAALAXY_COLUMNS = {
  linkedinUrl: "linkedinurl", firstName: "firstname", lastName: "lastname", company: "company_name",
  sent: "connectionrequestdate", accepted: "connectedat", replied: "lastreplydetecteddate",
} as const;
// Only these three are required -- the rest (name, company) are cosmetic for
// the client's lead list and just fall back to blank if the export is
// missing them, rather than blocking the whole upload over a column we don't
// strictly need.
const WAALAXY_REQUIRED_COLUMNS: [key: keyof typeof WAALAXY_COLUMNS, label: string][] = [
  ["sent", "connectionRequestDate"], ["accepted", "connectedAt"], ["replied", "lastReplyDetectedDate"],
];

// Turns a raw Waalaxy contact export (one row per lead currently in the
// campaign, unrelated in shape to our own lead-upload CSV) into both the
// aggregate counts campaign metrics are built from, and the per-lead rows
// behind the client's individual lead-status view: a lead counts as sent
// once it has a connection-request date, accepted once it has a
// connected-at date, and replied once it has a last-reply-detected date.
// Admin re-uploads this export whenever they want a campaign refreshed,
// rather than counting -- or copying per-lead status -- by hand.
export function parseWaalaxyContactsCsv(text: string): { summary: WaalaxyMetricsSummary; leads: WaalaxyContactRow[] } {
  const { headers, rows } = parseCsvHeaderAndRows(text);
  const lowerHeaders = headers.map((column) => column.trim().toLowerCase());
  const indexOf = (key: keyof typeof WAALAXY_COLUMNS) => lowerHeaders.indexOf(WAALAXY_COLUMNS[key]);
  const missing = WAALAXY_REQUIRED_COLUMNS.filter(([key]) => indexOf(key) === -1).map(([, label]) => label);
  if (missing.length) throw new Error(`This doesn't look like a Waalaxy contact export -- missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  if (rows.length === 0) throw new Error("This export has no leads in it.");
  const sentIndex = indexOf("sent"), acceptedIndex = indexOf("accepted"), repliedIndex = indexOf("replied");
  const linkedinIndex = indexOf("linkedinUrl"), firstNameIndex = indexOf("firstName"), lastNameIndex = indexOf("lastName"), companyIndex = indexOf("company");
  const cell = (row: string[], index: number) => (index === -1 ? "" : (row[index] || "").trim());
  let sent = 0, accepted = 0, replied = 0;
  const leads: WaalaxyContactRow[] = [];
  for (const row of rows) {
    const connectionRequestDate = cell(row, sentIndex), connectedAt = cell(row, acceptedIndex), repliedAt = cell(row, repliedIndex);
    if (connectionRequestDate) sent += 1;
    if (connectedAt) accepted += 1;
    if (repliedAt) replied += 1;
    const linkedinUrl = cell(row, linkedinIndex);
    // A row with no LinkedIn URL can't be matched back to a lead later (it's
    // our upsert key), so it still counts toward the aggregate totals above
    // but is left out of the per-lead list rather than stored unreachably.
    if (linkedinUrl) leads.push({ linkedinUrl, firstName: cell(row, firstNameIndex), lastName: cell(row, lastNameIndex), company: cell(row, companyIndex), connectionRequestDate, connectedAt, repliedAt });
  }
  return { summary: { total: rows.length, sent, accepted, replied }, leads };
}

export function summarizeWaalaxyMetricsCsv(text: string): WaalaxyMetricsSummary {
  return parseWaalaxyContactsCsv(text).summary;
}
