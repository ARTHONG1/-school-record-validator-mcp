# Validation Result Contract

`validate_record_text`와 `validate_record_batch`는 2026 초등 규칙팩을 기준으로 문안 내용과 작성 경위 정보를 분리해 반환합니다.

## Two axes

- `contentStatus`: 문안 자체의 `pass | review | blocked`
- `contextStatus`: 작성 경위의 `complete | needs_context | review | blocked`
- `status`: 두 결과를 합친 `pass | needs_context | review | blocked`

종합 상태 우선순위는 `blocked > review > needs_context > pass`입니다.

`findings`에는 실제 조치가 필요한 `block` 또는 `review`만 들어갑니다. 입력에 provenance가 없거나 `unknown`이면 `findings`가 아니라 `needsContext`에 필요한 입력 항목이 들어갑니다.

## Example: clean text without provenance

```json
{
  "status": "needs_context",
  "contentStatus": "pass",
  "contextStatus": "needs_context",
  "findings": [],
  "needsContext": [
    {
      "ruleId": "OFFICIAL-DIRECT-OBSERVATION",
      "category": "provenance",
      "message": "교사가 직접 관찰·평가한 근거가 확인되어야 합니다.",
      "recommendation": "교사의 직접 관찰 여부와 예외 근거를 확인하십시오.",
      "requiredFields": ["provenance.observationBasis"]
    }
  ]
}
```

이 결과는 문안에서 금지사항을 발견했다는 뜻이 아닙니다. 교사가 최종 입력 전에 관찰·사실성·작성 경위를 확인해야 한다는 뜻입니다.

## Explicit provenance outcomes

| 입력 | 결과 |
|---|---|
| `observationBasis: direct`, `factualSupport: supported` | 해당 확인 통과 |
| `observationBasis: unknown` 또는 미입력 | `needs_context` |
| `factualSupport: unverified` | `review` |
| `factualSupport: known_false` | `blocked` |
| `studentWroteFinalNarrative: true` | `blocked` |
| `aiUse: proofreading` + 교사 검증 없음 | `review` |
| `aiUse: verbatim` | `blocked` |
| `aiUse: unknown` 또는 미입력 | AI finding 없음, 필요 시 `needs_context` |

## Search

`search_record_guidance`는 외부 검색·임베딩 서비스 없이 활성 코퍼스를 결정적으로 검색합니다. BM25 계열 점수에 정확 구절, 공백을 제거한 한국어 합성어, heading 일치, 질의어 coverage를 함께 반영합니다. `sourceRoles`에는 `primary-guide`, `directive-body`, `verification-copy`, `directive-appendix`를 지정할 수 있습니다.

