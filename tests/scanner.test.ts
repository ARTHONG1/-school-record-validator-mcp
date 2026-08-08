import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FieldSpec, PhraseRule } from "../src/rule-types.ts";
import { scanPhraseRules } from "../src/scanner.ts";

const behaviorField = {
  key: "behavior_opinion",
  label: "Behavior opinion",
  lengthPolicy: { kind: "system-range" },
  applicableTo: "all-elementary",
  contentRuleMode: "global-prohibitions",
  provenanceMode: "teacher-observation",
  evidenceIds: ["EV-GUIDE-102-BEHAVIOR"],
} as FieldSpec;

const nameField = {
  ...behaviorField,
  key: "student_name",
  contentRuleMode: "none",
  provenanceMode: "none",
} as FieldSpec;

const rules = [
  {
    id: "OFFICIAL-LANGUAGE-TEST",
    title: "Language test",
    authorityClass: "official-policy",
    profile: "official",
    appliesTo: ["behavior_opinion"],
    message: "Do not record official language tests.",
    recommendation: "Remove the test result.",
    exceptions: [],
    outcome: "block",
    evidenceIds: ["EV-GUIDE-18-PROHIBITIONS"],
    detector: { type: "literal-any", patterns: ["TOEIC"], caseInsensitive: true },
  },
  {
    id: "EDITORIAL-ABSOLUTE",
    title: "Absolute claim",
    authorityClass: "editorial-caution",
    profile: "official_plus_editorial",
    appliesTo: ["behavior_opinion"],
    message: "Avoid unsupported absolute claims.",
    recommendation: "Use observed evidence.",
    exceptions: [],
    outcome: "review",
    localPolicyId: "LOCAL-EDITORIAL-POLICY",
    detector: { type: "literal-any", patterns: ["항상", "완벽하게"] },
  },
  {
    id: "OFFICIAL-QUALIFICATION",
    title: "Qualification",
    authorityClass: "official-policy",
    profile: "official",
    appliesTo: ["behavior_opinion"],
    message: "Do not record qualifications.",
    recommendation: "Remove the qualification result.",
    exceptions: [],
    outcome: "block",
    evidenceIds: ["EV-GUIDE-19-NARRATIVE-AUTHORITY"],
    detector: { type: "regex-any", patterns: ["자격증\\s*(?:취득|합격)"], caseInsensitive: false },
  },
] as PhraseRule[];

describe("phrase rule scanning", () => {
  it("blocks an explicitly named official language test", () => {
    const findings = scanPhraseRules("TOEIC 시험에서 900점을 취득함", rules, "official", behaviorField);

    assert.deepEqual(findings, [
      {
        ruleId: "OFFICIAL-LANGUAGE-TEST",
        outcome: "block",
        matchedText: "TOEIC",
        start: 0,
        end: 5,
      },
    ]);
  });

  it("does not run editorial cautions in official mode", () => {
    assert.deepEqual(scanPhraseRules("항상 완벽하게 수행함", rules, "official", behaviorField), []);
    assert.equal(
      scanPhraseRules("항상 완벽하게 수행함", rules, "official_plus_editorial", behaviorField).length,
      2,
    );
  });

  it("runs official rules in both profiles", () => {
    for (const profile of ["official", "official_plus_editorial"] as const) {
      const findings = scanPhraseRules("toeic", rules, profile, behaviorField);
      assert.equal(findings[0]?.ruleId, "OFFICIAL-LANGUAGE-TEST");
      assert.equal(findings[0]?.matchedText, "toeic");
    }
  });

  it("skips rules that do not apply to the selected field", () => {
    assert.deepEqual(scanPhraseRules("TOEIC", rules, "official", nameField), []);
  });

  it("returns UTF-16 offsets that slice the submitted text", () => {
    const text = "가나 자격증 취득";
    const [finding] = scanPhraseRules(text, rules, "official", behaviorField);

    assert.equal(finding.ruleId, "OFFICIAL-QUALIFICATION");
    assert.equal(text.slice(finding.start, finding.end), finding.matchedText);
  });
});
