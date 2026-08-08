# Low-Cost Cloud Run Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a dedicated billed GCP project and deploy the existing Remote MCP to Cloud Run with strict low-cost limits.

**Architecture:** Build the existing Dockerfile with Cloud Build, run it on Cloud Run in Seoul, and inject a Secret Manager Bearer token through a least-privilege runtime service account. Use HTTP-only scale-to-zero operation with one maximum instance.

**Tech Stack:** Google Cloud CLI 578.0.0, Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Node.js 22, MCP SDK 1.30.0.

## Global Constraints

- Project ID: `school-record-validator-mcp` if still globally available.
- Region: `asia-northeast3`.
- Service: `school-record-validator-mcp`.
- Minimum instances: `0`; maximum instances: `1`.
- CPU: `1`; memory: `512Mi`; concurrency: `20`.
- Disable startup CPU boost and enable CPU throttling.
- Set `MCP_ENABLE_LEGACY_SSE=false`.
- Never print or persist the Bearer token in tracked files or command logs.
- Do not modify, delete, or deploy into any existing game project.

---

### Task 1: Create And Configure The Dedicated Project

**Files:**
- No repository files changed.

**Interfaces:**
- Produces: a dedicated billed GCP project selected in the active gcloud configuration.

- [ ] Verify the authenticated account and project ID availability.
- [ ] Create the project with the display name `School Record Validator MCP`.
- [ ] Link billing account `01D25F-A941C5-FC1FA6`.
- [ ] Set the project and default Cloud Run region in gcloud.
- [ ] Enable only `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`, and `iam.googleapis.com`.
- [ ] Verify project and enabled-service state with read-only gcloud commands.

### Task 2: Create Runtime Identity And Secret

**Files:**
- No repository files changed.

**Interfaces:**
- Produces: service account `school-record-mcp-runtime` and secret `school-record-mcp-token`.

- [ ] Generate a cryptographically random token in memory.
- [ ] Create the Secret Manager secret and add the token as version 1 without printing it.
- [ ] Create the dedicated Cloud Run runtime service account.
- [ ] Grant that service account `roles/secretmanager.secretAccessor` on only this secret.
- [ ] Verify IAM and secret metadata without reading the secret payload.

### Task 3: Build And Deploy The Service

**Files:**
- Read: `Dockerfile`
- Read: `.dockerignore`
- Read: `dist/remote.js`

**Interfaces:**
- Consumes: project, runtime service account, and secret from Tasks 1-2.
- Produces: public HTTPS Cloud Run service with authenticated `/mcp`.

- [ ] Run `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build`.
- [ ] Deploy source with `gcloud run deploy school-record-validator-mcp --source .`.
- [ ] Set `--min 0`, `--max 1`, `--cpu 1`, `--memory 512Mi`, `--concurrency 20`, `--cpu-throttling`, and `--no-cpu-boost`.
- [ ] Set `MCP_ENABLE_LEGACY_SSE=false` and inject `MCP_AUTH_TOKEN` from Secret Manager.
- [ ] Allow unauthenticated Cloud Run invocation while retaining Bearer authentication in the application.
- [ ] Capture the generated service URL without exposing the token.

### Task 4: Add Cost Monitoring And Image Cleanup

**Files:**
- Create locally under ignored `tmp/`: Artifact Registry cleanup policy JSON.

**Interfaces:**
- Produces: billing alerts and automatic old-image cleanup.

- [ ] Create a low monthly project-scoped billing budget with 50%, 90%, and 100% threshold alerts.
- [ ] Identify the source-deploy Artifact Registry repository.
- [ ] Apply a cleanup policy that deletes old untagged images while preserving recent deployment images.
- [ ] Verify the budget and cleanup-policy metadata.

### Task 5: Verify Production And Report Registration Values

**Files:**
- Modify: `progress.md`
- Modify: `findings.md`

**Interfaces:**
- Consumes: deployed URL and in-memory token.
- Produces: verified Remote MCP registration details for the user.

- [ ] Confirm `/healthz` returns HTTP 200 and `{ "status": "ok" }`.
- [ ] Confirm an unauthenticated initialize request to `/mcp` returns HTTP 401.
- [ ] Use the official MCP SDK with the token and verify exactly seven tools.
- [ ] Inspect Cloud Run configuration and confirm every cost-control value.
- [ ] Record non-secret deployment facts in planning files.
- [ ] Give the user the HTTP `/mcp` URL and explain how to enter the Bearer token without publishing it.
