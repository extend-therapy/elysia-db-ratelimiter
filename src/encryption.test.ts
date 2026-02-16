import { beforeEach, describe, expect, it } from "bun:test";
import { dbRateLimitDecrypt, dbRateLimitEncrypt, resetKey } from "./dbRateLimitEncrypt";

describe("dbRateLimitEncrypt", () => {
  const TEST_KEY = Buffer.alloc(32, 1).toString("base64"); // 32 bytes of 0x01

  beforeEach(() => {
    resetKey();
  });

  it("should encrypt and decrypt a value correctly", async () => {
    process.env.DB_RATE_LIMIT_KEY = TEST_KEY;
    const original = "127.0.0.1";
    const encrypted = await dbRateLimitEncrypt(original);
    expect(typeof encrypted).toBe("string");
    expect(encrypted.length).toBeGreaterThan(original.length);

    const decrypted = await dbRateLimitDecrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("should produce different ciphertexts for the same plaintext (IV randomness)", async () => {
    process.env.DB_RATE_LIMIT_KEY = TEST_KEY;
    const original = "127.0.0.1";
    const encrypted1 = await dbRateLimitEncrypt(original);
    const encrypted2 = await dbRateLimitEncrypt(original);
    expect(encrypted1).not.toBe(encrypted2);

    expect(await dbRateLimitDecrypt(encrypted1)).toBe(original);
    expect(await dbRateLimitDecrypt(encrypted2)).toBe(original);
  });

  it("should fail to decrypt tampered data", async () => {
    process.env.DB_RATE_LIMIT_KEY = TEST_KEY;
    const original = "127.0.0.1";
    const encrypted = await dbRateLimitEncrypt(original);

    // Decrypt the base64, flip a bit in the ciphertext, re-encode
    const combined = Buffer.from(encrypted, "base64");
    combined[combined.length - 1] ^= 0xff;
    const tampered = combined.toString("base64");

    await expect(dbRateLimitDecrypt(tampered)).rejects.toThrow();
  });

  it("should use a fallback key if DB_RATE_LIMIT_KEY is missing", async () => {
    // Mocking console.warn to verify warning is logged
    const originalWarn = console.warn;
    let warned = false;
    console.warn = (...args) => {
      if (args[0]?.includes("DB_RATE_LIMIT_KEY")) warned = true;
    };

    const oldKey = process.env.DB_RATE_LIMIT_KEY;
    delete process.env.DB_RATE_LIMIT_KEY;

    const original = "test-value";
    const encrypted = await dbRateLimitEncrypt(original);
    expect(warned).toBe(true);
    expect(await dbRateLimitDecrypt(encrypted)).toBe(original);

    console.warn = originalWarn;
    process.env.DB_RATE_LIMIT_KEY = oldKey;
  });
});
