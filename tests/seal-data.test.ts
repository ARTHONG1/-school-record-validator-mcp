import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import {
  BUNDLE_DATA_PATHS,
  buildBundleManifest,
  isDirectExecution,
  sealDataBundle,
} from "../scripts/seal-data.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

async function createPackageRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "record-seal-"));
  for (const [index, path] of BUNDLE_DATA_PATHS.entries()) {
    const target = join(root, ...path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `fixture-${index}\n`, "utf8");
  }
  return root;
}

describe("data bundle sealing", () => {
  it("hashes exactly seven files in path order and derives the content hash", async () => {
    const root = await createPackageRoot();

    const manifest = await buildBundleManifest(root);

    assert.deepEqual(manifest.files.map((file) => file.path), [...BUNDLE_DATA_PATHS].sort());
    assert.equal(manifest.files.length, 7);
    const content = manifest.files
      .map((file) => `${file.path}\0${file.sha256}\n`)
      .join("");
    assert.equal(manifest.bundleContentSha256, sha256(content));
    assert.ok(manifest.files.every((file) => /^[A-F0-9]{64}$/.test(file.sha256)));
  });

  it("writes deterministic stable JSON to data/bundle-manifest.json", async () => {
    const root = await createPackageRoot();

    await sealDataBundle(root);
    const first = await readFile(join(root, "data", "bundle-manifest.json"), "utf8");
    await sealDataBundle(root);
    const second = await readFile(join(root, "data", "bundle-manifest.json"), "utf8");

    assert.equal(first, second);
    assert.equal(first.endsWith("\n"), true);
    assert.equal(JSON.parse(first).packId, "kr-moe-school-record-elementary-2026.1");
  });

  it("compares CLI paths through file URL conversion on Windows-compatible paths", () => {
    const scriptPath = join(process.cwd(), "scripts", "seal-data.ts");

    assert.equal(isDirectExecution(scriptPath, pathToFileURL(scriptPath).href), true);
    assert.equal(isDirectExecution(join(process.cwd(), "scripts", "other.ts"), pathToFileURL(scriptPath).href), false);
  });
});
