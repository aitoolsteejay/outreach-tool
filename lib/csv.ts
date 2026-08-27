// Minimal CSV parser for the lead-list template used by the campaign wizard
// (first_name,last_name,job_title,company,linkedin_url,email,notes). Handles
// basic double-quoted fields (with "" escaping) since a free-text "notes"
// column can contain commas -- not a full RFC 4180 implementation, but
// sufficient for a controlled, single-purpose template.

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = false; }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

export type LeadRow = { firstName: string; lastName: string; jobTitle: string; company: string; linkedinUrl: string; email: string; notes: string };

export function parseLeadsCsv(text: string): LeadRow[] {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((column) => column.toLowerCase());
  const index = (name: string) => header.indexOf(name);
  const firstNameIdx = index("first_name");
  const lastNameIdx = index("last_name");
  const jobTitleIdx = index("job_title");
  const companyIdx = index("company");
  const linkedinUrlIdx = index("linkedin_url");
  const emailIdx = index("email");
  const notesIdx = index("notes");

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const get = (idx: number) => (idx >= 0 ? cells[idx] || "" : "");
    return {
      firstName: get(firstNameIdx),
      lastName: get(lastNameIdx),
      jobTitle: get(jobTitleIdx),
      company: get(companyIdx),
      linkedinUrl: get(linkedinUrlIdx),
      email: get(emailIdx),
      notes: get(notesIdx),
    };
  }).filter((row) => row.linkedinUrl);
}
