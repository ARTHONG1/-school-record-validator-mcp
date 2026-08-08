import type { Finding } from "./validator-types.ts";
import type {
  BatchEntry,
  RecordValidator,
  TeacherEntryReview,
  TeacherReviewIssue,
  TeacherReviewRequest,
  TeacherReviewResult,
  TeacherReviewStatus,
  ValidationResult,
} from "./validator-types.ts";

const DEFAULT_FIELD = "subject_achievement_special" as const;
const DEFAULT_PROFILE = "official_plus_editorial" as const;
const TEACHER_CHECK =
  "학생의 실제 수행 및 교사의 관찰·평가 내용과 일치하는지 최종 확인하세요.";
const REWRITE_POLICY =
  "추천 수정문은 입력 문장에 이미 확인된 사실만 사용해야 하며, 새로운 활동·성과·관찰·증빙·교사 지도 사실을 추가하지 않습니다.";
const DISCLAIMER =
  "교육·실습용 자동 점검 결과이며 공식 승인이나 법률 판단이 아닙니다. 최종 기재 여부는 최신 기재요령과 학교 업무 기준을 확인하세요.";

function issueStatus(finding: Finding): "revise" | "prohibited" {
  return finding.authorityClass === "official-policy"
    && finding.outcome === "block"
    && finding.category === "content"
    ? "prohibited"
    : "revise";
}

function entryStatus(issues: readonly TeacherReviewIssue[]): TeacherReviewStatus {
  if (issues.some((issue) => issue.status === "prohibited")) return "prohibited";
  return issues.length > 0 ? "revise" : "pass";
}

function labelFor(status: TeacherReviewStatus): TeacherEntryReview["label"] {
  if (status === "pass") return "통과";
  if (status === "revise") return "수정 권장";
  return "기재 불가";
}

function toTeacherIssue(finding: Finding): TeacherReviewIssue {
  return {
    ruleId: finding.ruleId,
    kind: finding.authorityClass === "official-policy" ? "official" : "editorial",
    status: issueStatus(finding),
    reason: finding.message,
    improvement: finding.recommendation,
    ...(finding.matchedText ? { matchedText: finding.matchedText } : {}),
    citations: finding.authorityClass === "official-policy"
      ? finding.evidence.map(({ title, locatorLabel, quote }) => ({
        title,
        locatorLabel,
        quote,
      }))
      : [],
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function toEntryReview(
  entry: { entryId: string; field: TeacherEntryReview["field"] },
  result: ValidationResult,
): TeacherEntryReview {
  const actionableFindings = result.findings.filter(
    (finding) => finding.category !== "provenance" && finding.category !== "context",
  );
  const issues = actionableFindings.map(toTeacherIssue);
  const status = entryStatus(issues);
  const reason = status === "pass"
    ? "현재 규칙팩에서 금지 또는 수정 권장 표현이 탐지되지 않았습니다."
    : issues[0]?.reason ?? "교사의 최종 검토가 필요한 항목이 있습니다.";

  return {
    entryId: entry.entryId,
    field: entry.field,
    status,
    label: labelFor(status),
    reason,
    issues,
    improvementGuidance: unique(issues.map((issue) => issue.improvement)),
    teacherChecks: [TEACHER_CHECK],
  };
}

function aggregateStatus(entries: readonly TeacherEntryReview[]): TeacherReviewStatus {
  if (entries.some((entry) => entry.status === "prohibited")) return "prohibited";
  if (entries.some((entry) => entry.status === "revise")) return "revise";
  return "pass";
}

export function createTeacherReviewService(validator: RecordValidator) {
  return {
    review(request: TeacherReviewRequest): TeacherReviewResult {
      const defaultField = request.defaultField ?? DEFAULT_FIELD;
      const profile = request.profile ?? DEFAULT_PROFILE;
      const entries: BatchEntry[] = request.entries.map((entry) => ({
        entryId: entry.entryId,
        text: entry.text,
        field: entry.field ?? defaultField,
        profile,
      }));
      const validated = validator.validateBatch(entries);
      const reviews = validated.entries.map((entry) => toEntryReview(
        { entryId: entry.entryId, field: entry.result.field },
        entry.result,
      ));
      const status = aggregateStatus(reviews);

      return {
        rulePackId: validated.rulePackId,
        status,
        counts: {
          total: reviews.length,
          pass: reviews.filter((entry) => entry.status === "pass").length,
          revise: reviews.filter((entry) => entry.status === "revise").length,
          prohibited: reviews.filter((entry) => entry.status === "prohibited").length,
        },
        entries: reviews,
        rewritePolicy: REWRITE_POLICY,
        disclaimer: DISCLAIMER,
      };
    },
  };
}
