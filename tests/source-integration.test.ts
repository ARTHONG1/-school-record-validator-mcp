import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { extractDirectiveText } from "../scripts/ingest/directive-text.ts";
import { extractHwp5 } from "../scripts/ingest/hwp5.ts";
import { extractHwpml } from "../scripts/ingest/hwpml.ts";
import { extractPdf } from "../scripts/ingest/pdf.ts";
import { sourceManifestSchema } from "../src/source-types.ts";

const sourceDir = process.env.SCHOOL_RECORD_SOURCE_DIR;
const integration = sourceDir ? describe : describe.skip;
const directiveDirectory = "학교생활기록 작성 및 관리지침";

function pageText(document: Awaited<ReturnType<typeof extractPdf>>, pdfPage: number): string {
  const unit = document.units[pdfPage - 1];
  assert.ok(unit, `missing PDF page ${pdfPage}`);
  return unit.rawText;
}

integration("official elementary source extraction", () => {
  it("meets every manifest extraction minimum", async () => {
    const manifest = sourceManifestSchema.parse(
      JSON.parse(await readFile("sources/manifest.json", "utf8")),
    );

    for (const source of manifest.sources) {
      const bytes = await readFile(join(sourceDir!, ...source.relativeInputPath.split("/")));
      const extracted = source.format === "pdf"
        ? await extractPdf(source.id, bytes)
        : source.format === "text"
          ? extractDirectiveText(source.id, bytes)
          : source.format === "hwpml"
            ? extractHwpml(source.id, bytes)
            : extractHwp5(
                source.id,
                Number(source.id.match(/APPENDIX-(\d+)$/u)?.[1]) as 7 | 8 | 9 | 10 | 11,
                bytes,
              );

      assert.ok(
        extracted.extractedCharCount >= source.minimumExtractedChars,
        `${source.id}: extracted ${extracted.extractedCharCount}, minimum ${source.minimumExtractedChars}`,
      );
    }
  });

  it("extracts the fixed elementary PDF pages with their printed-page labels", async () => {
    const bytes = await readFile(join(sourceDir!, "2026+학교생활기록부+기재요령(초등학교).pdf"));
    const elementaryPdf = await extractPdf("MOE-GUIDE-ELEMENTARY-2026", bytes);

    assert.equal(elementaryPdf.units.length, 161);
    const printedPages = [24, 25, 33, 156].map((pdfPage) => {
      const locator = elementaryPdf.units[pdfPage - 1].locator;
      assert.equal(locator.kind, "pdf-page");
      return locator.printedPage;
    });
    assert.deepEqual(printedPages, [18, 19, 27, 150]);
    assert.match(pageText(elementaryPdf, 24), /각종 공인어학시험 참여 사실/);
    assert.match(pageText(elementaryPdf, 25), /AI를 활용하여 생성한 자료/);
    assert.match(pageText(elementaryPdf, 156), /별도의\s*글자수 제한은 없음/);
  });

  it("cross-checks selected current directive provisions in TXT and HWPML", async () => {
    const [textBytes, hwpmlBytes] = await Promise.all([
      readFile(join(sourceDir!, "학교생활기록 작성 및 관리지침 [시행 2026. 3. 1.] [교육부훈령 제555호, 2026. 2. 12., 일부개정].txt")),
      readFile(join(sourceDir!, directiveDirectory, "학교생활기록 작성 및 관리지침(교육부훈령)(제555호)(20260301).hwp")),
    ]);
    const textDocument = extractDirectiveText("MOE-DIRECTIVE-555-TEXT", textBytes);
    const hwpmlDocument = extractHwpml("MOE-DIRECTIVE-555-HWPML", hwpmlBytes);
    const hwpmlText = hwpmlDocument.units.map((unit) => unit.rawText).join("\n").replace(/\s+/g, "");

    assert.equal(textDocument.units.length, 29);
    assert.equal(textDocument.extractedCharCount, 11_127);
    assert.equal(hwpmlDocument.units.length, 286);
    assert.equal(hwpmlDocument.extractedCharCount, 19_013);
    assert.equal(
      textDocument.units.some((unit) => unit.rawText.includes("부칙  <제519호")),
      false,
    );
    assert.equal(
      textDocument.units.some((unit) => unit.rawText.includes("부칙  <제555호")),
      true,
    );

    for (const article of ["제4조", "제13조", "제16조", "제19조", "제20조"]) {
      const textUnit = textDocument.units.find((unit) => unit.rawText.startsWith(article));
      assert.ok(textUnit, `missing ${article} from directive TXT`);
      const normalized = textUnit.rawText.replace(/\s+/g, "");
      assert.ok(hwpmlText.includes(normalized), `missing ${article} from directive HWPML`);
    }
  });

  it("extracts each directive appendix with its topic sentinel", async () => {
    const appendixSources = [
      [7, "[별표 7] 학적처리에 사용하는 용어(학교생활기록 작성 및 관리지침).hwp", /학적/],
      [8, "[별표 8] 출결상황 관리(학교생활기록 작성 및 관리지침).hwp", /출결/],
      [9, "[별표 9] 교과학습발달상황 평가 및 관리(학교생활기록 작성 및 관리지침).hwp", /교과학습발달/],
      [10, "[별표 10] 학교생활기록부 정정대장 기재 및 관리(학교생활기록 작성 및 관리지침).hwp", /정정대장/],
      [11, "[별표 11] 개인정보(진로 관련 사항) 수집ㆍ이용 및 제3자 제공 동의서(학교생활기록 작성 및 관리지침).hwp", /동의/],
    ] as const;

    for (const [appendix, fileName, sentinel] of appendixSources) {
      const bytes = await readFile(join(sourceDir!, directiveDirectory, fileName));
      const extracted = extractHwp5(`MOE-DIRECTIVE-555-APPENDIX-${appendix}`, appendix, bytes);
      const text = extracted.units.map((unit) => unit.rawText).join("\n");
      assert.match(text, sentinel);
      assert.ok(extracted.extractedCharCount > 0);
    }
  });
});
