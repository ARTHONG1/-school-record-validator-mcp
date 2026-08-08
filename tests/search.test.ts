import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGuidanceSearch } from "../src/search.ts";
import { loadDataBundle } from "../src/data-loader.ts";
import { buildTestBundle } from "./helpers/validator-fixture.ts";

const guideSha256 = "A".repeat(64);
const directiveSha256 = "B".repeat(64);

type TestBundle = Parameters<typeof createGuidanceSearch>[0];

function buildBundle(): TestBundle {
  const base = buildTestBundle();
  const activeChunks: TestBundle["activeChunks"] = [
    {
      id: "MOE-GUIDE-ELEMENTARY-2026:pdf-025",
      sourceId: "MOE-GUIDE-ELEMENTARY-2026",
      authority: 80,
      schoolLevels: ["elementary"],
      locator: { kind: "pdf-page", pdfPage: 25, printedPage: 19 },
      locatorLabel: "2026 Elementary guidance printed 19 (PDF 25)",
      headingPath: ["Writing restrictions", "AI use"],
      text: "AI를 활용하여 생성한 자료를 그대로 입력해서는 안 된다.",
      searchText: "ai를 활용하여 생성한 자료를 그대로 입력해서는 안 된다.",
      textSha256: "C".repeat(64),
    },
    {
      id: "MOE-DIRECTIVE-555-TEXT:article-04-p02",
      sourceId: "MOE-DIRECTIVE-555-TEXT",
      authority: 100,
      schoolLevels: ["elementary", "middle", "high"],
      locator: { kind: "article", article: "4", paragraph: "2" },
      locatorLabel: "Directive 555 Article 4 Paragraph 2",
      headingPath: ["Article 4", "Input"],
      text: "사용자는 학생에 대해 직접 관찰 평가한 내용을 근거로 입력해야 한다.",
      searchText: "사용자는 학생에 대해 직접 관찰 평가한 내용을 근거로 입력해야 한다.",
      textSha256: "D".repeat(64),
    },
    {
      id: "MOE-GUIDE-ELEMENTARY-2026:pdf-024",
      sourceId: "MOE-GUIDE-ELEMENTARY-2026",
      authority: 80,
      schoolLevels: ["elementary"],
      locator: { kind: "pdf-page", pdfPage: 24, printedPage: 18 },
      locatorLabel: "2026 Elementary guidance printed 18 (PDF 24)",
      headingPath: ["Writing restrictions"],
      text: "교사가 직접 관찰한 사실을 바탕으로 작성한다.",
      searchText: "교사가 직접 관찰한 사실을 바탕으로 작성한다.",
      textSha256: "E".repeat(64),
    },
    {
      id: "MOE-GUIDE-ELEMENTARY-2026:pdf-156",
      sourceId: "MOE-GUIDE-ELEMENTARY-2026",
      authority: 80,
      schoolLevels: ["elementary"],
      locator: { kind: "pdf-page", pdfPage: 156, printedPage: 150 },
      locatorLabel: "2026 Elementary guidance printed 150 (PDF 156)",
      headingPath: ["07 학교생활기록부 영역별 입력 가능 최대 글자수"],
      text: "학교생활기록부 영역별 입력 가능 최대 글자수 학생 성명 20자 교과학습발달상황 별도의 글자수 제한은 없음",
      searchText: "학교생활기록부 영역별 입력 가능 최대 글자수 학생 성명 20자 교과학습발달상황 별도의 글자수 제한은 없음",
      textSha256: "G".repeat(64),
    },
    {
      id: "MOE-GUIDE-ELEMENTARY-2026:pdf-014",
      sourceId: "MOE-GUIDE-ELEMENTARY-2026",
      authority: 80,
      schoolLevels: ["elementary"],
      locator: { kind: "pdf-page", pdfPage: 14, printedPage: 8 },
      locatorLabel: "2026 Elementary guidance printed 8 (PDF 14)",
      headingPath: ["학교생활기록부", "입력"],
      text: "학교생활기록부 입력은 학생별 학교생활기록부 입력 자료에 따라 달라질 수 있다. 학교생활기록부 입력 입력 입력 자료를 확인한다.",
      searchText: "학교생활기록부 입력은 학생별 학교생활기록부 입력 자료에 따라 달라질 수 있다. 학교생활기록부 입력 입력 입력 자료를 확인한다.",
      textSha256: "H".repeat(64),
    },
  ];
  const guideSourceBase = base.sourceById.get("MOE-GUIDE-ELEMENTARY-2026");
  const directiveSourceBase = base.sourceById.get("MOE-DIRECTIVE-555-TEXT");
  assert.ok(guideSourceBase);
  assert.ok(directiveSourceBase);
  const guideSource = {
    ...guideSourceBase,
    title: "2026 School Record Guidance (Elementary)",
    sha256: guideSha256,
    sourceUrl: "https://example.test/elementary",
  };
  const directiveSource = {
    ...directiveSourceBase,
    title: "Directive 555",
    sha256: directiveSha256,
  };

  return {
    ...base,
    sources: [guideSource, directiveSource],
    activeChunks,
    activeChunkById: new Map(activeChunks.map((chunk) => [chunk.id, chunk])),
    sourceById: new Map([
      [guideSource.id, guideSource],
      [directiveSource.id, directiveSource],
    ]),
  };
}

describe("guidance search", () => {
  it("ranks the exact AI guidance page first", () => {
    const search = createGuidanceSearch(buildBundle());

    const results = search.searchGuidance("AI 생성 자료 그대로 입력", { limit: 5 });

    assert.equal(results[0]?.chunkId, "MOE-GUIDE-ELEMENTARY-2026:pdf-025");
    assert.match(results[0]?.snippet ?? "", /AI를 활용하여 생성한 자료/);
    assert.equal(results[0]?.sourceSha256, guideSha256);
  });

  it("finds the directive article before lower-authority guidance", () => {
    const search = createGuidanceSearch(buildBundle());

    const results = search.searchGuidance("직접 관찰 평가", { limit: 5 });
    const directive = results.find((result) => result.sourceId === "MOE-DIRECTIVE-555-TEXT");

    assert.ok(directive);
    assert.equal(directive.authority, 100);
  });

  it("normalizes query whitespace and case before scoring", () => {
    const search = createGuidanceSearch(buildBundle());

    const [result] = search.searchGuidance("  ai\t생성   자료  ");

    assert.equal(result?.chunkId, "MOE-GUIDE-ELEMENTARY-2026:pdf-025");
  });

  it("filters to requested known source IDs and applies the requested limit", () => {
    const search = createGuidanceSearch(buildBundle());

    const results = search.searchGuidance("직접 관찰", {
      limit: 1,
      sourceIds: ["MOE-DIRECTIVE-555-TEXT"],
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]?.sourceId, "MOE-DIRECTIVE-555-TEXT");
  });

  it("filters guidance results by source role", () => {
    const search = createGuidanceSearch(buildBundle());

    const results = search.searchGuidance("직접 관찰 평가", {
      sourceRoles: ["directive-body"],
      limit: 5,
    });

    assert.ok(results.length > 0);
    assert.ok(results.every((result) => result.sourceId === "MOE-DIRECTIVE-555-TEXT"));
  });

  it("rejects empty or oversized queries and unknown source IDs", () => {
    const search = createGuidanceSearch(buildBundle());

    assert.throws(() => search.searchGuidance(""), /query/i);
    assert.throws(() => search.searchGuidance("a".repeat(201)), /query/i);
    assert.throws(
      () => search.searchGuidance("관찰", { sourceIds: ["MOE-GUIDE-MIDDLE-2026"] }),
      /sourceIds/i,
    );
  });

  it("only returns active elementary or common documents", () => {
    const search = createGuidanceSearch(buildBundle());

    const results = search.searchGuidance("관찰", { limit: 5 });

    assert.ok(results.every((result) => !/\((중학교|고등학교)\)/u.test(result.title)));
  });

  it("puts the exact maximum-length guidance page first for a production-shaped query", () => {
    const search = createGuidanceSearch(buildBundle());

    const results = search.searchGuidance("학교생활기록부 입력 최대 글자 수", { limit: 3 });

    assert.equal(results[0]?.chunkId, "MOE-GUIDE-ELEMENTARY-2026:pdf-156");
  });

  it("ranks the production maximum-length page above unrelated guidance", async () => {
    const search = createGuidanceSearch(await loadDataBundle());
    const results = search.searchGuidance("학교생활기록부 입력 최대 글자 수", { limit: 3 });

    assert.equal(results[0]?.chunkId, "MOE-GUIDE-ELEMENTARY-2026:pdf-156");
  });
});
