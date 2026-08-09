import { createHash } from "node:crypto";
import type { EvidenceChunk } from "../../src/corpus-types.ts";
import type { DataBundle } from "../../src/data-types.ts";
import type {
  FieldKey,
  FieldSpec,
  OfficialContextRule,
  OfficialLengthRule,
  OfficialMetadataRule,
  OfficialPhraseRule,
  RulePack,
  ValidationRule,
  VerifiedEvidence,
} from "../../src/rule-types.ts";
import type { SourceDocument } from "../../src/source-types.ts";

const PACK_ID = "kr-moe-school-record-elementary-2026.1" as const;
const GUIDE_SOURCE_ID = "MOE-GUIDE-ELEMENTARY-2026";
const DIRECTIVE_SOURCE_ID = "MOE-DIRECTIVE-555-TEXT";

const evidenceDefinitions = [
  ["EV-GUIDE-18-PROHIBITIONS", "guide-018", "인쇄 18쪽의 기재 금지 항목", "초등 기재요령 인쇄 18쪽 (PDF 24쪽)"],
  ["EV-GUIDE-19-NARRATIVE-AUTHORITY", "guide-019", "인쇄 19쪽의 서술 권한 안내", "초등 기재요령 인쇄 19쪽 (PDF 25쪽)"],
  ["EV-GUIDE-27-STUDENT-MATERIALS", "guide-027", "인쇄 27쪽의 학생 자료 안내", "초등 기재요령 인쇄 27쪽 (PDF 33쪽)"],
  ["EV-GUIDE-59-ATTENDANCE", "guide-059", "인쇄 59쪽의 출결 특기사항 안내", "초등 기재요령 인쇄 59쪽 (PDF 65쪽)"],
  ["EV-GUIDE-79-CREATIVE-SCOPE", "guide-079", "인쇄 79쪽의 창의적 체험활동 범위", "초등 기재요령 인쇄 79쪽 (PDF 85쪽)"],
  ["EV-GUIDE-84-VOLUNTEER", "guide-084", "인쇄 84쪽의 봉사활동 인정 범위", "초등 기재요령 인쇄 84쪽 (PDF 90쪽)"],
  ["EV-GUIDE-100-SUBJECT", "guide-100", "인쇄 100쪽의 교과 기재 제한", "초등 기재요령 인쇄 100쪽 (PDF 106쪽)"],
  ["EV-GUIDE-102-BEHAVIOR", "guide-102", "인쇄 102쪽의 행동특성 관찰 안내", "초등 기재요령 인쇄 102쪽 (PDF 108쪽)"],
  ["EV-GUIDE-150-LIMITS", "guide-150", "인쇄 150쪽의 항목별 입력 한도", "초등 기재요령 인쇄 150쪽 (PDF 156쪽)"],
  ["EV-DIRECTIVE-4-2", "directive-04-02", "사용자는 학생에 대해 직접 관찰ㆍ평가한 내용을 근거로 자료를 입력해야 한다.", "교육부훈령 제4조제2항"],
] as const;

const narrativeFields: FieldKey[] = [
  "daily_life_special",
  "subject_achievement_special",
  "behavior_opinion",
];

const activityFields: FieldKey[] = [
  "creative_autonomy_club_special",
  "creative_career_special",
  "volunteer_activity",
];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

function evidenceIds(...ids: string[]): [string, ...string[]] {
  if (ids.length === 0) throw new Error("Test evidence IDs must not be empty");
  return ids as [string, ...string[]];
}

function field(spec: Omit<FieldSpec, "evidenceIds"> & { evidenceId: string }): FieldSpec {
  const { evidenceId, ...rest } = spec;
  return { ...rest, evidenceIds: evidenceIds(evidenceId) };
}

export const testFields: Record<FieldKey, FieldSpec> = {
  student_name: field({
    key: "student_name",
    label: "성명",
    lengthPolicy: { kind: "conditional-name", displayKoreanChars: 20, displayLatinChars: 60, maxBytes: 60 },
    applicableTo: "all-elementary",
    contentRuleMode: "none",
    provenanceMode: "none",
    lengthRuleId: "LENGTH-STUDENT-NAME",
    evidenceId: "EV-GUIDE-150-LIMITS",
  }),
  address: field({
    key: "address",
    label: "주소",
    lengthPolicy: { kind: "fixed-bytes", displayKoreanChars: 300, maxBytes: 900, scope: "field" },
    applicableTo: "all-elementary",
    contentRuleMode: "none",
    provenanceMode: "none",
    lengthRuleId: "LENGTH-ADDRESS",
    evidenceId: "EV-GUIDE-150-LIMITS",
  }),
  academic_status_special: field({
    key: "academic_status_special",
    label: "학적 특기사항",
    lengthPolicy: { kind: "fixed-bytes", displayKoreanChars: 500, maxBytes: 1500, scope: "field" },
    applicableTo: "all-elementary",
    contentRuleMode: "none",
    provenanceMode: "none",
    lengthRuleId: "LENGTH-ACADEMIC-STATUS-SPECIAL",
    evidenceId: "EV-GUIDE-150-LIMITS",
  }),
  attendance_special: field({
    key: "attendance_special",
    label: "출결상황 특기사항",
    lengthPolicy: { kind: "fixed-bytes", displayKoreanChars: 500, maxBytes: 1500, scope: "field" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "none",
    lengthRuleId: "LENGTH-ATTENDANCE-SPECIAL",
    evidenceId: "EV-GUIDE-150-LIMITS",
  }),
  creative_autonomy_club_special: field({
    key: "creative_autonomy_club_special",
    label: "창의적 체험활동 자율ㆍ자치ㆍ동아리 특기사항",
    lengthPolicy: { kind: "system-range" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "teacher-observation",
    evidenceId: "EV-GUIDE-79-CREATIVE-SCOPE",
  }),
  creative_career_special: field({
    key: "creative_career_special",
    label: "창의적 체험활동 진로 특기사항",
    lengthPolicy: { kind: "system-range" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "teacher-observation",
    evidenceId: "EV-GUIDE-79-CREATIVE-SCOPE",
  }),
  volunteer_activity: field({
    key: "volunteer_activity",
    label: "봉사활동 실적별 활동내용",
    lengthPolicy: { kind: "fixed-bytes", displayKoreanChars: 50, maxBytes: 150, scope: "entry" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "activity-evidence",
    lengthRuleId: "LENGTH-VOLUNTEER-ACTIVITY",
    evidenceId: "EV-GUIDE-150-LIMITS",
  }),
  daily_life_special: field({
    key: "daily_life_special",
    label: "일상생활 활동상황 특기사항",
    lengthPolicy: { kind: "system-range" },
    applicableTo: "special-basic-curriculum",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "teacher-observation",
    evidenceId: "EV-GUIDE-27-STUDENT-MATERIALS",
  }),
  subject_achievement_special: field({
    key: "subject_achievement_special",
    label: "교과학습발달상황 세부능력 및 특기사항",
    lengthPolicy: { kind: "system-range" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "teacher-observation",
    evidenceId: "EV-GUIDE-100-SUBJECT",
  }),
  behavior_opinion: field({
    key: "behavior_opinion",
    label: "행동특성 및 종합의견",
    lengthPolicy: { kind: "system-range" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "teacher-observation",
    evidenceId: "EV-GUIDE-102-BEHAVIOR",
  }),
};

function lengthRule(
  id: OfficialLengthRule["id"],
  fieldKey: FieldKey,
  maxBytes: number,
): OfficialLengthRule {
  return {
    id,
    title: `${fieldKey} 입력 한도`,
    authorityClass: "official-policy",
    profile: "official",
    appliesTo: [fieldKey],
    message: `공식 입력 한도 ${maxBytes}Byte를 초과했습니다.`,
    recommendation: "입력 한도 안으로 문안을 줄이세요.",
    exceptions: [],
    kind: "length",
    field: fieldKey,
    maxBytes,
    outcome: "block",
    evidenceIds: evidenceIds("EV-GUIDE-150-LIMITS"),
  };
}

function phraseRule(input: {
  id: string;
  title: string;
  appliesTo: FieldKey[];
  outcome: "block" | "review";
  evidenceId: string;
  detector: OfficialPhraseRule["detector"];
  conflictsWith?: string[];
}): OfficialPhraseRule {
  return {
    id: input.id,
    title: input.title,
    authorityClass: "official-policy",
    profile: "official",
    appliesTo: input.appliesTo,
    message: `${input.title} 관련 문구를 확인했습니다.`,
    recommendation: "공식 기재요령에 맞게 해당 표현을 삭제하거나 수정하세요.",
    exceptions: [],
    ...(input.conflictsWith ? { conflictsWith: input.conflictsWith } : {}),
    outcome: input.outcome,
    evidenceIds: evidenceIds(input.evidenceId),
    detector: input.detector,
    semanticReview: {
      concept: input.title,
      semanticHints: input.detector.patterns.slice(0, 3),
      confirmPatterns: [{
        patternId: `${input.id}-CONFIRM`,
        pattern: input.detector.patterns[0],
        termPatterns: [{ termId: `${input.id}-TERM`, pattern: input.detector.patterns[0] }],
      }],
      supportPatterns: [{ patternId: `${input.id}-SUPPORT`, pattern: input.detector.patterns[0] }],
      negativePatterns: [{ patternId: `${input.id}-NEGATIVE`, pattern: "(?!)" }],
    },
  };
}

function metadataRule(
  id: string,
  title: string,
  appliesTo: FieldKey[],
  check: OfficialMetadataRule["check"],
  evidenceId: string,
): OfficialMetadataRule {
  return {
    id,
    title,
    authorityClass: "official-policy",
    profile: "official",
    appliesTo,
    message: `${title} 정보를 확인해야 합니다.`,
    recommendation: "교사가 작성 경위와 증빙을 확인하세요.",
    exceptions: [],
    kind: "metadata",
    check,
    possibleOutcomes: ["block", "review"],
    evidenceIds: evidenceIds(evidenceId),
  };
}

function contextRule(
  id: string,
  title: string,
  appliesTo: FieldKey[],
  check: OfficialContextRule["check"],
  evidenceId: string,
): OfficialContextRule {
  return {
    id,
    title,
    authorityClass: "official-policy",
    profile: "official",
    appliesTo,
    message: `${title} 조건을 확인해야 합니다.`,
    recommendation: "활동 범위와 승인ㆍ증빙을 확인하세요.",
    exceptions: [],
    kind: "context",
    check,
    possibleOutcomes: ["block", "review"],
    evidenceIds: evidenceIds(evidenceId),
  };
}

export const defaultTestRules: ValidationRule[] = [
  lengthRule("LENGTH-STUDENT-NAME", "student_name", 60),
  lengthRule("LENGTH-ADDRESS", "address", 900),
  lengthRule("LENGTH-ACADEMIC-STATUS-SPECIAL", "academic_status_special", 1500),
  lengthRule("LENGTH-ATTENDANCE-SPECIAL", "attendance_special", 1500),
  lengthRule("LENGTH-VOLUNTEER-ACTIVITY", "volunteer_activity", 150),
  phraseRule({
    id: "OFFICIAL-LANGUAGE-TEST",
    title: "공인어학시험",
    appliesTo: [...narrativeFields, ...activityFields],
    outcome: "block",
    evidenceId: "EV-GUIDE-18-PROHIBITIONS",
    detector: { type: "literal-any", patterns: ["TOEIC", "TOEFL", "TEPS"], caseInsensitive: true },
  }),
  phraseRule({
    id: "OFFICIAL-CONTEST-PARTICIPATION-AWARD",
    title: "대회 참가ㆍ수상",
    appliesTo: [...narrativeFields, ...activityFields],
    outcome: "block",
    evidenceId: "EV-GUIDE-18-PROHIBITIONS",
    detector: { type: "regex-any", patterns: ["전국대회[^.!?\\n]{0,40}(?:수상|입상|참가|출전)"] },
  }),
  phraseRule({
    id: "OFFICIAL-PARENT-SOCIOECONOMIC-STATUS",
    title: "부모 사회경제적 지위",
    appliesTo: [...narrativeFields, ...activityFields],
    outcome: "block",
    evidenceId: "EV-GUIDE-18-PROHIBITIONS",
    detector: { type: "regex-any", patterns: ["(?:아버지|어머니|부모|친인척)[^.!?\\n]{0,30}(?:직업|직장|직위|경제력)"] },
  }),
  phraseRule({
    id: "OFFICIAL-OVERSEAS-ACTIVITY",
    title: "해외 활동실적",
    appliesTo: [...narrativeFields, ...activityFields],
    outcome: "block",
    evidenceId: "EV-GUIDE-18-PROHIBITIONS",
    detector: { type: "literal-any", patterns: ["어학연수", "해외 봉사", "해외 활동"] },
  }),
  phraseRule({
    id: "FIELD-ATTENDANCE-PROHIBITED-CONTENT",
    title: "출결 특기사항 제외 활동",
    appliesTo: ["attendance_special"],
    outcome: "block",
    evidenceId: "EV-GUIDE-59-ATTENDANCE",
    detector: { type: "literal-any", patterns: ["교외대회", "교외 대회", "어학연수", "해외 봉사"] },
  }),
  phraseRule({
    id: "FIELD-VOLUNTEER-SIMPLE-DONATION",
    title: "단순 기부",
    appliesTo: ["volunteer_activity"],
    outcome: "block",
    evidenceId: "EV-GUIDE-84-VOLUNTEER",
    detector: { type: "regex-any", patterns: ["(?:현금|물품)[^.!?\\n]{0,20}기부"] },
  }),
  phraseRule({
    id: "FIELD-SUBJECT-PROHIBITED-CONTENT",
    title: "교과 기재 제한",
    appliesTo: ["subject_achievement_special"],
    outcome: "block",
    evidenceId: "EV-GUIDE-100-SUBJECT",
    detector: { type: "literal-any", patterns: ["K-MOOC", "MOOC", "KOCW", "방과후학교"], caseInsensitive: true },
  }),
  metadataRule(
    "OFFICIAL-DIRECT-OBSERVATION",
    "직접 관찰 근거",
    narrativeFields,
    "direct-observation",
    "EV-DIRECTIVE-4-2",
  ),
  metadataRule(
    "OFFICIAL-FACTUAL-ACCURACY",
    "사실 정확성",
    narrativeFields,
    "factual-accuracy",
    "EV-GUIDE-19-NARRATIVE-AUTHORITY",
  ),
  metadataRule(
    "OFFICIAL-STUDENT-MATERIAL-CONDITIONS",
    "학생 자료 활용 조건",
    narrativeFields,
    "student-material",
    "EV-GUIDE-27-STUDENT-MATERIALS",
  ),
  metadataRule(
    "OFFICIAL-STUDENT-FINAL-DRAFT",
    "학생 작성 최종 문안",
    narrativeFields,
    "student-final-narrative",
    "EV-GUIDE-19-NARRATIVE-AUTHORITY",
  ),
  metadataRule(
    "OFFICIAL-AI-VERBATIM",
    "AI 생성 자료 그대로 입력",
    [...narrativeFields, ...activityFields],
    "ai-use",
    "EV-GUIDE-19-NARRATIVE-AUTHORITY",
  ),
  metadataRule(
    "OFFICIAL-AI-VERIFICATION",
    "AI 보조 작성 검증",
    [...narrativeFields, ...activityFields],
    "ai-use",
    "EV-GUIDE-19-NARRATIVE-AUTHORITY",
  ),
  metadataRule(
    "FIELD-BEHAVIOR-CONTINUOUS-OBSERVATION",
    "행동특성 지속 관찰",
    ["behavior_opinion"],
    "behavior-continuous-observation",
    "EV-GUIDE-102-BEHAVIOR",
  ),
  contextRule(
    "FIELD-CREATIVE-ACTIVITY-SCOPE",
    "창의적 체험활동 인정 범위",
    ["creative_autonomy_club_special", "creative_career_special"],
    "creative-activity-eligibility",
    "EV-GUIDE-79-CREATIVE-SCOPE",
  ),
  contextRule(
    "FIELD-VOLUNTEER-ELIGIBILITY",
    "봉사활동 인정 범위",
    ["volunteer_activity"],
    "volunteer-eligibility",
    "EV-GUIDE-84-VOLUNTEER",
  ),
  {
    id: "EDITORIAL-UNSUPPORTED-SUPERLATIVE",
    title: "근거 없는 최상급 표현",
    authorityClass: "editorial-caution",
    profile: "official_plus_editorial",
    appliesTo: [...narrativeFields, ...activityFields],
    message: "근거 없는 최상급ㆍ절대 표현을 확인했습니다.",
    recommendation: "관찰 가능한 사실 중심으로 바꾸세요.",
    exceptions: [],
    outcome: "review",
    localPolicyId: "LOCAL-EDITORIAL-POLICY",
    detector: { type: "literal-any", patterns: ["전교에서 가장", "항상", "완벽하게", "최고의"] },
  },
];

function source(id: string, title: string, authority: 100 | 80): SourceDocument {
  return {
    id,
    title,
    role: authority === 100 ? "directive-body" : "primary-guide",
    format: authority === 100 ? "text" : "pdf",
    authority,
    schoolLevels: authority === 100 ? ["elementary", "middle", "high"] : ["elementary"],
    academicYear: 2026,
    effectiveFrom: "2026-03-01",
    fileName: `${id}.txt`,
    relativeInputPath: `${id}.txt`,
    snapshotName: `${id}.txt`,
    sha256: authority === 100 ? "D".repeat(64) : "A".repeat(64),
    minimumExtractedChars: 1,
  };
}

function buildEvidenceData(): {
  chunks: EvidenceChunk[];
  evidence: VerifiedEvidence[];
} {
  const chunks: EvidenceChunk[] = [];
  const evidence: VerifiedEvidence[] = [];

  for (const [evidenceId, chunkSuffix, quote, locatorLabel] of evidenceDefinitions) {
    const directive = evidenceId === "EV-DIRECTIVE-4-2";
    const sourceId = directive ? DIRECTIVE_SOURCE_ID : GUIDE_SOURCE_ID;
    const chunkId = `${sourceId}:${chunkSuffix}`;
    const printedPageMatch = locatorLabel.match(/인쇄 (\d+)쪽/u);
    const pdfPageMatch = locatorLabel.match(/PDF (\d+)쪽/u);
    const locator = directive
      ? ({ kind: "article", article: "4", paragraph: "2" } as const)
      : ({
          kind: "pdf-page",
          pdfPage: Number(pdfPageMatch?.[1]),
          printedPage: Number(printedPageMatch?.[1]),
        } as const);
    const chunk: EvidenceChunk = {
      id: chunkId,
      sourceId,
      authority: directive ? 100 : 80,
      schoolLevels: directive ? ["elementary", "middle", "high"] : ["elementary"],
      locator,
      locatorLabel,
      headingPath: [locatorLabel],
      text: quote,
      searchText: quote.toLocaleLowerCase("ko-KR"),
      textSha256: sha256(quote),
    };
    chunks.push(chunk);
    evidence.push({
      id: evidenceId,
      chunkId,
      quote,
      quoteSha256: sha256(quote),
      checkedBy: "human",
      checkedOn: "2026-07-30",
    });
  }

  return { chunks, evidence };
}

export function buildTestBundle(options: { rules?: ValidationRule[] } = {}): DataBundle {
  const sources = [
    source(GUIDE_SOURCE_ID, "2026 학교생활기록부 기재요령(초등학교)", 80),
    source(DIRECTIVE_SOURCE_ID, "학교생활기록 작성 및 관리지침", 100),
  ];
  const { chunks, evidence } = buildEvidenceData();
  const activeChunkApprovals = chunks.map((chunk) => ({
    chunkId: chunk.id,
    scope: chunk.schoolLevels.length === 1 ? ("elementary" as const) : ("common" as const),
    reason: "Task 8 in-memory fixture",
  }));
  const rulePack: RulePack = {
    id: PACK_ID,
    schoolLevel: "elementary",
    academicYear: 2026,
    effectiveFrom: "2026-03-01",
    defaultProfile: "official",
    authorityOrder: [100, 80, 10],
    fields: testFields,
    rules: options.rules ? [...options.rules] : [...defaultTestRules],
    localPolicies: {
      "LOCAL-EDITORIAL-POLICY": {
        label: "자체 편집 경고",
        disclaimer: "교육부 명시 금지가 아닌 보수적 문장 품질 검토 항목",
      },
    },
  };

  return {
    bundleManifest: {
      schemaVersion: 1,
      packId: PACK_ID,
      files: [],
      bundleContentSha256: "B".repeat(64),
    },
    bundleManifestSha256: "C".repeat(64),
    bundleContentSha256: "B".repeat(64),
    corpusManifest: {
      schemaVersion: 1,
      packId: PACK_ID,
      sourceManifestSha256: "1".repeat(64),
      documentsSha256: "2".repeat(64),
      chunksSha256: "3".repeat(64),
      documentCount: 0,
      chunkCount: chunks.length,
    },
    sources,
    sourceById: new Map(sources.map((item) => [item.id, item])),
    documents: [],
    documentBySourceId: new Map(),
    chunks,
    chunkById: new Map(chunks.map((chunk) => [chunk.id, chunk])),
    activeChunkApprovals,
    activeChunkApprovalById: new Map(activeChunkApprovals.map((approval) => [approval.chunkId, approval])),
    activeChunks: chunks,
    activeChunkById: new Map(chunks.map((chunk) => [chunk.id, chunk])),
    evidence,
    evidenceById: new Map(evidence.map((item) => [item.id, item])),
    rules: rulePack,
  };
}

export function completeObservation(overrides: Record<string, unknown> = {}) {
  return {
    observationBasis: "direct" as const,
    observationContinuity: "continuous" as const,
    factualSupport: "supported" as const,
    studentMaterial: "none" as const,
    studentWroteFinalNarrative: false,
    aiUse: "none" as const,
    ...overrides,
  };
}

export function testOfficialPhraseRule(input: {
  id: string;
  evidenceId: string;
  outcome: "block" | "review";
  pattern: string;
  conflictsWith?: string[];
}): OfficialPhraseRule {
  return phraseRule({
    id: input.id,
    title: input.id,
    appliesTo: ["attendance_special"],
    outcome: input.outcome,
    evidenceId: input.evidenceId,
    detector: { type: "regex-any", patterns: [input.pattern] },
    ...(input.conflictsWith ? { conflictsWith: input.conflictsWith } : {}),
  });
}
