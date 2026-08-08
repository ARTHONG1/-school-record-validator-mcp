import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BundleDataPath, BundleManifest } from "../src/data-types.ts";
import { sha256File } from "./ingest/hash.ts";
import { stableJson } from "./ingest/stable-json.ts";

export const BUNDLE_DATA_PATHS = [
  "sources/manifest.json",
  "data/corpus/documents.json",
  "data/corpus/chunks.jsonl",
  "data/corpus/corpus-manifest.json",
  "data/corpus/active-chunks.json",
  "data/evidence/verified-excerpts.json",
  "data/rules/kr-moe-school-record-elementary-2026.1.json",
] as const satisfies readonly BundleDataPath[];

function platformPath(root: string, relativePath: BundleDataPath): string {
  return join(root, ...relativePath.split("/"));
}

export async function buildBundleManifest(packageRoot: string): Promise<BundleManifest> {
  const root = resolve(packageRoot);
  const files = await Promise.all(
    [...BUNDLE_DATA_PATHS]
      .sort((left, right) => left.localeCompare(right, "en"))
      .map(async (path) => ({ path, sha256: await sha256File(platformPath(root, path)) })),
  );
  const content = files.map((file) => `${file.path}\0${file.sha256}\n`).join("");
  const bundleContentSha256 = createHash("sha256")
    .update(content, "utf8")
    .digest("hex")
    .toUpperCase();

  return {
    schemaVersion: 1,
    packId: "kr-moe-school-record-elementary-2026.1",
    files,
    bundleContentSha256,
  };
}

export async function sealDataBundle(packageRoot: string): Promise<BundleManifest> {
  const root = resolve(packageRoot);
  const manifest = await buildBundleManifest(root);
  const destination = join(root, "data", "bundle-manifest.json");
  const temporary = `${destination}.${process.pid}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(temporary, stableJson(manifest), "utf8");
  await rename(temporary, destination);
  return manifest;
}

async function main(): Promise<void> {
  await sealDataBundle(process.cwd());
}

export function isDirectExecution(argvPath: string | undefined, moduleUrl: string): boolean {
  return argvPath !== undefined && resolve(argvPath) === resolve(fileURLToPath(moduleUrl));
}

if (isDirectExecution(process.argv[1], import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Data sealing failed");
    process.exitCode = 1;
  });
}
