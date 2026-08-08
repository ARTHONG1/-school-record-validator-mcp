# Teacher-Facing School Record Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 교사가 초등학교 학교생활기록부 문안 1건 또는 여러 건을 입력하면 하나의 MCP 도구가 통과, 수정 권장, 기재 불가를 일관되게 판정하고 근거와 개선 방향을 반환하게 한다.

**Architecture:** 검증된 2026 초등 규칙팩과 기존 RecordValidator는 그대로 유지한다. 새 teacher-review 어댑터가 안정적인 entries 배열을 기존 배치 검증 입력으로 변환하고, 저수준 결과를 교사용 3단계 상태와 간결한 근거로 투영한다. MCP 서버는 기본 teacher 모드에서 check_school_record 하나만 공개하고, 기존 7개 도구는 명시적인 expert 모드에서만 제공한다.

**Tech Stack:** Node.js 22.18+, TypeScript 5.9, Zod, Model Context Protocol SDK, node:test, Google Cloud Run.

## Global Constraints

- 적용 범위는 2026학년도 초등학교와 규칙팩 kr-moe-school-record-elementary-2026.1이다.
- 기본 입력은 entries 배열 한 가지 형태만 허용한다. 단일 문장도 배열 1건으로 전달한다.
- defaultField의 기본값은 subject_achievement_special이고 profile의 기본값은 official_plus_editorial이다.
- 문안에 provenance가 없다는 이유만으로 수정 권장 또는 기재 불가를 반환하지 않는다.
- 통과, 수정 권장, 기재 불가의 외부 값은 각각 pass, revise, prohibited로 고정한다.
- 공식 금지 내용의 block만 prohibited로 매핑한다. 길이 초과, review, editorial-caution은 revise로 매핑한다.
- editorial-caution은 교육부 공식 금지 규정이 아니라 자체 편집 권고임을 결과에 표시한다.
- MCP는 확인되지 않은 학생 활동, 증빙, 관찰 상황 또는 추천 수정문을 새로 만들지 않는다.
- 호출 AI는 MCP 상태를 변경하지 않으며, 수정문을 만들 때 입력 문장에 이미 있는 사실만 사용한다.
- 제출 문안과 학생 식별정보를 로그, 오류, structuredContent에 불필요하게 되돌려 보내지 않는다.
- 기본 teacher 모드는 check_school_record 하나만 노출한다. expert 모드는 새 도구와 기존 7개 도구를 함께 노출한다.
- 변경 버전은 0.3.0이며 기존 validate_record_text 및 validate_record_batch 사용자는 expert 모드로 마이그레이션한다.

---

## File Structure

- Create src/teacher-review.ts: 저수준 ValidationResult를 교사용 결과로 변환하는 순수 도메인 어댑터.
- Create src/toolset.ts: MCP_TOOLSET 환경값을 teacher 또는 expert로 파싱.
- Modify src/validator-types.ts: 교사용 요청, 이슈, 결과 타입 추가.
- Modify src/schemas.ts: check_school_record 입력·출력 Zod 스키마와 도구 설명 추가.
- Modify src/format.ts: 교사용 한국어 텍스트 결과 포맷터 추가.
- Modify src/handlers.ts: 새 스키마를 파싱하고 teacher-review 서비스를 호출.
- Modify src/server.ts: 기본 teacher 및 opt-in expert 도구 등록 분기.
- Modify src/index.ts, src/remote.ts, src/remote-config.ts, src/remote-server.ts: toolset을 stdio와 HTTP 서버 생성 경로에 전달.
- Create tests/teacher-review.test.ts: 상태 매핑과 결과 안전성 단위 테스트.
- Modify tests/handlers.test.ts, tests/server.test.ts, tests/remote-server.test.ts, tests/e2e/end-to-end.test.ts: MCP 계약과 전송별 회귀 테스트.
- Create docs/teacher-agent-prompt.md: 실제 AI 에이전트용 최종 시스템 프롬프트와 입력 변환 규칙.
- Modify README.md, docs/validation-result-contract.md, docs/remote-deployment.md, site/index.html: 교사 중심 사용법과 0.3.0 마이그레이션 문서.
- Modify package.json: 버전 0.3.0.

---

### Task 1: 교사용 결과 계약을 테스트로 고정

**Files:**
- Create: tests/teacher-review.test.ts
- Modify: src/validator-types.ts

**Interfaces:**
- Consumes: ValidationResult, BatchValidationResult, FieldKey, ValidationProfile.
- Produces: TeacherReviewRequest, TeacherReviewIssue, TeacherEntryReview, TeacherReviewResult.

- [ ] **Step 1: 교사용 타입을 먼저 선언한다**

~~~ts
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

export interface TeacherEntryReview {
  entryId: string;
  field: FieldKey;
  status: TeacherReviewStatus;
  label: "통과" | "수정 권장" | "기재 불가";
  reason: string;
  issues: TeacherReviewIssue[];
  improvementGuidance: string[];
  teacherChecks: string[];
}

export interface TeacherReviewResult {
  rulePackId: string;
  status: TeacherReviewStatus;
  counts: { total: number; pass: number; revise: number; prohibited: number };
  entries: TeacherEntryReview[];
  rewritePolicy: string;
  disclaimer: string;
}
~~~

- [ ] **Step 2: 정상 교과 문안이 provenance 없이 통과하는 실패 테스트를 작성한다**

~~~ts
const service = createTeacherReviewService(createValidator(buildTestBundle()));

it("passes a clean subject record without provenance metadata", () => {
  const result = service.review({
    entries: [{
      entryId: "record_1",
      text: "빗면을 이용하면 필요한 힘이 줄어드는 까닭을 설명하고 활용 사례를 조사하여 공유함.",
    }],
  });

  assert.equal(result.entries[0]?.status, "pass");
  assert.equal(result.entries[0]?.issues.length, 0);
  assert.match(result.entries[0]?.teacherChecks.join(" "), /실제 수행/u);
});
~~~

- [ ] **Step 3: 세 상태의 경계를 고정하는 실패 테스트를 작성한다**

~~~ts
it("maps editorial and length findings to revise and official prohibitions to prohibited", () => {
  const result = service.review({
    entries: [
      { entryId: "clean", text: "실험 결과를 비교하여 설명함." },
      { entryId: "editorial", text: "전교에서 가장 완벽하게 실험함." },
      { entryId: "official", text: "교외 영어경시대회에서 대상을 수상함." },
      { entryId: "length", field: "attendance_special", text: "가".repeat(501) },
    ],
  });

  assert.deepEqual(
    result.entries.map((entry) => entry.status),
    ["pass", "revise", "prohibited", "revise"],
  );
});
~~~

- [ ] **Step 4: 개인정보와 허위 수정 방지 실패 테스트를 작성한다**

~~~ts
it("does not echo full submitted text or invent a suggested revision", () => {
  const secret = "PRIVATE-STUDENT-SENTENCE-2026";
  const result = service.review({
    entries: [{ entryId: "record_1", text: secret }],
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(secret), false);
  assert.equal("suggestedRevision" in result.entries[0]!, false);
  assert.match(result.rewritePolicy, /입력 문장에 이미 확인된 사실/u);
});
~~~

- [ ] **Step 5: 단위 테스트를 실행해 teacher-review 모듈 부재로 실패함을 확인한다**

Run: npm.cmd run test:file -- tests/teacher-review.test.ts

Expected: FAIL because src/teacher-review.ts and createTeacherReviewService do not exist.

- [ ] **Step 6: 실패 상태를 유지한 채 Task 2 구현으로 바로 진행한다**

RED 단계에서는 커밋하지 않는다. Task 2에서 구현 후 테스트가 통과할 때 타입, 테스트, 구현을 하나의 녹색 커밋으로 묶는다.

---

### Task 2: 저수준 판정을 교사용 상태로 변환

**Files:**
- Create: src/teacher-review.ts
- Test: tests/teacher-review.test.ts

**Interfaces:**
- Consumes: RecordValidator.validateBatch(entries), TeacherReviewRequest.
- Produces: createTeacherReviewService(validator).review(request): TeacherReviewResult.

- [ ] **Step 1: 상태 매핑 순수 함수를 구현한다**

~~~ts
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
~~~

- [ ] **Step 2: 문안만으로 판단할 수 없는 category를 외부 상태에서 제외한다**

provenance와 context finding은 teacherChecks로만 요약하고 issues 및 status 계산에서 제외한다. length, content, editorial, conflict finding만 교사용 issues로 변환한다.

~~~ts
const actionable = result.findings.filter(
  (finding) => finding.category !== "provenance" && finding.category !== "context",
);
~~~

- [ ] **Step 3: 공식 근거와 자체 편집 권고를 분리해 변환한다**

~~~ts
function toTeacherIssue(finding: Finding): TeacherReviewIssue {
  return {
    ruleId: finding.ruleId,
    kind: finding.authorityClass === "official-policy" ? "official" : "editorial",
    status: issueStatus(finding),
    reason: finding.message,
    improvement: finding.recommendation,
    ...(finding.matchedText ? { matchedText: finding.matchedText } : {}),
    citations: finding.authorityClass === "official-policy"
      ? finding.evidence.map(({ title, locatorLabel, quote }) => ({ title, locatorLabel, quote }))
      : [],
  };
}
~~~

- [ ] **Step 4: 안정적인 공통 사유와 교사 확인 문구를 구현한다**

pass 사유는 "현재 규칙팩에서 금지 또는 수정 권장 표현이 탐지되지 않았습니다."로 고정한다. 모든 결과에는 "학생의 실제 수행 및 교사의 관찰·평가 내용과 일치하는지 최종 확인하세요."를 teacherChecks에 한 번만 넣는다.

- [ ] **Step 5: 배치 순서와 최악 상태 집계를 구현한다**

집계 우선순위는 prohibited > revise > pass이며 counts 합계가 entries 길이와 항상 일치해야 한다. entryId와 입력 순서는 변경하지 않는다.

- [ ] **Step 6: 단위 테스트를 실행한다**

Run: npm.cmd run test:file -- tests/teacher-review.test.ts

Expected: PASS for clean, editorial, official prohibition, length, privacy, order, and count cases.

- [ ] **Step 7: 구현을 커밋한다**

~~~powershell
git add src/teacher-review.ts src/validator-types.ts tests/teacher-review.test.ts
git commit -m "feat: add teacher-facing review adapter"
~~~

---

### Task 3: check_school_record 도구 스키마와 핸들러 추가

**Files:**
- Modify: src/schemas.ts
- Modify: src/format.ts
- Modify: src/handlers.ts
- Modify: tests/handlers.test.ts

**Interfaces:**
- Consumes: TeacherReviewRequest and createTeacherReviewService.
- Produces: inputParsers.check_school_record, outputSchemas.check_school_record, handlers.check_school_record.

- [ ] **Step 1: 한 가지 안정적인 입력 스키마를 실패 테스트로 고정한다**

~~~ts
const result = await handlers.check_school_record({
  entries: [
    { entryId: "record_1", text: "실험 결과를 비교하여 설명함." },
    { entryId: "record_2", text: "교외 영어경시대회에서 대상을 수상함." },
  ],
});
assert.equal(result.isError, undefined);
assert.deepEqual(
  result.structuredContent?.entries.map((entry) => entry.status),
  ["pass", "prohibited"],
);
~~~

허용 최상위 키는 entries, defaultField, profile뿐이다. entries는 1~100건, entryId는 1~100자이며 중복을 금지하고 text는 1~200,000자로 유지한다.

- [ ] **Step 2: check_school_record 입출력 Zod 스키마를 추가한다**

defaultField은 subject_achievement_special, profile은 official_plus_editorial로 기본화한다. entry.field가 없으면 defaultField을 사용한다. 출력은 Task 1의 타입과 같은 strict object로 정의한다.

- [ ] **Step 3: AI가 오도구를 선택하지 않도록 도구 설명을 작성한다**

~~~ts
description: [
  "교사가 학교생활기록부 문안의 통과, 수정 권장, 기재 불가 판단을 요청하면 반드시 이 도구만 호출한다.",
  "한 문장도 entries 배열 1건으로 전달한다.",
  "입력 JSON의 record_1, record_2 같은 키는 entryId와 text 배열로 변환한다.",
  "결과 status를 임의로 변경하지 말고, pass에 문제를 만들어내지 않는다.",
  "수정문은 입력에 이미 있는 사실만 사용하며 새로운 활동이나 관찰 근거를 만들지 않는다.",
].join(" "),
~~~

- [ ] **Step 4: 교사용 읽기 쉬운 텍스트 포맷터를 추가한다**

~~~text
종합: 수정 권장
검토 문안: 3건 (통과 2 / 수정 권장 1 / 기재 불가 0)
- record_1: 통과
- record_2: 수정 권장
  이유: 근거 없는 최상급 표현을 확인해야 합니다.
  개선: 관찰 가능한 수행 사실 중심으로 표현하세요.
※ 수정문은 입력 문장에 이미 확인된 사실만 사용해야 합니다.
~~~

- [ ] **Step 5: 핸들러가 저수준 validator가 아닌 teacher-review 서비스를 호출하게 한다**

createHandlers 내부에서 createTeacherReviewService(services.validator)를 한 번 생성하고 check_school_record 호출마다 review를 실행한다. Zod 오류는 기존 privacy-safe 입력 오류로 변환한다.

- [ ] **Step 6: 잘못된 record 객체와 중복 entryId가 안전한 입력 오류를 반환하는 테스트를 추가한다**

~~~ts
const wrongShape = await handlers.check_school_record({
  record: { record_1: "학생 문안" },
});
assert.equal(wrongShape.isError, true);
assert.equal(wrongShape.structuredContent, undefined);
~~~

- [ ] **Step 7: 핸들러 테스트와 타입 검사를 실행한다**

Run: npm.cmd run test:file -- tests/handlers.test.ts tests/teacher-review.test.ts

Expected: PASS.

Run: npm.cmd run typecheck

Expected: PASS.

- [ ] **Step 8: 도구 계약을 커밋한다**

~~~powershell
git add src/schemas.ts src/format.ts src/handlers.ts tests/handlers.test.ts
git commit -m "feat: expose practical school record check tool"
~~~

---

### Task 4: 기본 teacher 도구셋과 expert 호환 모드 구현

**Files:**
- Create: src/toolset.ts
- Modify: src/server.ts
- Modify: src/index.ts
- Modify: src/remote.ts
- Modify: src/remote-config.ts
- Modify: src/remote-server.ts
- Modify: tests/server.test.ts
- Modify: tests/remote-config.test.ts

**Interfaces:**
- Produces: Toolset = "teacher" | "expert", parseToolset(value), createServer(services, { toolset }).
- Consumes: MCP_TOOLSET environment variable.

- [ ] **Step 1: 기본 서버가 하나의 도구만 노출하는 실패 테스트를 작성한다**

~~~ts
const result = await client.listTools();
assert.deepEqual(result.tools.map((tool) => tool.name), ["check_school_record"]);
~~~

- [ ] **Step 2: expert 서버가 8개 도구를 노출하는 실패 테스트를 작성한다**

~~~ts
const server = createServer(services, { toolset: "expert" });
assert.deepEqual(
  (await client.listTools()).tools.map((tool) => tool.name).sort(),
  [
    "check_school_record",
    "explain_record_rule",
    "get_source_excerpt",
    "list_record_fields",
    "rule_pack_info",
    "search_record_guidance",
    "validate_record_batch",
    "validate_record_text",
  ],
);
~~~

- [ ] **Step 3: 환경값 파서를 구현한다**

~~~ts
export type Toolset = "teacher" | "expert";

export function parseToolset(value: string | undefined): Toolset {
  if (value === undefined || value === "" || value === "teacher") return "teacher";
  if (value === "expert") return "expert";
  throw new Error("MCP_TOOLSET must be teacher or expert");
}
~~~

- [ ] **Step 4: 서버 등록을 모드별로 분기한다**

check_school_record는 항상 등록한다. 기존 7개 registerTool 호출은 toolset === "expert" 블록 안에서만 실행한다. 서버 버전은 package.json의 0.3.0과 일치시킨다.

- [ ] **Step 5: stdio와 remote 시작 경로에서 MCP_TOOLSET을 전달한다**

기본 환경에서는 teacher를 사용한다. stdio는 index.ts에서 parseToolset(process.env.MCP_TOOLSET)을 호출하고, remote는 RemoteConfig.toolset을 createRemoteApp에서 createServer로 전달한다. 잘못된 값은 서버 시작 전에 학생 문안이나 환경값 원문을 노출하지 않는 일반 구성 오류로 종료한다.

- [ ] **Step 6: 서버 및 구성 테스트를 실행한다**

Run: npm.cmd run test:file -- tests/server.test.ts tests/remote-config.test.ts

Expected: PASS for default teacher, explicit expert, and invalid environment values.

- [ ] **Step 7: 도구셋 변경을 커밋한다**

~~~powershell
git add src/toolset.ts src/server.ts src/index.ts src/remote.ts src/remote-config.ts src/remote-server.ts tests/server.test.ts tests/remote-config.test.ts
git commit -m "feat: default mcp to teacher toolset"
~~~

---

### Task 5: 로컬·Remote MCP 실제 호출 계약 검증

**Files:**
- Modify: tests/remote-server.test.ts
- Modify: tests/e2e/end-to-end.test.ts
- Modify: tests/privacy.test.ts
- Modify: tests/performance.test.ts

**Interfaces:**
- Consumes: Streamable HTTP /mcp, stdio transport, check_school_record schema.
- Produces: 전송 방식과 무관한 동일 structuredContent.

- [ ] **Step 1: Remote MCP 기본 도구 검색 테스트를 1개 도구 기준으로 변경한다**

teacher 모드의 listTools 결과가 check_school_record 하나인지 확인하고, expert 옵션을 준 서버만 8개를 반환하도록 분리한다.

- [ ] **Step 2: 사용자가 제시한 과학 문안 3건을 실제 MCP 호출로 검증한다**

~~~ts
const result = await client.callTool({
  name: "check_school_record",
  arguments: {
    entries: [
      { entryId: "record_1", text: "빗면을 이용하면 필요한 힘이 줄어드는 까닭을 설명하고 활용 사례를 조사하여 공유함." },
      { entryId: "record_2", text: "기후변화가 인간 생활과 자연환경에 미치는 영향을 설명함." },
      { entryId: "record_3", text: "식물 세포를 관찰하여 핵과 세포벽의 위치를 확인함." },
    ],
  },
});
assert.deepEqual(
  result.structuredContent?.entries.map((entry) => entry.status),
  ["pass", "pass", "pass"],
);
~~~

- [ ] **Step 3: 공식 금지·편집 경고·길이 초과 E2E 사례를 추가한다**

공인어학시험·교외대회 수상은 prohibited, "전교에서 가장"은 revise, 출결 1,503Byte는 revise로 고정한다. 각 official issue에는 locatorLabel과 quote가 있어야 하고 editorial issue의 citations는 빈 배열이어야 한다.

- [ ] **Step 4: submitted text 비노출과 입력 한도를 다시 검증한다**

도구 성공 결과와 오류 결과 모두 전체 원문을 포함하지 않아야 한다. 100건은 통과하고 101건은 원문 없는 입력 오류를 반환해야 한다.

- [ ] **Step 5: 교사용 도구 성능 예산을 추가한다**

문안 100건 배치가 기존 validateBatch 성능 한도의 3배 이내에서 끝나는지 확인한다. 추가 네트워크나 LLM 호출은 없어야 한다.

- [ ] **Step 6: 전체 전송 테스트를 실행한다**

Run: npm.cmd run test:e2e

Expected: PASS for stdio and Streamable HTTP teacher tool calls.

Run: npm.cmd test

Expected: all tests PASS.

- [ ] **Step 7: 통합 계약을 커밋한다**

~~~powershell
git add tests/remote-server.test.ts tests/e2e/end-to-end.test.ts tests/privacy.test.ts tests/performance.test.ts
git commit -m "test: verify teacher review over mcp transports"
~~~

---

### Task 6: AI 에이전트 시스템 프롬프트와 교사용 문서 개편

**Files:**
- Create: docs/teacher-agent-prompt.md
- Modify: README.md
- Modify: docs/validation-result-contract.md
- Modify: docs/remote-deployment.md
- Modify: site/index.html
- Modify: site/styles.css
- Modify: scripts/verify-site.mjs

**Interfaces:**
- Consumes: check_school_record의 정확한 입출력 계약.
- Produces: 복사 가능한 전체 시스템 프롬프트와 0.2.x 마이그레이션 안내.

- [ ] **Step 1: 최종 시스템 프롬프트를 문서화한다**

프롬프트에는 다음 문장을 그대로 포함한다.

~~~text
사용자가 학교생활기록부 문안의 점검을 요청하면 school-record-validator MCP의 check_school_record 도구를 정확히 한 번 호출한다. 한 문장은 entries 배열 1건으로, record_1·record_2 형식의 객체는 각 키를 entryId로 하고 값을 text로 변환한다. 기본 field는 subject_achievement_special을 사용한다. MCP가 반환한 pass, revise, prohibited 상태를 임의로 변경하지 않는다. pass인 문안에는 문제를 새로 만들지 않는다. revise 또는 prohibited인 경우에만 MCP의 reason, issues, improvementGuidance와 공식 인용을 설명한다. 추천 수정문은 사용자가 입력한 문장에 이미 있는 사실만 사용해 작성하고, 새로운 활동·성과·관찰·증빙·교사 지도 사실을 추가하지 않는다. editorial 이슈는 교육부 공식 금지가 아니라 자체 편집 권고라고 명시한다. 최종 답변은 문안별로 상태, 이유, 개선 방향, 추천 수정문 순서로 간결하게 제시하고 마지막에 실제 수행 사실과 최신 기재요령을 교사가 확인해야 한다고 안내한다.
~~~

- [ ] **Step 2: README 첫 화면을 교사 워크플로 중심으로 다시 쓴다**

첫 사용 흐름은 "문장 입력 → check_school_record 1회 호출 → 통과/수정 권장/기재 불가 → 필요 시 수정문"으로 설명한다. 7개 도구 소개는 expert 모드 절로 이동한다.

- [ ] **Step 3: 실제 입력 변환 예시를 추가한다**

~~~json
{
  "entries": [
    { "entryId": "record_1", "text": "빗면을 이용하면 필요한 힘이 줄어드는 까닭을 설명함." },
    { "entryId": "record_2", "text": "기후변화가 환경에 미치는 영향을 설명함." }
  ]
}
~~~

student_name과 subject는 MCP 판정에 보내지 않고 호출 AI 또는 프론트엔드에서 표시용으로만 보존한다고 명시한다.

- [ ] **Step 4: 결과 계약 문서를 교사용 계약 우선으로 변경한다**

pass, revise, prohibited를 첫 절에서 설명하고, needs_context는 expert 저수준 계약의 호환 필드로만 이동한다. "provenance 미입력 = 경고"로 읽힐 수 있는 기존 예시는 제거한다.

- [ ] **Step 5: expert 모드 마이그레이션을 명시한다**

기존 validate_record_text, validate_record_batch, 검색·원문 도구가 필요한 설치는 MCP_TOOLSET=expert를 설정한다. 0.3.0 기본 모드에서는 예전 도구 선택 설정을 check_school_record로 다시 선택해야 한다.

- [ ] **Step 6: 홈페이지의 대표 도구와 결과 카드를 갱신한다**

도구 목록의 첫 화면은 check_school_record 하나를 보여주고, 결과 예시는 통과·수정 권장·기재 불가 3개만 사용한다. needs_context는 expert API 설명에만 남긴다.

- [ ] **Step 7: 문서와 사이트 검증을 실행한다**

Run: npm.cmd run verify:site

Expected: PASS and required text includes check_school_record, pass, revise, prohibited.

Run: rg -n "반드시.*validate_record_(text|batch)|도구 7개|종합.*needs_context" README.md site docs/teacher-agent-prompt.md

Expected: no stale teacher-facing instructions; expert compatibility references may remain under the migration section.

- [ ] **Step 8: 문서 개편을 커밋한다**

~~~powershell
git add README.md docs/teacher-agent-prompt.md docs/validation-result-contract.md docs/remote-deployment.md site scripts/verify-site.mjs
git commit -m "docs: make teacher review the primary workflow"
~~~

---

### Task 7: 0.3.0 릴리스, GitHub, Cloud Run 배포

**Files:**
- Modify: package.json
- Modify: package-lock.json
- Verify: Dockerfile
- Verify: .github/workflows/ci.yml

**Interfaces:**
- Produces: GitHub main, tag v0.3.0, 기본 teacher 모드의 공개 Remote MCP.

- [ ] **Step 1: 패키지 버전을 0.3.0으로 올린다**

Run: npm.cmd version 0.3.0 --no-git-tag-version

Expected: package.json and package-lock.json both report 0.3.0.

- [ ] **Step 2: 최종 로컬 검증을 실행한다**

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run verify:site
npm.cmd pack --dry-run
git diff --check
~~~

Expected: every command exits 0; package dry run contains dist, data, docs, attribution, licenses, and README.

- [ ] **Step 3: teacher 및 expert 로컬 smoke test를 각각 실행한다**

기본 환경의 tools/list는 check_school_record 하나여야 한다. MCP_TOOLSET=expert 환경의 tools/list는 새 도구와 기존 7개 도구를 반환해야 한다.

- [ ] **Step 4: 릴리스 변경을 커밋하고 main에 push한다**

~~~powershell
git add package.json package-lock.json
git commit -m "chore: release teacher-focused validator 0.3.0"
git push origin main
~~~

- [ ] **Step 5: GitHub CI와 Pages 성공을 확인한다**

Run: gh run list --repo ARTHONG1/-school-record-validator-mcp --limit 5

Expected: latest CI and Deploy GitHub Pages runs both complete with success.

- [ ] **Step 6: Cloud Run 변경 배포 전 사용자 승인을 확인한다**

공개 서비스 동작을 teacher 기본 모드로 바꾸는 외부 배포이므로 구현 검증 결과, 변경되는 도구 목록, 기존 사용자 영향, 비용 설정 유지값을 보고하고 명시적 승인을 받은 뒤 다음 단계로 진행한다.

- [ ] **Step 7: 기존 비용 제한을 유지해 Cloud Run 새 revision을 배포한다**

~~~powershell
gcloud run deploy school-record-validator-mcp --source . --region asia-northeast3 --allow-unauthenticated --min 0 --max 1 --memory 512Mi --cpu 1 --concurrency 20 --set-env-vars MCP_TOOLSET=teacher,MCP_ENABLE_LEGACY_SSE=false
~~~

Expected: deployment succeeds and returns the existing service URL ending in run.app.

- [ ] **Step 8: 공개 Remote MCP를 smoke test한다**

health endpoint가 HTTP 200인지 확인한다. /mcp의 tools/list는 check_school_record 하나를 반환해야 한다. 정상 과학 문안은 pass, 교외대회 수상 문안은 prohibited여야 하며 응답에 전체 학생 문안이 포함되지 않아야 한다.

- [ ] **Step 9: v0.3.0 태그를 생성한다**

~~~powershell
git tag -a v0.3.0 -m "Release v0.3.0"
git push origin v0.3.0
~~~

Expected: tag-triggered CI succeeds.

---

## Acceptance Checklist

- [ ] 교사가 정상 문안만 입력하면 provenance 없이 pass를 받는다.
- [ ] 공식 금지 표현은 prohibited와 공식 문서 인용을 받는다.
- [ ] 최상급·단정 등 자체 편집 경고와 길이 초과는 revise를 받는다.
- [ ] pass 결과에 AI가 새로운 문제나 수정문을 만들어내지 않도록 도구 설명과 시스템 프롬프트가 일치한다.
- [ ] 추천 수정문은 MCP가 허위로 생성하지 않으며 호출 AI도 입력 사실 밖의 내용을 추가하지 않는다.
- [ ] 기본 Remote MCP에는 check_school_record 하나만 보인다.
- [ ] 기존 7개 도구는 expert 모드에서 계속 사용할 수 있다.
- [ ] stdio, Streamable HTTP, 공개 Cloud Run에서 같은 structuredContent 계약을 반환한다.
- [ ] 전체 테스트, 타입 검사, 빌드, E2E, 사이트 검증, GitHub CI가 통과한다.
- [ ] README와 홈페이지가 교사 관점의 실제 사용법을 첫 화면에서 설명한다.
