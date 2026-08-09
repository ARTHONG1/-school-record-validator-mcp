import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const endpoint = process.env.REMOTE_MCP_URL;
if (!endpoint) throw new Error("REMOTE_MCP_URL is required");

const url = new URL(endpoint);
const isLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost";
if ((!isLocal && url.protocol !== "https:") || url.pathname !== "/mcp") {
  throw new Error("REMOTE_MCP_URL must be an HTTPS /mcp endpoint, except localhost");
}

const client = new Client({ name: "school-record-validator-release-smoke", version: "0.5.0" });
const transport = new StreamableHTTPClientTransport(url);
const secret = "SMOKE-PRIVATE-STUDENT-SENTENCE-MUST-NOT-RETURN";

try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name), ["check_school_record", "verify_semantic_candidate"]);

  const result = CallToolResultSchema.parse(await client.callTool({
    name: "check_school_record",
    arguments: {
      entries: [
        { entryId: "pass", text: "실험 결과를 비교하여 설명함." },
        { entryId: "revise", text: "항상 완벽하게 실험함." },
        { entryId: "prohibited", text: "TOEIC에서 우수한 성적을 거둠." },
      ],
    },
  }));
  assert.notEqual(result.isError, true);
  assert.ok(result.structuredContent);
  const entries = result.structuredContent.entries;
  assert.deepEqual(entries.map((entry) => entry.status), ["pass", "revise", "prohibited"]);
  assert.deepEqual(entries.map((entry) => entry.rewritePlan.action), ["none", "rewrite", "ask_evidence"]);
  assert.deepEqual(entries.map((entry) => entry.rewritePlan.requiresRevalidation), [false, true, true]);

  const second = CallToolResultSchema.parse(await client.callTool({
    name: "check_school_record",
    arguments: { entries: [{ entryId: "candidate", text: "실험 결과를 비교하여 설명함." }] },
  }));
  assert.notEqual(second.isError, true);
  assert.equal(second.structuredContent.entries[0].status, "pass");
  assert.equal(second.structuredContent.entries[0].rewritePlan.action, "none");

  const serialized = JSON.stringify({ result, second });
  assert.equal(serialized.includes(secret), false);
  console.log("remote smoke passed: teacher tool, rewrite plan, second-pass validation");
} finally {
  await client.close();
}
