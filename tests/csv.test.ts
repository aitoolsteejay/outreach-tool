import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LEAD_FILE_BYTES, validateAndParseLeadsCsv } from "../lib/csv.ts";

const header = "first_name,last_name,job_title,company,linkedin_url,email,notes";

test("parses commas, escaped quotes, and newlines inside quoted fields", () => {
  const rows = validateAndParseLeadsCsv(`${header}\nJane,Doe,Founder,Acme,https://linkedin.com/in/jane,jane@example.com,"Met at conference, said ""hello""\nFollow up Tuesday"\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].notes, 'Met at conference, said "hello"\nFollow up Tuesday');
});

test("rejects a missing required header", () => {
  assert.throws(() => validateAndParseLeadsCsv("first_name,email\nJane,jane@example.com"), /Missing required CSV columns/);
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
