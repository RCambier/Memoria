import { describe, expect, it } from "vitest";
import { loadConfig, unconfiguredResponse } from "../../api/_lib/config.js";

const VALID_SECRET = "e".repeat(64); // 32 bytes of hex

function envWith(overrides: Partial<Record<string, string>>): NodeJS.ProcessEnv {
  return {
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    AUTH_SIGNING_SECRET: VALID_SECRET,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe("loadConfig", () => {
  it("returns a config when all three env vars are present and valid", () => {
    expect(loadConfig(envWith({}))).toEqual({
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
      authSigningSecret: VALID_SECRET,
    });
  });

  it("is undefined when GOOGLE_OAUTH_CLIENT_ID is missing", () => {
    expect(loadConfig(envWith({ GOOGLE_OAUTH_CLIENT_ID: undefined }))).toBeUndefined();
  });

  it("is undefined when GOOGLE_OAUTH_CLIENT_SECRET is missing", () => {
    expect(loadConfig(envWith({ GOOGLE_OAUTH_CLIENT_SECRET: undefined }))).toBeUndefined();
  });

  it("is undefined when AUTH_SIGNING_SECRET is missing", () => {
    expect(loadConfig(envWith({ AUTH_SIGNING_SECRET: undefined }))).toBeUndefined();
  });

  it("is undefined when AUTH_SIGNING_SECRET is too short", () => {
    expect(loadConfig(envWith({ AUTH_SIGNING_SECRET: "abcd" }))).toBeUndefined();
  });

  it("is undefined when AUTH_SIGNING_SECRET isn't hex", () => {
    expect(loadConfig(envWith({ AUTH_SIGNING_SECRET: "z".repeat(64) }))).toBeUndefined();
  });

  it("is undefined for a totally empty environment", () => {
    expect(loadConfig({} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it("trims whitespace around values", () => {
    expect(loadConfig(envWith({ GOOGLE_OAUTH_CLIENT_ID: "  client-id  " }))?.googleClientId).toBe(
      "client-id",
    );
  });
});

describe("unconfiguredResponse", () => {
  it("is a 503 with a plain-text explanation", async () => {
    const res = unconfiguredResponse();
    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("not configured");
    expect(text).toContain("docs/SETUP.md");
  });
});
