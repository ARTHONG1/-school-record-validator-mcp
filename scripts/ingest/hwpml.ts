import { DOMParser } from "@xmldom/xmldom";
import type { ExtractedDocument, ExtractedUnit } from "./types.ts";
import { summarizeExtraction } from "./types.ts";

function removeDoctype(xml: string): string {
  const start = xml.search(/<!DOCTYPE\s/i);
  if (start === -1) return xml;
  let depth = 0;
  let quote = "";
  for (let index = start; index < xml.length; index += 1) {
    const char = xml[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
    } else if (char === ">" && depth === 0) {
      return xml.slice(0, start) + xml.slice(index + 1);
    }
  }
  throw new Error("Unterminated HWPML DOCTYPE");
}

function parseHwpml(xml: string): Document {
  const document = new DOMParser({
    errorHandler: { error: () => undefined, fatalError: () => undefined, warning: () => undefined },
  }).parseFromString(removeDoctype(xml).replaceAll("&nbsp;", "\u00A0"), "text/xml");
  if (document.getElementsByTagName("parsererror").length > 0 || !document.documentElement) {
    throw new Error("Invalid HWPML XML");
  }
  return document;
}

export function extractHwpml(sourceId: string, bytes: Uint8Array): ExtractedDocument {
  const document = parseHwpml(new TextDecoder("utf-8").decode(bytes));
  const paragraphs = Array.from(document.getElementsByTagName("P"));
  const units: ExtractedUnit[] = paragraphs.map((paragraph, index): ExtractedUnit => {
    const characters = Array.from(paragraph.getElementsByTagName("CHAR"));
    const rawText = characters.map((character) => character.textContent ?? "").join("").trim();
    return {
      locator: { kind: "article", article: `문단 ${index + 1}` },
      headingPath: [],
      rawText,
    };
  }).filter((unit) => unit.rawText.length > 0);
  return summarizeExtraction(sourceId, units);
}
