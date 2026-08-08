import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createRemoteApp, listenRemoteApp } from "../src/remote-server.ts";
import { createHandlerTestServices } from "./handlers.test.ts";

const TOKEN = "remote-test-token-that-is-at-least-32-characters";
const authHeaders = { Authorization: `Bearer ${TOKEN}` };

function toolNames(result: Awaited<ReturnType<Client["listTools"]>>): string[] {
  return result.tools.map((tool) => tool.name).sort();
}

async function withRemoteServer(
  run: (baseUrl: URL) => Promise<void>,
  options: {
    authToken?: string;
    toolset?: "teacher" | "expert";
  } = { authToken: TOKEN },
): Promise<void> {
  const remote = await listenRemoteApp(
    createRemoteApp(createHandlerTestServices(), {
      host: "127.0.0.1",
      port: 0,
      authToken: options.authToken,
      allowedHosts: ["127.0.0.1"],
      enableLegacySse: true,
      toolset: options.toolset ?? "expert",
    }),
    { host: "127.0.0.1", port: 0 },
  );
  try {
    await run(new URL(`http://127.0.0.1:${remote.port}`));
  } finally {
    await remote.close();
  }
}

describe("remote MCP HTTP server", { timeout: 30_000 }, () => {
  it("serves health without exposing configuration and protects MCP endpoints", async () => {
    await withRemoteServer(async (baseUrl) => {
      const health = await fetch(new URL("/healthz", baseUrl));
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ok" });
      const cloudRunHealth = await fetch(new URL("/health", baseUrl));
      assert.equal(cloudRunHealth.status, 200);
      assert.deepEqual(await cloudRunHealth.json(), { status: "ok" });
      assert.equal((await fetch(new URL("/mcp", baseUrl))).status, 401);
      assert.equal((await fetch(new URL("/sse", baseUrl))).status, 401);
      assert.equal((await fetch(new URL("/messages?sessionId=missing", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })).status, 401);
    });
  });

  it("exposes all seven tools over stateless Streamable HTTP", async () => {
    await withRemoteServer(async (baseUrl) => {
      const transport = new StreamableHTTPClientTransport(new URL("/mcp", baseUrl), {
        requestInit: { headers: authHeaders },
      });
      const client = new Client({ name: "remote-http-test", version: "0.1.0" });
      try {
        await client.connect(transport);
        assert.deepEqual(toolNames(await client.listTools()), [
          "explain_record_rule",
          "get_source_excerpt",
          "list_record_fields",
          "rule_pack_info",
          "search_record_guidance",
          "validate_record_batch",
          "validate_record_text",
        ]);
        const result = CallToolResultSchema.parse(await client.callTool({
          name: "rule_pack_info",
          arguments: {},
        }));
        assert.notEqual(result.isError, true);
        assert.equal(result.structuredContent?.rulePackId, "kr-moe-school-record-elementary-2026.1");
      } finally {
        await client.close();
      }
    });
  });

  it("allows public MCP discovery when no bearer token is configured", async () => {
    await withRemoteServer(async (baseUrl) => {
      const transport = new StreamableHTTPClientTransport(new URL("/mcp", baseUrl));
      const client = new Client({ name: "public-http-test", version: "0.1.0" });
      try {
        await client.connect(transport);
        assert.equal((await client.listTools()).tools.length, 7);
      } finally {
        await client.close();
      }
    }, { authToken: undefined });
  });

  it("supports the legacy SSE registration option with the same tools", async () => {
    await withRemoteServer(async (baseUrl) => {
      const transport = new SSEClientTransport(new URL("/sse", baseUrl), {
        eventSourceInit: { fetch: (url, init) => fetch(url, {
          ...init,
          headers: { ...authHeaders, ...init?.headers },
        }) },
        requestInit: { headers: authHeaders },
      });
      const client = new Client({ name: "remote-sse-test", version: "0.1.0" });
      try {
        await client.connect(transport);
        assert.equal((await client.listTools()).tools.length, 7);
      } finally {
        await client.close();
      }
    });
  });

  it("never returns submitted text in authentication or routing failures", async () => {
    await withRemoteServer(async (baseUrl) => {
      const secret = "UNIQUE-REMOTE-STUDENT-SECRET-2026";
      const response = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ text: secret }),
      });
      assert.equal(response.status, 401);
      assert.equal((await response.text()).includes(secret), false);
    });
  });

  it("authenticates before parsing JSON and keeps parser failures private", async () => {
    await withRemoteServer(async (baseUrl) => {
      const malformed = "{PRIVATE-STUDENT-TEXT";
      const unauthorized = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: malformed,
      });
      assert.equal(unauthorized.status, 401);
      assert.deepEqual(await unauthorized.json(), { error: "unauthorized" });

      const authorized = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: {
          ...authHeaders,
          "content-type": "application/json",
        },
        body: malformed,
      });
      assert.equal(authorized.status, 400);
      assert.deepEqual(await authorized.json(), { error: "invalid_json" });
    });
  });

  it("accepts an authenticated MCP request larger than the previous 2 MB limit", async () => {
    await withRemoteServer(async (baseUrl) => {
      const response = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: {
          ...authHeaders,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "validate_record_text",
            arguments: {
              field: "behavior_opinion",
              text: "가".repeat(200_000),
              padding: "x".repeat(2_500_000),
            },
          },
        }),
      });
      assert.notEqual(response.status, 413);
    });
  });
});
