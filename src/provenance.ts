import type { FieldSpec } from "./rule-types.ts";
import type { RuleMatch } from "./check-types.ts";

export interface ProvenanceAssessment {
  matches: RuleMatch[];
  needsContext: string[];
}

export interface ProvenanceInput {
  observationBasis?: "direct" | "documented_exception" | "none" | "unknown";
  observationExceptionReason?: string;
  observationContinuity?: "continuous" | "single_event" | "unknown";
  factualSupport?: "supported" | "known_false" | "unverified" | "unknown";
  studentMaterial?:
    | "none"
    | "peer_evaluation"
    | "self_evaluation"
    | "class_output"
    | "reflection"
    | "book_report"
    | "other";
  studentMaterialInSchoolEducationPlan?: boolean;
  studentMaterialUnderTeacherGuidance?: boolean;
  studentWroteFinalNarrative?: boolean;
  aiUse?: "none" | "proofreading" | "draft_generation_rewritten" | "verbatim" | "unknown";
  teacherVerifiedAgainstActualPerformance?: boolean;
  evidenceReference?: string;
}

function finding(ruleId: string, outcome: RuleMatch["outcome"]): RuleMatch {
  return { ruleId, outcome };
}

function isAllowedStudentMaterial(value: ProvenanceInput["studentMaterial"]): boolean {
  return value === "peer_evaluation" || value === "self_evaluation" || value === "class_output" || value === "reflection" || value === "book_report";
}

export function validateProvenance(field: FieldSpec, value?: ProvenanceInput): ProvenanceAssessment {
  if (field.provenanceMode !== "teacher-observation") {
    return { matches: [], needsContext: [] };
  }

  const provenance = value ?? {};
  const findings: RuleMatch[] = [];
  const needsContext: string[] = [];

  if (provenance.observationBasis === "none") {
    findings.push(finding("OFFICIAL-DIRECT-OBSERVATION", "block"));
  } else if (provenance.observationBasis === "documented_exception") {
    findings.push(finding("OFFICIAL-DIRECT-OBSERVATION", "review"));
  } else if (provenance.observationBasis === "unknown" || provenance.observationBasis === undefined) {
    needsContext.push("OFFICIAL-DIRECT-OBSERVATION");
  }

  if (field.key === "behavior_opinion" && provenance.observationContinuity !== "continuous") {
    if (provenance.observationContinuity === "single_event") {
      findings.push(finding("FIELD-BEHAVIOR-CONTINUOUS-OBSERVATION", "review"));
    } else {
      needsContext.push("FIELD-BEHAVIOR-CONTINUOUS-OBSERVATION");
    }
  }

  if (provenance.factualSupport === "known_false") {
    findings.push(finding("OFFICIAL-FACTUAL-ACCURACY", "block"));
  } else if (provenance.factualSupport === "unverified") {
    findings.push(finding("OFFICIAL-FACTUAL-ACCURACY", "review"));
  } else if (provenance.factualSupport === "unknown" || provenance.factualSupport === undefined) {
    needsContext.push("OFFICIAL-FACTUAL-ACCURACY");
  }

  if (provenance.studentMaterial === "other") {
    findings.push(finding("OFFICIAL-STUDENT-MATERIAL-CONDITIONS", "block"));
  } else if (isAllowedStudentMaterial(provenance.studentMaterial)) {
    if (
      provenance.studentMaterialInSchoolEducationPlan === false ||
      provenance.studentMaterialUnderTeacherGuidance === false
    ) {
      findings.push(finding("OFFICIAL-STUDENT-MATERIAL-CONDITIONS", "block"));
    } else if (
      provenance.studentMaterialInSchoolEducationPlan !== true ||
      provenance.studentMaterialUnderTeacherGuidance !== true
    ) {
      findings.push(finding("OFFICIAL-STUDENT-MATERIAL-CONDITIONS", "review"));
    }
  } else if (provenance.studentMaterial === undefined) {
    needsContext.push("OFFICIAL-STUDENT-MATERIAL-CONDITIONS");
  }

  if (provenance.studentWroteFinalNarrative === true) {
    findings.push(finding("OFFICIAL-STUDENT-FINAL-DRAFT", "block"));
  } else if (provenance.studentWroteFinalNarrative === undefined) {
    needsContext.push("OFFICIAL-STUDENT-FINAL-DRAFT");
  }

  if (provenance.aiUse === "verbatim") {
    findings.push(finding("OFFICIAL-AI-VERBATIM", "block"));
  } else if (provenance.aiUse === "proofreading" || provenance.aiUse === "draft_generation_rewritten") {
    if (provenance.teacherVerifiedAgainstActualPerformance !== true) {
      findings.push(finding("OFFICIAL-AI-VERIFICATION", "review"));
    }
  } else if (provenance.aiUse === "unknown" || provenance.aiUse === undefined) {
    needsContext.push("OFFICIAL-AI-VERIFICATION");
  }

  return { matches: findings, needsContext };
}
