import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentDirectiveArticles } from "../scripts/ingest/directive-text.ts";
import { flattenElementText } from "../scripts/ingest/hwp5.ts";
import { extractHwpml } from "../scripts/ingest/hwpml.ts";
import { detectPrintedPage, joinPdfTextItems } from "../scripts/ingest/pdf.ts";

describe("extractors", () => {
  it("joins PDF text items at their explicit line boundaries", () => {
    const text = joinPdfTextItems([
      { str: "첫 줄", hasEOL: true },
      { str: "둘째", hasEOL: false },
      { str: " 줄", hasEOL: true },
    ]);

    assert.equal(text, "첫 줄\n둘째 줄\n");
  });

  it("uses an unambiguous margin number as the printed PDF page", () => {
    assert.equal(detectPrintedPage("18\n본문\n내용\n18"), 18);
    assert.equal(detectPrintedPage("18\n본문\n19"), undefined);
  });

  it("keeps only the current directive articles and its latest addendum", () => {
    const text = [
      "이전 본문",
      "제1조(목적) 첫 조문",
      "제4조(입력)\n② 직접 관찰한다.",
      "제13조(창의적 체험활동상황) 본 조문",
      "제13조의2(일상생활 활동상황) 가지 조문",
      "제14조 < 삭 제 >",
      "제16조의2 (학교폭력 조치상황 관리) 공백이 있는 가지 조문",
      "제22조(재검토기한) 마지막 조문",
      " 부칙  <제554호, 2025. 1. 1.>",
      "제1조(시행일) 과거 부칙 조문",
      "이전 부칙",
      " 부칙  <제555호, 2026. 2. 12.>",
      "제1조(시행일) 최신 부칙 조문",
      "최신 부칙",
    ].join("\n");

    const units = currentDirectiveArticles(text);

    assert.equal(units.length, 8);
    assert.match(units[0].rawText, /^제1조/);
    assert.match(units[1].rawText, /^제4조/);
    assert.deepEqual(units.slice(2, 6).map((unit) => unit.locator), [
      { kind: "article", article: "제13조" },
      { kind: "article", article: "제13조의2" },
      { kind: "article", article: "제14조" },
      { kind: "article", article: "제16조의2" },
    ]);
    assert.match(units[6].rawText, /^제22조/);
    assert.match(units[7].rawText, /최신 부칙/);
    assert.equal(units.some((unit) => unit.rawText.includes("이전 부칙")), false);
    assert.equal(units.some((unit) => unit.rawText.includes("과거 부칙 조문")), false);
  });

  it("parses HWPML CHAR nodes with an XML parser", () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE HWPML [<!ENTITY nbsp "&#160;">]><HWPML><BODY><SECTION><P><CHAR>첫</CHAR><CHAR> 문단</CHAR></P><P><CHAR>둘째&nbsp;문단</CHAR></P></SECTION></BODY></HWPML>`;

    const extracted = extractHwpml("fixture-hwpml", new TextEncoder().encode(xml));

    assert.deepEqual(extracted.units.map((unit) => unit.rawText), ["첫 문단", "둘째\u00A0문단"]);
    assert.deepEqual(extracted.units.map((unit) => unit.locator), [
      { kind: "article", article: "문단 1" },
      { kind: "article", article: "문단 2" },
    ]);
  });

  it("reads HWP paragraph text from data.runs", () => {
    const element = {
      type: "paragraph",
      data: {
        id: "paragraph-1",
        runs: [{ text: "직접 " }, { text: "관찰" }],
      },
    };

    assert.deepEqual(flattenElementText(element), ["직접 관찰"]);
  });

  it("does not duplicate cell paragraphs mirrored in elements", () => {
    const paragraph = {
      id: "cell-paragraph-1",
      runs: [{ text: "한 번만 기록" }],
    };
    const element = {
      type: "table",
      data: {
        rows: [
          {
            cells: [
              {
                paragraphs: [paragraph],
                elements: [{ type: "paragraph", data: paragraph }],
              },
            ],
          },
        ],
      },
    };

    assert.deepEqual(flattenElementText(element), ["한 번만 기록"]);
  });

  it("flattens HWP table cells and nested tables in document order", () => {
    const element = {
      type: "table",
      data: {
        rows: [
          {
            cells: [
              { paragraphs: [{ runs: [{ text: "왼쪽" }] }] },
              {
                paragraphs: [{ runs: [{ text: "오른쪽" }] }],
                elements: [
                  {
                    type: "table",
                    data: {
                      rows: [{ cells: [{ paragraphs: [{ runs: [{ text: "중첩" }] }] }] }],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    assert.deepEqual(flattenElementText(element), ["왼쪽\t오른쪽\n중첩"]);
  });
});
