import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolResultSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SERVER_ENTRY = join(PACKAGE_ROOT, "dist", "index.js");
const SHA256 = /^[A-F0-9]{64}$/u;

interface RulePackInfo {
  rulePackId: string;
  schoolLevel: string;
  academicYear: number;
  sources: Array<{ sourceId: string }>;
}

interface PdfLocator {
  kind: "pdf-page";
  pdfPage: number;
  printedPage?: number;
}

interface SearchResult {
  chunkId: string;
  sourceId: string;
  sourceSha256: string;
  textSha256: string;
  locator: PdfLocator;
}

interface SearchOutput {
  results: SearchResult[];
}

interface SourceExcerpt {
  chunkId: string;
  sourceId: string;
  sourceSha256: string;
  text: string;
  textSha256: string;
  locator: PdfLocator;
}

interface ValidationOutput {
  status: string;
  findings: Array<{ ruleId: string; outcome: string }>;
}

interface EvidenceSummary {
  chunkId: string;
  quote: string;
  quoteSha256: string;
}

interface RuleExplanation {
  ruleId: string;
  authorityClass: string;
  evidence: EvidenceSummary[];
}

function structured<T>(
  toolName: string,
  result: Awaited<ReturnType<Client["callTool"]>>,
): T {
  const toolResult: CallToolResult = CallToolResultSchema.parse(result);
  assert.notEqual(toolResult.isError, true, `${toolName} returned an MCP tool error`);
  assert.ok(toolResult.structuredContent, `${toolName} omitted structuredContent`);
  return toolResult.structuredContent as T;
}

function normalizeForContainment(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .trim();
}

describe("school record validator stdio server", { timeout: 30_000 }, () => {
  it("serves the sealed 2026 elementary AI guidance and validation flow", async () => {
    assert.ok(
      existsSync(SERVER_ENTRY),
      `Built server not found at ${SERVER_ENTRY}; run npm run build before test:e2e`,
    );
    const builtEntrypoint = await readFile(SERVER_ENTRY, "utf8");
    assert.ok(builtEntrypoint.startsWith("#!/usr/bin/env node\n"));

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRY],
      cwd: PACKAGE_ROOT,
      env: { ...process.env, MCP_TOOLSET: "expert" },
      stderr: "pipe",
    });
    const client = new Client(
      { name: "school-record-validator-e2e", version: "0.1.0" },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);

      const pack = structured<RulePackInfo>(
        "rule_pack_info",
        await client.callTool(
          { name: "rule_pack_info", arguments: {} },
          CallToolResultSchema,
        ),
      );
      assert.equal(pack.rulePackId, "kr-moe-school-record-elementary-2026.1");
      assert.equal(pack.schoolLevel, "elementary");
      assert.equal(pack.academicYear, 2026);
      assert.equal(pack.sources.length, 8);

      const search = structured<SearchOutput>(
        "search_record_guidance",
        await client.callTool(
          {
            name: "search_record_guidance",
            arguments: { query: "AI 생성 자료", limit: 5 },
          },
          CallToolResultSchema,
        ),
      );
      const aiGuidance = search.results[0];
      assert.ok(aiGuidance, "AI guidance search returned no results");
      assert.equal(aiGuidance.chunkId, "MOE-GUIDE-ELEMENTARY-2026:pdf-025");
      assert.equal(aiGuidance.sourceId, "MOE-GUIDE-ELEMENTARY-2026");
      assert.deepEqual(aiGuidance.locator, {
        kind: "pdf-page",
        pdfPage: 25,
        printedPage: 19,
      });
      assert.match(aiGuidance.sourceSha256, SHA256);
      assert.match(aiGuidance.textSha256, SHA256);

      const excerpt = structured<SourceExcerpt>(
        "get_source_excerpt",
        await client.callTool(
          {
            name: "get_source_excerpt",
            arguments: { chunkId: aiGuidance.chunkId },
          },
          CallToolResultSchema,
        ),
      );
      assert.equal(excerpt.chunkId, aiGuidance.chunkId);
      assert.equal(excerpt.sourceId, aiGuidance.sourceId);
      assert.equal(excerpt.sourceSha256, aiGuidance.sourceSha256);
      assert.equal(excerpt.textSha256, aiGuidance.textSha256);
      assert.deepEqual(excerpt.locator, aiGuidance.locator);
      assert.match(excerpt.text, /AI|인공지능/u);

      const validation = structured<ValidationOutput>(
        "validate_record_text",
        await client.callTool(
          {
            name: "validate_record_text",
            arguments: {
              field: "behavior_opinion",
              text: "협력적인 태도로 활동함.",
              provenance: {
                observationBasis: "direct",
                observationContinuity: "continuous",
                factualSupport: "supported",
                studentMaterial: "none",
                studentWroteFinalNarrative: false,
                aiUse: "verbatim",
                teacherVerifiedAgainstActualPerformance: true,
                evidenceReference: "teacher-observation-note-e2e",
              },
            },
          },
          CallToolResultSchema,
        ),
      );
      assert.equal(validation.status, "blocked");
      assert.deepEqual(
        validation.findings
          .filter((finding) => finding.ruleId === "OFFICIAL-AI-VERBATIM")
          .map((finding) => finding.outcome),
        ["block"],
      );

      const explanation = structured<RuleExplanation>(
        "explain_record_rule",
        await client.callTool(
          {
            name: "explain_record_rule",
            arguments: { ruleId: "OFFICIAL-AI-VERBATIM" },
          },
          CallToolResultSchema,
        ),
      );
      assert.equal(explanation.ruleId, "OFFICIAL-AI-VERBATIM");
      assert.equal(explanation.authorityClass, "official-policy");
      const aiEvidence = explanation.evidence.find(
        (evidence) => evidence.chunkId === aiGuidance.chunkId,
      );
      assert.ok(aiEvidence, "AI rule explanation omitted its PDF 25 evidence");
      assert.match(aiEvidence.quoteSha256, SHA256);
      assert.ok(aiEvidence.quote.trim().length > 0);
      assert.ok(
        normalizeForContainment(excerpt.text).includes(normalizeForContainment(aiEvidence.quote)),
        "Verified AI rule quote was not found in the source excerpt",
      );
    } finally {
      await client.close();
    }
  });

  it("checks teacher-facing science records through the default toolset", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRY],
      cwd: PACKAGE_ROOT,
      env: { ...process.env, MCP_TOOLSET: "teacher" },
      stderr: "pipe",
    });
    const client = new Client(
      { name: "school-record-teacher-e2e", version: "0.3.0" },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
      assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), ["check_school_record"]);
      const result = structured<{
        status: string;
        entries: Array<{ entryId: string; status: string; label: string }>;
      }>(
        "check_school_record",
        await client.callTool(
          {
            name: "check_school_record",
            arguments: {
              entries: [
                { entryId: "record_1", text: "빗면을 이용하면 필요한 힘이 줄어드는 까닭을 설명함." },
                { entryId: "record_2", text: "기후변화가 환경에 미치는 영향을 설명함." },
                { entryId: "record_3", text: "식물 세포를 관찰하여 핵과 세포벽의 위치를 확인함." },
              ],
            },
          },
          CallToolResultSchema,
        ),
      );
      assert.equal(result.status, "pass");
      assert.deepEqual(result.entries.map((entry) => entry.status), ["pass", "pass", "pass"]);
    } finally {
      await client.close();
    }
  });
});
