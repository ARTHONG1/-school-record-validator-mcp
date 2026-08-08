import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import {
  buildCorpusArtifacts,
  parseCommandOptions,
  resolvePackageRoot,
  writeCorpusArtifacts,
} from "../scripts/build-corpus.ts";
import type { ExtractedDocument } from "../scripts/ingest/types.ts";
import type { SourceDocument, SourceManifest } from "../src/source-types.ts";

function source(overrides: Partial<SourceDocument>): SourceDocument {
  return {
    id: "MOE-GUIDE-Z",
    title: "Z guide",
    role: "primary-guide",
    format: "pdf",
    authority: 80,
    schoolLevels: ["elementary"],
    academicYear: 2026,
    effectiveFrom: "2026-03-01",
    fileName: "z.pdf",
    relativeInputPath: "z.pdf",
    snapshotName: "z.pdf",
    sha256: "A".repeat(64),
    minimumExtractedChars: 1,
    ...overrides,
  };
}

const guideZ = source({});
const guideA = source({
  id: "MOE-GUIDE-A",
  title: "A guide",
  fileName: "a.pdf",
  relativeInputPath: "a.pdf",
  snapshotName: "a.pdf",
  sha256: "B".repeat(64),
  sourceUrl: "https://example.test/a",
});
const verificationCopy = source({
  id: "MOE-DIRECTIVE-VERIFICATION",
  title: "Directive verification copy",
  role: "verification-copy",
  format: "hwpml",
  authority: 100,
  schoolLevels: ["elementary", "middle", "high"],
  fileName: "directive.hwp",
  relativeInputPath: "directive.hwp",
  snapshotName: "directive.hwpml",
  sha256: "C".repeat(64),
});

const manifest: SourceManifest = {
  schemaVersion: 1,
  packId: "kr-moe-school-record-elementary-2026.1",
  sources: [guideZ, verificationCopy, guideA],
};

const extracted: ExtractedDocument[] = [
  {
    sourceId: verificationCopy.id,
    extractedCharCount: 18,
    units: [{
      locator: { kind: "article", article: "문단 1" },
      headingPath: [],
      rawText: "검증 사본에만 있는 문구",
    }],
  },
  {
    sourceId: guideA.id,
    extractedCharCount: 7,
    units: [{
      locator: { kind: "pdf-page", pdfPage: 2 },
      headingPath: ["A heading"],
      rawText: " A\r\n본문 ",
    }],
  },
  {
    sourceId: guideZ.id,
    extractedCharCount: 4,
    units: [{
      locator: { kind: "pdf-page", pdfPage: 1 },
      headingPath: ["Z heading"],
      rawText: "Z 본문",
    }],
  },
];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

describe("corpus build orchestration", () => {
  it("builds byte-identical artifacts in source-id order and excludes verification chunks", () => {
    const first = buildCorpusArtifacts(manifest, extracted);
    const second = buildCorpusArtifacts(
      { ...manifest, sources: [...manifest.sources].reverse() },
      [...extracted].reverse(),
    );

    assert.deepEqual(second, first);
    assert.deepEqual(first.documents.map((document) => document.sourceId), [
      "MOE-DIRECTIVE-VERIFICATION",
      "MOE-GUIDE-A",
      "MOE-GUIDE-Z",
    ]);
    assert.deepEqual(first.chunks.map((chunk) => chunk.sourceId), [
      "MOE-GUIDE-A",
      "MOE-GUIDE-Z",
    ]);
    assert.equal(first.documents[0]?.includedInChunks, false);
    assert.equal(first.documents[0]?.unitCount, 1);
    assert.equal(first.documents[0]?.extractedCharCount, 18);
    assert.equal(first.documents[1]?.sourceUrl, "https://example.test/a");
    assert.equal(first.chunksJsonl.includes("검증 사본에만 있는 문구"), false);
  });

  it("records counts and uppercase SHA-256 values for the serialized bytes", () => {
    const sourceManifestJson = `${JSON.stringify(manifest)}\n`;
    const artifacts = buildCorpusArtifacts(manifest, extracted, sourceManifestJson);
    const parsedManifest = JSON.parse(artifacts.corpusManifestJson) as Record<string, unknown>;

    assert.equal(artifacts.documentsJson.endsWith("\n"), true);
    assert.equal(artifacts.chunksJsonl.endsWith("\n"), true);
    assert.equal(artifacts.corpusManifestJson.endsWith("\n"), true);
    assert.equal(artifacts.manifest.documentCount, 3);
    assert.equal(artifacts.manifest.chunkCount, 2);
    assert.equal(artifacts.manifest.documentsSha256, sha256(artifacts.documentsJson));
    assert.equal(artifacts.manifest.chunksSha256, sha256(artifacts.chunksJsonl));
    assert.equal(artifacts.hashes.documentsSha256, sha256(artifacts.documentsJson));
    assert.equal(artifacts.hashes.chunksSha256, sha256(artifacts.chunksJsonl));
    assert.equal(artifacts.hashes.corpusManifestSha256, sha256(artifacts.corpusManifestJson));
    assert.equal(artifacts.manifest.sourceManifestSha256, sha256(sourceManifestJson));
    assert.deepEqual(parsedManifest, artifacts.manifest);
  });

  it("rejects duplicate chunk IDs before writing corpus artifacts", () => {
    const duplicatePages: ExtractedDocument[] = [
      {
        sourceId: guideA.id,
        extractedCharCount: 13,
        units: [
          {
            locator: { kind: "pdf-page", pdfPage: 2 },
            headingPath: ["first"],
            rawText: "first page",
          },
          {
            locator: { kind: "pdf-page", pdfPage: 2 },
            headingPath: ["duplicate"],
            rawText: "duplicate page",
          },
        ],
      },
      extracted[0],
      extracted[2],
    ];

    assert.throws(
      () => buildCorpusArtifacts(manifest, duplicatePages),
      /Duplicate chunk ID: MOE-GUIDE-A:pdf-002/u,
    );
  });

  it("atomically replaces the three artifacts under the caller output root", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "record-corpus-build-"));
    const outputRoot = join(temporaryRoot, "nested", "corpus");
    await mkdir(outputRoot, { recursive: true });
    await writeFile(join(outputRoot, "keep.txt"), "keep", "utf8");
    await writeFile(join(outputRoot, "documents.json"), "old", "utf8");

    const artifacts = buildCorpusArtifacts(manifest, extracted);
    await writeCorpusArtifacts(outputRoot, artifacts);

    assert.equal(await readFile(join(outputRoot, "documents.json"), "utf8"), artifacts.documentsJson);
    assert.equal(await readFile(join(outputRoot, "chunks.jsonl"), "utf8"), artifacts.chunksJsonl);
    assert.equal(
      await readFile(join(outputRoot, "corpus-manifest.json"), "utf8"),
      artifacts.corpusManifestJson,
    );
    assert.equal(await readFile(join(outputRoot, "keep.txt"), "utf8"), "keep");
    assert.deepEqual((await readdir(outputRoot)).sort(), [
      "chunks.jsonl",
      "corpus-manifest.json",
      "documents.json",
      "keep.txt",
    ]);
  });

  it("parses source, snapshot-only, and verify-only options without ambiguous modes", () => {
    assert.deepEqual(parseCommandOptions(["--source-dir", "C:\\official", "--snapshot-only"]), {
      sourceDir: "C:\\official",
      snapshotOnly: true,
      verifyOnly: false,
    });
    assert.deepEqual(parseCommandOptions(["--verify-only"], "D:\\official"), {
      sourceDir: "D:\\official",
      snapshotOnly: false,
      verifyOnly: true,
    });
    assert.throws(
      () => parseCommandOptions(["--snapshot-only", "--verify-only"], "D:\\official"),
      /mutually exclusive/,
    );
    assert.throws(() => parseCommandOptions(["--source-dir"]), /requires a value/);
    assert.throws(() => parseCommandOptions([]), /Provide --source-dir/);
  });

  it("resolves the same package root from source and compiled script locations", () => {
    const packageRoot = join(tmpdir(), "school-record-validator-mcp-root");

    assert.equal(
      resolvePackageRoot(pathToFileURL(join(packageRoot, "scripts", "build-corpus.ts")).href),
      packageRoot,
    );
    assert.equal(
      resolvePackageRoot(
        pathToFileURL(join(packageRoot, ".ingest-dist", "scripts", "build-corpus.js")).href,
      ),
      packageRoot,
    );
  });
});
