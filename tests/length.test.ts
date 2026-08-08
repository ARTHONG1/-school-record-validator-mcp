import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FieldSpec } from "../src/rule-types.ts";
import { measureText, validateLength } from "../src/length.ts";

function field(overrides: Partial<FieldSpec> = {}): FieldSpec {
  return {
    key: "attendance_special",
    label: "Attendance special note",
    lengthPolicy: { kind: "fixed-bytes", displayKoreanChars: 500, maxBytes: 1500, scope: "field" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "none",
    lengthRuleId: "LENGTH-ATTENDANCE-SPECIAL",
    evidenceIds: ["EV-GUIDE-150-LIMITS"],
    ...overrides,
  };
}

describe("text length validation", () => {
  it("does not invent a fixed limit for behavior opinion", () => {
    const result = validateLength(
      field({
        key: "behavior_opinion",
        lengthPolicy: { kind: "system-range" },
        lengthRuleId: undefined,
      }),
      "가".repeat(5000),
    );

    assert.equal(result.policy.kind, "system-range");
    assert.deepEqual(result.matches, []);
  });

  it("blocks an attendance note over 1500 bytes", () => {
    const result = validateLength(field(), "가".repeat(501));

    assert.equal(result.measurement.byteCount, 1503);
    assert.deepEqual(result.matches, [{ ruleId: "LENGTH-ATTENDANCE-SPECIAL", outcome: "block" }]);
  });

  it("counts a CRLF as one NEIS Enter byte", () => {
    assert.deepEqual(measureText("가\r\nA"), { charCount: 3, byteCount: 5 });
  });

  it("uses the 60-byte name limit for mixed characters without an extra character cap", () => {
    const result = validateLength(
      field({
        key: "student_name",
        lengthPolicy: {
          kind: "conditional-name",
          displayKoreanChars: 20,
          displayLatinChars: 60,
          maxBytes: 60,
        },
        lengthRuleId: "LENGTH-STUDENT-NAME",
      }),
      `${"가".repeat(19)}abc`,
    );

    assert.equal(result.measurement.byteCount, 60);
    assert.deepEqual(result.matches, []);
  });
});
