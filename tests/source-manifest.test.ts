import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { sourceManifestSchema } from "../src/source-types.ts";

describe("source manifest", () => {
  it("contains exactly the eight active elementary sources", async () => {
    const raw = JSON.parse(await readFile("sources/manifest.json", "utf8"));
    const manifest = sourceManifestSchema.parse(raw);
    assert.equal(manifest.packId, "kr-moe-school-record-elementary-2026.1");
    assert.equal(manifest.sources.length, 8);
    assert.ok(manifest.sources.every((source) => source.schoolLevels.includes("elementary")));
    assert.equal(manifest.sources.some((source) => /중학교|고등학교/.test(source.fileName)), false);
  });

  it("stores no machine-specific absolute path", async () => {
    const text = await readFile("sources/manifest.json", "utf8");
    assert.equal(/[A-Z]:\\\\|C:\\Users|\/Users\//.test(text), false);
  });

  it("sets extraction regression floors close to the audited fixed-source measurements", async () => {
    const raw = JSON.parse(await readFile("sources/manifest.json", "utf8"));
    const manifest = sourceManifestSchema.parse(raw);
    const minimums = Object.fromEntries(
      manifest.sources.map((source) => [source.id, source.minimumExtractedChars]),
    );

    assert.deepEqual(minimums, {
      "MOE-GUIDE-ELEMENTARY-2026": 100_000,
      "MOE-DIRECTIVE-555-TEXT": 10_000,
      "MOE-DIRECTIVE-555-HWPML": 18_000,
      "MOE-DIRECTIVE-555-APPENDIX-7": 1_400,
      "MOE-DIRECTIVE-555-APPENDIX-8": 3_500,
      "MOE-DIRECTIVE-555-APPENDIX-9": 9_500,
      "MOE-DIRECTIVE-555-APPENDIX-10": 900,
      "MOE-DIRECTIVE-555-APPENDIX-11": 1_000,
    });
  });
});
