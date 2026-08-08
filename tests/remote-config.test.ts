import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRemoteConfig } from "../src/remote-config.ts";

describe("remote MCP configuration", () => {
  it("uses Cloud Run-compatible defaults", () => {
    assert.deepEqual(parseRemoteConfig({}), {
      host: "0.0.0.0",
      port: 8080,
      authToken: undefined,
      allowedHosts: undefined,
      enableLegacySse: true,
    });
  });

  it("parses a token, port, host allowlist, and SSE switch", () => {
    assert.deepEqual(parseRemoteConfig({
      PORT: "9090",
      MCP_AUTH_TOKEN: "a".repeat(32),
      MCP_ALLOWED_HOSTS: "example.run.app, mcp.example.com ",
      MCP_ENABLE_LEGACY_SSE: "false",
    }), {
      host: "0.0.0.0",
      port: 9090,
      authToken: "a".repeat(32),
      allowedHosts: ["example.run.app", "mcp.example.com"],
      enableLegacySse: false,
    });
  });

  it("rejects unsafe or malformed deployment values without echoing secrets", () => {
    const secret = "short-private-token";
    for (const env of [
      { PORT: "0" },
      { PORT: "not-a-port" },
      { MCP_AUTH_TOKEN: secret },
      { MCP_ENABLE_LEGACY_SSE: "maybe" },
      { MCP_ALLOWED_HOSTS: "example.com,,other.example" },
    ]) {
      assert.throws(
        () => parseRemoteConfig(env),
        (error: unknown) => error instanceof Error && !error.message.includes(secret),
      );
    }
  });
});
