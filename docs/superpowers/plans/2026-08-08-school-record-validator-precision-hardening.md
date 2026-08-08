# School Record Validator Precision Hardening Implementation Plan

> **Execution note:** Implement this plan in a separate session with `superpowers:executing-plans`, use `superpowers:test-driven-development` for every behavior change, and run `superpowers:verification-before-completion` before reporting completion.

**Goal:** 정상 문안과 작성 경위 미입력을 구분하고, 규정 검색의 top-k 정밀도를 높이면서 기존 차단·근거 추적·개인정보 보호 계약을 보존한다.

**Architecture:** 검증 결과를 `contentStatus`와 `contextStatus`의 두 축으로 계산한 뒤 호환용 종합 `status`를 도출한다. 실제 위반/위험은 기존 `findings`에 유지하고, 누락 정보는 별도 `needsContext`에 담는다. 검색은 외부 서비스 없이 production corpus에서 계산한 BM25 계열 점수와 결정적 재랭킹을 사용한다.

**Tech Stack:** TypeScript 5.9, Node.js 22 test runner, Zod 3, MCP SDK 1.30, sealed JSON/JSONL corpus.

---

## Task 1: Characterization tests for the reported failures

**Files:**

- Modify: `tests/provenance.test.ts`
- Modify: `tests/validator.test.ts`
- Modify: `tests/search.test.ts`
- Add: `tests/fixtures/search-cases.json`

1. Add a failing test showing that omitted and explicit `unknown` provenance do not mean an actual review finding.
2. Add separate cases for `observationBasis: none`, `factualSupport: known_false`, `studentWroteFinalNarrative: true`, and `aiUse: verbatim`; these must remain blocked.
3. Add cases proving `aiUse: proofreading | draft_generation_rewritten` without teacher verification remains review, while `aiUse: none | unknown | undefined` does not create an AI finding.
4. Add the production failure query `학교생활기록부 입력 최대 글자 수` and require `MOE-GUIDE-ELEMENTARY-2026:pdf-156` at rank 1.
5. Add 8-12 audited search queries covering direct observation, AI verbatim input, student materials, contests, language tests, corrections, attendance, and maximum length. Each fixture records expected chunk IDs and forbidden top-3 topic IDs.
6. Run focused tests and confirm they fail for the intended semantic reasons:

```powershell
npm.cmd run test:file -- tests/provenance.test.ts tests/validator.test.ts tests/search.test.ts
```

**Commit:** `test: characterize provenance and search precision failures`

## Task 2: Introduce the two-axis validation domain contract

**Files:**

- Modify: `src/check-types.ts`
- Modify: `src/validator-types.ts`
- Modify: `src/provenance.ts`
- Modify: `src/validator.ts`
- Modify: `tests/provenance.test.ts`
- Modify: `tests/validator.test.ts`

1. Add a domain type for context requirements with `ruleId`, `kind`, `message`, and `requiredFields`; it must not contain submitted student text.
2. Keep `Finding.outcome` limited to `block | review`. Do not encode missing information as a finding.
3. Change provenance evaluation to return `{ matches, needsContext }`.
4. Apply this truth table:

| Input state | Domain result |
|---|---|
| omitted or explicit `unknown` | neutral `needsContext`, no finding |
| explicit safe value | no finding, no context requirement |
| explicit uncertain risk such as documented exception or AI-assisted but unverified | review finding |
| explicit forbidden value | block finding |

5. For `studentMaterial`, only require plan/guidance context after an allowed student-material type is explicitly supplied. Do not assume student material was used when the property is absent.
6. Calculate `contentStatus` from non-provenance findings and `contextStatus` from provenance findings plus `needsContext`.
7. Aggregate `status` with `blocked > review > needs_context > pass`; preserve batch order and aggregate with the same precedence.
8. Run the focused tests until green.

**Commit:** `feat: separate record content from provenance completeness`

## Task 3: Update MCP schemas and readable output

**Files:**

- Modify: `src/schemas.ts`
- Modify: `src/format.ts`
- Modify: `src/handlers.ts` only if mapping is required
- Modify: `tests/handlers.test.ts`
- Add: `tests/format.test.ts`
- Modify: `tests/server.test.ts`
- Modify: `tests/e2e/end-to-end.test.ts`

1. Extend validation output schemas with `contentStatus`, `contextStatus`, and `needsContext`.
2. Add `needs_context` to top-level and batch status enums; keep all nested schemas strict.
3. Format content first: `문안 점검: 통과/검토 필요/기재 차단`.
4. Format context separately: `작성 경위: 확인 정보 부족` with neutral bullets. Never label missing context as a violation or dangerous content.
5. Ensure a clean text-only input reads approximately:

```text
문안 점검: 통과
작성 경위: 확인 정보 부족
- 최종 기재 전 교사의 직접·지속적 관찰에 기반한 내용인지 확인하세요.
```

6. Update batch summaries to show content result and context result without counting `needsContext` as findings.
7. Validate all structured outputs against Zod and through stdio/remote MCP tests.

**Commit:** `feat: expose neutral context requirements in MCP output`

## Task 4: Implement deterministic search reranking

**Files:**

- Modify: `src/search.ts`
- Modify: `src/schemas.ts`
- Modify: `src/handlers.ts`
- Modify: `src/source-types.ts` only if an exported role type is needed
- Modify: `tests/search.test.ts`
- Modify: `tests/handlers.test.ts`
- Modify: `tests/performance.test.ts`

1. Precompute normalized document lengths, token document frequencies, average length, and source role once in `createGuidanceSearch()`.
2. Replace raw occurrence scoring with deterministic BM25-style term scoring. Cap repeated-term contribution so long pages cannot win by repetition alone.
3. Add reranking signals in a documented order: exact normalized phrase, whitespace-compacted phrase, heading phrase/token match, distinct query coverage ratio, and minimum token span/proximity.
4. Keep authority as a tie-breaker or small bounded feature; authority must not overpower clear lexical relevance.
5. Add optional `sourceRoles` to `GuidanceSearchOptions` and `search_record_guidance` input. Validate known roles and filter before scoring.
6. Do not add `schoolLevel` or `academicYear` because this server already seals only elementary 2026 active chunks.
7. Do not add a `field` filter until chunks have audited field metadata; a false filter would hide valid common rules.
8. Run search fixtures and calculate MRR and Recall@3 in tests. Require MRR >= 0.90 and Recall@3 = 1.00.
9. Confirm the 2,000-chunk fixture and complete production corpus remain inside existing performance budgets.

**Commit:** `feat: improve deterministic guidance search ranking`

## Task 5: Preserve safety and evidence contracts

**Files:**

- Modify: `tests/fixtures/validation-cases.json`
- Modify: `tests/validation-golden.test.ts`
- Modify: `tests/privacy.test.ts`
- Modify: `tests/evidence.test.ts` only if output traversal changed
- Modify: `tests/e2e/end-to-end.test.ts`

1. Add a text-only normal behavior record golden case with `contentStatus: pass` and neutral context requirements.
2. Retain all current blocked golden cases unchanged: outside contest, official language test, parent occupation, false content, student final narrative, AI verbatim, invalid activity, and length violations.
3. Assert no submitted text, evidence reference, observation exception reason, or invalid enum value leaks through `needsContext`, errors, logs, or summaries.
4. Assert every official block/review finding still resolves to verified evidence and hashes.
5. Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e
```

**Commit:** `test: preserve school record safety and evidence guarantees`

## Task 6: Document the contract change

**Files:**

- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Add: `docs/validation-result-contract.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

1. Bump package version to `0.2.0` because the structured output status enum changes.
2. Document the exact meaning of `pass`, `needs_context`, `review`, and `blocked` with JSON examples.
3. Explain that `needs_context` is not a detected violation and must not be rendered with warning/error styling.
4. Document AI and student-authorship truth tables.
5. Document search filters and the deterministic/offline ranking choice.
6. State that rule pack identity and official source hashes are unchanged because the source data did not change.

**Commit:** `docs: explain validation status and search semantics`

## Task 7: Final verification and Cloud Run rollout

**Files:**

- Modify: `progress.md`
- Modify: `.planning/school-record-validator-precision-hardening/progress.md`

1. Run the full verification commands from Task 5 in a clean process.
2. Run an SDK client smoke against the built local remote server and verify all seven tools still register.
3. Compare representative old/new outputs and record the expected contract delta.
4. Stop before production mutation and obtain explicit deployment approval.
5. After approval, deploy one new Cloud Run revision with the existing cost controls (`minScale=0`, `maxScale=1`, 512Mi, concurrency 20).
6. Smoke-test `/healthz`, MCP discovery, normal text-only validation, explicit AI verbatim block, and maximum-length search.
7. Keep the previous revision available for immediate traffic rollback until production smoke passes.

**Commit:** `chore: prepare precision hardening release`

## Deferred Option: Hybrid semantic search

Only consider this if the audited lexical search fixture misses its acceptance target. Prefer precomputed local embeddings stored in the sealed bundle and a local deterministic reranker. Do not add a paid runtime embedding API without a separate cost, privacy, reproducibility, and data-license review.
