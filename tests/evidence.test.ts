import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { createEvidenceService } from "../src/evidence.ts";
import { buildTestBundle } from "./helpers/validator-fixture.ts";

const sourceSha256 = "A".repeat(64);
const excerptText = "AI를 활용하여 생성한 자료를 그대로 입력해서는 안 된다.";
const quote = "AI를 활용하여 생성한 자료를 그대로 입력";

type TestBundle = Parameters<typeof createEvidenceService>[0];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

function buildBundle(): TestBundle {
  const base = buildTestBundle();
  const chunk: TestBundle["activeChunks"][number] = {
    id: "MOE-GUIDE-ELEMENTARY-2026:pdf-025",
    sourceId: "MOE-GUIDE-ELEMENTARY-2026",
    authority: 80,
    schoolLevels: ["elementary"],
    locator: { kind: "pdf-page", pdfPage: 25, printedPage: 19 },
    locatorLabel: "2026 Elementary guidance printed 19 (PDF 25)",
    headingPath: ["Writing restrictions", "AI use"],
    text: excerptText,
    searchText: excerptText.toLocaleLowerCase("ko-KR"),
    textSha256: sha256(excerptText),
  };
  const evidence: TestBundle["evidence"][number] = {
    id: "EV-GUIDE-19-NARRATIVE-AUTHORITY",
    chunkId: chunk.id,
    quote,
    quoteSha256: sha256(quote),
    checkedBy: "human",
    checkedOn: "2026-07-30",
  };

  const sourceBase = base.sourceById.get(chunk.sourceId);
  assert.ok(sourceBase);
  const source = {
    ...sourceBase,
    title: "2026 School Record Guidance (Elementary)",
    sha256: sourceSha256,
    sourceUrl: "https://example.test/elementary",
  };
  const rules: TestBundle["rules"]["rules"] = [
    {
      id: "OFFICIAL-AI-VERBATIM",
      title: "Do not copy AI material verbatim",
      authorityClass: "official-policy",
      profile: "official",
      appliesTo: ["behavior_opinion"],
      message: "AI-generated material must not be entered verbatim.",
      recommendation: "Rewrite from teacher-verified observation.",
      exceptions: ["Teacher-directed student material is evaluated separately."],
      outcome: "block",
      evidenceIds: [evidence.id],
      detector: { type: "literal-any", patterns: ["AI"] },
    },
    {
      id: "EDITORIAL-UNSUPPORTED-SUPERLATIVE",
      title: "Avoid unsupported superlatives",
      authorityClass: "editorial-caution",
      profile: "official_plus_editorial",
      appliesTo: "all",
      message: "Avoid unsupported superlatives.",
      recommendation: "State observable behavior instead.",
      exceptions: [],
      outcome: "review",
      localPolicyId: "LOCAL-EDITORIAL-POLICY",
      detector: { type: "literal-any", patterns: ["always"] },
    },
    {
      id: "OFFICIAL-DIRECT-OBSERVATION",
      title: "Record direct observation basis",
      authorityClass: "official-policy",
      profile: "official",
      appliesTo: ["behavior_opinion"],
      message: "Direct observation basis is required.",
      recommendation: "Provide observation metadata.",
      exceptions: [],
      kind: "metadata",
      check: "direct-observation",
      possibleOutcomes: ["block", "review"],
      evidenceIds: [evidence.id],
    },
  ];

  return {
    ...base,
    sources: [...base.sources.filter((item) => item.id !== source.id), source],
    activeChunks: [chunk],
    activeChunkById: new Map([[chunk.id, chunk]]),
    sourceById: new Map([
      ...[...base.sourceById].filter(([sourceId]) => sourceId !== source.id),
      [source.id, source],
    ]),
    evidence: [evidence],
    evidenceById: new Map([[evidence.id, evidence]]),
    rules: {
      ...base.rules,
      rules,
    },
  };
}

describe("evidence service", () => {
  it("returns a complete approved source excerpt with a verifiable text hash", () => {
    const service = createEvidenceService(buildBundle());

    const result = service.getSourceExcerpt("MOE-GUIDE-ELEMENTARY-2026:pdf-025");

    assert.equal(result.text, excerptText);
    assert.equal(result.sourceSha256, sourceSha256);
    assert.equal(result.sourceUrl, "https://example.test/elementary");
    assert.equal(sha256(result.text), result.textSha256);
  });

  it("rejects a source excerpt outside the active chunk allowlist", () => {
    const service = createEvidenceService(buildBundle());

    assert.throws(() => service.getSourceExcerpt("MOE-GUIDE-MIDDLE-2026:pdf-025"), /chunkId/i);
  });

  it("explains official rules with every verified evidence quote", () => {
    const service = createEvidenceService(buildBundle());

    const result = service.explainRule("OFFICIAL-AI-VERBATIM");

    assert.deepEqual(result.possibleOutcomes, ["block"]);
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0]?.quote, quote);
    assert.equal(result.evidence[0]?.sourceSha256, sourceSha256);
  });

  it("keeps metadata outcomes and editorial cautions distinct", () => {
    const service = createEvidenceService(buildBundle());

    const metadata = service.explainRule("OFFICIAL-DIRECT-OBSERVATION");
    const editorial = service.explainRule("EDITORIAL-UNSUPPORTED-SUPERLATIVE");

    assert.deepEqual(metadata.possibleOutcomes, ["block", "review"]);
    assert.deepEqual(editorial.evidence, []);
    assert.equal(editorial.localPolicyId, "LOCAL-EDITORIAL-POLICY");
    assert.equal(editorial.disclaimer, "공식 규정 아님");
  });

  it("returns evidence summaries in requested order and rejects unknown IDs", () => {
    const service = createEvidenceService(buildBundle());

    const [summary] = service.getEvidenceSummaries(["EV-GUIDE-19-NARRATIVE-AUTHORITY"]);

    assert.equal(summary?.chunkId, "MOE-GUIDE-ELEMENTARY-2026:pdf-025");
    assert.equal(summary?.quoteSha256, sha256(quote));
    assert.throws(() => service.getEvidenceSummaries(["EV-MISSING"]), /evidence/i);
  });
});
