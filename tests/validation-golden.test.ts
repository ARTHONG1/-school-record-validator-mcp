import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type { ValidationInput } from "../src/validator-types.ts";
import { createValidator } from "../src/validator.ts";
import { buildTestBundle } from "./helpers/validator-fixture.ts";

interface GoldenCase {
  name: string;
  input: ValidationInput;
  repeatText?: number;
  expectedStatus: "pass" | "review" | "blocked";
  expectedRuleIds: string[];
  unexpectedRuleIds: string[];
}

const cases = JSON.parse(
  await readFile(new URL("./fixtures/validation-cases.json", import.meta.url), "utf8"),
) as GoldenCase[];

const allowedStudentMaterials = [
  "peer_evaluation",
  "self_evaluation",
  "class_output",
  "reflection",
  "book_report",
] as const;

function materializeInput(testCase: GoldenCase): ValidationInput {
  return {
    ...testCase.input,
    text: testCase.repeatText
      ? testCase.input.text.repeat(testCase.repeatText)
      : testCase.input.text,
  };
}

describe("2026 elementary validation golden cases", () => {
  it("contains exactly the 20 audited categories", () => {
    assert.equal(cases.length, 20);
    assert.equal(new Set(cases.map((testCase) => testCase.name)).size, 20);
    for (const testCase of cases) {
      assert.ok(testCase.name.length > 0);
      assert.ok(testCase.input);
      assert.ok(Array.isArray(testCase.expectedRuleIds));
      assert.ok(Array.isArray(testCase.unexpectedRuleIds));
    }
  });

  for (const testCase of cases) {
    it(testCase.name, () => {
      const validator = createValidator(buildTestBundle());
      const input = materializeInput(testCase);
      const variants = testCase.name === "허용 학생 자료 5종"
        ? allowedStudentMaterials.map((studentMaterial) => ({
            ...input,
            provenance: { ...input.provenance, studentMaterial },
          }))
        : [input];

      for (const variant of variants) {
        const result = validator.validate(variant);
        const ruleIds = result.findings.map((finding) => finding.ruleId);

        assert.equal(result.status, testCase.expectedStatus);
        assert.deepEqual(ruleIds, testCase.expectedRuleIds);
        for (const unexpectedRuleId of testCase.unexpectedRuleIds) {
          assert.equal(ruleIds.includes(unexpectedRuleId), false);
        }
        for (const finding of result.findings) {
          if (finding.authorityClass === "official-policy") {
            assert.ok(finding.evidence.length > 0);
          } else {
            assert.deepEqual(finding.evidence, []);
            assert.equal(finding.localPolicyId, "LOCAL-EDITORIAL-POLICY");
          }
        }
      }
    });
  }
});
