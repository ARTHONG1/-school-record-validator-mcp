import { z } from "zod";

const PRIVATE_INVALID_ENUM = "__INVALID_ENUM_VALUE__";

function privacySafeEnum<const Values extends [string, ...string[]]>(values: Values) {
  const schema = z.enum(values);
  return z.preprocess(
    (value) => schema.safeParse(value).success ? value : PRIVATE_INVALID_ENUM,
    schema,
  );
}

const fieldValues = [
  "student_name",
  "address",
  "academic_status_special",
  "attendance_special",
  "creative_autonomy_club_special",
  "creative_career_special",
  "volunteer_activity",
  "daily_life_special",
  "subject_achievement_special",
  "behavior_opinion",
] as const;

const fieldKey = z.enum(fieldValues);
const inputFieldKey = privacySafeEnum([...fieldValues]);

const provenanceInput = z.object({
  observationBasis: privacySafeEnum([
    "direct",
    "documented_exception",
    "none",
    "unknown",
  ]).optional(),
  observationExceptionReason: z.string().min(1).max(200).optional(),
  observationContinuity: privacySafeEnum(["continuous", "single_event", "unknown"]).optional(),
  factualSupport: privacySafeEnum([
    "supported",
    "known_false",
    "unverified",
    "unknown",
  ]).optional(),
  studentMaterial: privacySafeEnum([
    "none",
    "peer_evaluation",
    "self_evaluation",
    "class_output",
    "reflection",
    "book_report",
    "other",
  ]).optional(),
  studentMaterialInSchoolEducationPlan: z.boolean().optional(),
  studentMaterialUnderTeacherGuidance: z.boolean().optional(),
  studentWroteFinalNarrative: z.boolean().optional(),
  aiUse: privacySafeEnum([
    "none",
    "proofreading",
    "draft_generation_rewritten",
    "verbatim",
    "unknown",
  ]).optional(),
  teacherVerifiedAgainstActualPerformance: z.boolean().optional(),
  evidenceReference: z.string().min(1).max(200).optional(),
}).strict();

const activityContextInput = z.object({
  domestic: z.boolean().optional(),
  organizers: z.array(z.object({
    kind: privacySafeEnum([
      "school",
      "other_elementary_school",
      "education_authority",
      "external",
      "unknown",
    ]),
    name: z.string().min(1).max(100).optional(),
  }).strict()).min(1).max(20).optional(),
  schoolApproved: z.boolean().optional(),
  inSchoolEducationPlan: z.boolean().optional(),
}).strict();

const volunteerContextInput = z.object({
  planType: privacySafeEnum(["school", "individual", "unknown"]).optional(),
  schoolApproved: z.boolean().optional(),
  evidenceAvailable: z.boolean().optional(),
  activityKind: privacySafeEnum([
    "service",
    "simple_donation",
    "disciplinary_service",
    "juvenile_social_service",
    "education_activity_infringement_measure",
    "unknown",
  ]).optional(),
}).strict();

const validationInput = z.object({
  field: inputFieldKey,
  text: z.string().min(1).max(200_000),
  grade: z.number().int().min(1).max(6).optional(),
  curriculum: privacySafeEnum(["general", "special_basic"]).optional(),
  profile: privacySafeEnum(["official", "official_plus_editorial"]).default("official"),
  provenance: provenanceInput.optional(),
  activityContext: activityContextInput.optional(),
  volunteerContext: volunteerContextInput.optional(),
}).strict();

const batchEntry = validationInput.extend({
  entryId: z.string().min(1).max(100),
});

const validateBatchShape = {
  entries: z.array(batchEntry).min(1).max(100),
};

const validateBatchInput = z.object(validateBatchShape).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.entries.forEach((entry, index) => {
    if (ids.has(entry.entryId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entries", index, "entryId"],
        message: "entryId must be unique",
      });
    }
    ids.add(entry.entryId);
  });
});

const teacherReviewEntry = z.object({
  entryId: z.string().min(1).max(100),
  text: z.string().min(1).max(200_000),
  field: inputFieldKey.optional(),
}).strict();

const checkSchoolRecordShape = {
  entries: z.array(teacherReviewEntry).min(1).max(100),
  defaultField: inputFieldKey.default("subject_achievement_special"),
  profile: privacySafeEnum(["official", "official_plus_editorial"]).default("official_plus_editorial"),
};

const checkSchoolRecordInput = z.object(checkSchoolRecordShape).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.entries.forEach((entry, index) => {
    if (ids.has(entry.entryId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entries", index, "entryId"],
        message: "entryId must be unique",
      });
    }
    ids.add(entry.entryId);
  });
});

const semanticCandidateInput = z.object({
  candidateId: z.string().min(1).max(100),
  ruleId: z.string().min(1).max(100),
  spanText: z.string().min(1).max(200),
  occurrence: z.number().int().min(1).optional(),
  retryToken: z.string().min(1).max(300).optional(),
}).strict();

const verifySemanticCandidateInput = z.object({
  entries: z.array(z.object({
    entryId: z.string().min(1).max(100),
    text: z.string().min(1).max(200_000),
    field: inputFieldKey,
    profile: privacySafeEnum(["official", "official_plus_editorial"]),
    initialStatus: z.enum(["pass_no_match", "revise", "prohibited"]),
    candidates: z.array(semanticCandidateInput).min(1).max(10),
  }).strict()).min(1).max(100),
}).strict();

const searchGuidanceInput = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(5),
  sourceIds: z.array(z.string().min(1)).max(8).optional(),
  sourceRoles: z.array(z.enum(["primary-guide", "directive-body", "verification-copy", "directive-appendix"])).max(4).optional(),
}).strict();

const sourceExcerptInput = z.object({
  chunkId: z.string().min(1).max(200),
}).strict();

const explainRuleInput = z.object({
  ruleId: z.string().min(1).max(100),
}).strict();

const emptyInput = z.object({}).strict();

const sha256 = z.string().regex(/^[A-F0-9]{64}$/u);
const authority = z.union([z.literal(100), z.literal(80)]);
const status = z.enum(["pass", "needs_context", "review", "blocked"]);
const contentStatus = z.enum(["pass", "review", "blocked"]);
const contextStatus = z.enum(["complete", "needs_context", "review", "blocked"]);
const validationProfile = z.enum(["official", "official_plus_editorial"]);

const sourceLocatorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pdf-page"),
    pdfPage: z.number().int().positive(),
    printedPage: z.number().int().positive().optional(),
  }).strict(),
  z.object({
    kind: z.literal("article"),
    article: z.string(),
    paragraph: z.string().optional(),
  }).strict(),
  z.object({
    kind: z.literal("appendix"),
    appendix: z.union([
      z.literal(7),
      z.literal(8),
      z.literal(9),
      z.literal(10),
      z.literal(11),
    ]),
    unitIndex: z.number().int().positive(),
  }).strict(),
]);

const lengthPolicySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fixed-bytes"),
    displayKoreanChars: z.number().int().positive(),
    maxBytes: z.number().int().positive(),
    scope: z.enum(["field", "entry"]),
  }).strict(),
  z.object({
    kind: z.literal("conditional-name"),
    displayKoreanChars: z.literal(20),
    displayLatinChars: z.literal(60),
    maxBytes: z.literal(60),
  }).strict(),
  z.object({ kind: z.literal("system-range") }).strict(),
]);

const evidenceSummarySchema = z.object({
  evidenceId: z.string(),
  chunkId: z.string(),
  sourceId: z.string(),
  title: z.string(),
  authority,
  sourceSha256: sha256,
  locator: sourceLocatorSchema,
  locatorLabel: z.string(),
  quote: z.string(),
  quoteSha256: sha256,
}).strict();

const findingSchema = z.object({
  ruleId: z.string(),
  authorityClass: z.enum(["official-policy", "editorial-caution"]),
  authority: z.union([z.literal(100), z.literal(80), z.literal(10)]),
  outcome: z.enum(["block", "review"]),
  category: z.enum(["length", "content", "provenance", "context", "editorial", "conflict"]),
  message: z.string(),
  recommendation: z.string(),
  matchedText: z.string().max(80).optional(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  evidence: z.array(evidenceSummarySchema),
  localPolicyId: z.literal("LOCAL-EDITORIAL-POLICY").optional(),
  conflictingRuleIds: z.array(z.string()).optional(),
}).strict();

const contextRequirementSchema = z.object({
  ruleId: z.string(),
  category: z.literal("provenance"),
  message: z.string(),
  recommendation: z.string(),
  requiredFields: z.array(z.string()).min(1),
}).strict();

const validationResultSchema = z.object({
  rulePackId: z.string(),
  field: fieldKey,
  profile: validationProfile,
  status,
  contentStatus,
  contextStatus,
  measurement: z.object({
    charCount: z.number().int().nonnegative(),
    byteCount: z.number().int().nonnegative(),
  }).strict(),
  lengthPolicy: lengthPolicySchema,
  findings: z.array(findingSchema),
  needsContext: z.array(contextRequirementSchema),
  disclaimer: z.string(),
}).strict();

const batchValidationResultSchema = z.object({
  rulePackId: z.string(),
  status,
  entries: z.array(z.object({
    entryId: z.string(),
    result: validationResultSchema,
  }).strict()),
}).strict();

const teacherReviewIssueSchema = z.object({
  ruleId: z.string(),
  kind: z.enum(["official", "editorial"]),
  status: z.enum(["revise", "prohibited"]),
  reason: z.string(),
  improvement: z.string(),
  matchedText: z.string().max(80).optional(),
  citations: z.array(z.object({
    title: z.string(),
    locatorLabel: z.string(),
    quote: z.string(),
  }).strict()),
}).strict();

const rewritePlanSchema = z.object({
  action: z.enum(["none", "rewrite", "ask_evidence"]),
  mustRemove: z.array(z.string()),
  instructions: z.array(z.string()),
  rewriteReason: z.string(),
  neededEvidence: z.array(z.string()),
  requiresRevalidation: z.boolean(),
}).strict();

const teacherEntryReviewSchema = z.object({
  entryId: z.string(),
  field: fieldKey,
  status: z.enum(["pass", "revise", "prohibited"]),
  label: z.enum(["통과", "수정 권장", "기재 불가"]),
  reason: z.string(),
  issues: z.array(teacherReviewIssueSchema),
  improvementGuidance: z.array(z.string()),
  teacherChecks: z.array(z.string()),
  rewritePlan: rewritePlanSchema,
}).strict();

const teacherReviewResultSchema = z.object({
  rulePackId: z.string(),
  catalogVersion: sha256,
  semanticReviewCatalog: z.array(z.object({
    ruleId: z.string(),
    action: z.enum(["prohibited", "revise"]),
    concept: z.string(),
    semanticHints: z.array(z.string()).min(1),
  }).strict()),
  status: z.enum(["pass", "revise", "prohibited"]),
  counts: z.object({
    total: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative(),
    revise: z.number().int().nonnegative(),
    prohibited: z.number().int().nonnegative(),
  }).strict(),
  entries: z.array(teacherEntryReviewSchema),
  rewritePolicy: z.string(),
  disclaimer: z.string(),
}).strict();

const semanticVerifyResultSchema = z.object({
  rulePackId: z.string(),
  processingStatus: z.enum(["complete", "retry_required"]),
  status: z.enum(["prohibited", "revise", "teacher_review", "pass_no_match"]).nullable(),
  entries: z.array(z.object({
    entryId: z.string(),
    initialStatus: z.enum(["pass_no_match", "revise", "prohibited"]),
    processingStatus: z.enum(["complete", "retry_required"]),
    finalRecommendation: z.enum(["prohibited", "revise", "teacher_review", "pass_no_match"]).nullable(),
    candidates: z.array(z.object({
      candidateId: z.string(),
      ruleId: z.string(),
      spanText: z.string(),
      candidateStatus: z.enum(["verified", "invalid"]),
      verification: z.enum(["confirmed", "supported_but_uncertain", "not_supported"]).nullable(),
      finalRecommendation: z.enum(["prohibited", "revise", "teacher_review", "pass_no_match"]).nullable(),
      errorCode: z.string().optional(),
      retryable: z.boolean().optional(),
      retryToken: z.string().optional(),
      availableOccurrences: z.array(z.number().int().positive()).optional(),
    }).strict()),
  }).strict()),
  disclaimer: z.string(),
}).strict();

const searchResultSchema = z.object({
  chunkId: z.string(),
  sourceId: z.string(),
  title: z.string(),
  authority,
  sourceSha256: sha256,
  locator: sourceLocatorSchema,
  locatorLabel: z.string(),
  snippet: z.string(),
  score: z.number(),
  textSha256: sha256,
}).strict();

const sourceExcerptSchema = z.object({
  chunkId: z.string(),
  sourceId: z.string(),
  title: z.string(),
  authority,
  sourceUrl: z.string().url().optional(),
  sourceSha256: sha256,
  locator: sourceLocatorSchema,
  locatorLabel: z.string(),
  headingPath: z.array(z.string()),
  text: z.string(),
  textSha256: sha256,
}).strict();

const ruleExplanationSchema = z.object({
  ruleId: z.string(),
  title: z.string(),
  authorityClass: z.enum(["official-policy", "editorial-caution"]),
  profile: validationProfile,
  possibleOutcomes: z.array(z.enum(["block", "review"])).min(1),
  appliesTo: z.union([z.literal("all"), z.array(fieldKey)]),
  message: z.string(),
  recommendation: z.string(),
  detectorSummary: z.string(),
  exceptions: z.array(z.string()),
  evidence: z.array(evidenceSummarySchema),
  localPolicyId: z.literal("LOCAL-EDITORIAL-POLICY").optional(),
  disclaimer: z.literal("공식 규정 아님").optional(),
}).strict();

const fieldSummarySchema = z.object({
  key: fieldKey,
  label: z.string(),
  lengthPolicy: lengthPolicySchema,
  applicableTo: z.enum(["all-elementary", "special-basic-curriculum"]),
  contentRuleMode: z.enum(["none", "global-prohibitions"]),
  provenanceMode: z.enum(["none", "teacher-observation", "activity-evidence"]),
  lengthRuleId: z.enum([
    "LENGTH-STUDENT-NAME",
    "LENGTH-ADDRESS",
    "LENGTH-ACADEMIC-STATUS-SPECIAL",
    "LENGTH-ATTENDANCE-SPECIAL",
    "LENGTH-VOLUNTEER-ACTIVITY",
  ]).optional(),
  evidenceIds: z.array(z.string()).min(1),
}).strict();

const rulePackSourceSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  role: z.enum(["primary-guide", "directive-body", "verification-copy", "directive-appendix"]),
  authority,
  schoolLevels: z.array(z.enum(["elementary", "middle", "high"])),
  academicYear: z.literal(2026),
  effectiveFrom: z.literal("2026-03-01"),
  sourceUrl: z.string().url().optional(),
  sha256,
}).strict();

export const outputSchemas = {
  check_school_record: teacherReviewResultSchema,
  verify_semantic_candidate: semanticVerifyResultSchema,
  validate_record_text: validationResultSchema,
  validate_record_batch: batchValidationResultSchema,
  search_record_guidance: z.object({ results: z.array(searchResultSchema) }).strict(),
  get_source_excerpt: sourceExcerptSchema,
  explain_record_rule: ruleExplanationSchema,
  list_record_fields: z.object({
    rulePackId: z.string(),
    fields: z.array(fieldSummarySchema),
  }).strict(),
  rule_pack_info: z.object({
    rulePackId: z.string(),
    schoolLevel: z.literal("elementary"),
    academicYear: z.literal(2026),
    effectiveFrom: z.literal("2026-03-01"),
    defaultProfile: z.literal("official"),
    authorityOrder: z.tuple([z.literal(100), z.literal(80), z.literal(10)]),
    sources: z.array(rulePackSourceSchema).length(8),
    data: z.object({
      bundleManifestSha256: sha256,
      bundleContentSha256: sha256,
      files: z.array(z.object({
        path: z.string(),
        sha256,
      }).strict()).length(7),
    }).strict(),
  }).strict(),
} as const;

export const inputShapes = {
  check_school_record: checkSchoolRecordShape,
  verify_semantic_candidate: verifySemanticCandidateInput.shape,
  validate_record_text: validationInput.shape,
  validate_record_batch: validateBatchShape,
  search_record_guidance: searchGuidanceInput.shape,
  get_source_excerpt: sourceExcerptInput.shape,
  explain_record_rule: explainRuleInput.shape,
  list_record_fields: emptyInput.shape,
  rule_pack_info: emptyInput.shape,
} as const;

export const inputParsers = {
  check_school_record: checkSchoolRecordInput,
  verify_semantic_candidate: verifySemanticCandidateInput,
  validate_record_text: validationInput,
  validate_record_batch: validateBatchInput,
  search_record_guidance: searchGuidanceInput,
  get_source_excerpt: sourceExcerptInput,
  explain_record_rule: explainRuleInput,
  list_record_fields: emptyInput,
  rule_pack_info: emptyInput,
} as const;

export type ToolName = keyof typeof inputParsers;

export interface ToolSpec {
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  outputSchema: z.ZodRawShape;
}

const LIMITATION =
  "이 결과는 공식 승인이나 법률 판단이 아님. 입력 provenance가 없으면 관찰 및 작성 경위를 확정할 수 없음.";

export const TOOL_SPECS = {
  check_school_record: {
    title: "교사용 생기부 문안 점검",
    description: [
      "교사가 학교생활기록부 문안의 통과, 수정 권장, 기재 불가 판단을 요청하면 반드시 이 도구만 호출한다.",
      "한 문장도 entries 배열 1건으로 전달한다.",
      "입력 JSON의 record_1, record_2 같은 키는 entryId와 text 배열로 변환한다.",
      "결과 status를 임의로 변경하지 말고 pass인 문안에 문제를 만들어내지 않는다.",
      "수정문은 입력에 이미 있는 사실만 사용하며 새로운 활동이나 관찰 근거를 만들지 않는다.",
      "이 결과는 공식 승인이나 법률 판단이 아니다.",
    ].join(" "),
    inputSchema: inputShapes.check_school_record,
    outputSchema: outputSchemas.check_school_record.shape,
  },
  verify_semantic_candidate: {
    title: "AI 의미 후보 규칙 재검증",
    description: `외부 AI가 제출한 ruleId와 원문 verbatim spanText를 공식 규칙팩으로 재검증합니다. AI는 후보만 제출할 수 있고 최종 상태는 MCP가 결정합니다. ${LIMITATION}`,
    inputSchema: inputShapes.verify_semantic_candidate,
    outputSchema: outputSchemas.verify_semantic_candidate.shape,
  },
  validate_record_text: {
    title: "생활기록부 문안 검증",
    description: `생활기록부 문안을 검토, 교정 또는 작성하기 전에 먼저 호출한다. ${LIMITATION}`,
    inputSchema: inputShapes.validate_record_text,
    outputSchema: outputSchemas.validate_record_text.shape,
  },
  validate_record_batch: {
    title: "생활기록부 문안 일괄 검증",
    description: `독립된 여러 문안을 한 번에 검토할 때 호출하고 각 문안에 안정적인 entryId를 제공한다. ${LIMITATION}`,
    inputSchema: inputShapes.validate_record_batch,
    outputSchema: outputSchemas.validate_record_batch.shape,
  },
  search_record_guidance: {
    title: "생활기록부 기재요령 검색",
    description: `규정에 대한 일반 질문 또는 검증 결과에 없는 근거를 찾을 때 호출한다. ${LIMITATION}`,
    inputSchema: inputShapes.search_record_guidance,
    outputSchema: outputSchemas.search_record_guidance.shape,
  },
  get_source_excerpt: {
    title: "공식 원문 문맥 조회",
    description: `검색 결과의 원문 전체 문맥이 필요할 때 chunkId로 호출한다. ${LIMITATION}`,
    inputSchema: inputShapes.get_source_excerpt,
    outputSchema: outputSchemas.get_source_excerpt.shape,
  },
  explain_record_rule: {
    title: "검증 규칙 설명",
    description: `검증 finding의 ruleId를 사용자에게 설명하기 전에 호출한다. ${LIMITATION}`,
    inputSchema: inputShapes.explain_record_rule,
    outputSchema: outputSchemas.explain_record_rule.shape,
  },
  list_record_fields: {
    title: "지원 생활기록부 항목 조회",
    description: `검증 전에 지원 항목명이나 2026 입력 한도를 확인할 때 호출한다. ${LIMITATION}`,
    inputSchema: inputShapes.list_record_fields,
    outputSchema: outputSchemas.list_record_fields.shape,
  },
  rule_pack_info: {
    title: "활성 규칙팩 정보 조회",
    description: `현재 활성 학교급, 학년도, 출처 및 데이터 해시를 확인할 때 호출한다. ${LIMITATION}`,
    inputSchema: inputShapes.rule_pack_info,
    outputSchema: outputSchemas.rule_pack_info.shape,
  },
} as const satisfies Record<ToolName, ToolSpec>;
