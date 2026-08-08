import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { createEvidenceChunks, locatorKey, locatorLabel } from "../scripts/ingest/chunk.ts";
import { normalizeCorpusText, normalizeSearchText } from "../scripts/ingest/normalize.ts";
import { stableJson, stableJsonLines } from "../scripts/ingest/stable-json.ts";
import type { ExtractedDocument } from "../scripts/ingest/types.ts";
import type { SourceDocument } from "../src/source-types.ts";

const source: SourceDocument = {
  id: "MOE-GUIDE-ELEMENTARY-2026",
  title: "2026 학교생활기록부 기재요령(초등학교)",
  role: "primary-guide",
  format: "pdf",
  authority: 80,
  schoolLevels: ["elementary"],
  academicYear: 2026,
  effectiveFrom: "2026-03-01",
  fileName: "elementary.pdf",
  relativeInputPath: "elementary.pdf",
  snapshotName: "elementary-guide-2026.pdf",
  sha256: "A".repeat(64),
  minimumExtractedChars: 1,
};

describe("deterministic corpus helpers", () => {
  it("preserves source line structure while normalizing CRLF", () => {
    assert.equal(normalizeCorpusText(" 첫 줄\r\n둘째 줄\r셋째 줄 \n"), "첫 줄\n둘째 줄\n셋째 줄");
  });

  it("normalizes search text with NFKC, whitespace folding, and lowercase", () => {
    assert.equal(normalizeSearchText(" ＡＩ\t자료 \r\n 그대로  입력 "), "ai 자료\n그대로 입력");
  });

  it("creates stable PDF chunk IDs, labels, text, and hashes", () => {
    const extracted: ExtractedDocument = {
      sourceId: source.id,
      extractedCharCount: 13,
      units: [{
        locator: { kind: "pdf-page", pdfPage: 24, printedPage: 18 },
        headingPath: ["기재 금지"],
        rawText: "  TOEIC\r\n기재 금지  ",
      }],
    };

    const [chunk] = createEvidenceChunks(source, extracted);
    assert.equal(chunk.id, "MOE-GUIDE-ELEMENTARY-2026:pdf-024");
    assert.equal(chunk.locatorLabel, "2026 초등 기재요령 인쇄 18쪽 (PDF 24쪽)");
    assert.equal(chunk.text, "TOEIC\n기재 금지");
    assert.equal(chunk.searchText, "toeic\n기재 금지");
    assert.equal(
      chunk.textSha256,
      createHash("sha256").update(chunk.text, "utf8").digest("hex").toUpperCase(),
    );
  });

  it("uses deterministic article and one-based appendix coordinates", () => {
    assert.equal(
      locatorKey("MOE-DIRECTIVE-555-TEXT", { kind: "article", article: "제4조", paragraph: "2" }),
      "MOE-DIRECTIVE-555-TEXT:article-04-p02",
    );
    assert.equal(
      locatorLabel(source, { kind: "appendix", appendix: 8, unitIndex: 12 }),
      "교육부훈령 제555호 별표 8, 단위 12",
    );
    assert.equal(
      locatorKey("MOE-DIRECTIVE-555-APPENDIX-8", { kind: "appendix", appendix: 8, unitIndex: 1 }),
      "MOE-DIRECTIVE-555-APPENDIX-8:unit-0001",
    );
  });

  it("keeps branch article numbers distinct in chunk IDs", () => {
    assert.equal(
      locatorKey("MOE-DIRECTIVE-555-TEXT", { kind: "article", article: "제13조의2" }),
      "MOE-DIRECTIVE-555-TEXT:article-13-2",
    );
    assert.equal(
      locatorKey("MOE-DIRECTIVE-555-TEXT", {
        kind: "article",
        article: "제20조의3",
        paragraph: "2",
      }),
      "MOE-DIRECTIVE-555-TEXT:article-20-3-p02",
    );
  });

  it("splits directive paragraphs through enclosed number twenty-one", () => {
    const directiveSource: SourceDocument = {
      ...source,
      id: "MOE-DIRECTIVE-555-TEXT",
      role: "directive-body",
      format: "text",
      authority: 100,
      schoolLevels: ["elementary", "middle", "high"],
    };
    const extracted: ExtractedDocument = {
      sourceId: directiveSource.id,
      extractedCharCount: 41,
      units: [{
        locator: { kind: "article", article: "제15조" },
        headingPath: ["제15조(교과학습발달상황)"],
        rawText: "제15조(교과학습발달상황) ① 첫째 항\n⑩ 열째 항\n⑪ 열한째 항\n⑭ 열넷째 항\n㉑ 스물한째 항",
      }],
    };

    assert.deepEqual(
      createEvidenceChunks(directiveSource, extracted).map((chunk) => chunk.id),
      [
        "MOE-DIRECTIVE-555-TEXT:article-15",
        "MOE-DIRECTIVE-555-TEXT:article-15-p10",
        "MOE-DIRECTIVE-555-TEXT:article-15-p11",
        "MOE-DIRECTIVE-555-TEXT:article-15-p14",
        "MOE-DIRECTIVE-555-TEXT:article-15-p21",
      ],
    );
  });

  it("serializes objects and JSONL byte-for-byte deterministically", () => {
    const left = stableJson({ z: 1, nested: { b: 2, a: 1 }, a: [3, { y: 2, x: 1 }] });
    const right = stableJson({ a: [3, { x: 1, y: 2 }], nested: { a: 1, b: 2 }, z: 1 });
    assert.equal(left, right);
    assert.equal(left.endsWith("\n"), true);
    assert.equal(stableJsonLines([{ b: 2, a: 1 }, { d: 4, c: 3 }]), '{"a":1,"b":2}\n{"c":3,"d":4}\n');
  });
});
