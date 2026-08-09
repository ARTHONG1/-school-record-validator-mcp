# School Record Validator MCP v0.5 Hybrid Semantic Verification Design

## Purpose

v0.5.0 turns the current high-precision but lexically narrow validator into a practical MCP for an external AI agent. The MCP remains deterministic and evidence-backed. The external AI may discover semantic omissions, but it cannot assign or override a final status.

The governing principle is:

> AI detects a possible omission. MCP validates the candidate. Code resolves the final state.

## Scope

This release includes:

- a compact semantic review catalog generated from every applicable semantic rule;
- a second public teacher tool, `verify_semantic_candidate`;
- candidate-gated deterministic matchers that are broader than the first-pass detector;
- code-owned state transitions including `teacher_review`;
- grouped rule issues and deduplicated citation references;
- explicit `pass_no_match` validation scope;
- a rule-wide regression corpus and release metrics;
- full rewrite re-entry through the hybrid pipeline;
- updated external AI instructions, documentation, GitHub Pages, CI, and Cloud Run deployment.

This release does not add an LLM, embedding model, vector database, or semantic classifier inside the MCP.

## Public Teacher API

Teacher mode exposes exactly two tools:

1. `check_school_record`: always the first call for new or rewritten text.
2. `verify_semantic_candidate`: only after an entry returned `pass_no_match` and the external AI can submit a rule ID and exact source span.

Expert mode retains the existing low-level tools in addition to these two.

## End-to-End Flow

```text
original text
  -> check_school_record
     -> prohibited: final
     -> revise: final
     -> pass_no_match
        -> compact semanticReviewCatalog
        -> external AI compares text with every applicable catalog rule
           -> no candidate: pass_no_match
           -> candidate ruleId + exact span
              -> verify_semantic_candidate
                 -> confirmed: prohibited or revise
                 -> supported_but_uncertain: teacher_review
                 -> not_supported: pass_no_match

grounded AI rewrite
  -> enters check_school_record as completely new text
  -> repeats the entire semantic review and candidate verification flow
```

`verify_semantic_candidate` never replaces full rewrite validation.

## Status Model

`check_school_record` uses:

- `pass_no_match`: no applicable deterministic rule matched;
- `revise`: a deterministic review or editorial rule matched;
- `prohibited`: a deterministic official block rule matched.

The hybrid final disposition uses:

- `pass_no_match`;
- `revise`;
- `teacher_review`;
- `prohibited`.

Aggregate severity is:

```text
prohibited > teacher_review > revise > pass_no_match
```

An uncertain official prohibition outranks a confirmed editorial revision.

## Rule Pack v2026.2

The rule pack remains the single source of truth. Every phrase rule that participates in semantic review adds this data:

```ts
interface SemanticTermPattern {
  termId: string;
  pattern: string;
}

interface SemanticVerifierPattern {
  patternId: string;
  pattern: string;
  termPatterns: SemanticTermPattern[];
}

interface SemanticReviewDefinition {
  concept: string;
  semanticHints: string[];
  confirmPatterns: SemanticVerifierPattern[];
  supportPatterns: Array<{ patternId: string; pattern: string }>;
  negativePatterns: Array<{ patternId: string; pattern: string }>;
}
```

Rules continue to have their current high-precision `detector`. `confirmPatterns` are broader, candidate-gated deterministic patterns. They run only against an AI-submitted exact span. `supportPatterns` establish relevance without confirming applicability. `negativePatterns` identify known exclusions and nearby non-examples.

Adding a semantic rule automatically adds it to the catalog when its field and profile apply. Public API code contains no category-specific branches.

The rule pack ID becomes `kr-moe-school-record-elementary-2026.2`.

## Compact Semantic Catalog

`check_school_record` returns only the metadata the external AI needs for semantic comparison:

```ts
interface SemanticCatalogItem {
  ruleId: string;
  action: "prohibited" | "revise";
  concept: string;
  semanticHints: string[];
}
```

It does not include citations, source quotes, examples, regexes, or matcher internals.

The catalog appears once at batch result level. Each `pass_no_match` entry references its applicable rules through `semanticReviewRuleIds`. Entries already marked `revise` or `prohibited` have no semantic review rule IDs.

## `check_school_record` Contract

The input remains the current strict batch shape:

```ts
interface CheckSchoolRecordRequest {
  entries: Array<{
    entryId: string;
    text: string;
    field?: FieldKey;
  }>;
  defaultField?: FieldKey;
  profile?: "official" | "official_plus_editorial";
}
```

The v2 result is:

```ts
interface CheckSchoolRecordResultV2 {
  schemaVersion: "2.0";
  serverVersion: "0.5.0";
  rulePackId: "kr-moe-school-record-elementary-2026.2";
  profileUsed: ValidationProfile;
  status: "pass_no_match" | "revise" | "prohibited";
  counts: {
    total: number;
    passNoMatch: number;
    revise: number;
    prohibited: number;
  };
  entries: CheckEntryResultV2[];
  semanticReviewCatalog: SemanticCatalogItem[];
  citations: Record<string, Citation>;
  rewritePolicy: string;
  disclaimer: string;
}
```

Each entry contains:

```ts
interface CheckEntryResultV2 {
  entryId: string;
  field: FieldKey;
  fieldResolution: {
    requested: FieldKey | null;
    resolved: FieldKey;
    method: "explicit" | "default";
  };
  status: "pass_no_match" | "revise" | "prohibited";
  label: "현재 규칙에서 탐지 없음" | "수정 권장" | "기재 불가";
  reason: string;
  validation: {
    profileUsed: ValidationProfile;
    checkedRuleCount: number;
    matchedRuleCount: number;
  };
  semanticReviewRuleIds: string[];
  issues: GroupedTeacherIssue[];
  improvementGuidance: string[];
  teacherChecks: string[];
  rewritePlan: RewritePlan;
}
```

`pass_no_match` never means official approval. It means only that the listed deterministic rules produced no match.

## Grouped Issues and Citations

Multiple occurrences of one rule are one issue:

```ts
interface GroupedTeacherIssue {
  ruleId: string;
  kind: "official" | "editorial";
  status: "revise" | "prohibited";
  reason: string;
  improvement: string;
  matches: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  citationIds: string[];
}
```

Official citations are stored once in the top-level registry:

```ts
interface Citation {
  citationId: string;
  title: string;
  locatorLabel: string;
  relevantQuote: string;
  sourceId: string;
  sourceSha256: string;
}
```

Editorial issues have no official citation and retain the local-policy disclaimer.

## `verify_semantic_candidate` Input

```ts
interface VerifySemanticCandidateRequest {
  entries: Array<{
    entryId: string;
    text: string;
    field?: FieldKey;
    candidates: Array<{
      candidateId: string;
      ruleId: string;
      span: {
        text: string;
        start: number;
        end: number;
      };
    }>;
  }>;
  defaultField?: FieldKey;
  profile?: ValidationProfile;
}
```

Offsets are JavaScript UTF-16 code units, start-inclusive and end-exclusive. A valid span satisfies:

```ts
text.slice(start, end) === span.text
```

The tool accepts no AI rationale as evidence.

## `verify_semantic_candidate` Output

```ts
type SemanticVerification =
  | "confirmed"
  | "supported_but_uncertain"
  | "not_supported";

type HybridDisposition =
  | "pass_no_match"
  | "revise"
  | "teacher_review"
  | "prohibited";

interface VerifySemanticCandidateResult {
  schemaVersion: "2.0";
  serverVersion: "0.5.0";
  rulePackId: "kr-moe-school-record-elementary-2026.2";
  profileUsed: ValidationProfile;
  status: HybridDisposition;
  entries: VerifyEntryResult[];
  citations: Record<string, Citation>;
  disclaimer: string;
}
```

A valid candidate result contains:

```ts
interface ValidCandidateResult {
  candidateId: string;
  candidateStatus: "processed";
  ruleId: string;
  verification: SemanticVerification;
  matchedSpan: { text: string; start: number; end: number };
  matchEvidence: null | {
    type: "deterministic_pattern";
    patternId: string;
    matchedTerms: string[];
  };
  uncertaintyReason?: string;
  notSupportedReason?: string;
  finalRecommendation: HybridDisposition;
  citationIds: string[];
}
```

## Deterministic Candidate Algorithm

For each entry, the verifier reruns `check_school_record` internally.

- If the initial result is `revise` or `prohibited`, all semantic candidates are skipped and the initial result remains final.
- If the initial result is `pass_no_match`, candidate processing continues.
- The verifier validates exact span, rule existence, semantic metadata, field applicability, and profile applicability.
- Matching runs only on the submitted exact span.

For a valid candidate:

| Confirm match | Negative match | Support match | Verification |
|---|---|---|---|
| yes | no | any | `confirmed` |
| yes | yes | any | `supported_but_uncertain` |
| no | any | yes | `supported_but_uncertain` |
| no | yes | no | `not_supported` |
| no | no | no | `not_supported` |

`confirmed` final action comes from the rule, never from the AI. Official block becomes `prohibited`; official or editorial review becomes `revise`.

`supported_but_uncertain` always becomes `teacher_review`.

`not_supported` remains `pass_no_match`.

## Invalid Candidates and Partial Failure

Malformed request structure fails atomically with the existing privacy-safe MCP input error. This includes missing entries, duplicate entry IDs, unsupported fields or profiles, and request limits.

Candidate-local errors do not fail the entire batch. They return:

```ts
interface InvalidCandidateResult {
  candidateId: string;
  candidateStatus: "invalid";
  ruleId: string;
  verification: null;
  errorCode:
    | "unknown_rule_id"
    | "rule_not_semantic"
    | "rule_not_applicable"
    | "span_out_of_bounds"
    | "span_mismatch"
    | "empty_span"
    | "duplicate_candidate_id"
    | "too_many_candidates";
  finalRecommendation: "teacher_review";
}
```

An invalid AI candidate makes the entry review incomplete and therefore `teacher_review`, not `pass_no_match`.

If the initial result was already final, candidates return `candidateStatus: "skipped"`, error code `initial_result_is_final`, and preserve the initial disposition.

## Limits

- existing HTTP body limit: 10 MB;
- entries per request: 100;
- text per entry: 200,000 characters;
- candidates per entry: 10;
- candidates per request: 500;
- entry and candidate IDs: 1-100 characters;
- semantic concept: 1-200 characters;
- semantic hints per rule: 1-20;
- exact span must be non-empty and no longer than its source text.

No request text, span, student name, or AI rationale is logged.

## Rewrite Grounding

The MCP never generates natural-language rewrites. The external AI may create one only from facts in the original text or later facts explicitly supplied by the teacher.

When prohibited content is the only substantive fact, the external AI returns no rewrite and requests evidence.

Every rewrite starts again at `check_school_record`, then undergoes semantic review and candidate verification as needed. A second deterministic pass alone is not sufficient to claim hybrid verification complete.

## External AI Contract

The system prompt requires the AI to:

1. call `check_school_record` first;
2. preserve `revise` or `prohibited` without semantic re-verification;
3. inspect only `pass_no_match` entries against every applicable catalog item;
4. submit only copied exact spans and rule IDs from the catalog;
5. never emit a status of its own;
6. preserve `finalRecommendation` from the verifier;
7. show `teacher_review` when verification is uncertain or candidate input is invalid;
8. send every rewrite through the full pipeline again.

## Teacher-Facing Presentation

The UI presents only:

- 현재 규칙에서 탐지 없음;
- 수정 권장;
- 교사 확인 필요;
- 기재 불가.

It explains whether the result came from first-pass deterministic matching or candidate verification. It does not show raw catalog JSON by default.

## Regression Corpus

Every semantic-reviewable rule must have:

- at least 5 canonical positives;
- at least 10 paraphrase, spacing, or synonym positives;
- at least 5 boundary cases;
- at least 10 known negatives;
- at least 3 confirm/negative conflict cases.

The current pack has 18 semantic phrase rules, so the initial corpus contains at least 594 synthetic or de-identified entries. It contains no real identifying student information.

Regression fixtures are separate from the production rule pack but reference stable rule and pattern IDs. A build-time coverage test fails if any semantic rule lacks the required fixture counts.

Fixed-suite release gates are:

- known prohibited/revise recall: 100%;
- known-negative precision: 100%;
- span offset correctness: 100%;
- state transition tests: 100%;
- all existing integrity, privacy, performance, stdio, Streamable HTTP, and legacy expert-mode tests pass.

Held-out evaluation reports prohibited recall, revise recall, false-positive rate, and teacher-review rate. Product documentation never claims universal 100% accuracy.

## Versioning and Migration

- server version: `0.5.0`;
- output schema version: `2.0`;
- rule pack: `kr-moe-school-record-elementary-2026.2`;
- teacher status `pass` becomes `pass_no_match`;
- teacher mode changes from one public tool to two;
- expert low-level tools remain available;
- system prompts, result contract, README, Pages, and deployment smoke tests migrate together.

## Release and Rollback

The release must pass local tests, GitHub main CI, GitHub Pages, tag CI, and Cloud Run smoke tests before completion. Cloud Run keeps max scale 1, min instances 0, 512 MiB, one CPU, concurrency 20, no authorization header, teacher toolset, and disabled legacy SSE.

If production health, tool discovery, catalog output, candidate verification, or rewrite re-entry smoke tests fail, traffic returns to the previous v0.4.0 revision.

## Success Criteria

- An external AI can review every applicable semantic rule without a hardcoded category list.
- An AI-selected rule never becomes `confirmed` without a deterministic candidate matcher on the exact span.
- Uncertain official relevance becomes `teacher_review`, never a silent pass or fabricated prohibition.
- A malformed candidate cannot make the whole batch fail or produce a false pass.
- New semantic rules become available without changing either public tool schema.
- Teachers receive concise, traceable results while the machine contract remains fully auditable.
