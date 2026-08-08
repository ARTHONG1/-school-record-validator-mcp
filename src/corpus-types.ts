import type {
  AuthorityLevel,
  SchoolLevel,
  SourceFormat,
  SourceRole,
} from "./source-types.ts";

export type SourceLocator =
  | { kind: "pdf-page"; pdfPage: number; printedPage?: number }
  | { kind: "article"; article: string; paragraph?: string }
  | { kind: "appendix"; appendix: 7 | 8 | 9 | 10 | 11; unitIndex: number };

export interface CorpusDocument {
  sourceId: string;
  title: string;
  role: SourceRole;
  format: SourceFormat;
  authority: AuthorityLevel;
  schoolLevels: SchoolLevel[];
  sourceSha256: string;
  sourceUrl?: string;
  snapshotName: string;
  unitCount: number;
  extractedCharCount: number;
  includedInChunks: boolean;
}

export interface EvidenceChunk {
  id: string;
  sourceId: string;
  authority: AuthorityLevel;
  schoolLevels: SchoolLevel[];
  locator: SourceLocator;
  locatorLabel: string;
  headingPath: string[];
  text: string;
  searchText: string;
  textSha256: string;
}

export interface CorpusManifest {
  schemaVersion: 1;
  packId: "kr-moe-school-record-elementary-2026.1";
  sourceManifestSha256: string;
  documentsSha256: string;
  chunksSha256: string;
  documentCount: number;
  chunkCount: number;
}
