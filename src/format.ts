import type { RuleExplanation, SourceExcerpt } from "./evidence.ts";
import type { FieldSpec } from "./rule-types.ts";
import type { SearchResult } from "./search.ts";
import type {
  BatchValidationResult,
  Finding,
  TeacherReviewResult,
  ValidationResult,
} from "./validator-types.ts";

const STATUS_LABELS: Record<ValidationResult["status"], string> = {
  pass: "탐지 없음",
  needs_context: "추가 정보 확인 필요",
  review: "교사 검토 필요",
  blocked: "기재 차단",
};

const CONTENT_STATUS_LABELS: Record<ValidationResult["contentStatus"], string> = {
  pass: "통과",
  review: "검토 필요",
  blocked: "기재 차단",
};

function formatFinding(finding: Finding): string[] {
  const lines = [
    `- ${finding.ruleId}: ${finding.message}`,
    `  권고: ${finding.recommendation}`,
  ];

  if (finding.authorityClass === "editorial-caution") {
    lines.push("  [자체 편집 경고 - 공식 규정 아님]");
    return lines;
  }

  for (const evidence of finding.evidence) {
    lines.push(`  [${evidence.title}, ${evidence.locatorLabel}] ${evidence.quote}`);
  }
  return lines;
}

export function formatValidationResult(result: ValidationResult): string {
  const lines = [
    `문안 점검: ${CONTENT_STATUS_LABELS[result.contentStatus]}`,
    `작성 경위: ${result.contextStatus === "complete" ? "확인됨" : result.contextStatus === "needs_context" ? "정보 확인 필요" : STATUS_LABELS[result.contextStatus]}`,
    `측정: ${result.measurement.charCount}자 / ${result.measurement.byteCount}Byte`,
  ];

  for (const finding of result.findings) {
    lines.push(...formatFinding(finding));
  }
  for (const requirement of result.needsContext) {
    lines.push(`- 확인 필요: ${requirement.message}`);
    lines.push(`  확인 항목: ${requirement.requiredFields.join(", ")}`);
  }
  lines.push(result.disclaimer);
  return lines.join("\n");
}

export function formatBatchValidationResult(result: BatchValidationResult): string {
  const lines = [
    `종합 상태: ${STATUS_LABELS[result.status]}`,
    `검증 문안: ${result.entries.length}건`,
  ];
  for (const entry of result.entries) {
    lines.push(`- ${entry.entryId}: ${STATUS_LABELS[entry.result.status]} (${entry.result.findings.length}개 finding)`);
  }
  return lines.join("\n");
}

export function formatTeacherReviewResult(result: TeacherReviewResult): string {
  const label = result.status === "prohibited"
    ? "기재 불가"
    : result.status === "revise"
      ? "수정 권장"
      : "통과";
  const lines = [
    "종합: " + label,
    "검토 문안: " + result.counts.total + "건 (통과 " + result.counts.pass
      + " / 수정 권장 " + result.counts.revise
      + " / 기재 불가 " + result.counts.prohibited + ")",
  ];

  for (const entry of result.entries) {
    lines.push("- " + entry.entryId + ": " + entry.label);
    if (entry.status !== "pass") {
      lines.push("  이유: " + entry.reason);
      for (const guidance of entry.improvementGuidance) {
        lines.push("  개선: " + guidance);
      }
      for (const issue of entry.issues) {
        if (issue.kind === "editorial") lines.push("  [자체 편집 권고 - 교육부 공식 금지 규정 아님]");
      }
    }
  }
  lines.push("※ " + result.rewritePolicy);
  lines.push(result.disclaimer);
  return lines.join("\n");
}

export function formatSearchResults(results: readonly SearchResult[]): string {
  if (results.length === 0) return "검색 결과 없음";
  return results.map((result, index) => [
    `${index + 1}. ${result.title} - ${result.locatorLabel}`,
    `   chunkId: ${result.chunkId}`,
    `   ${result.snippet}`,
  ].join("\n")).join("\n");
}

export function formatSourceExcerpt(excerpt: SourceExcerpt): string {
  return [
    `${excerpt.title} - ${excerpt.locatorLabel}`,
    `chunkId: ${excerpt.chunkId}`,
    excerpt.text,
  ].join("\n");
}

export function formatRuleExplanation(explanation: RuleExplanation): string {
  const lines = [
    `${explanation.ruleId}: ${explanation.title}`,
    explanation.message,
    `권고: ${explanation.recommendation}`,
  ];
  if (explanation.authorityClass === "editorial-caution") {
    lines.push("[자체 편집 경고 - 공식 규정 아님]");
  } else {
    for (const evidence of explanation.evidence) {
      lines.push(`[${evidence.title}, ${evidence.locatorLabel}] ${evidence.quote}`);
    }
  }
  return lines.join("\n");
}

export function formatFieldList(fields: readonly FieldSpec[]): string {
  return [
    `지원 항목: ${fields.length}개`,
    ...fields.map((field) => `- ${field.key}: ${field.label}`),
  ].join("\n");
}

export function formatRulePackInfo(input: {
  rulePackId: string;
  schoolLevel: "elementary";
  academicYear: 2026;
  effectiveFrom: "2026-03-01";
  sources: readonly unknown[];
}): string {
  return [
    input.rulePackId,
    `학교급: 초등학교 / 학년도: ${input.academicYear}`,
    `시행일: ${input.effectiveFrom}`,
    `공식 출처: ${input.sources.length}개`,
  ].join("\n");
}
