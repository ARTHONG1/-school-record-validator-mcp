import { Buffer } from "node:buffer";
import type { FieldSpec, LengthPolicy } from "./rule-types.ts";
import type { RuleMatch, TextMeasurement } from "./check-types.ts";

export interface LengthValidationResult {
  measurement: TextMeasurement;
  policy: LengthPolicy;
  matches: RuleMatch[];
}

export function measureText(input: string): TextMeasurement {
  const text = input.replace(/\r\n?/g, "\n");
  return {
    charCount: Array.from(text).length,
    byteCount: Buffer.byteLength(text, "utf8"),
  };
}

export function validateLength(field: FieldSpec, text: string): LengthValidationResult {
  const measurement = measureText(text);
  const policy = field.lengthPolicy;

  if (policy.kind === "system-range" || measurement.byteCount <= policy.maxBytes || !field.lengthRuleId) {
    return { measurement, policy, matches: [] };
  }

  return {
    measurement,
    policy,
    matches: [{ ruleId: field.lengthRuleId, outcome: "block" }],
  };
}
