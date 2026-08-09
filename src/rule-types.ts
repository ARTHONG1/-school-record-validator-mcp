export type FieldKey =
  | "student_name"
  | "address"
  | "academic_status_special"
  | "attendance_special"
  | "creative_autonomy_club_special"
  | "creative_career_special"
  | "volunteer_activity"
  | "daily_life_special"
  | "subject_achievement_special"
  | "behavior_opinion";

export type ValidationProfile = "official" | "official_plus_editorial";

export type LengthPolicy =
  | {
      kind: "fixed-bytes";
      displayKoreanChars: number;
      maxBytes: number;
      scope: "field" | "entry";
    }
  | {
      kind: "conditional-name";
      displayKoreanChars: 20;
      displayLatinChars: 60;
      maxBytes: 60;
    }
  | { kind: "system-range" };

export type LengthRuleId =
  | "LENGTH-STUDENT-NAME"
  | "LENGTH-ADDRESS"
  | "LENGTH-ACADEMIC-STATUS-SPECIAL"
  | "LENGTH-ATTENDANCE-SPECIAL"
  | "LENGTH-VOLUNTEER-ACTIVITY";

export interface FieldSpec {
  key: FieldKey;
  label: string;
  lengthPolicy: LengthPolicy;
  applicableTo: "all-elementary" | "special-basic-curriculum";
  contentRuleMode: "none" | "global-prohibitions";
  provenanceMode: "none" | "teacher-observation" | "activity-evidence";
  lengthRuleId?: LengthRuleId;
  evidenceIds: [string, ...string[]];
}

export interface SemanticTermPattern {
  termId: string;
  pattern: string;
}

export interface SemanticVerifierPattern {
  patternId: string;
  pattern: string;
  termPatterns: SemanticTermPattern[];
}

export interface SemanticReviewDefinition {
  concept: string;
  semanticHints: string[];
  confirmPatterns: SemanticVerifierPattern[];
  supportPatterns: Array<{ patternId: string; pattern: string }>;
  negativePatterns: Array<{ patternId: string; pattern: string }>;
}

export interface BaseRule {
  id: string;
  title: string;
  authorityClass: "official-policy" | "editorial-caution";
  profile: ValidationProfile;
  appliesTo: "all" | FieldKey[];
  message: string;
  recommendation: string;
  exceptions: string[];
  conflictsWith?: string[];
}

export interface OfficialPhraseRule extends BaseRule {
  authorityClass: "official-policy";
  profile: "official";
  outcome: "block" | "review";
  evidenceIds: [string, ...string[]];
  detector: {
    type: "literal-any" | "regex-any";
    patterns: string[];
    caseInsensitive?: boolean;
  };
  semanticReview?: SemanticReviewDefinition;
}

export interface EditorialPhraseRule extends BaseRule {
  authorityClass: "editorial-caution";
  profile: "official_plus_editorial";
  outcome: "review";
  evidenceIds?: never;
  localPolicyId: "LOCAL-EDITORIAL-POLICY";
  detector: {
    type: "literal-any" | "regex-any";
    patterns: string[];
    caseInsensitive?: boolean;
  };
  semanticReview?: SemanticReviewDefinition;
}

export type PhraseRule = OfficialPhraseRule | EditorialPhraseRule;

export interface OfficialLengthRule extends BaseRule {
  authorityClass: "official-policy";
  profile: "official";
  kind: "length";
  field: FieldKey;
  maxBytes: number;
  outcome: "block";
  evidenceIds: [string, ...string[]];
}

export interface OfficialMetadataRule extends BaseRule {
  authorityClass: "official-policy";
  profile: "official";
  kind: "metadata";
  check:
    | "direct-observation"
    | "factual-accuracy"
    | "student-material"
    | "student-final-narrative"
    | "ai-use"
    | "behavior-continuous-observation";
  possibleOutcomes: Array<"block" | "review">;
  evidenceIds: [string, ...string[]];
}

export interface OfficialContextRule extends BaseRule {
  authorityClass: "official-policy";
  profile: "official";
  kind: "context";
  check: "creative-activity-eligibility" | "volunteer-eligibility";
  possibleOutcomes: Array<"block" | "review">;
  evidenceIds: [string, ...string[]];
}

export type ValidationRule =
  | PhraseRule
  | OfficialLengthRule
  | OfficialMetadataRule
  | OfficialContextRule;

export interface VerifiedEvidence {
  id: string;
  chunkId: string;
  quote: string;
  quoteSha256: string;
  checkedBy: "human";
  checkedOn: "2026-07-30";
}

export interface RulePack {
  id: "kr-moe-school-record-elementary-2026.1";
  schoolLevel: "elementary";
  academicYear: 2026;
  effectiveFrom: "2026-03-01";
  defaultProfile: "official";
  authorityOrder: [100, 80, 10];
  fields: Record<FieldKey, FieldSpec>;
  rules: ValidationRule[];
  localPolicies: {
    "LOCAL-EDITORIAL-POLICY": {
      label: string;
      disclaimer: "교육부 명시 금지가 아닌 보수적 문장 품질 검토 항목";
    };
  };
}
