import type { ActivityContextInput, VolunteerContextInput } from "./activity-context.ts";
import type { ContextRequirement, TextMeasurement } from "./check-types.ts";
import type { EvidenceSummary } from "./evidence.ts";
import type { ProvenanceInput } from "./provenance.ts";
import type { FieldKey, LengthPolicy, ValidationProfile } from "./rule-types.ts";

export interface ValidationInput {
  field: FieldKey;
  text: string;
  grade?: 1 | 2 | 3 | 4 | 5 | 6;
  curriculum?: "general" | "special_basic";
  profile?: ValidationProfile;
  provenance?: ProvenanceInput;
  activityContext?: ActivityContextInput;
  volunteerContext?: VolunteerContextInput;
}

export interface Finding {
  ruleId: string;
  authorityClass: "official-policy" | "editorial-caution";
  authority: 100 | 80 | 10;
  outcome: "block" | "review";
  category: "length" | "content" | "provenance" | "context" | "editorial" | "conflict";
  message: string;
  recommendation: string;
  matchedText?: string;
  start?: number;
  end?: number;
  evidence: EvidenceSummary[];
  localPolicyId?: "LOCAL-EDITORIAL-POLICY";
  conflictingRuleIds?: string[];
}

export interface ValidationResult {
  rulePackId: string;
  field: FieldKey;
  profile: ValidationProfile;
  status: "pass" | "needs_context" | "review" | "blocked";
  contentStatus: "pass" | "review" | "blocked";
  contextStatus: "complete" | "needs_context" | "review" | "blocked";
  measurement: TextMeasurement;
  lengthPolicy: LengthPolicy;
  findings: Finding[];
  needsContext: ContextRequirement[];
  disclaimer: string;
}

export type BatchEntry = ValidationInput & { entryId: string };

export interface BatchEntryResult {
  entryId: string;
  result: ValidationResult;
}

export interface BatchValidationResult {
  rulePackId: string;
  status: "pass" | "needs_context" | "review" | "blocked";
  entries: BatchEntryResult[];
}

export type TeacherReviewStatus = "pass" | "revise" | "prohibited";

export interface TeacherReviewEntryInput {
  entryId: string;
  text: string;
  field?: FieldKey;
}

export interface TeacherReviewRequest {
  entries: TeacherReviewEntryInput[];
  defaultField?: FieldKey;
  profile?: ValidationProfile;
}

export interface TeacherReviewIssue {
  ruleId: string;
  kind: "official" | "editorial";
  status: "revise" | "prohibited";
  reason: string;
  improvement: string;
  matchedText?: string;
  citations: Array<{
    title: string;
    locatorLabel: string;
    quote: string;
  }>;
}

export type RewriteAction = "none" | "rewrite" | "ask_evidence";

export interface RewritePlan {
  action: RewriteAction;
  mustRemove: string[];
  instructions: string[];
  rewriteReason: string;
  neededEvidence: string[];
  requiresRevalidation: boolean;
}

export interface TeacherEntryReview {
  entryId: string;
  field: FieldKey;
  status: TeacherReviewStatus;
  label: "통과" | "수정 권장" | "기재 불가";
  reason: string;
  issues: TeacherReviewIssue[];
  improvementGuidance: string[];
  teacherChecks: string[];
  rewritePlan: RewritePlan;
}

export interface TeacherReviewResult {
  rulePackId: string;
  catalogVersion: string;
  semanticReviewCatalog: Array<{
    ruleId: string;
    action: "prohibited" | "revise";
    concept: string;
    semanticHints: string[];
  }>;
  status: TeacherReviewStatus;
  counts: { total: number; pass: number; revise: number; prohibited: number };
  entries: TeacherEntryReview[];
  rewritePolicy: string;
  disclaimer: string;
}

export interface RecordValidator {
  validate(input: ValidationInput): ValidationResult;
  validateBatch(entries: readonly BatchEntry[]): BatchValidationResult;
}
