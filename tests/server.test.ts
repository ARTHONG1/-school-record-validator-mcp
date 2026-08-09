import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.ts";
import { TOOL_SPECS } from "../src/schemas.ts";
import { createHandlerTestServices } from "./handlers.test.ts";

const expertToolNames = [
  "check_school_record",
  "verify_semantic_candidate",
  "explain_record_rule",
  "get_source_excerpt",
  "list_record_fields",
  "rule_pack_info",
  "search_record_guidance",
  "validate_record_batch",
  "validate_record_text",
] as const;

async function connectTestClient(options: { toolset?: "teacher" | "expert" } = {}) {
  const server = createServer(createHandlerTestServices(), options);
  const client = new Client({ name: "school-record-validator-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

async function callToolSafely(
  client: Client,
  request: Parameters<Client["callTool"]>[0],
): Promise<string> {
  try {
    return JSON.stringify(await client.callTool(request));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("MCP stdio server contract", () => {
  it("registers only the teacher tool by default", async () => {
    const { client, server } = await connectTestClient();
    try {
      const result = await client.listTools();
      assert.deepEqual(result.tools.map((tool) => tool.name), ["check_school_record", "verify_semantic_candidate"]);
      assert.ok(result.tools.every((tool) => tool.inputSchema));
      assert.ok(result.tools.every((tool) => tool.outputSchema));
      assert.ok(result.tools.every((tool) => tool.description?.includes("공식 승인이나 법률 판단")));
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("keeps all raw schema registrations in sync with TOOL_SPECS", () => {
    assert.deepEqual(Object.keys(TOOL_SPECS).sort(), [...expertToolNames].sort());
    for (const spec of Object.values(TOOL_SPECS)) {
      assert.ok(spec.title.length > 0);
      assert.ok(spec.description.length > 0);
      assert.ok(Object.keys(spec.inputSchema).length >= 0);
      assert.ok(Object.keys(spec.outputSchema).length > 0);
    }
  });

  it("strips an unknown top-level key before the strict handler and rejects a nested one", async () => {
    const { client, server } = await connectTestClient({ toolset: "expert" });
    const secret = "UNIQUE-SERVER-STUDENT-SECRET-2026";
    try {
      const topLevel = await client.callTool({
        name: "validate_record_text",
        arguments: {
          field: "student_name",
          text: "김학생",
          ignoredExtra: secret,
        },
      });
      assert.equal(topLevel.isError, undefined);
      assert.equal(JSON.stringify(topLevel).includes(secret), false);

      let nestedResponse = "";
      try {
        const nested = await client.callTool({
          name: "validate_record_text",
          arguments: {
            field: "behavior_opinion",
            text: secret,
            provenance: {
              observationBasis: "direct",
              ignoredExtra: secret,
            },
          },
        });
        nestedResponse = JSON.stringify(nested);
        assert.equal(nested.isError, true);
      } catch (error) {
        nestedResponse = error instanceof Error ? error.message : String(error);
      }
      assert.equal(nestedResponse.includes(secret), false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("does not expose secret invalid enum values rejected by registered schemas", async () => {
    const { client, server } = await connectTestClient();
    const secret = "SECRET-INVALID-ENUM-STUDENT-VALUE-2026";
    const cases = [
      {
        boundary: "field",
        name: "validate_record_text",
        arguments: { field: secret, text: "학생 기록" },
      },
      {
        boundary: "curriculum",
        name: "validate_record_text",
        arguments: { field: "student_name", text: "학생 기록", curriculum: secret },
      },
      {
        boundary: "profile",
        name: "validate_record_text",
        arguments: { field: "student_name", text: "학생 기록", profile: secret },
      },
      ...[
        "observationBasis",
        "observationContinuity",
        "factualSupport",
        "studentMaterial",
        "aiUse",
      ].map((property) => ({
        boundary: `provenance.${property}`,
        name: "validate_record_text",
        arguments: {
          field: "behavior_opinion",
          text: "학생 기록",
          provenance: { [property]: secret },
        },
      })),
      {
        boundary: "activityContext.organizers.kind",
        name: "validate_record_text",
        arguments: {
          field: "creative_autonomy_club_special",
          text: "학생 기록",
          activityContext: { organizers: [{ kind: secret }] },
        },
      },
      {
        boundary: "volunteerContext.planType",
        name: "validate_record_text",
        arguments: {
          field: "volunteer_activity",
          text: "학생 기록",
          volunteerContext: { planType: secret },
        },
      },
      {
        boundary: "volunteerContext.activityKind",
        name: "validate_record_text",
        arguments: {
          field: "volunteer_activity",
          text: "학생 기록",
          volunteerContext: { activityKind: secret },
        },
      },
      {
        boundary: "batch.entries.field",
        name: "validate_record_batch",
        arguments: {
          entries: [{ entryId: "student-1", field: secret, text: "학생 기록" }],
        },
      },
    ] as const;

    try {
      for (const { boundary, ...request } of cases) {
        const response = await callToolSafely(client, request);
        assert.equal(response.includes(secret), false, boundary);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("converts unexpected service failures to a generic privacy-safe tool error", async () => {
    const secret = "SECRET-UNEXPECTED-SERVICE-FAILURE-2026";
    const services = createHandlerTestServices();
    const server = createServer({
      ...services,
      validator: {
        ...services.validator,
        validate() {
          throw new Error(`database failure: ${secret}`);
        },
      },
    }, { toolset: "expert" });
    const client = new Client({ name: "school-record-validator-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.callTool({
        name: "validate_record_text",
        arguments: { field: "student_name", text: "학생 기록" },
      });
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result), /도구 처리 중 오류/u);
      assert.equal(JSON.stringify(result).includes(secret), false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("keeps the executable shebang in the TypeScript entrypoint", async () => {
    const entrypoint = fileURLToPath(new URL("../src/index.ts", import.meta.url));
    const source = await readFile(entrypoint, "utf8");
    assert.ok(source.startsWith("#!/usr/bin/env node\n"));
  });
});
