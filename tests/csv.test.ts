import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LEAD_FILE_BYTES, MissingHeadersError, buildLeadRowsFromMapping, describeColumnOptions, findMappingConflicts, guessColumnMapping, leadRowsToCsv, parseCsvHeaderAndRows, rowsToCsv, validateAndParseLeadsCsv } from "../lib/csv.ts";

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

test("routes a header-only CSV (zero data rows) with wrong headers to the mapping UI, not a generic error", () => {
  assert.throws(() => validateAndParseLeadsCsv("Name,Company\n"), MissingHeadersError);
});

test("still reports the plain empty-file error once headers are correct but there are no data rows", () => {
  assert.throws(() => validateAndParseLeadsCsv(`${header}\n`), (error: unknown) => {
    assert.ok(!(error instanceof MissingHeadersError));
    assert.match((error as Error).message, /at least one lead/);
    return true;
  });
});

test("guesses a column mapping from common header synonyms, by index", () => {
  const mapping = guessColumnMapping(["First Name", "Surname", "Job Title", "Employer", "LinkedIn Profile", "Email Address", "Comments"]);
  assert.deepEqual(mapping, { first_name: 0, last_name: 1, job_title: 2, company: 3, linkedin_url: 4, email: 5, notes: 6 });
});

test("builds lead rows from a confirmed column mapping and round-trips through leadRowsToCsv", () => {
  const { headers, rows } = parseCsvHeaderAndRows("First Name,LinkedIn Profile\nJane,https://linkedin.com/in/jane");
  const leadRows = buildLeadRowsFromMapping(headers, rows, { first_name: 0, linkedin_url: 1 });
  assert.equal(leadRows.length, 1);
  assert.equal(leadRows[0].firstName, "Jane");
  assert.equal(leadRows[0].linkedinUrl, "https://linkedin.com/in/jane");
  assert.equal(leadRows[0].company, "");
  const csv = leadRowsToCsv(leadRows);
  assert.equal(validateAndParseLeadsCsv(csv)[0].firstName, "Jane");
});

test("buildLeadRowsFromMapping still requires a linkedin_url per row", () => {
  const { headers, rows } = parseCsvHeaderAndRows("First Name\nJane");
  assert.throws(() => buildLeadRowsFromMapping(headers, rows, { first_name: 0 }), /row 2/);
});

test("index-based mapping correctly disambiguates duplicate header names", () => {
  // Two columns both literally named "Email" -- a string-keyed mapping could
  // never tell them apart; index-based mapping can select either one.
  const { headers, rows } = parseCsvHeaderAndRows("Name,Email,Email,LinkedIn\nJane,personal@example.com,work@example.com,https://linkedin.com/in/jane");
  const mappedToSecondEmail = buildLeadRowsFromMapping(headers, rows, { first_name: 0, email: 2, linkedin_url: 3 });
  assert.equal(mappedToSecondEmail[0].email, "work@example.com");
  const mappedToFirstEmail = buildLeadRowsFromMapping(headers, rows, { first_name: 0, email: 1, linkedin_url: 3 });
  assert.equal(mappedToFirstEmail[0].email, "personal@example.com");
});

test("describeColumnOptions labels duplicate headers distinctly, leaves unique ones alone", () => {
  const options = describeColumnOptions(["Name", "Email", "Email"]);
  assert.deepEqual(options, [
    { index: 0, label: "Name" },
    { index: 1, label: "Email (column 2)" },
    { index: 2, label: "Email (column 3)" },
  ]);
});

test("findMappingConflicts flags two fields mapped to the same source column", () => {
  const conflicts = findMappingConflicts({ email: 1, linkedin_url: 1, first_name: 0 });
  assert.deepEqual(conflicts, [["LinkedIn URL", "Email"]]);
});

test("findMappingConflicts reports nothing for a clean one-to-one mapping", () => {
  assert.deepEqual(findMappingConflicts({ first_name: 0, email: 1, linkedin_url: 2 }), []);
});

test("reports rows without a LinkedIn URL", () => {
  assert.throws(() => validateAndParseLeadsCsv(`${header}\nJane,Doe,Founder,Acme,,jane@example.com,Priority`), /row 2/);
});

test("uses an exact 10 MiB upload limit", () => {
  assert.equal(MAX_LEAD_FILE_BYTES, 10 * 1024 * 1024);
});

test("rowsToCsv escapes commas, quotes, and coerces numbers, and round-trips through parseCsvHeaderAndRows", () => {
  const csv = rowsToCsv(["Client", "Campaign", "Acceptance rate"], [["Acme, Inc.", 'Say "hi" campaign', 44], ["Beta Co", "Q3 push", 0]]);
  assert.equal(csv, 'Client,Campaign,Acceptance rate\r\n"Acme, Inc.","Say ""hi"" campaign",44\r\nBeta Co,Q3 push,0\r\n');
  const { headers, rows } = parseCsvHeaderAndRows(csv);
  assert.deepEqual(headers, ["Client", "Campaign", "Acceptance rate"]);
  assert.deepEqual(rows, [["Acme, Inc.", 'Say "hi" campaign', "44"], ["Beta Co", "Q3 push", "0"]]);
});

test("does not open quote mode for a stray quote in the middle of a field", () => {
  const rows = validateAndParseLeadsCsv(`${header}\nJane,O"Brien,Founder,Acme,https://linkedin.com/in/jane,jane@example.com,Notes here\nJohn,Doe,CEO,Widgets,https://linkedin.com/in/john,john@example.com,More notes`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].lastName, 'O"Brien');
  assert.equal(rows[1].firstName, "John");
});
