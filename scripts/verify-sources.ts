import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sourceManifestSchema } from "../src/source-types.ts";
import { loadVerifiedSources, snapshotVerifiedSources } from "./ingest/source-loader.ts";

interface CommandOptions {
  sourceDir: string;
  snapshot: boolean;
}

export async function main(args: readonly string[]): Promise<void> {
  const options = parseOptions(args);
  const manifest = sourceManifestSchema.parse(
    JSON.parse(await readFile(resolve("sources", "manifest.json"), "utf8")),
  );
  const verified = await loadVerifiedSources(manifest, options.sourceDir);

  if (options.snapshot) {
    await snapshotVerifiedSources(verified, resolve("sources", "original"));
  }

  for (const source of verified) {
    console.log(`${source.source.id}: ${source.actualSha256} (${source.sizeBytes} bytes)`);
  }
  console.log(`${verified.length} sources verified`);
}

function parseOptions(args: readonly string[]): CommandOptions {
  let sourceDir = process.env.SCHOOL_RECORD_SOURCE_DIR;
  let snapshot = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--snapshot") {
      snapshot = true;
      continue;
    }
    if (argument === "--source-dir") {
      sourceDir = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!sourceDir) {
    throw new Error("Provide --source-dir or SCHOOL_RECORD_SOURCE_DIR");
  }
  return { sourceDir, snapshot };
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Source verification failed");
  process.exitCode = 1;
});
