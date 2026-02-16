// No top-level guard here to allow for lazy-loaded fallback key if env is missing

const getCryptoKey = async () => {
  const rawKey = Bun.env.DB_RATE_LIMIT_KEY;
  if (!rawKey) {
    console.warn(
      "WARNING: DB_RATE_LIMIT_KEY environment variable is not set. Rate limiting cookies will be invalidated on server restart.",
    );
    return await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
  }

  const keyBuffer = Buffer.from(rawKey, "base64");
  if (keyBuffer.length !== 32) {
    throw new Error("DB_RATE_LIMIT_KEY must be a 256-bit (32 byte) base64 encoded string");
  }

  return await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
};

// Lazy load the key
let _key: CryptoKey | null = null;
export const resetKey = () => {
  _key = null;
};
const getKey = async () => {
  if (!_key) _key = await getCryptoKey();
  return _key;
};

export const dbRateLimitEncrypt = async (value: string) => {
  const key = await getKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return Buffer.from(combined).toString("base64");
};

export const dbRateLimitDecrypt = async (value: string) => {
  const key = await getKey();
  const combined = Buffer.from(value, "base64");
  const iv = combined.subarray(0, 12);
  const data = combined.subarray(12);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);

  return new TextDecoder().decode(decrypted);
};
