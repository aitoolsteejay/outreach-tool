import assert from "node:assert/strict";
import test from "node:test";
import { encryptSecret, decryptSecret } from "../lib/crypto.ts";

process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

test("round-trips a secret through encrypt/decrypt", () => {
  const secret = encryptSecret("correct horse battery staple");
  assert.equal(decryptSecret(secret), "correct horse battery staple");
});

test("uses a random IV, so the same plaintext never produces the same ciphertext twice", () => {
  const a = encryptSecret("same password");
  const b = encryptSecret("same password");
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.notEqual(a.iv, b.iv);
});

test("throws rather than returning garbage when the ciphertext has been tampered with", () => {
  const secret = encryptSecret("correct horse battery staple");
  const tampered = { ...secret, ciphertext: Buffer.from("tampered-tampered-tampered!").toString("base64") };
  assert.throws(() => decryptSecret(tampered));
});

test("requires CREDENTIALS_ENCRYPTION_KEY to be configured", () => {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  try {
    assert.throws(() => encryptSecret("x"), /CREDENTIALS_ENCRYPTION_KEY/);
  } finally {
    process.env.CREDENTIALS_ENCRYPTION_KEY = key;
  }
});

test("rejects a key that isn't exactly 32 bytes", () => {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
  try {
    assert.throws(() => encryptSecret("x"), /32-byte/);
  } finally {
    process.env.CREDENTIALS_ENCRYPTION_KEY = key;
  }
});
