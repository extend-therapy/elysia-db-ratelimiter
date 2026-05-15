import { CryptoHasher } from "bun";
import type { DBRLCookieObfuscation } from "./types";

// No top-level guard here to allow for lazy-loaded fallback key if env is missing

// Lazy load the hash padding
let _hashPadding: string | null = null;

const getHashPadding = (): string => {
  if (!_hashPadding) {
    const envPadding = Bun.env.DB_RATE_LIMIT_HASH_PADDING;
    if (envPadding) {
      _hashPadding = envPadding;
    } else {
      // Generate a random padding if not provided
      console.info(
        "INFO: DB_RATE_LIMIT_HASH_PADDING environment variable is not set. Using transient random padding. Hashed cookies will be invalidated on server restart.",
      );
      const randomSize = Math.floor(Math.random() * (32 - 16)) + 16;
      _hashPadding = Buffer.from(crypto.getRandomValues(new Uint8Array(randomSize))).toString(
        "base64",
      );
    }
  }
  return _hashPadding;
};

export const resetKey = () => {
  _hashPadding = null;
};

/**
 * Hash a value using CryptoHasher("sha512-256") with padding
 * This is a one-way function - the original value cannot be retrieved
 */
export const dbRateLimitHash = async (value: string): Promise<string> => {
  const padding = getHashPadding();
  // Prepend padding to the value before hashing
  const hasher = new CryptoHasher("sha512-256");
  hasher.update(padding + value);
  return hasher.digest("base64");
};

/**
 * Process a cookie value based on the obfuscation strategy
 * @param value - The value to process
 * @param strategy - The obfuscation strategy to use
 * @returns The processed value (always base64 encoded)
 */
export const processCookieValue = async (
  value: string,
  strategy: DBRLCookieObfuscation,
): Promise<string> => {
  switch (strategy) {
    case "none":
      return Buffer.from(value).toString("base64");
    case "hash":
    default: {
      return dbRateLimitHash(value);
    }
  }
};

/**
 * Validate that a value is valid base64 without extracting/decoding it
 * @param value - The value to validate
 * @returns Whether the value is valid base64
 */
export const isValidBase64 = (value: string): boolean => {
  try {
    // Check if it's valid base64 by attempting to create a buffer
    // This will throw if the string is not valid base64
    const buffer = Buffer.from(value, "base64");
    // Verify round-trip to ensure it's actually valid base64
    return buffer.toString("base64") === value;
  } catch {
    return false;
  }
};

/**
 * Verify that a cookie value matches the provided IP address
 * @param cookieValue - The value from the cookie (base64 encoded)
 * @param ip - The IP address to verify against
 * @param strategy - The obfuscation strategy used
 * @returns Whether the cookie value is valid for this IP
 */
export const verifyCookieValue = async (
  cookieValue: string,
  ip: string,
  strategy: DBRLCookieObfuscation,
): Promise<boolean> => {
  switch (strategy) {
    case "none": {
      try {
        const decoded = Buffer.from(cookieValue, "base64").toString("utf8");
        return decoded === ip;
      } catch {
        return false;
      }
    }
    case "hash":
    default: {
      try {
        const expectedHash = await dbRateLimitHash(ip);
        return cookieValue === expectedHash;
      } catch {
        // Verification failed, cookie is invalid
        return false;
      }
    }
  }
};
