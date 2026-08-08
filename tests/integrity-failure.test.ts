import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { basename } from "node:path";
import { describe, it, type TestContext } from "node:test";
import {
  BUNDLE_MANIFEST_PATH,
  CHUNKS_PATH,
  EVIDENCE_PATH,
  RULE_PACK_PATH,
  createSealedSecurityFixture,
  hasRuntimeLoaderDependency,
  mutateFixtureJson,
  mutateFixtureJsonLines,
  sealFixtureBundle,
  sha256,
} from "./helpers/security-fixture.ts";

const loaderAvailable = await hasRuntimeLoaderDependency();
const dependencySkip = loaderAvailable ? false : "zod is not installed; runtime integrity tests require npm install";

async function loadFixture(root: string): Promise<unknown> {
  const { loadDataBundle } = await import("../src/data-loader.ts");
  return loadDataBundle(root);
}

async function fixtureRoot(context: TestContext): Promise<string> {
  const root = await createSealedSecurityFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function expectIntegrityFailure(
  root: string,
  expectedPath: string,
  secret?: string,
): Promise<void> {
  await assert.rejects(
    loadFixture(root),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^Data integrity check failed: /u);
      assert.ok(
        error.message.includes(expectedPath) || error.message.includes(basename(expectedPath)),
        `integrity error must identify ${expectedPath}`,
      );
      if (secret) assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
}

describe("sealed runtime data integrity", () => {
  it("rejects a tampered bundle manifest", { skip: dependencySkip }, async (context) => {
    const root = await fixtureRoot(context);
    await mutateFixtureJson(root, BUNDLE_MANIFEST_PATH, (manifest) => {
      manifest.bundleContentSha256 = `${manifest.bundleContentSha256[0] === "A" ? "B" : "A"}${manifest.bundleContentSha256.slice(1)}`;
    });

    await expectIntegrityFailure(root, BUNDLE_MANIFEST_PATH);
  });

  it("rejects changed corpus text even when the outer bundle is resealed", { skip: dependencySkip }, async (context) => {
    const root = await fixtureRoot(context);
    const secret = "UNIQUE-TAMPERED-CORPUS-TEXT-2026";
    await mutateFixtureJsonLines(root, CHUNKS_PATH, (chunks) => {
      chunks[0].text += secret;
    });
    await sealFixtureBundle(root);

    await expectIntegrityFailure(root, CHUNKS_PATH, secret);
  });

  it("rejects a changed rule pack without leaking rule content", { skip: dependencySkip }, async (context) => {
    const root = await fixtureRoot(context);
    const secret = "UNIQUE-TAMPERED-RULE-CONTENT-2026";
    await mutateFixtureJson(root, RULE_PACK_PATH, (pack) => {
      pack.rules[0].message += secret;
    });

    await expectIntegrityFailure(root, RULE_PACK_PATH, secret);
  });

  it("rejects a resealed verified quote that is absent from its active chunk", { skip: dependencySkip }, async (context) => {
    const root = await fixtureRoot(context);
    const secret = "UNIQUE-PRIVATE-VERIFIED-QUOTE-2026";
    await mutateFixtureJson(root, EVIDENCE_PATH, (evidence) => {
      evidence[0].quote = secret;
      evidence[0].quoteSha256 = sha256(secret);
    });
    await sealFixtureBundle(root);

    await expectIntegrityFailure(root, EVIDENCE_PATH, secret);
  });

  for (const [label, pattern] of [
    ["backreference", "(금지)\\1"],
    ["named backreference", "(?<word>금지)\\k<word>"],
    ["positive lookbehind", "(?<=금지)문구"],
    ["negative lookbehind", "(?<!허용)문구"],
  ] as const) {
    it(`rejects a resealed rule containing ${label}`, { skip: dependencySkip }, async (context) => {
      const root = await fixtureRoot(context);
      await mutateFixtureJson(root, RULE_PACK_PATH, (pack) => {
        const rule = pack.rules.find((item: Record<string, any>) => item.id === "OFFICIAL-SECURITY-FIXTURE-REGEX");
        rule.detector.patterns = [pattern];
      });
      await sealFixtureBundle(root);

      await expectIntegrityFailure(root, RULE_PACK_PATH, pattern);
    });
  }
});
