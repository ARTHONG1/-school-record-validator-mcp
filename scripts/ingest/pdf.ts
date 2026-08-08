import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ExtractedDocument, ExtractedUnit } from "./types.ts";
import { summarizeExtraction } from "./types.ts";

interface PdfTextItemLike {
  str?: string;
  hasEOL?: boolean;
}

function isPdfTextItemLike(item: unknown): item is PdfTextItemLike {
  return typeof item === "object"
    && item !== null
    && "str" in item
    && typeof item.str === "string";
}

export function joinPdfTextItems(items: readonly unknown[]): string {
  let text = "";
  for (const item of items) {
    if (!isPdfTextItemLike(item)) continue;
    text += item.str;
    if (item.hasEOL) text += "\n";
  }
  return text;
}

export function detectPrintedPage(rawText: string): number | undefined {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const marginLines = [...lines.slice(0, 5), ...lines.slice(-5)];
  const candidates = new Set(
    marginLines
      .filter((line) => /^\d{1,3}$/.test(line))
      .map((line) => Number.parseInt(line, 10)),
  );
  return candidates.size === 1 ? [...candidates][0] : undefined;
}

export function detectPdfHeadings(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length <= 120)
    .slice(0, 2);
}

export async function extractPdf(sourceId: string, bytes: Uint8Array): Promise<ExtractedDocument> {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const units: ExtractedUnit[] = [];
  try {
    for (let pdfPage = 1; pdfPage <= pdf.numPages; pdfPage += 1) {
      const page = await pdf.getPage(pdfPage);
      const content = await page.getTextContent();
      const rawText = joinPdfTextItems(content.items).trim();
      const printedPage = detectPrintedPage(rawText);
      units.push({
        locator: {
          kind: "pdf-page",
          pdfPage,
          ...(printedPage === undefined ? {} : { printedPage }),
        },
        headingPath: detectPdfHeadings(rawText),
        rawText,
      });
    }
  } finally {
    await pdf.destroy();
  }
  return summarizeExtraction(sourceId, units);
}
