import { parseHwpContent } from "../vendor/hwp/HwpParser.ts";
import type { ExtractedDocument, ExtractedUnit } from "./types.ts";
import { summarizeExtraction } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function arrayProperty(value: unknown, property: string): unknown[] {
  if (!isRecord(value)) return [];
  const candidate = value[property];
  return Array.isArray(candidate) ? candidate : [];
}

function flattenParagraph(paragraph: unknown): string {
  return arrayProperty(paragraph, "runs")
    .map((run) => isRecord(run) && typeof run.text === "string" ? run.text : "")
    .join("");
}

function elementType(element: unknown): string | undefined {
  return isRecord(element) && typeof element.type === "string" ? element.type : undefined;
}

function elementData(element: unknown): unknown {
  return isRecord(element) ? element.data : undefined;
}

function flattenCell(cell: unknown): string {
  const elements = arrayProperty(cell, "elements");
  const hasParagraphElements = elements.some((element) => elementType(element) === "paragraph");
  const text = hasParagraphElements
    ? elements.flatMap(flattenElementText)
    : arrayProperty(cell, "paragraphs").map(flattenParagraph).filter(Boolean);
  if (!hasParagraphElements) {
    for (const table of arrayProperty(cell, "nestedTables")) text.push(flattenTable(table));
    for (const element of elements) text.push(...flattenElementText(element));
  }
  return text.filter(Boolean).join("\n");
}

function flattenTable(table: unknown): string {
  return arrayProperty(table, "rows")
    .map((row) => arrayProperty(row, "cells").map(flattenCell).join("\t"))
    .join("\n");
}

export function flattenElementText(element: unknown): string[] {
  switch (elementType(element)) {
    case "paragraph":
      return [flattenParagraph(elementData(element))];
    case "table":
      return [flattenTable(elementData(element))];
    case "textbox":
      return arrayProperty(elementData(element), "paragraphs").map(flattenParagraph);
    default:
      return [];
  }
}

export function extractHwp5(
  sourceId: string,
  appendix: 7 | 8 | 9 | 10 | 11,
  bytes: Uint8Array,
): ExtractedDocument {
  const content = parseHwpContent(bytes);
  const units: ExtractedUnit[] = [];
  let unitIndex = 1;
  for (const section of content.sections) {
    for (const element of section.elements) {
      for (const rawText of flattenElementText(element)) {
        if (rawText.trim() === "") continue;
        units.push({
          locator: { kind: "appendix", appendix, unitIndex },
          headingPath: [],
          rawText,
        });
        unitIndex += 1;
      }
    }
  }
  const extracted = summarizeExtraction(sourceId, units);
  if (extracted.extractedCharCount === 0) throw new Error(`HWP extraction produced no text for ${sourceId}`);
  return extracted;
}
