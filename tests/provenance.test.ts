import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FieldSpec } from "../src/rule-types.ts";
import { validateProvenance } from "../src/provenance.ts";

const behaviorField = {
  key: "behavior_opinion",
  label: "Behavior opinion",
  lengthPolicy: { kind: "system-range" },
  applicableTo: "all-elementary",
  contentRuleMode: "global-prohibitions",
  provenanceMode: "teacher-observation",
  evidenceIds: ["EV-GUIDE-102-BEHAVIOR"],
} as FieldSpec;

const administrativeField = {
  ...behaviorField,
  key: "attendance_special",
  provenanceMode: "none",
} as FieldSpec;

const supportedObservation = {
  observationBasis: "direct" as const,
  observationContinuity: "continuous" as const,
  factualSupport: "supported" as const,
  studentMaterial: "none" as const,
  studentWroteFinalNarrative: false,
  aiUse: "none" as const,
};

describe("provenance validation", () => {
  it("blocks a student-written final narrative and verbatim AI text", () => {
    const findings = validateProvenance(behaviorField, {
      ...supportedObservation,
      studentWroteFinalNarrative: true,
      aiUse: "verbatim",
      teacherVerifiedAgainstActualPerformance: true,
      evidenceReference: "teacher-observation-note-001",
    });

    assert.deepEqual(findings.matches.map((match) => match.ruleId), [
      "OFFICIAL-STUDENT-FINAL-DRAFT",
      "OFFICIAL-AI-VERBATIM",
    ]);
    assert.deepEqual(findings.matches.map((match) => match.outcome), ["block", "block"]);
  });

  it("blocks an explicit absence of direct observation", () => {
    const findings = validateProvenance(behaviorField, { ...supportedObservation, observationBasis: "none" });

    assert.deepEqual(findings.matches, [{ ruleId: "OFFICIAL-DIRECT-OBSERVATION", outcome: "block" }]);
  });

  it("keeps a documented exception in behavior opinion for teacher review without exposing its text", () => {
    const secretReason = "sensitive exception reason";
    const secretEvidence = "private-reference-001";
    const findings = validateProvenance(behaviorField, {
      ...supportedObservation,
      observationBasis: "documented_exception",
      observationExceptionReason: secretReason,
      evidenceReference: secretEvidence,
    });

    assert.deepEqual(findings.matches, [{ ruleId: "OFFICIAL-DIRECT-OBSERVATION", outcome: "review" }]);
    assert.equal(JSON.stringify(findings).includes(secretReason), false);
    assert.equal(JSON.stringify(findings).includes(secretEvidence), false);
  });

  it("requires evidence verification only when AI-assisted drafting was used", () => {
    assert.deepEqual(validateProvenance(behaviorField, supportedObservation).matches, []);
    assert.deepEqual(
      validateProvenance(behaviorField, { ...supportedObservation, aiUse: "proofreading" }).matches,
      [{ ruleId: "OFFICIAL-AI-VERIFICATION", outcome: "review" }],
    );
  });

  it("accepts verified AI assistance without requiring an undocumented evidence reference", () => {
    for (const aiInput of [
      { aiUse: "proofreading" as const },
      { aiUse: "draft_generation_rewritten" as const, evidenceReference: "   " },
    ]) {
      const findings = validateProvenance(behaviorField, {
        ...supportedObservation,
        ...aiInput,
        teacherVerifiedAgainstActualPerformance: true,
      });

      assert.deepEqual(findings.matches, []);
    }
  });

  it("allows rewritten AI drafting after teacher verification", () => {
    const findings = validateProvenance(behaviorField, {
      ...supportedObservation,
      aiUse: "draft_generation_rewritten",
      teacherVerifiedAgainstActualPerformance: true,
      evidenceReference: "teacher-observation-note-002",
    });

    assert.deepEqual(findings.matches, []);
  });

  it("blocks an invalid student material condition", () => {
    const findings = validateProvenance(behaviorField, {
      ...supportedObservation,
      studentMaterial: "reflection",
      studentMaterialInSchoolEducationPlan: false,
      studentMaterialUnderTeacherGuidance: true,
    });

    assert.deepEqual(findings.matches, [{ ruleId: "OFFICIAL-STUDENT-MATERIAL-CONDITIONS", outcome: "block" }]);
  });

  it("does not require narrative provenance for an administrative field", () => {
    assert.deepEqual(validateProvenance(administrativeField).matches, []);
  });

  it("treats omitted provenance as context to confirm, not as a violation", () => {
    const assessment = validateProvenance(behaviorField);

    assert.deepEqual(assessment.matches, []);
    assert.deepEqual(assessment.needsContext, [
      "OFFICIAL-DIRECT-OBSERVATION",
      "FIELD-BEHAVIOR-CONTINUOUS-OBSERVATION",
      "OFFICIAL-FACTUAL-ACCURACY",
      "OFFICIAL-STUDENT-MATERIAL-CONDITIONS",
      "OFFICIAL-STUDENT-FINAL-DRAFT",
      "OFFICIAL-AI-VERIFICATION",
    ]);
  });
});
