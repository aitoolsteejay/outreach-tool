import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LEAD_FILE_BYTES, MissingHeadersError, buildLeadRowsFromMapping, guessColumnMapping, leadRowsToCsv, parseCsvHeaderAndRows, validateAndParseLeadsCsv } from "../lib/csv.ts";

const header = "first_name,last_name,job_title,company,linkedin_url,email,notes";

test("parses commas, escaped quotes, and newlines inside quoted fields", () => {
  const rows = validateAndParseLeadsCsv(`${header}\nJane,Doe,Founder,Acme,https://linkedin.com/in/jane,jane@example.com,"Met at conference, said ""hello""\nFollow up Tuesday"\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].notes, 'Met at conference, said "hello"\nFollow up Tuesday');
});

test("rejects a missing required header", () => {
  assert.throws(() => validateAndParseLeadsCsv("first_name,email\nJane,jane@example.com"), /Missing required CSV columns/);
});

test("throws a MissingHeadersError carrying the raw headers and rows for the mapping UI", () => {
  assert.throws(
    () => validateAndParseLeadsCsv("First Name,Email Address\nJane,jane@example.com"),
    (error: unknown) => {
      assert.ok(error instanceof MissingHeadersError);
      assert.deepEqual(error.headers, ["First Name", "Email Address"]);
      assert.deepEqual(error.rows, [["Jane", "jane@example.com"]]);
      return true;
    },
  );
});

test("guesses a column mapping from common header synonyms", () => {
  const mapping = guessColumnMapping(["First Name", "Surname", "Job Title", "Employer", "LinkedIn Profile", "Email Address", "Comments"]);
  assert.deepEqual(mapping, {
    first_name: "First Name", last_name: "Surname", job_title: "Job Title", company: "Employer",
    linkedin_url: "LinkedIn Profile", email: "Email Address", notes: "Comments",
  });
});

test("builds lead rows from a confirmed column mapping and round-trips through leadRowsToCsv", () => {
  const { headers, rows } = parseCsvHeaderAndRows("First Name,LinkedIn Profile\nJane,https://linkedin.com/in/jane");
  const leadRows = buildLeadRowsFromMapping(headers, rows, { first_name: "First Name", linkedin_url: "LinkedIn Profile" });
  assert.equal(leadRows.length, 1);
  assert.equal(leadRows[0].firstName, "Jane");
  assert.equal(leadRows[0].linkedinUrl, "https://linkedin.com/in/jane");
  assert.equal(leadRows[0].company, "");
  const csv = leadRowsToCsv(leadRows);
  assert.equal(validateAndParseLeadsCsv(csv)[0].firstName, "Jane");
});

test("buildLeadRowsFromMapping still requires a linkedin_url per row", () => {
  const { headers, rows } = parseCsvHeaderAndRows("First Name\nJane");
  assert.throws(() => buildLeadRowsFromMapping(headers, rows, { first_name: "First Name" }), /row 2/);
});

test("reports rows without a LinkedIn URL", () => {
  assert.throws(() => validateAndParseLeadsCsv(`${header}\nJane,Doe,Founder,Acme,,jane@example.com,Priority`), /row 2/);
});

test("uses an exact 10 MiB upload limit", () => {
  assert.equal(MAX_LEAD_FILE_BYTES, 10 * 1024 * 1024);
});

test("does not open quote mode for a stray quote in the middle of a field", () => {
  const rows = validateAndParseLeadsCsv(`${header}\nJane,O"Brien,Founder,Acme,https://linkedin.com/in/jane,jane@example.com,Notes here\nJohn,Doe,CEO,Widgets,https://linkedin.com/in/john,john@example.com,More notes`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].lastName, 'O"Brien');
  assert.equal(rows[1].firstName, "John");
});
