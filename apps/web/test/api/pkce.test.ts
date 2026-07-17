import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPkceS256 } from "../../api/_lib/pkce.js";

function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

describe("verifyPkceS256", () => {
  it("accepts a matching verifier/challenge pair", () => {
    const verifier = "a-valid-code-verifier-with-enough-entropy-1234567890";
    expect(verifyPkceS256(verifier, challengeFor(verifier))).toBe(true);
  });

  it("rejects a mismatched verifier", () => {
    const challenge = challengeFor("original-verifier");
    expect(verifyPkceS256("different-verifier", challenge)).toBe(false);
  });

  it("rejects an empty challenge", () => {
    expect(verifyPkceS256("some-verifier", "")).toBe(false);
  });

  it("rejects a challenge that isn't valid base64url of any sha256 digest", () => {
    expect(verifyPkceS256("some-verifier", "not-a-real-challenge")).toBe(false);
  });
});
