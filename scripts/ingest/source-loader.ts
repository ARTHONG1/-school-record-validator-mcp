import { copyFile, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import type { SourceDocument, SourceManifest } from "../../src/source-types.ts";
import { sha256File } from "./hash.ts";

export interface VerifiedSource {
  source: SourceDocument;
  inputPath: string;
  actualSha256: string;
  sizeBytes: number;
}

export interface VerifyOneSourceInput {
  path: string;
  expectedSha256: string;
}

export function resolveInputPath(sourceDir: string, relativePath: string): string {
  const root = resolve(sourceDir);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error("Source path escapes source directory");
  }
  return target;
}

export async function verifyOneSource(
  input: VerifyOneSourceInput,
): Promise<{ actualSha256: string; sizeBytes: number }> {
  const actualSha256 = await sha256File(input.path);
  if (actualSha256 !== input.expectedSha256) {
    throw new Error(
      `Source hash mismatch: expected ${input.expectedSha256}, actual ${actualSha256}`,
    );
  }

  const metadata = await stat(input.path);
  return { actualSha256, sizeBytes: metadata.size };
}

export async function loadVerifiedSources(
  manifest: SourceManifest,
  sourceDir: string,
): Promise<VerifiedSource[]> {
  return Promise.all(
    manifest.sources.map(async (source) => {
      const inputPath = resolveInputPath(sourceDir, source.relativeInputPath);
      try {
        const verification = await verifyOneSource({
          path: inputPath,
          expectedSha256: source.sha256,
        });
        return { source, inputPath, ...verification };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Source hash mismatch:")) {
          throw new Error(`Source ${source.id}: ${error.message}`);
        }
        throw error;
      }
    }),
  );
}

export async function snapshotVerifiedSources(
  sources: readonly VerifiedSource[],
  snapshotDirectory: string,
): Promise<void> {
  await mkdir(snapshotDirectory, { recursive: true });

  const pending = [] as VerifiedSource[];
  for (const verified of sources) {
    const destination = join(snapshotDirectory, verified.source.snapshotName);
    try {
      const existingHash = await sha256File(destination);
      if (existingHash === verified.actualSha256) {
        continue;
      }
      throw new Error(
        `Immutable snapshot collision: ${verified.source.id}, expected ${verified.actualSha256}, actual ${existingHash}`,
      );
    } catch (error) {
      if (isMissingFile(error)) {
        pending.push(verified);
        continue;
      }
      throw error;
    }
  }

  if (pending.length === 0) {
    return;
  }

  const temporaryDirectory = await mkdtemp(join(snapshotDirectory, ".snapshot-"));
  try {
    for (const verified of pending) {
      const temporaryPath = join(temporaryDirectory, verified.source.snapshotName);
      await copyFile(verified.inputPath, temporaryPath);
      const copiedHash = await sha256File(temporaryPath);
      if (copiedHash !== verified.actualSha256) {
        throw new Error(
          `Source ${verified.source.id}: Source hash mismatch: expected ${verified.actualSha256}, actual ${copiedHash}`,
        );
      }
    }

    for (const verified of pending) {
      const destination = join(snapshotDirectory, verified.source.snapshotName);
      try {
        await stat(destination);
      } catch (error) {
        if (isMissingFile(error)) {
          await rename(
            join(temporaryDirectory, basename(verified.source.snapshotName)),
            destination,
          );
          continue;
        }
        throw error;
      }
      const existingHash = await sha256File(destination);
      throw new Error(
        `Immutable snapshot collision: ${verified.source.id}, expected ${verified.actualSha256}, actual ${existingHash}`,
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
