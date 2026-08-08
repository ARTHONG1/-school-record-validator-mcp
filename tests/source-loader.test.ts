import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SourceDocument, SourceManifest } from "../src/source-types.ts";
import { sha256File } from "../scripts/ingest/hash.ts";
import {
  loadVerifiedSources,
  resolveInputPath,
  snapshotVerifiedSources,
  verifyOneSource,
} from "../scripts/ingest/source-loader.ts";

function source(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "TEST-SOURCE",
    title: "Test source",
    role: "directive-body",
    format: "text",
    authority: 100,
    schoolLevels: ["elementary"],
    academicYear: 2026,
    effectiveFrom: "2026-03-01",
    fileName: "source.txt",
    relativeInputPath: "source.txt",
    snapshotName: "source.txt",
    sha256: "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD",
    minimumExtractedChars: 1,
    ...overrides,
  };
}

describe("source verification", () => {
  it("returns the uppercase SHA-256", async () => {
    const dir = await mkdtemp(join(tmpdir(), "record-source-"));
    const file = join(dir, "sample.txt");
    await writeFile(file, "abc", "utf8");

    assert.equal(
      await sha256File(file),
      "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD",
    );
  });

  it("rejects a changed official file before extraction", async () => {
    const dir = await mkdtemp(join(tmpdir(), "record-source-changed-"));
    const file = join(dir, "changed.txt");
    await writeFile(file, "changed", "utf8");

    await assert.rejects(
      () => verifyOneSource({ path: file, expectedSha256: "0".repeat(64) }),
      /Source hash mismatch/,
    );
  });

  it("rejects relative paths that escape the caller-provided source directory", () => {
    assert.throws(
      () => resolveInputPath(join(tmpdir(), "record-source-root"), "..\\outside.txt"),
      /Source path escapes source directory/,
    );
  });

  it("loads each verified source with its path, hash, and byte size", async () => {
    const dir = await mkdtemp(join(tmpdir(), "record-source-load-"));
    await writeFile(join(dir, "source.txt"), "abc", "utf8");
    const manifest: SourceManifest = {
      schemaVersion: 1,
      packId: "kr-moe-school-record-elementary-2026.1",
      sources: [source()],
    };

    const [verified] = await loadVerifiedSources(manifest, dir);

    assert.deepEqual(verified, {
      source: manifest.sources[0],
      inputPath: join(dir, "source.txt"),
      actualSha256: "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD",
      sizeBytes: 3,
    });
  });

  it("does not replace a conflicting immutable snapshot", async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), "record-source-snapshot-"));
    const snapshotDir = join(sourceDir, "snapshots");
    const inputPath = join(sourceDir, "source.txt");
    await writeFile(inputPath, "abc", "utf8");
    await mkdir(snapshotDir);
    await writeFile(join(snapshotDir, "source.txt"), "different", "utf8");
    const document = source();

    await assert.rejects(
      () =>
        snapshotVerifiedSources(
          [
            {
              source: document,
              inputPath,
              actualSha256: document.sha256,
              sizeBytes: 3,
            },
          ],
          snapshotDir,
        ),
      /Immutable snapshot collision/,
    );

    assert.equal(await readFile(join(snapshotDir, "source.txt"), "utf8"), "different");
  });
});
