import type { SourceLocator } from "../../src/corpus-types.ts";

export interface ExtractedUnit {
  locator: SourceLocator;
  headingPath: string[];
  rawText: string;
}

export interface ExtractedDocument {
  sourceId: string;
  units: ExtractedUnit[];
  extractedCharCount: number;
}

export function summarizeExtraction(sourceId: string, units: ExtractedUnit[]): ExtractedDocument {
  return {
    sourceId,
    units,
    extractedCharCount: units.reduce((total, unit) => total + unit.rawText.length, 0),
  };
}
