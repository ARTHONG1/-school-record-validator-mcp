# External AI Safe Rewrite Design

## Purpose

`check_school_record`를 사용하는 외부 AI가 규정 위반 문안을 자연스럽게 수정하되, 입력에 없는 학생 활동·성과·관찰·증빙을 만들어내지 않도록 한다. MCP는 문장을 생성하지 않고 판정, 수정 제약, 추가로 필요한 사실과 2차 검증을 담당한다.

## Non-goals

- MCP 내부에서 생성형 모델 또는 외부 AI API를 호출하지 않는다.
- MCP가 자연어 추천 문장을 직접 반환하지 않는다.
- 규정 판정 결과를 외부 AI가 변경하거나 완화하지 않는다.
- `pass` 문안을 문체 취향만으로 다시 쓰지 않는다.
- 1차 릴리스에서 금지 표현이 포함된 문장의 안전한 잔여 사실을 의미론적으로 자동 판별하지 않는다.

## Roles

### MCP

- 원문을 `pass`, `revise`, `prohibited`로 판정한다.
- 문제 구절, 규칙 ID, 공식 근거와 개선 방향을 반환한다.
- 외부 AI가 따라야 할 `rewritePlan`을 문안별로 반환한다.
- 외부 AI가 만든 후보 문장을 같은 규칙팩으로 다시 검증한다.

### External AI

- 사용자의 원문을 보유한다.
- 1차 MCP 결과의 상태와 `rewritePlan`을 변경하지 않는다.
- 입력 원문에 있는 사실만 사용해 후보 문장을 작성한다.
- 후보를 `check_school_record`로 2차 검증한다.
- 2차 결과가 `pass`인 경우에만 `suggestedRewrite`로 사용자에게 제시한다.
- 구체적 수행 사실이 부족하거나 2차 검증이 실패하면 `suggestedRewrite: null`을 반환한다.

## End-to-end Flow

1. 외부 AI가 사용자 입력의 `record_1`, `record_2`를 `entries` 배열로 변환한다.
2. 외부 AI가 원문 entries로 `check_school_record`를 호출한다.
3. MCP가 문안별 판정과 `rewritePlan`을 반환한다.
4. `action: none`이면 외부 AI는 원문을 수정하지 않는다.
5. `action: rewrite`이면 외부 AI는 `mustRemove`와 `instructions`를 준수해 후보를 작성한다.
6. `action: ask_evidence`이면 외부 AI는 추천문을 만들지 않고 `neededEvidence`를 사용자에게 요청한다.
7. 후보가 생성된 경우 외부 AI가 후보만 담아 `check_school_record`를 다시 호출한다.
8. 2차 결과가 `pass`이면 `suggestedRewrite`와 `rewriteVerified: true`를 반환한다.
9. 2차 결과가 `revise` 또는 `prohibited`이면 후보를 폐기하고 `suggestedRewrite: null`, `rewriteVerified: false`와 실패 이유를 반환한다.

## MCP Output Contract

`TeacherEntryReview`에 다음 객체를 추가한다.

~~~ts
export type RewriteAction = "none" | "rewrite" | "ask_evidence";

export interface RewritePlan {
  action: RewriteAction;
  mustRemove: string[];
  instructions: string[];
  rewriteReason: string;
  neededEvidence: string[];
  requiresRevalidation: boolean;
}
~~~

문안별 결과 예시는 다음과 같다.

~~~json
{
  "entryId": "record_1",
  "status": "prohibited",
  "label": "기재 불가",
  "reason": "교내·외 대회 참가 또는 수상실적은 기재할 수 없습니다.",
  "issues": [
    {
      "ruleId": "OFFICIAL-COMPETITION-AWARD",
      "matchedText": "대회에서 1등을 수상",
      "status": "prohibited"
    }
  ],
  "rewritePlan": {
    "action": "ask_evidence",
    "mustRemove": ["대회에서 1등을 수상"],
    "instructions": [
      "대회명, 참가 사실, 순위 및 수상실적을 삭제하십시오.",
      "입력에 없는 활동, 성과 또는 관찰 사실을 추가하지 마십시오."
    ],
    "rewriteReason": "금지 내용을 제외하면 기재 가능한 구체적 수행 사실을 확인할 수 없습니다.",
    "neededEvidence": [
      "학교 수업이나 교육활동에서 학생이 실제로 수행한 행동",
      "교사가 관찰한 구체적인 모습"
    ],
    "requiresRevalidation": true
  }
}
~~~

## Rewrite Action Rules

### `none`

- entry 상태가 `pass`이다.
- `mustRemove`, `instructions`, `neededEvidence`는 빈 배열이다.
- `requiresRevalidation`은 `false`이다.
- 외부 AI는 원문을 그대로 유지하고 추천 수정문을 만들지 않는다.

### `rewrite`

- entry 상태가 `revise`이다.
- 길이 초과 또는 자체 편집 경고처럼 입력 사실을 유지하면서 표현만 정리할 수 있다.
- `mustRemove`는 모든 issue의 중복 제거된 `matchedText` 목록이다.
- `instructions`는 `improvementGuidance`와 사실 추가 금지 문구를 포함한다.
- `neededEvidence`는 기본적으로 빈 배열이다.
- `requiresRevalidation`은 `true`이다.

### `ask_evidence`

- entry 상태가 `prohibited`이다.
- 1차 릴리스에서는 금지 내용이 포함된 문장을 보수적으로 처리한다.
- 외부 AI는 원문만으로 추천 수정문을 만들지 않는다.
- `neededEvidence`에는 학교 교육활동에서의 실제 수행 행동과 교사의 구체적 관찰을 요청한다.
- `requiresRevalidation`은 `true`이다. 사용자가 추가 사실을 제공한 뒤 새 원문으로 다시 검사해야 한다.

## Evidence Presentation

기존 `issues[].citations`를 유지한다. 외부 AI는 첫 번째 official issue의 첫 번째 citation을 대표 근거로 표시하되, 여러 규칙이 있으면 규칙별 근거를 생략하지 않는다.

최종 사용자 화면은 다음 다섯 요소를 우선 표시한다.

1. 판정
2. 문제 부분
3. 공식 근거 또는 자체 편집 권고 표시
4. 수정 방향
5. 추천 표현 또는 추가로 필요한 사실

## External AI Final Output

`suggestedRewrite`는 MCP 필드가 아니라 외부 AI 노드의 최종 출력 필드이다.

~~~ts
interface AgentRewriteResult {
  entryId: string;
  status: "pass" | "revise" | "prohibited";
  suggestedRewrite: string | null;
  rewriteVerified: boolean;
  rewriteReason: string;
  neededEvidence: string[];
}
~~~

외부 AI는 후보 문장을 2차 검증하기 전에는 `rewriteVerified: true`를 반환할 수 없다.

## Prompt Requirements

기존 시스템 프롬프트의 “도구를 정확히 한 번 호출한다”를 제거한다. 다음 규칙을 포함한다.

- 원문 검증을 위해 1차 호출한다.
- `rewritePlan.action`이 `rewrite`일 때만 후보를 작성한다.
- 후보는 입력 원문의 사실만 사용한다.
- 후보를 같은 `entryId`로 2차 호출한다.
- 2차 결과가 `pass`일 때만 추천문을 보여준다.
- `ask_evidence`이면 사용자에게 필요한 사실을 질문하고 추천문은 null로 둔다.
- `pass`이면 수정문을 만들지 않는다.

## Error Handling

- 1차 MCP 호출 실패: 판정을 생성하지 않고 도구 연결 오류를 반환한다.
- 후보 생성 실패: 원래 판정은 유지하고 `suggestedRewrite: null`을 반환한다.
- 2차 MCP 호출 실패: 후보를 검증된 수정문으로 표시하지 않는다.
- 2차 결과가 `revise` 또는 `prohibited`: 후보를 폐기하고 남은 이슈를 사용자에게 설명한다.
- 여러 entry 중 하나의 재검증 실패가 다른 entry의 검증된 결과를 무효화하지 않는다.

## Privacy

- MCP structuredContent는 제출 원문 전체를 되돌려 보내지 않는다.
- `mustRemove`는 기존 `matchedText`와 동일하게 최대 80 code point로 제한한다.
- 학생명과 과목명은 MCP에 보내지 않고 외부 AI 또는 프론트엔드에서 표시용으로 보존한다.
- 공개 Remote MCP에는 실제 학생 식별정보를 보내지 않는 기존 정책을 유지한다.

## Testing Strategy

### Unit

- `pass`는 `action: none`.
- 최상급·절대 표현은 `action: rewrite`.
- 공식 대회·수상·공인어학시험은 `action: ask_evidence`.
- 중복 `matchedText`와 instructions는 제거된다.
- 전체 원문과 학생 식별정보는 rewrite plan에 포함되지 않는다.

### Contract

- Zod output schema가 `rewritePlan`을 strict object로 검증한다.
- stdio와 Streamable HTTP가 동일한 구조를 반환한다.
- 기존 `status`, `issues`, `counts` 계약은 변경되지 않는다.

### Two-pass E2E

- “항상 완벽하게 수행함”의 1차 결과는 `rewrite`.
- 외부 AI 역할의 테스트 fixture가 “과제를 기한 안에 수행함” 후보를 제출한다.
- 후보의 2차 결과가 `pass`일 때만 검증 성공으로 처리한다.
- 금지된 수상실적 문장은 1차에서 `ask_evidence`이며 후보를 생성하지 않는다.
- 2차 후보에 다른 금지 표현이 남으면 검증 실패로 처리한다.

## Versioning and Rollout

- 버전을 `0.4.0`으로 올린다.
- 기본 teacher 도구 이름과 입력 스키마는 유지한다.
- 출력에 필드를 추가하는 하위 호환 확장으로 배포한다.
- GitHub CI와 Pages를 먼저 통과시킨다.
- 공개 Cloud Run은 기존 URL, `MCP_TOOLSET=teacher`, min instances 0, max instances 1, 1 CPU, 512Mi 설정을 유지한다.
- 배포 후 실제 `rewrite`, `ask_evidence`, 2차 `pass` 호출을 smoke test한다.
