import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEvidenceService } from "../src/evidence.ts";
import { createHandlers, type Services } from "../src/handlers.ts";
import { outputSchemas } from "../src/schemas.ts";
import { createGuidanceSearch } from "../src/search.ts";
import type { BundleDataPath, DataBundle } from "../src/data-types.ts";
import type { SourceDocument } from "../src/source-types.ts";
import { createValidator } from "../src/validator.ts";
import { buildTestBundle, completeObservation } from "./helpers/validator-fixture.ts";

const bundlePaths = [
  "sources/manifest.json",
  "data/corpus/documents.json",
  "data/corpus/chunks.jsonl",
  "data/corpus/corpus-manifest.json",
  "data/corpus/active-chunks.json",
  "data/evidence/verified-excerpts.json",
  "data/rules/kr-moe-school-record-elementary-2026.1.json",
] as const satisfies readonly BundleDataPath[];

function appendixSource(index: number): SourceDocument {
  return {
    id: `MOE-DIRECTIVE-555-APPENDIX-${index}`,
    title: `학교생활기록 작성 및 관리지침 별표 ${index}`,
    role: "directive-appendix",
    format: "hwp5",
    authority: 100,
    schoolLevels: ["elementary", "middle", "high"],
    academicYear: 2026,
    effectiveFrom: "2026-03-01",
    fileName: `appendix-${index}.hwp`,
    relativeInputPath: `appendix-${index}.hwp`,
    snapshotName: `appendix-${index}.hwp`,
    sha256: index.toString(16).toUpperCase().repeat(64).slice(0, 64),
    minimumExtractedChars: 1,
  };
}

export function buildHandlerTestBundle(): DataBundle {
  const base = buildTestBundle();
  const extraSources = [7, 8, 9, 10, 11].map(appendixSource);
  const verificationCopy: SourceDocument = {
    id: "MOE-DIRECTIVE-555-HWPML",
    title: "학교생활기록 작성 및 관리지침 검증 사본",
    role: "verification-copy",
    format: "hwpml",
    authority: 100,
    schoolLevels: ["elementary", "middle", "high"],
    academicYear: 2026,
    effectiveFrom: "2026-03-01",
    fileName: "directive.hwp",
    relativeInputPath: "directive.hwp",
    snapshotName: "directive.hwpml",
    sha256: "F".repeat(64),
    minimumExtractedChars: 1,
  };
  const sources = [...base.sources, verificationCopy, ...extraSources];

  return {
    ...base,
    bundleManifest: {
      ...base.bundleManifest,
      files: bundlePaths.map((path, index) => ({
        path,
        sha256: (index + 1).toString(16).toUpperCase().repeat(64),
      })),
    },
    sources,
    sourceById: new Map(sources.map((source) => [source.id, source])),
  };
}

export function createHandlerTestServices(): Services {
  const bundle = buildHandlerTestBundle();
  return {
    bundle,
    validator: createValidator(bundle),
    search: createGuidanceSearch(bundle),
    evidence: createEvidenceService(bundle),
  };
}

describe("MCP tool handlers", () => {
  it("returns both readable Korean text and structured citations", async () => {
    const handlers = createHandlers(createHandlerTestServices());

    const result = await handlers.validate_record_text({
      field: "behavior_opinion",
      text: "TOEIC에서 우수한 성적을 거둠.",
      provenance: completeObservation(),
    });

    assert.equal(result.isError, undefined);
    assert.match(result.content[0]?.text ?? "", /문안 점검: 기재 차단/u);
    assert.match(result.content[0]?.text ?? "", /인쇄 18쪽 \(PDF 24쪽\)/u);
    assert.equal(result.structuredContent?.status, "blocked");
    assert.equal(JSON.stringify(result.structuredContent).includes("TOEIC에서 우수한 성적을 거둠"), false);
  });

  it("returns schema-valid structured content from every tool", async () => {
    const services = createHandlerTestServices();
    const handlers = createHandlers(services);
    const chunkId = services.bundle.activeChunks[0]?.id;
    assert.ok(chunkId);

    const calls = {
      check_school_record: () => handlers.check_school_record({
        entries: [{ entryId: "record_1", text: "실험 결과를 비교하여 설명함." }],
      }),
      validate_record_text: () => handlers.validate_record_text({
        field: "student_name",
        text: "김학생",
      }),
      validate_record_batch: () => handlers.validate_record_batch({
        entries: [{ entryId: "student-1", field: "student_name", text: "김학생" }],
      }),
      search_record_guidance: () => handlers.search_record_guidance({
        query: "기재 금지",
        limit: 3,
      }),
      get_source_excerpt: () => handlers.get_source_excerpt({ chunkId }),
      explain_record_rule: () => handlers.explain_record_rule({ ruleId: "OFFICIAL-LANGUAGE-TEST" }),
      list_record_fields: () => handlers.list_record_fields({}),
      rule_pack_info: () => handlers.rule_pack_info({}),
    } as const;

    for (const name of Object.keys(calls) as Array<keyof typeof calls>) {
      const result = await calls[name]();
      assert.equal(result.isError, undefined, name);
      outputSchemas[name].parse(result.structuredContent);
      assert.equal(result.content[0]?.type, "text", name);
      assert.ok((result.content[0]?.text.length ?? 0) > 0, name);
    }
  });

  it("uses deterministic wrappers for batch, search, fields, and rule-pack metadata", async () => {
    const handlers = createHandlers(createHandlerTestServices());

    const batch = await handlers.validate_record_batch({
      entries: [
        { entryId: "first", field: "student_name", text: "김학생" },
        { entryId: "second", field: "attendance_special", text: "교외대회 참가" },
      ],
    });
    const search = await handlers.search_record_guidance({ query: "직접 관찰" });
    const fields = await handlers.list_record_fields({});
    const info = await handlers.rule_pack_info({});

    assert.deepEqual(batch.structuredContent?.entries.map((entry) => entry.entryId), ["first", "second"]);
    assert.ok((search.structuredContent?.results.length ?? 0) > 0);
    assert.equal(fields.structuredContent?.fields.length, 10);
    assert.equal(info.structuredContent?.sources.length, 8);
    assert.equal(info.structuredContent?.data.files.length, 7);
  });

  it("returns privacy-safe input errors for strict nested objects and duplicate batch IDs", async () => {
    const handlers = createHandlers(createHandlerTestServices());
    const secret = "UNIQUE-STUDENT-SECRET-2026";

    const nested = await handlers.validate_record_text({
      field: "behavior_opinion",
      text: secret,
      provenance: {
        observationBasis: "direct",
        ignoredExtra: secret,
      },
    });
    const duplicate = await handlers.validate_record_batch({
      entries: [
        { entryId: "same", field: "student_name", text: "김학생" },
        { entryId: "same", field: "student_name", text: secret },
      ],
    });
    const wrongTeacherShape = await handlers.check_school_record({
      record: { record_1: secret },
    });

    for (const result of [nested, duplicate, wrongTeacherShape]) {
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent, undefined);
      assert.match(result.content[0]?.text ?? "", /입력/u);
      assert.equal(JSON.stringify(result).includes(secret), false);
    }
  });

  it("converts known identifier mistakes but rethrows unexpected service failures", async () => {
    const services = createHandlerTestServices();
    const handlers = createHandlers(services);

    const missingChunk = await handlers.get_source_excerpt({ chunkId: "UNKNOWN-CHUNK" });
    const missingRule = await handlers.explain_record_rule({ ruleId: "UNKNOWN-RULE" });
    assert.equal(missingChunk.isError, true);
    assert.equal(missingRule.isError, true);

    const broken = createHandlers({
      ...services,
      validator: {
        ...services.validator,
        validate() {
          throw new Error("unexpected internal failure");
        },
      },
    });
    await assert.rejects(
      broken.validate_record_text({ field: "student_name", text: "김학생" }),
      /unexpected internal failure/u,
    );
  });
});
