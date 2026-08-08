import type { RewritePlan, TeacherReviewIssue, TeacherReviewStatus } from "./validator-types.ts";

const GENERIC_EVIDENCE = [
  "학생이 실제로 수행한 구체적인 행동",
  "교사가 관찰·평가한 장면 또는 결과",
];

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function createRewritePlan(
  status: TeacherReviewStatus,
  issues: readonly TeacherReviewIssue[],
  improvementGuidance: readonly string[],
): RewritePlan {
  if (status === "pass") {
    return {
      action: "none",
      mustRemove: [],
      instructions: [],
      rewriteReason: "현재 규칙팩에서 수정이 필요한 항목이 탐지되지 않았습니다.",
      neededEvidence: [],
      requiresRevalidation: false,
    };
  }

  const mustRemove = unique(
    issues
      .filter((issue) => issue.status === "prohibited")
      .map((issue) => issue.matchedText)
      .filter((value): value is string => Boolean(value)),
  );
  const instructions = unique([
    ...improvementGuidance,
    ...issues.filter((issue) => issue.status === "prohibited").map((issue) => issue.improvement),
  ]);

  if (status === "prohibited") {
    return {
      action: "ask_evidence",
      mustRemove,
      instructions,
      rewriteReason: "입력 문장에 기재할 수 없는 핵심 내용이 포함되어 있어, 해당 내용을 제거한 안전한 수정문을 자동으로 확정할 수 없습니다.",
      neededEvidence: GENERIC_EVIDENCE,
      requiresRevalidation: true,
    };
  }

  return {
    action: "rewrite",
    mustRemove,
    instructions,
    rewriteReason: "입력에 이미 확인된 사실만 유지하고 지적된 표현을 수정한 후보를 외부 AI가 작성한 뒤 다시 검증해야 합니다.",
    neededEvidence: [],
    requiresRevalidation: true,
  };
}
