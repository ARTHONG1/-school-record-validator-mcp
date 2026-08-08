# Low-Cost Cloud Run Deployment Design

## Goal

Deploy the school-record validator as a dedicated Remote MCP on Google Cloud while keeping idle and runaway costs as low as practical.

## Architecture

- Create a dedicated GCP project named `school-record-validator-mcp` so billing, permissions, and deletion remain isolated from existing projects.
- Deploy one Cloud Run service in `asia-northeast3` from the existing Dockerfile.
- Expose only stateless Streamable HTTP at `/mcp`; disable legacy SSE.
- Allow header-free public access to `/mcp`.
- Do not apply an application request-rate limit; rely on input-size limits, Cloud Run maximum scale 1, and billing alerts.
- Accept HTTP request bodies up to 10MB, validation text up to 200,000 characters, and batches up to 100 entries.

## Cost Controls

- Cloud Run minimum instances: `0`.
- Cloud Run maximum instances: `1`.
- CPU: `1`, throttled outside requests.
- Memory: `512Mi`.
- Startup CPU boost: disabled.
- Concurrency: `20`.
- No database, load balancer, VPC connector, fixed IP, or custom domain.
- Set a low monthly billing budget with alerts at 50%, 90%, and 100%.
- Apply an Artifact Registry cleanup policy that keeps recent images and removes old untagged images.

Budgets provide alerts and do not impose a hard spending cap. The Cloud Run maximum-instance limit is the primary runtime cost guard.

## Security And Privacy

- Cloud Run and `/mcp` permit public invocation without an authorization header.
- `/healthz` contains no sensitive data and remains unauthenticated.
- Submitted text, authorization headers, and tokens are not written to application logs.
- The deployment is educational and experimental; real student-identifying information must not be submitted to the public endpoint.

## Verification

- Confirm `/healthz` returns `{ "status": "ok" }`.
- Connect without headers using the official MCP SDK and confirm all seven tools are listed.
- Confirm the deployed revision has min instances 0, max instances 1, legacy SSE disabled, 1 CPU, and 512Mi memory.
