# External AI Safe Rewrite Implementation Plan

> **Execution note:** Use the subagent-driven development workflow or execute each task sequentially with tests after every task.

## Goal

Extend the teacher-facing MCP so an external AI can safely produce a suggested rewrite without the MCP containing or invoking an LLM. The MCP will deterministically inspect the original text, return a `rewritePlan`, and validate the external AI's candidate in a second call. Only a second-pass `pass` may be presented as verified.

## Architecture and constraints

- MCP remains deterministic and document-grounded.
- External AI owns natural-language candidate generation.
- First call: `check_school_record` on the original entry.
- If `rewritePlan.action` is `rewrite`, the external AI creates a candidate using only facts in the original text, then calls the MCP again with that candidate.
- If the first result is `ask_evidence`, no candidate is invented; the external AI asks the teacher for evidence.
- A candidate is never labelled verified unless the second MCP call returns `pass`.
- Existing statuses, counts, findings, citations, limits, privacy behavior, and expert toolset remain compatible.
- `suggestedRewrite` is an external AI response field, not an MCP field.

## Tasks

### 1. Add the deterministic rewrite-plan contract

Files: `src/validator-types.ts`, new `src/rewrite-plan.ts`, `tests/rewrite-plan.test.ts`.

- Add `RewriteAction = "none" | "rewrite" | "ask_evidence"`.
- Add `RewritePlan` with `action`, `mustRemove`, `instructions`, `rewriteReason`, `neededEvidence`, and `requiresRevalidation`.
- Add `rewritePlan` to every `TeacherEntryReview`.
- Implement rules: `pass` -> `none`; actionable editorial `revise` -> `rewrite`; `prohibited` -> `ask_evidence` in v0.4.0.
- Ensure instructions use only deterministic findings and never invent student activity.
- Write failing tests first, then implement until they pass.

### 2. Connect the plan to teacher review and schemas

Files: `src/teacher-review.ts`, `src/schemas.ts`, `src/format.ts`, relevant handler/server tests.

- Build the plan from the existing status, matched findings, and guidance.
- Make the JSON schema strict and require `rewritePlan` for each entry.
- Keep the formatted result concise and teacher-readable: status, reason, required removals, rewrite instructions, evidence requests, and revalidation requirement.
- Preserve machine-readable output as the primary contract.
- Test pass, revise, prohibited, batch, malformed input, and expert-mode compatibility.

### 3. Update the external AI integration contract

Files: `docs/teacher-agent-prompt.md`, `README.md`, `docs/validation-contract.md`, site content and verification scripts.

- Replace the old one-call instruction with the two-pass workflow.
- Define the external AI result shape with optional `suggestedRewrite`, `rewriteVerified`, `rewriteReason`, and `neededEvidence`.
- Require the AI to copy facts only from the original text, never treat an MCP plan as evidence, and never state that a candidate is approved before revalidation.
- Document the exact branches: `none`, `rewrite`, `ask_evidence`, and failed second-pass validation.
- Explain that the MCP is a rule checker, not an official approval or legal decision service.

### 4. Add end-to-end and regression coverage

Files: `tests/e2e.test.ts`, `tests/remote.test.ts`, `tests/privacy.test.ts`, `tests/performance.test.ts`, and any needed fixtures.

- Verify a clean original result produces `action: none`.
- Verify an editorial violation produces `action: rewrite` with deterministic instructions.
- Verify a prohibited claim produces `action: ask_evidence` and no invented rewrite path.
- Verify a valid externally generated candidate passes on the second call.
- Verify an unsafe candidate remains unverified when the second call is revise/prohibited.
- Check no raw student-identifying data is added to logs or error messages and existing request limits remain intact.

### 5. Package, verify, and release

Files: `package.json`, changelog/release docs as appropriate.

- Bump the package/service version to `0.4.0`.
- Run typecheck, build, unit tests, E2E tests, site verification, package dry-run, and local MCP smoke tests.
- Review the diff and generated package contents.
- Commit the implementation, push to the existing GitHub repository's `main`, and tag `v0.4.0` only after all checks pass.
- Deploy Cloud Run with the existing public teacher configuration, max scale 1, 512 MiB, one CPU, and `MCP_TOOLSET=teacher`.
- Smoke-test `/health`, `tools/list`, original review, rewrite-plan response, prohibited response, and second-pass validation.

## Completion criteria

- An external AI can complete the two-pass workflow using only the public `check_school_record` tool.
- The MCP never fabricates or returns a suggested rewrite as if it were evidence-backed.
- The external AI receives enough structured information to show a concise teacher-facing result.
- Unsafe candidates cannot be marked verified.
- Local tests, GitHub CI, and Cloud Run smoke tests pass.
