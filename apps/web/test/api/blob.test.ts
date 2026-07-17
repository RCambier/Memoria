import { describe, expect, it } from "vitest";
import { BLOB_TTL_MS, isFresh, openBlob, sealBlob } from "../../api/_lib/blob.js";

const SECRET = "a".repeat(64); // 32 bytes of hex
const OTHER_SECRET = "b".repeat(64);

describe("sealBlob / openBlob", () => {
  it("round-trips a JSON payload", () => {
    const payload = { redirectUri: "https://claude.ai/api/mcp/auth_callback", issuedAt: 123 };
    const blob = sealBlob(SECRET, "oauth-state", payload);
    expect(openBlob(SECRET, "oauth-state", blob)).toEqual(payload);
  });

  it("produces a different blob every time (fresh random IV)", () => {
    const payload = { a: 1 };
    const a = sealBlob(SECRET, "oauth-state", payload);
    const b = sealBlob(SECRET, "oauth-state", payload);
    expect(a).not.toBe(b);
  });

  it("rejects a blob opened under the wrong purpose", () => {
    const blob = sealBlob(SECRET, "oauth-state", { a: 1 });
    expect(openBlob(SECRET, "oauth-code", blob)).toBeUndefined();
  });

  it("rejects a blob opened with the wrong secret", () => {
    const blob = sealBlob(SECRET, "oauth-state", { a: 1 });
    expect(openBlob(OTHER_SECRET, "oauth-state", blob)).toBeUndefined();
  });

  it("rejects a bit-flipped (tampered) blob", () => {
    const blob = sealBlob(SECRET, "oauth-state", { a: 1 });
    const bytes = Buffer.from(blob, "base64url");
    const lastIndex = bytes.length - 1;
    bytes.writeUInt8(bytes.readUInt8(lastIndex) ^ 0xff, lastIndex); // flip the last ciphertext byte
    const tampered = bytes.toString("base64url");
    expect(openBlob(SECRET, "oauth-state", tampered)).toBeUndefined();
  });

  it("rejects a truncated blob", () => {
    const blob = sealBlob(SECRET, "oauth-state", { a: 1 });
    expect(openBlob(SECRET, "oauth-state", blob.slice(0, 10))).toBeUndefined();
  });

  it("rejects garbage input without throwing", () => {
    expect(() => openBlob(SECRET, "oauth-state", "not-a-real-blob")).not.toThrow();
    expect(openBlob(SECRET, "oauth-state", "not-a-real-blob")).toBeUndefined();
  });

  it("rejects an empty string", () => {
    expect(openBlob(SECRET, "oauth-state", "")).toBeUndefined();
  });
});

describe("isFresh", () => {
  it("is fresh at issuance", () => {
    const now = 1_000_000;
    expect(isFresh(now, now)).toBe(true);
  });

  it("is fresh just under the TTL", () => {
    const now = 1_000_000;
    expect(isFresh(now, now + BLOB_TTL_MS - 1)).toBe(true);
  });

  it("expires exactly at the TTL boundary and beyond", () => {
    const now = 1_000_000;
    expect(isFresh(now, now + BLOB_TTL_MS)).toBe(true);
    expect(isFresh(now, now + BLOB_TTL_MS + 1)).toBe(false);
  });

  it("rejects a timestamp from the future (clock skew / forged issuedAt)", () => {
    const now = 1_000_000;
    expect(isFresh(now, now - 1)).toBe(false);
  });
});
