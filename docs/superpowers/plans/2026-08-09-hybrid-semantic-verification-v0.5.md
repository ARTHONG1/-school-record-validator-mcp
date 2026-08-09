# Hybrid Semantic Verification v0.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and release a two-tool teacher MCP in which an external AI detects possible semantic omissions across the complete active rule pack, while deterministic MCP code validates exact-span candidates and owns every final status transition.

**Architecture:** `check_school_record` performs the complete first-pass deterministic review and returns a compact, versioned catalog of every semantic rule applicable to each `pass_no_match` entry. The external AI submits only catalog `ruleId` values and verbatim `spanText`; the MCP resolves occurrences and offsets, applies candidate matchers with a server-owned context window, and code resolves the final disposition. Every AI rewrite re-enters `check_school_record` and repeats the full hybrid flow.

**Tech Stack:** Node.js 22.18+, TypeScript 5.9, MCP SDK 1.30, Zod 3.25, deterministic JSON rule pack, Node test runner, GitHub Actions/Pages, Google Cloud Build and Cloud Run.

## Global Constraints

- Public teacher mode exposes exactly `check_school_record` and `verify_semantic_candidate`.
- MCP contains no LLM, embedding model, vector database, or network-based semantic classifier.
- AI may submit `ruleId`, verbatim `spanText`, and occurrence only when needed, but may never submit or override a final status.
- `confirmed` requires a deterministic candidate matcher on the submitted exact span.
- `supported_but_uncertain` always maps to `teacher_review`.
- A first format-invalid AI candidate returns `retry_required`; one invalid retry maps to `teacher_review`, never a false pass.
- `pass_no_match` means only that the declared deterministic rules did not match; it is not official approval.
- Semantic scope is generated from every applicable semantic rule, not a hardcoded category subset.
- Natural-language rewrites use only original or teacher-confirmed facts and always re-enter the full hybrid pipeline.
- Existing source hashes, human-checked evidence, authority separation, privacy guarantees, request limits, and expert tools remain enforced.
- Server version is `0.5.0`, schema version is `2.0`, and rule pack ID is `kr-moe-school-record-elementary-2026.2`.
- Production remains public without authorization headers, min instances 0, max instances 1, 512 MiB, one CPU, concurrency 20, CPU throttling on, startup boost off, teacher toolset, legacy SSE off.

---

## File Structure

### New runtime files

- `src/semantic-catalog.ts`: derives compact applicable catalog items from the active rule pack.
- `src/semantic-verifier.ts`: validates spans and executes confirm, support, and negative candidate matchers.
- `src/hybrid-review.ts`: reruns first-pass review, processes candidate batches, and resolves deterministic final states.
- `src/citation-registry.ts`: groups issue occurrences and deduplicates verified citation objects.

### New test data and tests

- `tests/fixtures/semantic-regression.json`: at least 594 synthetic or de-identified semantic fixtures.
- `tests/semantic-catalog.test.ts`: catalog field/profile filtering and compactness.
- `tests/semantic-verifier.test.ts`: exact-span matcher truth table and error behavior.
- `tests/hybrid-review.test.ts`: entry and batch state transitions.
- `tests/semantic-regression.test.ts`: rule-wide recall, precision, conflict, and coverage gates.

### Modified runtime and data files

- `src/rule-types.ts`: semantic rule metadata interfaces and pack ID 2026.2.
- `src/validator-types.ts`: schema v2 teacher, issue, citation, catalog, and verifier contracts.
- `src/data-loader.ts`: strict semantic metadata schemas, regex safety, and reference validation.
- `src/data-types.ts`, `src/source-types.ts`: pack path and ID migration.
- `src/teacher-review.ts`: schema v2 status, validation scope, field resolution, grouped issues, and catalog references.
- `src/schemas.ts`: strict input/output schemas and two teacher tool specifications.
- `src/handlers.ts`: verifier service wiring and privacy-safe errors.
- `src/format.ts`: concise Korean output for four final dispositions.
- `src/server.ts`: two teacher tools and server version 0.5.0.
- `src/services.ts`: semantic catalog and hybrid review services.
- `data/rules/kr-moe-school-record-elementary-2026.2.json`: all 18 phrase rules with semantic metadata.
- `data/evidence/verified-excerpts.json`: rule-specific relevant excerpts where broad page quotes can be narrowed safely.
- `data/bundle-manifest.json`, `data/corpus/corpus-manifest.json`, `sources/manifest.json`: pack ID, path, and sealed hash migration.
- `scripts/seal-data.ts`: new rule-pack path and pack ID.
- `scripts/smoke-remote.mjs`: two-tool hybrid production smoke flow.

### Modified documentation and delivery files

- `docs/teacher-agent-prompt.md`: exact two-tool AI orchestration contract.
- `docs/validation-result-contract.md`: complete schema v2 examples.
- `docs/limitations.md`, `docs/rule-audit.md`, `docs/remote-deployment.md`, `README.md`: semantics, migration, and operational limitations.
- `site/index.html`, `scripts/verify-site.mjs`: teacher-facing hybrid workflow.
- `.github/workflows/ci.yml`: semantic regression and remote contract gates.
- `package.json`, `package-lock.json`: version 0.5.0 and test commands.

### Existing tests requiring pack or schema migration

- `tests/helpers/validator-fixture.ts`, `tests/helpers/security-fixture.ts`
- `tests/data-loader.test.ts`, `tests/integrity-failure.test.ts`, `tests/rule-pack.test.ts`
- `tests/teacher-review.test.ts`, `tests/handlers.test.ts`, `tests/server.test.ts`
- `tests/remote-server.test.ts`, `tests/e2e/end-to-end.test.ts`
- `tests/privacy.test.ts`, `tests/performance.test.ts`, `tests/seal-data.test.ts`
- `tests/source-loader.test.ts`, `tests/source-manifest.test.ts`, `tests/validation-golden.test.ts`

---

### Task 1: Define Semantic Rule-Pack Types and Strict Loader Validation

**Files:**
- Modify: `src/rule-types.ts`
- Modify: `src/data-loader.ts`
- Modify: `tests/helpers/validator-fixture.ts`
- Test: `tests/data-loader.test.ts`
- Test: `tests/rule-pack.test.ts`

**Interfaces:**
- Consumes: existing `PhraseRule` detector, field/profile applicability, regex safety checks.
- Produces: `SemanticReviewDefinition`, safe compiled pattern data, and rule-pack validation required by all later tasks.

- [ ] **Step 1: Write failing semantic metadata schema tests**

Add tests that reject:

```ts
semanticReview: {
  concept: "",
  semanticHints: [],
  confirmPatterns: [],
  supportPatterns: [],
  negativePatterns: [],
}
```

Also reject duplicate `patternId`, duplicate `termId`, unsafe backreferences, lookbehind, zero-length matches, more than 20 hints, and a semantic phrase rule with no confirm or support pattern.

Run:

```powershell
npm.cmd run test:file -- tests/data-loader.test.ts tests/rule-pack.test.ts
```

Expected: FAIL because semantic metadata is not defined or validated.

- [ ] **Step 2: Add exact semantic types**

Add to `src/rule-types.ts`:

```ts
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
```

Add `semanticReview: SemanticReviewDefinition` to both official and editorial phrase rules. Length, metadata, and context rules do not receive semantic metadata.

- [ ] **Step 3: Implement strict Zod schemas and regex safety checks**

In `src/data-loader.ts`, validate identifiers, nonblank concepts, 1-20 unique hints, globally unique pattern IDs per rule, unique term IDs per confirm pattern, and safe non-empty regex matches. Refactor `verifyRegexRules` to inspect primary detectors plus every semantic confirm, support, negative, and term pattern.

- [ ] **Step 4: Make fixture builders produce valid semantic rules**

Update `phraseRule` and editorial fixture helpers to accept explicit semantic metadata. Security fixtures use a minimal valid definition with one confirm and one support pattern; tests that mutate semantic data start from valid sealed input.

- [ ] **Step 5: Run focused tests and commit**

```powershell
npm.cmd run test:file -- tests/data-loader.test.ts tests/rule-pack.test.ts
npm.cmd run typecheck
git add src/rule-types.ts src/data-loader.ts tests/helpers/validator-fixture.ts tests/helpers/security-fixture.ts tests/data-loader.test.ts tests/rule-pack.test.ts
git commit -m "feat: define semantic rule metadata"
```

Expected: all focused tests and typecheck pass.

### Task 2: Implement the Compact Semantic Catalog

**Files:**
- Create: `src/semantic-catalog.ts`
- Create: `tests/semantic-catalog.test.ts`
- Modify: `src/validator-types.ts`

**Interfaces:**
- Consumes: `RulePack`, `FieldSpec`, `ValidationProfile`.
- Produces: `semanticRulesForEntry(pack, field, profile)` and deduplicated `SemanticCatalogItem[]`.

- [ ] **Step 1: Write failing catalog tests**

Test these exact properties:

- official semantic rules appear in both profiles;
- editorial rules appear only in `official_plus_editorial`;
- field-specific rules appear only for applicable fields;
- metadata, context, and length rules never appear;
- output includes only `ruleId`, `action`, `concept`, `semanticHints`;
- rule order follows sealed rule-pack order;
- catalog items are deduplicated across a mixed-field batch.
- `catalogVersion` changes when rule IDs, actions, concepts, or hints change and remains stable otherwise.

- [ ] **Step 2: Define catalog contracts**

```ts
export interface SemanticCatalogItem {
  ruleId: string;
  action: "prohibited" | "revise";
  concept: string;
  semanticHints: string[];
}

export interface EntrySemanticScope {
  entryId: string;
  semanticReviewRuleIds: string[];
}
```

Map official `outcome: "block"` to `prohibited`; all review outcomes and editorial rules map to `revise`.

- [ ] **Step 3: Implement field/profile filtering and union catalog**

Export:

```ts
semanticRulesForEntry(
  pack: RulePack,
  field: FieldSpec,
  profile: ValidationProfile,
): PhraseRule[];

buildSemanticCatalog(
  pack: RulePack,
  scopes: Array<{ field: FieldSpec; profile: ValidationProfile }>,
): SemanticCatalogItem[];
```

Also export `semanticCatalogVersion(items): string`, using a stable serialization and SHA-256 digest.

- [ ] **Step 4: Run tests and commit**

```powershell
npm.cmd run test:file -- tests/semantic-catalog.test.ts
npm.cmd run typecheck
git add src/semantic-catalog.ts src/validator-types.ts tests/semantic-catalog.test.ts
git commit -m "feat: derive compact semantic review catalog"
```

### Task 3: Implement Candidate Span Validation and Deterministic Verification

**Files:**
- Create: `src/semantic-verifier.ts`
- Create: `tests/semantic-verifier.test.ts`

**Interfaces:**
- Consumes: original text, candidate ID, rule ID, verbatim span text, optional one-based occurrence, optional retry token, and applicable semantic phrase rule.
- Produces: processed or invalid candidate result without assigning AI-authored status.

- [ ] **Step 1: Write the matcher truth-table tests**

Use one fixture rule and assert:

| confirm | negative | support | expected |
|---|---|---|---|
| yes | no | no | `confirmed` |
| yes | yes | any | `supported_but_uncertain` |
| no | no | yes | `supported_but_uncertain` |
| no | yes | no | `not_supported` |
| no | no | no | `not_supported` |

Also assert `matchedTerms` are actual source substrings extracted by the confirm pattern's `termPatterns`.

- [ ] **Step 2: Write span resolution, context, and rule error tests**

Cover candidate-local `unknown_rule_id`, `rule_not_semantic`, `rule_not_applicable`, `span_not_found`, `ambiguous_span`, `occurrence_out_of_range`, and `empty_span`. Assert a unique `spanText` resolves without occurrence, repeated text requires one-based occurrence, and output UTF-16 offsets correctly slice Korean plus emoji text. Duplicate candidate IDs and candidate-count limits remain request-level schema errors in Task 6.

Add context tests where `spanText: "의사"` is confirmed only because the server-derived ±40-code-point sentence-bounded context contains `아버지가 의사`, while `의사의 역할을 조사함` is not confirmed. Assert every confirm match overlaps the resolved span and cannot be triggered by an unrelated expression elsewhere in the context window.

- [ ] **Step 3: Implement the verifier**

Export:

```ts
verifySemanticCandidate(input: {
  text: string;
  field: FieldSpec;
  profile: ValidationProfile;
  rule: PhraseRule | undefined;
  candidate: SemanticCandidateInput;
}): CandidateResult;
```

Resolve span occurrences before matching. Never normalize returned span text. Regexes may use Unicode/case-insensitive flags internally, but returned offsets and text always come from the original string. Derive a context window of up to 40 Unicode code points on either side, clipped at sentence/newline boundaries, and require confirm matches to overlap the resolved span.

Implement retry tokens as SHA-256 over stable serialized pack ID, entry ID, original-text hash, candidate ID, and rule ID. Tokens never bypass candidate validation and can only turn a second invalid attempt into `teacher_review`.

- [ ] **Step 4: Run tests and commit**

```powershell
npm.cmd run test:file -- tests/semantic-verifier.test.ts
npm.cmd run typecheck
git add src/semantic-verifier.ts tests/semantic-verifier.test.ts
git commit -m "feat: verify semantic candidates deterministically"
```

### Task 4: Build Schema v2 Teacher Results, Grouped Issues, and Citation Registry

**Files:**
- Create: `src/citation-registry.ts`
- Modify: `src/validator-types.ts`
- Modify: `src/teacher-review.ts`
- Modify: `tests/teacher-review.test.ts`

**Interfaces:**
- Consumes: existing `ValidationResult.findings`, semantic catalog service, evidence summaries.
- Produces: `CheckSchoolRecordResultV2`, grouped `matches[]`, deduplicated citation registry, validation scope, and `pass_no_match` status.

- [ ] **Step 1: Write failing schema v2 projection tests**

Assert a clean entry returns:

```ts
{
  status: "pass_no_match",
  validationSummary: "세부능력 및 특기사항에 적용되는 공식·편집 규칙 ...",
  validation: { profileUsed: "official_plus_editorial", checkedRuleCount: 18, matchedRuleCount: 0 },
  fieldResolution: { requested: null, resolved: "subject_achievement_special", method: "default" },
  semanticReviewRuleIds: expect.arrayContaining(["OFFICIAL-CONTEST-PARTICIPATION-AWARD"]),
}
```

Compute the expected rule count from the fixture, not a hardcoded production count.

Assert `장학생` and `장학금` become one issue with two matches and one citation ID. Assert the top-level citation registry stores that citation once.
Assert every citation includes `sourceUrl` when the source manifest provides one and safely omits it otherwise.

- [ ] **Step 2: Add exact schema v2 result types**

Add `CheckSchoolRecordResultV2`, `CheckEntryResultV2`, `GroupedTeacherIssue`, `Citation`, and four-disposition shared types exactly as specified in the design document.

- [ ] **Step 3: Implement grouping and registry helpers**

Group findings by `ruleId + issue status + reason + improvement`. Preserve first rule occurrence order and sort matches by start/end. Derive stable citation IDs from evidence ID or existing evidence identity, not array position.

- [ ] **Step 4: Implement pass scope and field resolution**

Track whether each entry supplied `field`. Count every deterministic rule actually evaluated for that entry, including applicable phrase and length rules; document separately that provenance/context checks depend on supplied metadata. Add semantic rule IDs only to `pass_no_match` entries.

Generate `validationSummary` in MCP code from the resolved Korean field label, profile, checked rule count, and matched rule count. It must say "결정적 일치 항목이 발견되지 않았습니다" for pass-no-match and must never say the sentence is officially permitted.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd run test:file -- tests/teacher-review.test.ts
npm.cmd run typecheck
git add src/citation-registry.ts src/validator-types.ts src/teacher-review.ts tests/teacher-review.test.ts
git commit -m "feat: return traceable schema v2 teacher reviews"
```

### Task 5: Implement Hybrid Batch Review and Code-Owned State Transitions

**Files:**
- Create: `src/hybrid-review.ts`
- Create: `tests/hybrid-review.test.ts`
- Modify: `src/services.ts`

**Interfaces:**
- Consumes: teacher first-pass service, semantic verifier, exact batch request.
- Produces: `createHybridReviewService(...).verify(request)` and deterministic aggregate dispositions.

- [ ] **Step 1: Write state transition tests**

Cover these exact transitions:

```text
initial prohibited -> prohibited, candidates skipped
initial revise -> revise, candidates skipped
pass + no candidate -> invalid request for verifier
pass + confirmed official block -> prohibited
pass + confirmed editorial review -> revise
pass + uncertain -> teacher_review
pass + not_supported -> pass_no_match
pass + first invalid candidate -> retry_required with null final status
pass + invalid candidate carrying valid retry token -> teacher_review
```

For multiple candidates assert severity `prohibited > teacher_review > revise > pass_no_match`. For mixed entries assert stable input order.

- [ ] **Step 2: Implement entry-level partial failure**

Malformed top-level schema remains atomic. A first candidate-local error returns `candidateStatus: "invalid"`, `retryable: true`, `retryToken`, `processingStatus: "retry_required"`, and no final status. A second invalid attempt carrying the matching token returns `retryable: false`; an entry with no stronger result becomes `teacher_review`. Mixed batches with any outstanding retry have top-level `status: null` and cannot be displayed as final.

- [ ] **Step 3: Rerun first-pass review internally**

The verifier must not trust an AI-supplied initial status. It calls the teacher review service using the submitted text, resolved field, and profile. Existing final results skip semantic processing.

- [ ] **Step 4: Build deduplicated verifier citations**

Confirmed and uncertain official candidates reference top-level citation IDs. `not_supported` and editorial candidates do not fabricate official evidence; editorial candidates include the local policy disclaimer.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd run test:file -- tests/hybrid-review.test.ts
npm.cmd run typecheck
git add src/hybrid-review.ts src/services.ts tests/hybrid-review.test.ts
git commit -m "feat: resolve hybrid review states in code"
```

### Task 6: Add Strict MCP Schemas, Handlers, and Korean Formatting

**Files:**
- Modify: `src/schemas.ts`
- Modify: `src/handlers.ts`
- Modify: `src/format.ts`
- Modify: `tests/handlers.test.ts`

**Interfaces:**
- Consumes: schema v2 teacher review and hybrid service.
- Produces: strict MCP tool contracts for both public teacher tools.

- [ ] **Step 1: Write failing handler contract tests**

Assert both tools return structured content accepted by strict output schemas. Assert unknown top-level keys, nested unknown keys, duplicate IDs, 101 entries, 11 candidates per entry, 501 total candidates, missing/ambiguous span text, invalid occurrence, bad retry token, and unsupported enum values never echo submitted text in errors.

- [ ] **Step 2: Define strict verifier input shapes**

Use `entries` with 1-100 items, 1-10 candidates per entry, unique IDs, and a cross-entry total-candidate super-refinement capped at 500. `ruleId` and candidate IDs are 1-100 characters. `spanText` is nonblank, `occurrence` is an optional positive integer, and `retryToken` is an optional uppercase SHA-256 string. Occurrence resolution and token binding are candidate-local service checks.

- [ ] **Step 3: Define strict output schemas**

Add discriminated unions on `candidateStatus` for `processed`, `invalid`, and `skipped`. Require `verification: null` for invalid/skipped and one of the three verification values for processed candidates. Require `processingStatus: "retry_required"` and `status: null` whenever any first-attempt candidate requires retry.

- [ ] **Step 4: Add handler and formatter**

Wire `handlers.verify_semantic_candidate`. Human-readable Korean text shows initial status, candidate verification, final recommendation, concise reason, and citation locator. It never prints the full source text or full catalog.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd run test:file -- tests/handlers.test.ts
npm.cmd run typecheck
git add src/schemas.ts src/handlers.ts src/format.ts tests/handlers.test.ts
git commit -m "feat: expose strict hybrid review tool contracts"
```

### Task 7: Register Exactly Two Public Teacher Tools

**Files:**
- Modify: `src/server.ts`
- Modify: `src/toolset.ts`
- Modify: `tests/server.test.ts`
- Modify: `tests/remote-server.test.ts`

**Interfaces:**
- Consumes: `TOOL_SPECS.check_school_record`, `TOOL_SPECS.verify_semantic_candidate`.
- Produces: teacher tool discovery with exactly two ordered tools and expert mode with both plus existing low-level tools.

- [ ] **Step 1: Write discovery and misuse tests**

Assert teacher list is:

```ts
["check_school_record", "verify_semantic_candidate"]
```

Assert expert list contains these two plus the existing seven expert tools. Verify descriptions state `check_school_record` is always first, verifier is only for pass-no-match semantic candidates, and AI must preserve `finalRecommendation`.

- [ ] **Step 2: Register the verifier and update server metadata**

Set MCP server version to `0.5.0`. Register both teacher tools before the expert-mode early return. Keep generic privacy-safe unexpected errors.

- [ ] **Step 3: Run transport tests and commit**

```powershell
npm.cmd run build
npm.cmd run test:file -- tests/server.test.ts tests/remote-server.test.ts
git add src/server.ts src/toolset.ts tests/server.test.ts tests/remote-server.test.ts
git commit -m "feat: publish two-tool teacher MCP"
```

### Task 8: Migrate All 18 Phrase Rules to Rule Pack 2026.2

**Files:**
- Create: `data/rules/kr-moe-school-record-elementary-2026.2.json`
- Remove after migration verification: `data/rules/kr-moe-school-record-elementary-2026.1.json`
- Modify: `data/evidence/verified-excerpts.json`
- Modify: `src/data-types.ts`, `src/source-types.ts`
- Modify: `scripts/seal-data.ts`
- Modify: pack-ID tests and manifests listed in File Structure

**Interfaces:**
- Consumes: all existing 2026.1 rules and human-verified evidence.
- Produces: sealed 2026.2 pack with semantic metadata for all phrase rules.

- [ ] **Step 1: Add semantic metadata for the 12 general official rules**

Cover exactly:

```text
OFFICIAL-LANGUAGE-TEST
OFFICIAL-CONTEST-PARTICIPATION-AWARD
OFFICIAL-OUTSIDE-AWARD
OFFICIAL-CERTIFICATION-TEST
OFFICIAL-PAPER-PUBLICATION
OFFICIAL-BOOK-PUBLICATION
OFFICIAL-INTELLECTUAL-PROPERTY
OFFICIAL-OVERSEAS-ACTIVITY
OFFICIAL-PARENT-SOCIOECONOMIC-STATUS
OFFICIAL-SCHOLARSHIP
OFFICIAL-SPECIFIC-NAME
OFFICIAL-QUALIFICATION
```

For contest confirmation include deterministic combinations covering `1등함`, `1위를 차지함`, `금상을 받음`, `우승함`, and existing participation/s award forms. For parent status require relationship terms plus occupation, employer, title, or economic-status terms; `의사의 역할을 조사함` must remain negative. Add `공인어학시험`, `논문 게재`, and public-institution award formulations.

- [ ] **Step 2: Add semantic metadata for the six field/editorial rules**

Cover exactly:

```text
FIELD-ATTENDANCE-PROHIBITED-CONTENT
FIELD-VOLUNTEER-SIMPLE-DONATION
FIELD-SUBJECT-PROHIBITED-CONTENT
EDITORIAL-UNSUPPORTED-SUPERLATIVE
EDITORIAL-HOME-ACTIVITY
EDITORIAL-CAREER-CERTAINTY
```

Expand editorial superlatives to 최고, 최상, 가장 뛰어난, 압도적, 독보적, 월등, 천재적, 누구보다 while preserving normal comparative learning statements as negatives.

- [ ] **Step 3: Prepare and approve narrower verified excerpts**

For page-18 prohibitions, extract proposed exact source substrings for contest, language tests, outside awards, certification, papers, publication, intellectual property, overseas activity, parent status, scholarship, and qualifications. Generate a review report containing evidence ID, source chunk, locator, proposed quote, containment result, and SHA-256. Stop for the project owner's human review before setting `checkedBy: "human"`. If an excerpt is not approved, retain the existing broad verified evidence ID; never label an AI-selected quote as human-checked.

- [ ] **Step 4: Migrate all pack IDs and paths**

Replace active 2026.1 literals with 2026.2 in runtime types, source/corpus manifests, seal script, tests, and bundle paths. Historical documentation may retain 2026.1 as release history. Do not leave two active rule files in the sealed bundle.

- [ ] **Step 5: Verify, seal, and commit**

```powershell
npm.cmd run typecheck
npm.cmd run verify:sources
npm.cmd run seal:data
npm.cmd run test:file -- tests/data-loader.test.ts tests/evidence-integrity.test.ts tests/rule-pack.test.ts tests/seal-data.test.ts tests/source-manifest.test.ts
git add data src scripts tests sources/manifest.json
git commit -m "feat: publish semantic rule pack 2026.2"
```

Expected: source files remain unchanged, verified excerpts resolve, all hashes and manifests agree, and no active 2026.1 path remains.

### Task 9: Build the 594+ Entry Semantic Regression Corpus

**Files:**
- Create: `tests/fixtures/semantic-regression.json`
- Create: `tests/semantic-regression.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all 18 semantic rules and stable pattern IDs.
- Produces: release-blocking known recall, precision, conflict, and coverage metrics.

- [ ] **Step 1: Define the fixture schema**

```ts
interface SemanticRegressionCase {
  caseId: string;
  ruleId: string;
  kind: "canonical" | "paraphrase" | "boundary" | "negative" | "conflict";
  text: string;
  field: FieldKey;
  profile: ValidationProfile;
  spanText: string;
  occurrence?: number;
  expectedResolvedSpan: { text: string; start: number; end: number };
  expectedVerification: "confirmed" | "supported_but_uncertain" | "not_supported";
  expectedFinal: HybridDisposition;
}
```

- [ ] **Step 2: Populate every rule's minimum cases**

For each of 18 rules include at least 5 canonical, 10 paraphrase/spacing/synonym, 5 boundary, 10 negative, and 3 conflict cases. Total must be at least 594. Use only synthetic or de-identified text. Include all false negatives reproduced from v0.4.0.

- [ ] **Step 3: Add coverage and metric tests**

Fail if any rule lacks a required kind/count, any case references an unknown pattern/rule, any span occurrence cannot resolve to `expectedResolvedSpan`, any known positive misses, any known negative confirms, or any expected final state differs. Print counts only, never fixture text, on failure summaries.

- [ ] **Step 4: Register the dedicated command and commit**

Add:

```json
"test:semantic": "node --test tests/semantic-regression.test.ts"
```

Run:

```powershell
npm.cmd run test:semantic
git add tests/fixtures/semantic-regression.json tests/semantic-regression.test.ts package.json package-lock.json
git commit -m "test: add semantic regression corpus"
```

Expected: 100% fixed-suite positive recall and known-negative precision.

### Task 10: Expand Privacy, Performance, Integrity, and End-to-End Coverage

**Files:**
- Modify: `tests/privacy.test.ts`
- Modify: `tests/performance.test.ts`
- Modify: `tests/integrity-failure.test.ts`
- Modify: `tests/e2e/end-to-end.test.ts`
- Modify: `tests/remote-server.test.ts`
- Modify: `scripts/smoke-remote.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: complete two-tool implementation and 2026.2 pack.
- Produces: release gates across local, stdio, HTTP, CI, and production.

- [ ] **Step 1: Add privacy and integrity tests**

Assert text, span text, and server-derived context never reach stdout/stderr, malformed candidate errors do not echo input, retry tokens contain no reversible text, tampered semantic patterns fail bundle load, unsafe semantic regexes fail startup, and candidate AI rationale is not accepted by strict schemas.

- [ ] **Step 2: Add performance budgets**

Measure a 100-entry first pass, a 500-candidate verifier batch, and full 594+ semantic regression. Set hard limits at three times measured baseline in CI-compatible tests, following existing performance-test style.

- [ ] **Step 3: Add full stdio and HTTP workflow tests**

Test:

```text
first-pass prohibited -> no verifier needed
first-pass pass -> AI candidate -> confirmed prohibited
first-pass pass -> uncertain -> teacher_review
first-pass pass -> not_supported -> pass_no_match
first invalid span selector -> retry_required -> corrected retry -> processed
first invalid span selector -> retry_required -> second invalid -> teacher_review
grounded rewrite -> check again -> semantic review again
```

- [ ] **Step 4: Upgrade production smoke test**

`scripts/smoke-remote.mjs` must assert exactly two teacher tools, schema version 2.0, pack 2026.2, stable `catalogVersion`, compact catalog, server-generated `validationSummary`, citation `sourceUrl`, a confirmed context-aware candidate, an uncertain candidate, a not-supported candidate, one successful retry, grouped issues, citation deduplication, and rewrite re-entry.

- [ ] **Step 5: Add CI semantic gate and commit**

Add `npm run test:semantic` after unit tests and before build in CI.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:semantic
npm.cmd run build
npm.cmd run test:e2e
git add tests scripts/smoke-remote.mjs .github/workflows/ci.yml
git commit -m "test: enforce hybrid MCP release gates"
```

### Task 11: Rewrite the External AI Contract and Teacher Documentation

**Files:**
- Modify: `docs/teacher-agent-prompt.md`
- Modify: `docs/validation-result-contract.md`
- Modify: `docs/limitations.md`
- Modify: `docs/rule-audit.md`
- Modify: `docs/remote-deployment.md`
- Modify: `README.md`
- Modify: `site/index.html`
- Modify: `scripts/verify-site.mjs`

**Interfaces:**
- Consumes: final tool names, schema v2, statuses, and rewrite rules.
- Produces: copy-ready system prompt and understandable public documentation.

- [ ] **Step 1: Write the final system prompt**

The prompt must require:

```text
1. Always call check_school_record first.
2. Treat revise/prohibited as final.
3. For pass_no_match, compare each entry against every semanticReviewRuleId in the compact catalog.
4. Submit only catalog ruleId values and verbatim meaningful `spanText`; provide one-based occurrence only when the MCP reports ambiguity.
5. Never invent or modify status/finalRecommendation.
6. Retry a format-invalid candidate exactly once using the returned retry token.
7. Display an invalid retry or uncertain candidate as teacher_review.
8. Generate rewrites only from known facts.
9. Re-run rewritten text through the complete two-tool flow.
```

Include exact conversion from `{record:{record_1:"..."}}` to entries and exact final JSON expected by the user's AI node.

- [ ] **Step 2: Document all four teacher states and traceability**

Provide compact examples for first-pass match, candidate-confirmed match, uncertainty, not-supported candidate, insufficient rewrite evidence, and grounded rewrite re-entry. Explain `pass_no_match` without suggesting official approval.

- [ ] **Step 3: Update the public Pages workflow**

Show the two-tool sequence, AI/MCP authority boundary, four states, privacy warning, 2026 elementary scope, no-header Remote MCP connection, AI찬우쌤 and classddok.com identity, source attribution, and educational-use disclaimer.

- [ ] **Step 4: Strengthen site verification and commit**

Require `verify_semantic_candidate`, `pass_no_match`, `teacher_review`, `schemaVersion`, `catalogVersion`, `validationSummary`, `2026.2`, one-retry behavior, and rewrite full re-entry in `verify-site.mjs`.

```powershell
npm.cmd run verify:site
git add README.md docs site scripts/verify-site.mjs
git commit -m "docs: explain the hybrid semantic review workflow"
```

### Task 12: Version, Package, Release, and Deploy v0.5.0

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.planning/hybrid-v0.5/task_plan.md`
- Modify: `.planning/hybrid-v0.5/progress.md`

**Interfaces:**
- Consumes: fully verified implementation.
- Produces: GitHub main/tag/Pages and Cloud Run v0.5.0 production deployment.

- [ ] **Step 1: Synchronize package and server versions**

```powershell
npm.cmd version 0.5.0 --no-git-tag-version
rg -n '0\.4\.0|2026\.1' package.json package-lock.json src data scripts tests docs README.md site
```

Review every match. Historical release documents may retain old versions; active runtime, schema, docs, and tests may not.

- [ ] **Step 2: Run the complete local release gate**

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:semantic
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run verify:site
npm.cmd pack --dry-run
git diff --check
git status --short
```

Expected: all checks pass, package is 0.5.0, `git status --short` contains only the intentional release changes, and no local paths or raw student data appear in the package.

- [ ] **Step 3: Commit the release candidate**

```powershell
git add package.json package-lock.json src data scripts tests docs README.md site .github
git commit -m "chore: release hybrid validator 0.5.0"
git status --short
```

Expected: the worktree is clean after the release commit.

- [ ] **Step 4: Fast-forward GitHub main and wait for gates**

```powershell
git fetch origin main --tags
git merge-base --is-ancestor origin/main HEAD
git rev-list --left-right --count origin/main...HEAD
git push origin HEAD:main
```

Expected ancestry count: `0 N`, `N > 0`. Wait for both main CI and GitHub Pages with `gh run watch --exit-status`. Do not tag or deploy if either fails.

- [ ] **Step 5: Create immutable v0.5.0 tag and wait for tag CI**

```powershell
git tag -a v0.5.0 -m "Release v0.5.0"
git push origin v0.5.0
```

Verify the peeled tag commit equals GitHub main and wait for tag CI success. Never move a published tag; corrections become v0.5.1.

- [ ] **Step 6: Capture rollback target and deploy Cloud Run**

Record the currently ready v0.4.0 revision `school-record-validator-mcp-00007-gk7`, then run:

```powershell
gcloud.cmd run deploy school-record-validator-mcp --project school-record-validator-mcp --source . --region asia-northeast3 --allow-unauthenticated --set-env-vars MCP_ENABLE_LEGACY_SSE=false,MCP_TOOLSET=teacher --min-instances=0 --max-instances=1 --memory=512Mi --cpu=1 --concurrency=20 --cpu-throttling --no-cpu-boost --quiet
```

- [ ] **Step 7: Verify production and roll back on any failure**

Verify both public hostnames return health 200, teacher discovery returns exactly two tools, and the production smoke test passes the complete hybrid and rewrite re-entry flow.

On any configuration, health, discovery, schema, or smoke failure:

```powershell
gcloud.cmd run services update-traffic school-record-validator-mcp --project school-record-validator-mcp --region asia-northeast3 --to-revisions school-record-validator-mcp-00007-gk7=100 --quiet
```

Confirm v0.4.0 health and tool behavior after rollback. Preserve the failed revision for logs.

- [ ] **Step 8: Record immutable release evidence**

Write final commit SHA, tag SHA, main CI URL, tag CI URL, Pages URL, Cloud Run revision, service URLs, semantic corpus count, held-out metrics if available, and smoke result to `.planning/hybrid-v0.5/progress.md`. Never record tokens or submitted text.

---

## Final Acceptance Checklist

- [ ] Teacher mode exposes exactly two tools in the correct order.
- [ ] All 18 phrase rules publish compact semantic metadata automatically.
- [ ] Every semantic rule has at least 33 regression fixtures; total is at least 594.
- [ ] Known positive recall and known-negative precision are 100% on the fixed suite.
- [ ] AI candidate rule selection alone can never produce `confirmed`.
- [ ] Verbatim span occurrence resolution and returned UTF-16 offsets work for Korean, Latin text, repeated spans, and surrogate pairs.
- [ ] First invalid candidates yield one retry; a second invalid attempt yields `teacher_review`, never pass or request-wide 500.
- [ ] Candidate matching uses server-derived sentence-bounded context and requires confirm-match overlap with the exact span.
- [ ] Results include stable `catalogVersion`, MCP-generated `validationSummary`, and citation `sourceUrl` where available.
- [ ] Grouped issues and citation registry remove repeated 687-character citations.
- [ ] `pass_no_match` reports actual checked scope and does not claim approval.
- [ ] Rewrites re-enter the complete hybrid flow.
- [ ] Privacy, integrity, performance, stdio, HTTP, expert compatibility, CI, Pages, and production smoke gates all pass.
- [ ] Cloud Run public/cost configuration remains unchanged except for the new revision.
