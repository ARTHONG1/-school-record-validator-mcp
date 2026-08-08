# Remote MCP와 Google Cloud Run 배포

이 문서는 URL 기반 Remote MCP를 Google Cloud Run에 배포하고, Remote MCP 등록 화면에 연결하는 절차를 설명합니다. 실제 배포는 GCP 과금과 외부 네트워크 노출을 발생시킬 수 있습니다.

## 엔드포인트

| 용도 | URL | 화면의 Transport |
|---|---|---|
| 권장 Remote MCP | `https://SERVICE_URL/mcp` | `HTTP` |
| 구형 클라이언트 호환 | `https://SERVICE_URL/sse` | `SSE` |
| 상태 확인 | `https://SERVICE_URL/health` | 해당 없음 |

`/mcp`는 상태 없는 Streamable HTTP라 Cloud Run 확장에 적합합니다. `/sse`는 SDK에서 폐기 예정인 호환 전송이며 세션을 메모리에 저장합니다. SSE를 사용하려면 Cloud Run 인스턴스를 1개로 제한해야 합니다. 새 연결은 반드시 `HTTP`를 권장합니다.

## 로컬 원격 서버 시험

```powershell
npm.cmd ci
npm.cmd run build
$env:PORT="8080"
$env:MCP_ENABLE_LEGACY_SSE="false"
npm.cmd run start:remote
```

`http://localhost:8080/health`가 `{"status":"ok"}`를 반환하면 서버가 준비된 것입니다. 로컬에서는 `/healthz`도 같은 응답을 제공합니다. 공개 모드에서는 인증 헤더가 필요하지 않습니다.

## Cloud Run 배포

사전 조건은 Google Cloud CLI 설치, 로그인, 프로젝트 선택, 결제 계정 연결입니다.

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

프로젝트 루트에서 소스 빌드 배포를 실행합니다. SSE 호환을 유지하는 예시는 인스턴스를 1개로 제한합니다.

```bash
gcloud run deploy school-record-validator-mcp \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --set-env-vars MCP_ENABLE_LEGACY_SSE=false,MCP_TOOLSET=teacher \
  --min 0 \
  --max 1 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 20 \
  --cpu-throttling \
  --no-cpu-boost
```

이 구성은 헤더 없이 공개 호출을 허용합니다. 기본 MCP 도구셋은 교사용 check_school_record 하나이며, 저수준 7개 도구가 필요한 유지관리자는 MCP_TOOLSET=expert를 사용합니다. 별도 애플리케이션 요청 횟수 제한은 적용하지 않습니다. HTTP 본문은 최대 10MB, 문안은 건당 최대 200,000자, 배치는 최대 100건이며 Cloud Run 최대 인스턴스 1과 월 예산 알림으로 비용을 통제합니다.

배포 후 MCP smoke test나 health check가 실패하면 직전 정상 리비전으로 트래픽을 되돌립니다.

```bash
gcloud run services update-traffic school-record-validator-mcp \
  --project school-record-validator-mcp \
  --region asia-northeast3 \
  --to-revisions school-record-validator-mcp-00006-gf4=100
```

롤백 뒤 `/health`와 `check_school_record`를 다시 확인하고, 실패한 리비전은 원인 분석을 위해 삭제하지 않습니다.

## 등록 화면 입력값

| 입력칸 | 권장값 |
|---|---|
| 이름 | `학교생활기록부 검증기` |
| URL | `https://YOUR_SERVICE_URL/mcp` |
| Transport | `HTTP` |
| Headers | 비워 둠 (`+ 추가`를 누르지 않음) |
| 설명 | `2026 초등 학교생활기록부 문안을 공식 근거로 검토하는 교육·실습용 MCP` |

현재 공개 배포에서는 SSE가 비활성화되어 있으므로 `HTTP`와 `/mcp`를 사용합니다.

## 개인정보와 운영 주의

- 로컬 stdio 모드에서는 문안이 사용자 컴퓨터 밖으로 나가지 않습니다.
- Remote MCP에서는 문안이 인터넷을 통해 Cloud Run으로 전송됩니다.
- 서버 코드는 요청 본문과 학생 문안을 저장하거나 애플리케이션 로그에 쓰지 않습니다.
- Cloud Run 및 MCP 호스트의 플랫폼 로그·보관 정책은 별도로 확인해야 합니다.
- 실습 공개 서버에는 실제 학생 식별정보를 넣지 말고 가명·비식별 예시만 사용하십시오.
- 실제 학교 업무에 사용하려면 학교 개인정보 처리 기준과 최신 교육부 문서를 최종 확인해야 합니다.

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | Cloud Run이 주입하는 수신 포트 |
| `MCP_AUTH_TOKEN` | 없음 | 설정하면 Bearer 인증을 활성화함. 공개 배포에서는 설정하지 않음 |
| `MCP_ALLOWED_HOSTS` | 없음 | 쉼표로 구분한 허용 Host 이름 |
| `MCP_ENABLE_LEGACY_SSE` | `true` | `/sse` 호환 경로 활성화 여부 |
