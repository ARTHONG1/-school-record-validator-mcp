import type { ExtractedDocument, ExtractedUnit } from "./types.ts";
import { summarizeExtraction } from "./types.ts";

const articleHeading = /^제\d+조(?:의\d+)?(?:[ \t]*\([^\r\n)]*\)|[ \t]*<[ \t]*삭[ \t]*제[ \t]*>)/gm;
const addendumHeading = /^[ \t]*부[ \t]*칙[ \t]*<[ \t]*([^>\r\n]+?)[ \t]*>[ \t]*\r?$/gm;

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function articleUnits(text: string): ExtractedUnit[] {
  const matches = [...text.matchAll(articleHeading)];
  return matches.map((match, index): ExtractedUnit => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? text.length;
    const article = match[0].match(/^제\d+조(?:의\d+)?/)?.[0] ?? match[0];
    return {
      locator: { kind: "article", article },
      headingPath: [match[0]],
      rawText: text.slice(start, end).trim(),
    };
  }).filter((unit) => unit.rawText.length > 0);
}

function latestAddendum(text: string, marker: string): ExtractedUnit[] {
  const matches = [...text.matchAll(addendumHeading)];
  const index = matches.findIndex((match) => match[1]?.trim() === marker);
  if (index === -1) return [];
  const start = matches[index]?.index ?? -1;
  if (start === -1) return [];
  const next = matches[index + 1]?.index;
  return [{
    locator: { kind: "article", article: "부칙", paragraph: marker },
    headingPath: [`부칙 <${marker}>`],
    rawText: text.slice(start, next ?? text.length).trim(),
  }];
}

export function currentDirectiveArticles(text: string): ExtractedUnit[] {
  const firstArticle = text.indexOf("제1조(목적)");
  const latestArticle = text.indexOf("제22조(재검토기한)");
  if (firstArticle === -1 || latestArticle === -1 || latestArticle < firstArticle) {
    throw new Error("Current directive article range was not found");
  }
  const addendumStart = [...text.matchAll(addendumHeading)]
    .find((match) => (match.index ?? -1) > latestArticle)?.index;
  const body = text.slice(firstArticle, addendumStart ?? text.length);
  return [...articleUnits(body), ...latestAddendum(text, "제555호, 2026. 2. 12.")];
}

export function extractDirectiveText(sourceId: string, bytes: Uint8Array): ExtractedDocument {
  return summarizeExtraction(sourceId, currentDirectiveArticles(decodeText(bytes)));
}
