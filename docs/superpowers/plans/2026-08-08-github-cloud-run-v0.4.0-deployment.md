# GitHub and Cloud Run v0.4.0 Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release the external-AI safe rewrite workflow as v0.4.0 to the existing GitHub repository, GitHub Pages site, and public teacher-mode Cloud Run MCP without changing its public access model or cost controls.

**Architecture:** Treat the local `codex/teacher-facing-record-review` branch as the release candidate because it is a fast-forward descendant of remote `main`. Complete version and documentation gaps first, verify locally, fast-forward `HEAD` to GitHub `main`, wait for CI and Pages, create the immutable v0.4.0 tag, then deploy the exact clean commit to Cloud Run. Keep revision `school-record-validator-mcp-00006-gf4` available for immediate traffic rollback.

**Tech Stack:** Node.js 22.18, TypeScript 5.9, MCP SDK 1.30, Zod 3.25, Git/GitHub CLI, GitHub Actions/Pages, Google Cloud CLI, Cloud Build, Cloud Run.

## Global Constraints

- GitHub repository: `ARTHONG1/-school-record-validator-mcp`; default branch: `main`.
- Cloud Run project/service: `school-record-validator-mcp`; region: `asia-northeast3`.
- Public Remote MCP remains unauthenticated; do not add `Authorization` or `MCP_AUTH_TOKEN`.
- Runtime toolset remains `MCP_TOOLSET=teacher`; legacy SSE remains disabled.
- Cost controls remain min instances 0, max instances 1, 512 MiB memory, 1 CPU, concurrency 20, CPU throttling enabled, startup CPU boost disabled.
- Never force-push `main`, move a published tag, log student text, or test production with real student-identifying information.
- GitHub must be green before Cloud Run deployment. Cloud Run smoke failure requires traffic rollback before diagnosis continues.

---

## File Structure

- Modify `package-lock.json`: synchronize the release version with `package.json`.
- Modify `src/server.ts`: advertise MCP server version `0.4.0`.
- Modify `tests/remote-server.test.ts`: assert rewrite-plan data over Streamable HTTP.
- Modify `tests/e2e/end-to-end.test.ts`: assert teacher-mode rewrite actions and use the 0.4.0 test client version.
- Modify `site/index.html`: explain `rewritePlan`, external-AI candidate generation, and mandatory second validation.
- Modify `scripts/verify-site.mjs`: require the v0.4.0 two-pass guidance on GitHub Pages.
- Create `scripts/smoke-remote.mjs`: run repeatable, non-identifying production MCP discovery and two-pass calls.
- Modify `package.json`: add `smoke:remote` command while retaining version `0.4.0`.
- Modify `docs/remote-deployment.md`: record the exact teacher-mode Cloud Run command and rollback command.

### Task 1: Close v0.4.0 Release Metadata Gaps

**Files:**
- Modify: `package-lock.json`
- Modify: `src/server.ts`
- Modify: `tests/e2e/end-to-end.test.ts`
- Modify: `tests/remote-server.test.ts`

**Interfaces:**
- Consumes: existing `package.json` version `0.4.0` and `TeacherEntryReview.rewritePlan`.
- Produces: consistent package/MCP version metadata and transport-level assertions for `none`, `rewrite`, and `ask_evidence`.

- [ ] **Step 1: Add transport assertions before changing release metadata**

In the teacher HTTP test, parse entries as:

```ts
Array<{
  status: "pass" | "revise" | "prohibited";
  rewritePlan: {
    action: "none" | "rewrite" | "ask_evidence";
    requiresRevalidation: boolean;
  };
}>
```

Assert actions `none`, `rewrite`, `ask_evidence` for the existing clean, editorial, and TOEIC fixtures. In the stdio teacher E2E test, include one editorial and one prohibited fixture and make the same assertion.

- [ ] **Step 2: Run focused tests and confirm the current contract**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e
```

Expected: all transport tests pass and structured content contains the three rewrite actions.

- [ ] **Step 3: Synchronize all release versions**

Run:

```powershell
npm.cmd version 0.4.0 --no-git-tag-version --allow-same-version
```

Change `src/server.ts` MCP version to `0.4.0`; change only teacher test-client labels that intentionally identify this release from `0.3.0` to `0.4.0`.

- [ ] **Step 4: Verify no live release metadata remains at 0.3.0**

Run:

```powershell
rg -n '"version": "0\.3\.0"|version: "0\.3\.0"' package.json package-lock.json src tests
```

Expected: no matches. Historical plan and migration documentation may still mention 0.3.0 and should not be rewritten.

- [ ] **Step 5: Commit the metadata and transport contract**

```powershell
git add package.json package-lock.json src/server.ts tests/remote-server.test.ts tests/e2e/end-to-end.test.ts
git commit -m "chore: prepare v0.4.0 release metadata"
```

### Task 2: Finish the GitHub Pages v0.4.0 Guide

**Files:**
- Modify: `site/index.html`
- Modify: `scripts/verify-site.mjs`
- Modify: `docs/remote-deployment.md`

**Interfaces:**
- Consumes: `rewritePlan.action` contract and public `/mcp` endpoint.
- Produces: teacher-facing two-pass instructions and automated site-content verification.

- [ ] **Step 1: Make site verification fail for missing v0.4.0 guidance**

Add required strings to `scripts/verify-site.mjs`:

```js
"rewritePlan",
"2차 검증",
"ask_evidence",
```

Run `npm.cmd run verify:site`.

Expected: FAIL until the site is updated.

- [ ] **Step 2: Update the site workflow and result explanation**

In `site/index.html`, explain this exact flow:

1. AI sends the original entries to `check_school_record`.
2. `none` means no rewrite; `rewrite` allows an external-AI candidate using original facts only; `ask_evidence` requests teacher evidence and forbids an invented candidate.
3. Every candidate is sent to the same MCP a second time.
4. Only a second-pass `pass` may be shown as a verified recommendation.

Keep the existing connection URL, HTTP transport, no-header guidance, AI찬우쌤/classddok.com identity, attribution, and privacy warning.

- [ ] **Step 3: Correct the deployment documentation**

Update the Cloud Run command in `docs/remote-deployment.md` to include:

```text
MCP_ENABLE_LEGACY_SSE=false,MCP_TOOLSET=teacher
```

Add the exact rollback command from Task 6 and state that both published Cloud Run hostnames must be health-checked before changing the website URL.

- [ ] **Step 4: Verify and commit the guide**

Run `npm.cmd run verify:site`.

Expected: `site verification passed`.

```powershell
git add site/index.html scripts/verify-site.mjs docs/remote-deployment.md
git commit -m "docs: explain the v0.4.0 two-pass workflow"
```

### Task 3: Add a Repeatable Production Smoke Test

**Files:**
- Create: `scripts/smoke-remote.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `REMOTE_MCP_URL` ending in `/mcp` and the public `check_school_record` tool.
- Produces: exit code 0 only when discovery and representative v0.4.0 behavior pass.

- [ ] **Step 1: Implement the smoke client**

Use `Client`, `StreamableHTTPClientTransport`, and `CallToolResultSchema`. Require `REMOTE_MCP_URL`, reject non-HTTPS URLs outside localhost, and perform only these synthetic calls:

```js
const originals = [
  { entryId: "pass", text: "실험 결과를 비교하여 설명함." },
  { entryId: "revise", text: "항상 완벽하게 실험함." },
  { entryId: "prohibited", text: "TOEIC에서 우수한 성적을 거둠." },
];
```

Assert:

- tools/list returns only `check_school_record`.
- statuses are `pass`, `revise`, `prohibited`.
- rewrite actions are `none`, `rewrite`, `ask_evidence`.
- the second call with `실험 결과를 비교하여 설명함.` returns `pass` and `none`.
- serialized output does not contain any extra submitted secret fixture.

Always close the MCP client in `finally`.

- [ ] **Step 2: Register the command and test locally**

Add:

```json
"smoke:remote": "node scripts/smoke-remote.mjs"
```

Start the local remote server with teacher mode, then run:

```powershell
$env:REMOTE_MCP_URL="http://127.0.0.1:8080/mcp"
npm.cmd run smoke:remote
```

Expected: discovery and all four assertions pass with no student text printed.

- [ ] **Step 3: Commit the smoke tool**

```powershell
git add package.json package-lock.json scripts/smoke-remote.mjs
git commit -m "test: add remote release smoke check"
```

### Task 4: Run the Release Gate and Fast-Forward GitHub Main

**Files:**
- Verify only: entire repository

**Interfaces:**
- Consumes: clean local release candidate.
- Produces: GitHub `main` at the exact verified commit with CI and Pages successful.

- [ ] **Step 1: Run every local release check**

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run verify:site
npm.cmd pack --dry-run
git status --short
```

Expected: all commands pass; worktree is clean; package dry-run includes `dist`, sealed `data`, docs, licenses, and source manifest but no raw student data or local paths.

- [ ] **Step 2: Recheck remote ancestry immediately before push**

```powershell
git fetch origin main --tags
git merge-base --is-ancestor origin/main HEAD
git rev-list --left-right --count origin/main...HEAD
```

Expected: ancestor command exits 0 and the count is `0 N` with `N > 0`. If remote has diverged, stop and rebase or merge only after reviewing the new commits; never force-push.

- [ ] **Step 3: Push the verified commit to main**

```powershell
git push origin HEAD:main
```

Record the exact pushed SHA with `git rev-parse HEAD`.

- [ ] **Step 4: Wait for both main workflows**

Use `gh run list -R ARTHONG1/-school-record-validator-mcp --branch main` to identify the CI and Deploy GitHub Pages runs for the pushed SHA, then run `gh run watch RUN_ID --exit-status` for each.

Expected: both conclude `success`. If either fails, inspect with `gh run view RUN_ID --log-failed`, fix on the release branch, repeat Task 4, and do not tag or deploy Cloud Run.

- [ ] **Step 5: Verify the published Pages site**

Open `https://arthong1.github.io/-school-record-validator-mcp/` and verify it contains `rewritePlan`, `2차 검증`, the public MCP URL, source attribution, and the privacy disclaimer.

### Task 5: Create and Verify the Immutable v0.4.0 Tag

**Files:**
- No source changes

**Interfaces:**
- Consumes: green GitHub `main` SHA.
- Produces: annotated `v0.4.0` tag pointing to that exact SHA.

- [ ] **Step 1: Confirm the tag is absent and main matches HEAD**

```powershell
git ls-remote origin refs/tags/v0.4.0 refs/heads/main
git rev-parse HEAD
```

Expected: no v0.4.0 tag and identical main/HEAD commit SHA.

- [ ] **Step 2: Create and push the tag**

```powershell
git tag -a v0.4.0 -m "Release v0.4.0"
git push origin v0.4.0
```

- [ ] **Step 3: Wait for tag CI**

Find the tag CI run with `gh run list`, then run `gh run watch RUN_ID --exit-status`.

Expected: `success`. Do not move or delete the published tag; any correction becomes v0.4.1.

### Task 6: Deploy the Exact v0.4.0 Commit to Cloud Run

**Files:**
- No source changes

**Interfaces:**
- Consumes: clean, tagged, green v0.4.0 checkout.
- Produces: a new Cloud Run revision receiving 100% traffic after smoke verification.

- [ ] **Step 1: Capture the rollback target and verify identity**

```powershell
gcloud.cmd config get-value project
gcloud.cmd auth list --filter=status:ACTIVE --format="value(account)"
gcloud.cmd run services describe school-record-validator-mcp --region asia-northeast3 --format="value(status.latestReadyRevisionName,status.url)"
```

Expected project: `school-record-validator-mcp`; expected current rollback revision: `school-record-validator-mcp-00006-gf4`.

- [ ] **Step 2: Deploy with the existing public low-cost settings**

```powershell
gcloud.cmd run deploy school-record-validator-mcp --project school-record-validator-mcp --source . --region asia-northeast3 --allow-unauthenticated --set-env-vars MCP_ENABLE_LEGACY_SSE=false,MCP_TOOLSET=teacher --min-instances=0 --max-instances=1 --memory=512Mi --cpu=1 --concurrency=20 --cpu-throttling --no-cpu-boost --quiet
```

Expected: Cloud Build succeeds and a new ready revision is created.

- [ ] **Step 3: Verify configuration before functional calls**

Describe the service and assert:

- new `latestReadyRevisionName` differs from `00006-gf4`;
- traffic is 100% to the new revision;
- `allUsers` retains `roles/run.invoker`;
- `MCP_TOOLSET=teacher` and `MCP_ENABLE_LEGACY_SSE=false`;
- max scale 1, concurrency 20, CPU throttling true, startup boost false.

- [ ] **Step 4: Health-check both public hostnames**

Check `/health` on the Cloud Run API URL and the existing regional URL shown on GitHub Pages. Both must return HTTP 200 and `{ "status": "ok" }`. Keep the existing website URL if both work so registered clients do not need reconfiguration.

- [ ] **Step 5: Run the production MCP smoke test**

```powershell
$env:REMOTE_MCP_URL="https://school-record-validator-mcp-48287429068.asia-northeast3.run.app/mcp"
npm.cmd run smoke:remote
```

Expected: one teacher tool, statuses `pass/revise/prohibited`, actions `none/rewrite/ask_evidence`, and a passing second validation.

- [ ] **Step 6: Roll back immediately if Steps 3-5 fail**

```powershell
gcloud.cmd run services update-traffic school-record-validator-mcp --project school-record-validator-mcp --region asia-northeast3 --to-revisions school-record-validator-mcp-00006-gf4=100 --quiet
```

Re-run `/health` and the old v0.3.0-compatible tool call after rollback. Preserve the failed revision for logs; do not delete it during incident diagnosis.

### Task 7: Record the Release Outcome

**Files:**
- Modify: `.planning/safe-rewrite-v1/task_plan.md`
- Modify: `.planning/safe-rewrite-v1/progress.md`

**Interfaces:**
- Consumes: GitHub commit/tag/run URLs, Pages URL, Cloud Run revision/URL, smoke result.
- Produces: durable release evidence and a clear operational handoff.

- [ ] **Step 1: Record immutable identifiers**

Write the final commit SHA, `v0.4.0` tag SHA, CI run URLs, Pages deployment URL, new Cloud Run revision, active service URL, and smoke-test result to progress.md. Do not record tokens, student text, access headers, or transient Cloud Build credentials.

- [ ] **Step 2: Mark phases complete only after production verification**

Mark Phases 5-7 complete only if GitHub CI, Pages, tag CI, Cloud Run configuration, health checks, and MCP smoke all pass. If rolled back, leave Phase 7 incomplete and record the failed revision and reason.

- [ ] **Step 3: Final user report**

Report the GitHub repository, Pages URL, Remote MCP `/mcp` URL, deployed revision, exact verification results, and whether rollback was needed.

## Release Decision Matrix

| Failure point | Action |
|---|---|
| Local test/build/site/package failure | Fix locally; do not push |
| Remote main changed or diverged | Stop, inspect, integrate normally; never force-push |
| GitHub CI failure | Fix and push a new commit; do not tag or deploy |
| GitHub Pages failure | Fix Pages before tagging or Cloud Run |
| Tag CI failure | Keep tag immutable; diagnose and publish v0.4.1 if source correction is required |
| Cloud Build/deploy failure before traffic switch | Existing revision remains active; inspect build logs |
| Cloud Run config/health/MCP smoke failure | Route 100% traffic to `school-record-validator-mcp-00006-gf4` immediately |
| Post-release source defect | Revert on main with a new commit or fix forward as v0.4.1; never rewrite published history |

## Completion Criteria

- GitHub `main`, annotated `v0.4.0`, and Cloud Run all point to the same verified source commit.
- Main CI, tag CI, and GitHub Pages workflows succeed.
- Public Remote MCP remains header-free and exposes only `check_school_record`.
- Production returns the three teacher statuses and the three rewrite actions correctly.
- A second-pass candidate is accepted only when the MCP returns `pass`.
- Existing cost controls, privacy behavior, attribution, and public URL compatibility remain intact.
