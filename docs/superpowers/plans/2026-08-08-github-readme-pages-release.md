# GitHub README and Pages Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish School Record Validator MCP 0.2.0 to `ARTHONG1/-school-record-validator-mcp` with a detailed Korean README and a static GitHub Pages guide for teachers.

**Architecture:** Keep the existing Node/TypeScript MCP runtime unchanged except for public documentation references. Add a dependency-free static site under `site/`, deploy it with GitHub Actions Pages, and initialize only the MCP directory as its own Git repository so unrelated workspace files never enter the commit.

**Tech Stack:** Node.js 22.18+, TypeScript 5.9, existing MCP SDK, semantic HTML, CSS, vanilla JavaScript, GitHub Actions Pages.

## Global Constraints

- Target repository: `https://github.com/ARTHONG1/-school-record-validator-mcp`
- Pages URL: `https://arthong1.github.io/-school-record-validator-mcp/`
- Remote MCP URL: `https://school-record-validator-mcp-48287429068.asia-northeast3.run.app/mcp`
- Homepage is documentation-only; no student-text input, analytics, cookies, login, or external runtime dependency.
- Preserve official source data, hashes, existing MCP behavior, and public header-free Remote MCP settings.
- Do not stage parent workspace files.
- README and site must explain that `needs_context` is not a violation.
- Use relative asset paths because the Pages project has a leading hyphen in its repository name.

---

## Task 1: Prepare the standalone repository and public metadata

**Files:**
- Modify: `.gitignore`
- Create: `.github/workflows/pages.yml`
- No parent workspace files may be staged.

- [ ] Verify the target GitHub repository is empty and the local MCP directory has no nested `.git`.
- [ ] Initialize `main` inside the MCP directory and add the exact origin URL.
- [ ] Extend `.gitignore` to exclude local planning files, temporary screenshots, generated site artifacts, and dependency/build directories.
- [ ] Add a Pages workflow with `configure-pages`, `upload-pages-artifact`, and `deploy-pages`.
- [ ] Keep existing CI workflow unchanged and confirm it includes typecheck, tests, build, and e2e.

---

## Task 2: Rewrite README as the technical entry point

**Files:**
- Modify: `README.md`
- Verify: `docs/validation-result-contract.md`, `ATTRIBUTION.md`, `DATA_LICENSE.md`, `docs/source-audit.md`, `docs/remote-deployment.md`

- [ ] Replace clone and URL placeholders with the actual repository, Pages, and Remote MCP URLs.
- [ ] Add badges for CI, Node 22, MCP transport, elementary 2026 scope, and license.
- [ ] Add a short Korean quick start for teachers before deep technical detail.
- [ ] Explain the creator, educational/public purpose, non-official status, and classddok.com.
- [ ] Explain all seven tools, strict input shape, result statuses, privacy, attribution, license, limits, troubleshooting, and tests.
- [ ] Link to the GitHub Pages guide from the first section.
- [ ] Verify no placeholder URL, secret, token, local absolute path, or misleading official-approval claim remains.

---

## Task 3: Build the static GitHub Pages homepage

**Files:**
- Create: `site/index.html`
- Create: `site/styles.css`
- Create: `site/app.js`
- Create: `site/assets/mcp-flow.svg`
- Create: `site/assets/remote-registration.svg`
- Create: `site/assets/validation-states.svg`

- [ ] Build a Korean one-page guide with sections: purpose, workflow, checks, 3-minute connection, results, tools, examples, system prompt, privacy, sources, FAQ, creator.
- [ ] Use a restrained documentation palette with green/blue/yellow/red semantic states, max 8px card radius, no gradients/orbs, and mobile-safe text.
- [ ] Add a first viewport with project name, purpose, copyable Remote MCP URL, and links to installation/results.
- [ ] Use local SVG assets with accessible labels and no external image/network dependency.
- [ ] Add vanilla JS for copy buttons, tabs, mobile navigation, FAQ disclosure, and current-year text.
- [ ] Ensure content remains readable with JavaScript disabled.
- [ ] Include concrete JSON and system prompt examples that match the MCP 0.2.0 contract.

---

## Task 4: Add local static-site verification

**Files:**
- Create: `scripts/verify-site.mjs`
- Modify: `package.json`
- Modify: `README.md` if verification command is documented

- [ ] Parse `site/index.html` without external dependencies.
- [ ] Check required sections, actual URLs, relative asset references, and no forbidden runtime URLs/scripts.
- [ ] Check anchor targets and asset existence.
- [ ] Check for placeholder strings, secrets, absolute local paths, and student identifying data.
- [ ] Add `npm run verify:site` and run it from the project root.

---

## Task 5: Verify MCP and site together

**Files:**
- Modify: `.planning/github-readme-pages-release/progress.md`
- Modify: `.planning/github-readme-pages-release/task_plan.md`

- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd run test:e2e`.
- [ ] Run `npm.cmd run verify:site`.
- [ ] Run `npm.cmd pack --dry-run`.
- [ ] Run repository-scoped secret/path scans and `git diff --check`.
- [ ] Inspect the site at 360px, 768px, and 1440px using an available browser/screenshot workflow or static layout checks.
- [ ] Confirm the local site has no horizontal overflow or missing anchors.

---

## Task 6: Publish to GitHub and enable Pages

**Files:**
- Git metadata inside `school-record-validator-mcp/.git` only.

- [ ] Check `git status -sb` and stage only the standalone MCP repository contents.
- [ ] Commit with `feat: publish school record validator mcp and guide site`.
- [ ] Push `main` with upstream tracking.
- [ ] Set repository description, homepage URL, and topics.
- [ ] Enable Pages with GitHub Actions as the source.
- [ ] Wait for CI and Pages workflows, inspect failures if any, and verify the Pages URL.
- [ ] Create tag `v0.2.0` only after CI and Pages smoke checks pass.

---

## Task 7: Final handoff

- [ ] Report repository URL, Pages URL, Remote MCP URL, commit, tag, workflow status, and verification results.
- [ ] Document any remaining Cloud Run deployment limitation separately from the GitHub publication.

