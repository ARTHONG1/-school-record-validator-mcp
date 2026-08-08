import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type { ActiveChunkApproval } from "../src/data-types.ts";
import type { VerifiedEvidence } from "../src/rule-types.ts";

const ACTIVE_CHUNKS_PATH = "data/corpus/active-chunks.json";
const VERIFIED_EXCERPTS_PATH = "data/evidence/verified-excerpts.json";
const CHUNKS_PATH = "data/corpus/chunks.jsonl";
const EXPECTED_EVIDENCE_IDS = [
  "EV-DIRECTIVE-4-2",
  "EV-GUIDE-18-PROHIBITIONS",
  "EV-GUIDE-19-NARRATIVE-AUTHORITY",
  "EV-GUIDE-27-STUDENT-MATERIALS",
  "EV-GUIDE-59-ATTENDANCE",
  "EV-GUIDE-79-CREATIVE-SCOPE",
  "EV-GUIDE-83-VOLUNTEER-SCOPE",
  "EV-GUIDE-84-VOLUNTEER",
  "EV-GUIDE-85-VOLUNTEER-PROCEDURE",
  "EV-GUIDE-100-SUBJECT",
  "EV-GUIDE-102-BEHAVIOR",
  "EV-GUIDE-150-LIMITS",
] as const;
const REQUIRED_COMMON_SOURCES = [
  "MOE-DIRECTIVE-555-TEXT",
  "MOE-DIRECTIVE-555-APPENDIX-7",
  "MOE-DIRECTIVE-555-APPENDIX-8",
  "MOE-DIRECTIVE-555-APPENDIX-9",
  "MOE-DIRECTIVE-555-APPENDIX-10",
  "MOE-DIRECTIVE-555-APPENDIX-11",
] as const;
const EXPECTED_ACTIVE_COUNTS = {
  "MOE-GUIDE-ELEMENTARY-2026": 159,
  "MOE-DIRECTIVE-555-TEXT": 64,
  "MOE-DIRECTIVE-555-APPENDIX-7": 27,
  "MOE-DIRECTIVE-555-APPENDIX-8": 61,
  "MOE-DIRECTIVE-555-APPENDIX-9": 76,
  "MOE-DIRECTIVE-555-APPENDIX-10": 10,
  "MOE-DIRECTIVE-555-APPENDIX-11": 3,
} as const;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readChunks(): Promise<Array<{ id: string; sourceId: string; text: string }>> {
  return (await readFile(CHUNKS_PATH, "utf8"))
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line) as { id: string; sourceId: string; text: string });
}

describe("human-reviewed evidence inputs", () => {
  it("stores active chunk approvals as unique package-relative corpus IDs", async () => {
    const approvals = await readJson<ActiveChunkApproval[]>(ACTIVE_CHUNKS_PATH);
    const chunks = await readChunks();
    const ids = new Set<string>();

    assert.ok(Array.isArray(approvals));
    assert.equal(approvals.length, 400);
    for (const approval of approvals) {
      assert.deepEqual(Object.keys(approval).sort(), ["chunkId", "reason", "scope"]);
      assert.match(approval.chunkId, /^MOE-[A-Z0-9-]+:(?:pdf|article|unit)-[a-z0-9-]+$/u);
      assert.ok(approval.scope === "elementary" || approval.scope === "common");
      assert.ok(approval.reason.trim().length > 0);
      assert.equal(/[A-Z]:\\|C:\\Users|\/Users\//u.test(JSON.stringify(approval)), false);
      assert.equal(ids.has(approval.chunkId), false, approval.chunkId);
      ids.add(approval.chunkId);
    }

    const elementaryGuideIds = chunks
      .filter((chunk) => chunk.sourceId === "MOE-GUIDE-ELEMENTARY-2026")
      .map((chunk) => chunk.id)
      .sort();
    assert.equal(elementaryGuideIds.length, 161);
    const activeGuideIds = approvals
      .filter((approval) => approval.chunkId.startsWith("MOE-GUIDE-ELEMENTARY-2026:"))
      .map((approval) => approval.chunkId)
      .sort();
    assert.deepEqual(
      elementaryGuideIds.filter((id) => ![
        "MOE-GUIDE-ELEMENTARY-2026:pdf-002",
        "MOE-GUIDE-ELEMENTARY-2026:pdf-007",
      ].includes(id)),
      activeGuideIds,
    );
    assert.equal(activeGuideIds.includes("MOE-GUIDE-ELEMENTARY-2026:pdf-002"), false);
    assert.equal(activeGuideIds.includes("MOE-GUIDE-ELEMENTARY-2026:pdf-007"), false);
    for (const sourceId of REQUIRED_COMMON_SOURCES) {
      assert.ok(
        approvals.some((approval) => approval.chunkId.startsWith(`${sourceId}:`)),
        `${sourceId}: no active chunks`,
      );
    }

    const activeCounts = Object.fromEntries(
      Object.keys(EXPECTED_ACTIVE_COUNTS).map((sourceId) => [
        sourceId,
        approvals.filter((approval) => approval.chunkId.startsWith(`${sourceId}:`)).length,
      ]),
    );
    assert.deepEqual(activeCounts, EXPECTED_ACTIVE_COUNTS);
  });

  it("accepts only exact human-checked quotes whose hashes and active chunk references agree", async () => {
    const approvals = await readJson<ActiveChunkApproval[]>(ACTIVE_CHUNKS_PATH);
    const evidence = await readJson<VerifiedEvidence[]>(VERIFIED_EXCERPTS_PATH);
    const chunks = await readChunks();
    const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const activeIds = new Set(approvals.map((approval) => approval.chunkId));
    const evidenceIds = new Set<string>();

    assert.ok(Array.isArray(evidence));
    assert.deepEqual(evidence.map((excerpt) => excerpt.id).sort(), [...EXPECTED_EVIDENCE_IDS].sort());
    for (const excerpt of evidence) {
      assert.deepEqual(Object.keys(excerpt).sort(), [
        "checkedBy",
        "checkedOn",
        "chunkId",
        "id",
        "quote",
        "quoteSha256",
      ]);
      assert.match(excerpt.id, /^EV-(?:DIRECTIVE|GUIDE)-[A-Z0-9-]+$/u);
      assert.ok(activeIds.has(excerpt.chunkId), `${excerpt.id}: inactive chunk`);
      assert.ok(excerpt.quote.trim().length > 0, `${excerpt.id}: quote`);
      assert.match(excerpt.quoteSha256, /^[A-F0-9]{64}$/u);
      assert.equal(excerpt.quoteSha256, sha256(excerpt.quote), excerpt.id);
      assert.ok(chunkById.get(excerpt.chunkId)?.text.includes(excerpt.quote), `${excerpt.id}: containment`);
      assert.equal(excerpt.checkedBy, "human");
      assert.equal(excerpt.checkedOn, "2026-07-30");
      assert.equal(evidenceIds.has(excerpt.id), false, excerpt.id);
      evidenceIds.add(excerpt.id);
    }
  });
});
