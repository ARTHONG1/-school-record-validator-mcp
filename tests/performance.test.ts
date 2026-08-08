import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { describe, it } from "node:test";
import type { EvidenceChunk } from "../src/corpus-types.ts";
import type { DataBundle } from "../src/data-types.ts";
import type { PhraseRule } from "../src/rule-types.ts";
import { createGuidanceSearch } from "../src/search.ts";
import { createValidator } from "../src/validator.ts";
import { buildTestBundle, completeObservation } from "./helpers/validator-fixture.ts";
import { hasRuntimeLoaderDependency } from "./helpers/security-fixture.ts";

const HARD_LIMITS_MS = {
  coldDataLoad: 3_000,
  validateTenThousandCharacters: 300,
  validateHundredEntryBatch: 6_000,
  searchFullCorpus: 600,
  eachRegex: 50,
} as const;

const loaderAvailable = await hasRuntimeLoaderDependency();
const dependencySkip = loaderAvailable ? false : "zod is not installed; production bundle performance requires npm install";

function elapsed(run: () => unknown): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

async function elapsedAsync(run: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await run();
  return performance.now() - started;
}

function corpusSizedBundle(chunkCount: number): DataBundle {
  const bundle = buildTestBundle();
  const seeds = bundle.activeChunks;
  const activeChunks: EvidenceChunk[] = Array.from({ length: chunkCount }, (_, index) => {
    const seed = seeds[index % seeds.length] as EvidenceChunk;
    const text = `${seed.text} corpus fixture ${index}`;
    return {
      ...seed,
      id: `${seed.id}:stress-${index}`,
      text,
      searchText: text.toLocaleLowerCase("ko-KR"),
    };
  });
  return { ...bundle, activeChunks };
}

function regexRules(value: unknown): Array<{ ruleId: string; pattern: string }> {
  assert.ok(value !== null && typeof value === "object" && "rules" in value);
  assert.ok(Array.isArray(value.rules));
  const patterns: Array<{ ruleId: string; pattern: string }> = [];
  for (const candidate of value.rules) {
    const rule = candidate as Partial<PhraseRule>;
    if (rule.detector?.type !== "regex-any" || !Array.isArray(rule.detector.patterns)) continue;
    for (const pattern of rule.detector.patterns) {
      patterns.push({ ruleId: String(rule.id), pattern });
    }
  }
  return patterns;
}

function hasForbiddenRegexFeature(pattern: string): boolean {
  if (pattern.includes("(?<=") || pattern.includes("(?<!")) return true;
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== "\\") continue;
    let end = index;
    while (pattern[end] === "\\") end += 1;
    if ((end - index) % 2 === 1) {
      const next = pattern[end];
      if (next !== undefined && /^[1-9]$/u.test(next)) return true;
      if (next === "k" && pattern[end + 1] === "<") return true;
    }
    index = end - 1;
  }
  return false;
}

describe("runtime security and performance budgets", () => {
  it("validates a 10,000-character record within the 3x hard limit", () => {
    const validator = createValidator(buildTestBundle());
    const duration = elapsed(() => validator.validate({
      field: "behavior_opinion",
      text: "가".repeat(10_000),
      provenance: completeObservation(),
    }));

    assert.ok(
      duration <= HARD_LIMITS_MS.validateTenThousandCharacters,
      `10,000-character validation took ${duration.toFixed(2)}ms`,
    );
  });

  it("validates a 100-entry batch within the 3x hard limit", () => {
    const validator = createValidator(buildTestBundle());
    const entries = Array.from({ length: 100 }, (_, index) => ({
      entryId: `performance-${index}`,
      field: "behavior_opinion" as const,
      text: "협력적인 태도를 관찰함. ".repeat(400),
      provenance: completeObservation(),
    }));
    const duration = elapsed(() => validator.validateBatch(entries));

    assert.ok(
      duration <= HARD_LIMITS_MS.validateHundredEntryBatch,
      `100-entry batch validation took ${duration.toFixed(2)}ms`,
    );
  });

  it("keeps every bundled regex safe and below 50ms on a 20,000-character adversarial string", async () => {
    const pack = JSON.parse(
      await readFile(new URL("../data/rules/kr-moe-school-record-elementary-2026.1.json", import.meta.url), "utf8"),
    ) as unknown;
    const rules = regexRules(pack);
    assert.ok(rules.length > 0, "the production rule pack must contain regex rules");
    const adversarialInputs = ["가".repeat(20_000), "대회".repeat(10_000)];

    for (const { ruleId, pattern } of rules) {
      assert.equal(hasForbiddenRegexFeature(pattern), false, `${ruleId} contains a forbidden regex feature`);
      const expression = new RegExp(pattern, "giu");
      for (const input of adversarialInputs) {
        const duration = elapsed(() => {
          expression.lastIndex = 0;
          for (const match of input.matchAll(expression)) {
            assert.notEqual(match[0], "", `${ruleId} must not match an empty string`);
          }
        });
        assert.ok(duration <= HARD_LIMITS_MS.eachRegex, `${ruleId} regex took ${duration.toFixed(2)}ms`);
      }
    }
  });

  it("searches an entire 2,000-chunk corpus fixture within the 3x hard limit", () => {
    const search = createGuidanceSearch(corpusSizedBundle(2_000));
    let resultCount = 0;
    const duration = elapsed(() => {
      resultCount = search.searchGuidance("인쇄", { limit: 20 }).length;
    });

    assert.equal(resultCount, 20);
    assert.ok(duration <= HARD_LIMITS_MS.searchFullCorpus, `full-corpus search took ${duration.toFixed(2)}ms`);
  });

  it("cold-loads the production data bundle within the 3x hard limit", { skip: dependencySkip }, async () => {
    const moduleUrl = new URL("../src/data-loader.ts", import.meta.url);
    moduleUrl.searchParams.set("cold", `${Date.now()}-${Math.random()}`);
    const duration = await elapsedAsync(async () => {
      const { loadDataBundle } = await import(moduleUrl.href);
      await loadDataBundle();
    });

    assert.ok(duration <= HARD_LIMITS_MS.coldDataLoad, `cold data load took ${duration.toFixed(2)}ms`);
  });

  it("searches the complete production corpus within the 3x hard limit", { skip: dependencySkip }, async () => {
    const { loadDataBundle } = await import("../src/data-loader.ts");
    const bundle = await loadDataBundle();
    const search = createGuidanceSearch(bundle);
    let resultCount = 0;
    const duration = elapsed(() => {
      resultCount = search.searchGuidance("학생", { limit: 20 }).length;
    });

    assert.ok(bundle.activeChunks.length > 0, "production corpus must contain active chunks");
    assert.ok(resultCount > 0, "production corpus search must return a result");
    assert.ok(duration <= HARD_LIMITS_MS.searchFullCorpus, `production corpus search took ${duration.toFixed(2)}ms`);
  });
});
