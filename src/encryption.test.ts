import { beforeEach, describe, expect, it } from "bun:test";
import {
  dbRateLimitHash,
  isValidBase64,
  processCookieValue,
  resetKey,
} from "./dbRateLimitEncrypt";

describe("dbRateLimitEncrypt", () => {
  beforeEach(() => {
    resetKey();
  });

  describe("dbRateLimitHash", () => {
    it("should produce consistent hashes for the same input", async () => {
      Bun.env.DB_RATE_LIMIT_HASH_PADDING = "test-padding-value";
      const value = "127.0.0.1";
      const hash1 = await dbRateLimitHash(value);
      const hash2 = await dbRateLimitHash(value);
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe("string");
      expect(hash1.length).toBeGreaterThan(0);
      delete Bun.env.DB_RATE_LIMIT_HASH_PADDING;
    });

    it("should produce different hashes for different inputs", async () => {
      Bun.env.DB_RATE_LIMIT_HASH_PADDING = "test-padding-value";
      const hash1 = await dbRateLimitHash("127.0.0.1");
      const hash2 = await dbRateLimitHash("127.0.0.2");
      expect(hash1).not.toBe(hash2);
      delete Bun.env.DB_RATE_LIMIT_HASH_PADDING;
    });

    it("should use DB_RATE_LIMIT_HASH_PADDING when provided", async () => {
      Bun.env.DB_RATE_LIMIT_HASH_PADDING = "my-secret-padding";
      const value = "127.0.0.1";
      const hash = await dbRateLimitHash(value);

      // Reset and use same padding again
      resetKey();
      Bun.env.DB_RATE_LIMIT_HASH_PADDING = "my-secret-padding";
      const hash2 = await dbRateLimitHash(value);
      expect(hash).toBe(hash2);

      // Different padding should produce different hash
      resetKey();
      Bun.env.DB_RATE_LIMIT_HASH_PADDING = "different-padding";
      const hash3 = await dbRateLimitHash(value);
      expect(hash).not.toBe(hash3);

      delete Bun.env.DB_RATE_LIMIT_HASH_PADDING;
    });
  });

  describe("processCookieValue", () => {
    it("should return base64 encoded value for 'none' strategy", async () => {
      const value = "127.0.0.1";
      const result = await processCookieValue(value, "none");
      expect(result).toBe(Buffer.from(value).toString("base64"));
    });

    it("should hash value for 'hash' strategy", async () => {
      Bun.env.DB_RATE_LIMIT_HASH_PADDING = "test-padding";
      const value = "127.0.0.1";
      const result = await processCookieValue(value, "hash");
      expect(result).not.toBe(value);
      // Hash should be consistent
      const result2 = await processCookieValue(value, "hash");
      expect(result).toBe(result2);
      delete Bun.env.DB_RATE_LIMIT_HASH_PADDING;
    });
  });

  describe("isValidBase64", () => {
    it("should return true for valid base64 strings", () => {
      const value = "127.0.0.1";
      const encoded = Buffer.from(value).toString("base64");
      expect(isValidBase64(encoded)).toBe(true);
    });

    it("should return false for invalid base64 strings", () => {
      expect(isValidBase64("not-valid-base64!!!")).toBe(false);
      expect(isValidBase64("hello world")).toBe(false);
    });

    it("should return true for empty base64 string", () => {
      expect(isValidBase64("")).toBe(true);
    });

    it("should return true for base64 encoded binary data", () => {
      const binary = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const encoded = binary.toString("base64");
      expect(isValidBase64(encoded)).toBe(true);
    });
  });
});
