import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  CorpusDocument,
  CorpusManifest,
  EvidenceChunk,
} from "../src/corpus-types.ts";
import type { SourceDocument, SourceManifest } from "../src/source-types.ts";
import { createEvidenceChunks } from "./ingest/chunk.ts";
import {
  loadVerifiedSources,
  snapshotVerifiedSources,
  type VerifiedSource,
} from "./ingest/source-loader.ts";
import { stableJson, stableJsonLines } from "./ingest/stable-json.ts";
import type { ExtractedDocument } from "./ingest/types.ts";

const artifactNames = ["documents.json", "chunks.jsonl", "corpus-manifest.json"] as const;

export interface CorpusArtifactHashes {
  documentsSha256: string;
  chunksSha256: string;
  corpusManifestSha256: string;
}

export interface CorpusArtifacts {
  documents: CorpusDocument[];
  chunks: EvidenceChunk[];
  manifest: CorpusManifest;
  documentsJson: string;
  chunksJsonl: string;
  corpusManifestJson: string;
  hashes: CorpusArtifactHashes;
}

export interface CommandOptions {
  sourceDir: string;
  snapshotOnly: boolean;
  verifyOnly: boolean;
}

function sha256Bytes(value: string | Uint8Array): string {
  const hash = createHash("sha256");
  if (typeof value === "string") {
    hash.update(value, "utf8");
  } else {
    hash.update(value);
  }
  return hash.digest("hex").toUpperCase();
}

function compareById(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id, "en");
}

function toCorpusDocument(source: SourceDocument, extracted: ExtractedDocument): CorpusDocument {
  return {
    sourceId: source.id,
    title: source.title,
    role: source.role,
    format: source.format,
    authority: source.authority,
    schoolLevels: [...source.schoolLevels],
    sourceSha256: source.sha256,
    ...(source.sourceUrl === undefined ? {} : { sourceUrl: source.sourceUrl }),
    snapshotName: source.snapshotName,
    unitCount: extracted.units.length,
    extractedCharCount: extracted.extractedCharCount,
    includedInChunks: source.role !== "verification-copy",
  };
}

export function buildCorpusArtifacts(
  sourceManifest: SourceManifest,
  extractedDocuments: readonly ExtractedDocument[],
  sourceManifestBytes?: string | Uint8Array,
): CorpusArtifacts {
  const sources = [...sourceManifest.sources].sort(compareById);
  const extractedBySourceId = new Map<string, ExtractedDocument>();
  for (const extracted of extractedDocuments) {
    if (extractedBySourceId.has(extracted.sourceId)) {
      throw new Error(`Duplicate extraction: ${extracted.sourceId}`);
    }
    extractedBySourceId.set(extracted.sourceId, extracted);
  }

  const sourceIds = new Set(sources.map((source) => source.id));
  for (const sourceId of extractedBySourceId.keys()) {
    if (!sourceIds.has(sourceId)) {
      throw new Error(`Extraction has no source metadata: ${sourceId}`);
    }
  }

  const documents: CorpusDocument[] = [];
  const chunks: EvidenceChunk[] = [];
  for (const source of sources) {
    const extracted = extractedBySourceId.get(source.id);
    if (!extracted) {
      throw new Error(`Missing extraction: ${source.id}`);
    }
    documents.push(toCorpusDocument(source, extracted));
    chunks.push(...createEvidenceChunks(source, extracted));
  }
  chunks.sort(compareById);
  const chunkIds = new Set<string>();
  for (const chunk of chunks) {
    if (chunkIds.has(chunk.id)) {
      throw new Error(`Duplicate chunk ID: ${chunk.id}`);
    }
    chunkIds.add(chunk.id);
  }

  const canonicalSourceManifest: SourceManifest = {
    schemaVersion: sourceManifest.schemaVersion,
    packId: sourceManifest.packId,
    sources,
  };
  const documentsJson = stableJson(documents);
  const chunksJsonl = stableJsonLines(chunks);
  const manifest: CorpusManifest = {
    schemaVersion: 1,
    packId: sourceManifest.packId,
    sourceManifestSha256: sha256Bytes(sourceManifestBytes ?? stableJson(canonicalSourceManifest)),
    documentsSha256: sha256Bytes(documentsJson),
    chunksSha256: sha256Bytes(chunksJsonl),
    documentCount: documents.length,
    chunkCount: chunks.length,
  };
  const corpusManifestJson = stableJson(manifest);

  return {
    documents,
    chunks,
    manifest,
    documentsJson,
    chunksJsonl,
    corpusManifestJson,
    hashes: {
      documentsSha256: manifest.documentsSha256,
      chunksSha256: manifest.chunksSha256,
      corpusManifestSha256: sha256Bytes(corpusManifestJson),
    },
  };
}

export async function writeCorpusArtifacts(
  outputRoot: string,
  artifacts: CorpusArtifacts,
): Promise<void> {
  await mkdir(outputRoot, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(outputRoot, ".corpus-build-"));
  const contents: Record<(typeof artifactNames)[number], string> = {
    "documents.json": artifacts.documentsJson,
    "chunks.jsonl": artifacts.chunksJsonl,
    "corpus-manifest.json": artifacts.corpusManifestJson,
  };

  try {
    await Promise.all(
      artifactNames.map((name) => writeFile(join(temporaryDirectory, name), contents[name], "utf8")),
    );
    for (const name of artifactNames) {
      await replaceFile(join(temporaryDirectory, name), join(outputRoot, name));
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function replaceFile(temporaryPath: string, destinationPath: string): Promise<void> {
  const backupPath = `${destinationPath}.backup-${randomUUID()}`;
  let backedUp = false;
  try {
    try {
      await rename(destinationPath, backupPath);
      backedUp = true;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    await rename(temporaryPath, destinationPath);
    if (backedUp) await rm(backupPath, { force: true });
  } catch (error) {
    if (backedUp) {
      await rm(destinationPath, { force: true });
      await rename(backupPath, destinationPath);
    }
    throw error;
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function parseCommandOptions(
  args: readonly string[],
  environmentSourceDir = process.env.SCHOOL_RECORD_SOURCE_DIR,
): CommandOptions {
  let sourceDir = environmentSourceDir;
  let snapshotOnly = false;
  let verifyOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--source-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--source-dir requires a value");
      }
      sourceDir = value;
      index += 1;
      continue;
    }
    if (argument === "--snapshot-only") {
      snapshotOnly = true;
      continue;
    }
    if (argument === "--verify-only") {
      verifyOnly = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (snapshotOnly && verifyOnly) {
    throw new Error("--snapshot-only and --verify-only are mutually exclusive");
  }
  if (!sourceDir) {
    throw new Error("Provide --source-dir or SCHOOL_RECORD_SOURCE_DIR");
  }
  return { sourceDir, snapshotOnly, verifyOnly };
}

export function resolvePackageRoot(moduleUrl: string): string {
  const scriptDirectory = dirname(fileURLToPath(moduleUrl));
  const parentDirectory = dirname(scriptDirectory);
  return basename(parentDirectory) === ".ingest-dist"
    ? dirname(parentDirectory)
    : parentDirectory;
}

async function extractSource(verified: VerifiedSource): Promise<ExtractedDocument> {
  const bytes = new Uint8Array(await readFile(verified.inputPath));
  switch (verified.source.format) {
    case "pdf": {
      const { extractPdf } = await import("./ingest/pdf.ts");
      return extractPdf(verified.source.id, bytes);
    }
    case "text": {
      const { extractDirectiveText } = await import("./ingest/directive-text.ts");
      return extractDirectiveText(verified.source.id, bytes);
    }
    case "hwpml": {
      const { extractHwpml } = await import("./ingest/hwpml.ts");
      return extractHwpml(verified.source.id, bytes);
    }
    case "hwp5": {
      const appendix = Number.parseInt(verified.source.id.match(/APPENDIX-(\d+)$/)?.[1] ?? "", 10);
      if (![7, 8, 9, 10, 11].includes(appendix)) {
        throw new Error(`Cannot determine appendix number: ${verified.source.id}`);
      }
      const { extractHwp5 } = await import("./ingest/hwp5.ts");
      return extractHwp5(verified.source.id, appendix as 7 | 8 | 9 | 10 | 11, bytes);
    }
  }
}

export async function main(args: readonly string[]): Promise<void> {
  const options = parseCommandOptions(args);
  const packageRoot = resolvePackageRoot(import.meta.url);
  const manifestPath = join(packageRoot, "sources", "manifest.json");
  const { sourceManifestSchema } = await import("../src/source-types.ts");
  const sourceManifestBytes = await readFile(manifestPath);
  const sourceManifest = sourceManifestSchema.parse(
    JSON.parse(sourceManifestBytes.toString("utf8")),
  );
  const verifiedSources = await loadVerifiedSources(sourceManifest, options.sourceDir);

  if (options.snapshotOnly) {
    await snapshotVerifiedSources(verifiedSources, join(packageRoot, "sources", "original"));
    console.log(`${verifiedSources.length} sources verified and snapshotted`);
    return;
  }
  if (options.verifyOnly) {
    console.log(`${verifiedSources.length} sources verified`);
    return;
  }

  const extractedDocuments = await Promise.all(verifiedSources.map(extractSource));
  for (const extracted of extractedDocuments) {
    const source = sourceManifest.sources.find((candidate) => candidate.id === extracted.sourceId);
    if (!source) throw new Error(`Extraction has no source metadata: ${extracted.sourceId}`);
    if (extracted.extractedCharCount < source.minimumExtractedChars) {
      throw new Error(`Extracted text below minimum for ${source.id}`);
    }
  }

  const artifacts = buildCorpusArtifacts(sourceManifest, extractedDocuments, sourceManifestBytes);
  await writeCorpusArtifacts(join(packageRoot, "data", "corpus"), artifacts);
  console.log(`${artifacts.manifest.documentCount} documents and ${artifacts.manifest.chunkCount} chunks built`);
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (executedPath && pathToFileURL(executedPath).href === import.meta.url) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Corpus build failed");
    process.exitCode = 1;
  });
}
