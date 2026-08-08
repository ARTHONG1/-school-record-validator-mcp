import { createHash } from "node:crypto";
import type { EvidenceChunk, SourceLocator } from "../../src/corpus-types.ts";
import type { SourceDocument } from "../../src/source-types.ts";
import type { ExtractedDocument, ExtractedUnit } from "./types.ts";
import { normalizeCorpusText, normalizeSearchText } from "./normalize.ts";

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

function numericPart(value: string): string | undefined {
  return value.match(/\d+/)?.[0];
}

function articleSlug(locator: Extract<SourceLocator, { kind: "article" }>): string {
  if (locator.article === "부칙") {
    const number = locator.paragraph?.match(/제(\d+)호/)?.[1];
    return number ? `addendum-${number}` : "addendum";
  }
  const article = /^제(\d+)조(?:의(\d+))?$/u.exec(locator.article.trim());
  if (!article?.[1]) {
    throw new Error(`Unsupported article locator: ${locator.article}`);
  }
  const base = `article-${article[1].padStart(2, "0")}${article[2] ? `-${article[2]}` : ""}`;
  const paragraph = locator.paragraph ? numericPart(locator.paragraph) : undefined;
  return paragraph ? `${base}-p${paragraph.padStart(2, "0")}` : base;
}

export function locatorKey(sourceId: string, locator: SourceLocator): string {
  switch (locator.kind) {
    case "pdf-page":
      return `${sourceId}:pdf-${String(locator.pdfPage).padStart(3, "0")}`;
    case "article":
      return `${sourceId}:${articleSlug(locator)}`;
    case "appendix":
      return `${sourceId}:unit-${String(locator.unitIndex).padStart(4, "0")}`;
  }
}

export function locatorLabel(source: SourceDocument, locator: SourceLocator): string {
  switch (locator.kind) {
    case "pdf-page":
      return locator.printedPage === undefined
        ? `2026 초등 기재요령 PDF ${locator.pdfPage}쪽`
        : `2026 초등 기재요령 인쇄 ${locator.printedPage}쪽 (PDF ${locator.pdfPage}쪽)`;
    case "article":
      return `교육부훈령 제555호 ${locator.article}${locator.paragraph ? `제${numericPart(locator.paragraph) ?? locator.paragraph}항` : ""}`;
    case "appendix":
      return `교육부훈령 제555호 별표 ${locator.appendix}, 단위 ${locator.unitIndex}`;
  }
}

function splitDirectiveParagraphs(unit: ExtractedUnit): ExtractedUnit[] {
  if (unit.locator.kind !== "article" || unit.locator.paragraph || unit.locator.article === "부칙") {
    return [unit];
  }

  const paragraphNumbers = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑";
  const starts = [...unit.rawText.matchAll(/(?:^|\n)\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑])\s*/gu)];
  if (starts.length === 0) {
    return [unit];
  }

  const firstStart = starts[0]?.index ?? 0;
  const prefix = unit.rawText.slice(0, firstStart).trim();
  const units: ExtractedUnit[] = prefix ? [{ ...unit, rawText: prefix }] : [];
  for (const [index, match] of starts.entries()) {
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? unit.rawText.length;
    const symbol = match[1] ?? "";
    units.push({
      locator: {
        kind: "article",
        article: unit.locator.article,
        paragraph: String(paragraphNumbers.indexOf(symbol) + 1),
      },
      headingPath: [...unit.headingPath],
      rawText: unit.rawText.slice(start, end).trim(),
    });
  }
  return units;
}

export function createEvidenceChunks(
  source: SourceDocument,
  extracted: ExtractedDocument,
): EvidenceChunk[] {
  if (source.id !== extracted.sourceId) {
    throw new Error(`Source and extraction IDs differ: ${source.id}`);
  }
  if (source.role === "verification-copy") {
    return [];
  }

  const units = source.role === "directive-body"
    ? extracted.units.flatMap(splitDirectiveParagraphs)
    : extracted.units;

  return units.map((unit) => {
    const text = normalizeCorpusText(unit.rawText);
    return {
      id: locatorKey(source.id, unit.locator),
      sourceId: source.id,
      authority: source.authority,
      schoolLevels: [...source.schoolLevels],
      locator: unit.locator,
      locatorLabel: locatorLabel(source, unit.locator),
      headingPath: [...unit.headingPath],
      text,
      searchText: normalizeSearchText(text),
      textSha256: sha256Text(text),
    };
  });
}
