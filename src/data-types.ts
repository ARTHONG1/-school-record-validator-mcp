import type {
  CorpusDocument,
  CorpusManifest,
  EvidenceChunk,
} from "./corpus-types.ts";
import type { RulePack, VerifiedEvidence } from "./rule-types.ts";
import type { SourceDocument } from "./source-types.ts";

export interface ActiveChunkApproval {
  chunkId: string;
  scope: "elementary" | "common";
  reason: string;
}

export type BundleDataPath =
  | "sources/manifest.json"
  | "data/corpus/documents.json"
  | "data/corpus/chunks.jsonl"
  | "data/corpus/corpus-manifest.json"
  | "data/corpus/active-chunks.json"
  | "data/evidence/verified-excerpts.json"
  | "data/rules/kr-moe-school-record-elementary-2026.1.json";

export interface BundleManifest {
  schemaVersion: 1;
  packId: "kr-moe-school-record-elementary-2026.1";
  files: Array<{ path: BundleDataPath; sha256: string }>;
  bundleContentSha256: string;
}

export interface DataBundle {
  bundleManifest: BundleManifest;
  bundleManifestSha256: string;
  bundleContentSha256: string;
  corpusManifest: CorpusManifest;
  sources: readonly SourceDocument[];
  sourceById: ReadonlyMap<string, SourceDocument>;
  documents: readonly CorpusDocument[];
  documentBySourceId: ReadonlyMap<string, CorpusDocument>;
  chunks: readonly EvidenceChunk[];
  chunkById: ReadonlyMap<string, EvidenceChunk>;
  activeChunkApprovals: readonly ActiveChunkApproval[];
  activeChunkApprovalById: ReadonlyMap<string, ActiveChunkApproval>;
  activeChunks: readonly EvidenceChunk[];
  activeChunkById: ReadonlyMap<string, EvidenceChunk>;
  evidence: readonly VerifiedEvidence[];
  evidenceById: ReadonlyMap<string, VerifiedEvidence>;
  rules: RulePack;
}
