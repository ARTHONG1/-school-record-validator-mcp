# School Record Validator MCP

[![CI](https://github.com/ARTHONG1/-school-record-validator-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ARTHONG1/-school-record-validator-mcp/actions/workflows/ci.yml) [![Node.js](https://img.shields.io/badge/Node.js-22.18%2B-2f855a)](https://nodejs.org/) [![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-2878a8)](https://modelcontextprotocol.io/) [![License](https://img.shields.io/badge/code-MIT-blue)](LICENSE)

> **처음 오셨나요?** [교사용 안내 홈페이지](https://arthong1.github.io/-school-record-validator-mcp/)에서 프로젝트 소개, Remote MCP 연결 방법, 결과 읽는 법을 먼저 확인하세요.

AI 에이전트에 그대로 넣을 시스템 프롬프트는 [교사용 시스템 프롬프트](docs/teacher-agent-prompt.md)에서 복사할 수 있습니다.

2026학년도 **초등학교 학교생활기록부 문안**을 교사가 직접 올리면 통과·수정 권장·기재 불가로 판단해 주는 교육·실습용 MCP 서버입니다. AI는 기본 teacher 모드의 `check_school_record` 도구를 호출하고, 문제가 있을 때 공식 근거와 개선 방향을 설명합니다. 0.4.0부터는 외부 AI가 사실을 추가하지 않고 후보 수정문을 만든 뒤 같은 도구로 2차 검증할 수 있도록 `rewritePlan`을 함께 반환합니다.

이 프로젝트는 현직 교사 **AI찬우쌤**이 학교 현장의 AI 활용 실습과 교육 공공성에 기여하기 위해 만들었습니다. AI찬우쌤은 교육자를 위한 AI 활용 서비스 [classddok.com](https://classddok.com)을 운영하고 있습니다.

> [!IMPORTANT]
> 교육부가 제작·검수·승인한 공식 서비스가 아닙니다. 결과의 `pass`는 현재 규칙팩에서 탐지된 항목이 없다는 뜻일 뿐, 교육부의 공식 승인·유권해석·법률 판단이나 학교 내부 결재를 대신하지 않습니다. 적용 시점의 최신 훈령, 기재요령과 학교 업무 기준을 최종 확인하세요.

## 결과 상태 읽는 법

교사가 가장 먼저 볼 상태는 세 가지입니다.

| 상태 | 의미 |
|---|---|
| `pass` | 현재 규칙팩에서 금지 또는 수정 권장 표현이 탐지되지 않음 |
| `revise` | 표현을 고치거나 실제 수행·근거를 교사가 확인해야 함 |
| `prohibited` | 공식 금지 내용이 탐지되어 현재 표현 그대로 기재할 수 없음 |

`pass`도 교육부 공식 승인이나 자동 결재를 뜻하지 않습니다. 학생의 실제 수행, 교사의 관찰·평가, 최신 기재요령과 학교 업무 기준을 최종 확인하세요. 저수준 expert 도구에서 제공되는 `needs_context`는 작성 경위 확인용 호환 상태이며, 기본 teacher 도구는 문안만 입력해도 이를 위반이나 수정 사유로 승격하지 않습니다.

## `check_school_record` 입력 예시

```json
{
  "entries": [
    { "entryId": "record_1", "text": "빗면을 이용하면 필요한 힘이 줄어드는 까닭을 설명함." },
    { "entryId": "record_2", "text": "기후변화가 환경에 미치는 영향을 설명함." }
  ]
}
```

## 무엇을 지원하나요?

- 규칙팩: `kr-moe-school-record-elementary-2026.1`
- 범위: 2026학년도 초등학교 전용
- 공식 자료: 교육부 문서 8개
- 검색 말뭉치: 고유 청크 515개 중 사람 검토를 거친 활성 청크 400개
- 근거 인용: 사람이 확인한 정확한 인용 12개
- 실행 방식: 로컬 `stdio` MCP와 URL 기반 Remote MCP
- 원격 전송: Streamable HTTP `/mcp` 및 구형 SSE 호환 `/sse`

중학교와 고등학교 기재요령은 v1의 검색과 판정에 포함하지 않습니다.

## AI가 정말 직접 사용하나요?

네. MCP를 지원하는 AI 클라이언트에 서버를 등록하면 AI가 도구 목록을 읽고 교사 문안 점검 요청에 `check_school_record`를 호출합니다.

1. 교사가 한 문장 또는 여러 문장을 입력합니다.
2. AI가 `record_1`, `record_2` 값을 `entries` 배열로 변환합니다.
3. AI가 `check_school_record`를 호출합니다.
4. MCP가 문안별 `pass`, `revise`, `prohibited`와 공식 인용·개선 방향을 반환합니다.
5. AI가 상태를 바꾸지 않고 교사가 읽기 쉬운 결과로 설명합니다.

모델이 항상 자율적으로 도구를 고른다고 보장할 수는 없습니다. 첫 사용에서는 “`school-record-validator` MCP를 반드시 사용해”라고 명시하면 확인하기 쉽습니다.

## 기본 도구

| 도구 | 역할 |
|---|---|
| `check_school_record` | 한 문장 또는 최대 100건을 교사용 세 상태로 점검하고, 문제별 이유·개선 방향·공식 인용을 반환 |

기본 teacher 모드에서는 이 도구 하나만 노출해 AI가 검색 도구를 잘못 선택하지 않도록 합니다. 규정 검색·원문·저수준 provenance 결과가 필요한 유지관리자와 개발자는 `MCP_TOOLSET=expert`를 사용하세요. expert 모드에서는 기존 `validate_record_text`, `validate_record_batch`, `search_record_guidance`, `get_source_excerpt`, `explain_record_rule`, `list_record_fields`, `rule_pack_info`도 함께 사용할 수 있습니다.

## 빠른 설치

요구 사항은 Node.js `22.18.0` 이상입니다.

```bash
git clone https://github.com/ARTHONG1/-school-record-validator-mcp.git
cd school-record-validator-mcp
npm ci
npm run build
npm run test:e2e
```

Windows PowerShell의 실행 정책 때문에 `npm.ps1`이 차단되면 `npm` 대신 `npm.cmd`를 사용하세요.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run test:e2e
```

## 로컬 stdio MCP 등록

로컬 모드는 학생 문안을 컴퓨터 밖으로 전송하지 않습니다. MCP 설정의 경로를 실제 설치 위치로 바꾸세요.

```json
{
  "mcpServers": {
    "school-record-validator": {
      "command": "node",
      "args": ["C:\\path\\to\\school-record-validator-mcp\\dist\\index.js"]
    }
  }
}
```

Codex CLI를 사용할 수 있다면 다음과 같이 등록할 수 있습니다.

```bash
codex mcp add school-record-validator -- node "/absolute/path/school-record-validator-mcp/dist/index.js"
codex mcp get school-record-validator
```

등록 후 AI 클라이언트를 완전히 종료했다가 다시 열고 새 대화에서 시험하세요.

## Remote MCP 등록 화면

Google Cloud Run 등에 배포해 서비스 URL을 받은 뒤 다음 값을 입력합니다.

> [!WARNING]
> 화면의 기본 선택이 `SSE`일 수 있습니다. 새 연결은 **HTTP를 직접 선택**하고 URL 끝을 **`/mcp`**로 입력하는 방식을 권장합니다.

| 화면 입력칸 | 입력값 |
|---|---|
| 이름 | `학교생활기록부 검증기` |
| URL | `https://school-record-validator-mcp-48287429068.asia-northeast3.run.app/mcp` |
| Transport | `HTTP` |
| Headers | 비워 둠 (`+ 추가`를 누르지 않음) |
| 설명 | `2026 초등 학교생활기록부 문안을 공식 근거로 검토하는 교육·실습용 MCP` |

현재 공개 배포는 HTTP 전용이며 별도 인증 헤더가 필요하지 않습니다. SSE는 비활성화되어 있으므로 신규 연결에는 HTTP를 사용하세요.

공개 서버는 요청 횟수를 별도로 제한하지 않습니다. HTTP 본문은 최대 10MB, 문안은 건당 최대 200,000자, 배치는 최대 100건이며 Cloud Run 최대 인스턴스 1과 월 예산 알림으로 비용을 통제합니다.

상세 배포 절차는 [Remote MCP와 Google Cloud Run 배포](docs/remote-deployment.md)를 참고하세요.

## Remote MCP 로컬 시험

```powershell
npm.cmd run build
$env:PORT="8080"
$env:MCP_ENABLE_LEGACY_SSE="false"
npm.cmd run start:remote
```

다른 터미널에서 상태를 확인합니다.

```powershell
Invoke-RestMethod http://localhost:8080/health
```

Remote MCP 엔드포인트는 다음과 같습니다.

- 권장 HTTP: `http://localhost:8080/mcp`
- SSE 호환: `http://localhost:8080/sse`
- 상태 확인: `http://localhost:8080/health` (`/healthz`도 로컬에서 지원)

## 바로 써보는 요청문

```text
학교생활기록부 검증기 MCP의 check_school_record 도구를 반드시 사용해서
다음 초등 과학 문장 3건을 검사해 줘.
각 문장에 대해 통과·수정 권장·기재 불가 중 하나를 제시하고,
문제가 있는 경우 이유·개선 방향·공식 근거를 설명해 줘.
추천 수정문을 만들 때 입력 문장에 없는 활동이나 성과를 추가하지 마.
```

`official` 프로필은 교육부 공식 규칙만 실행합니다. `official_plus_editorial`은 공식 규칙에 `항상`, `완벽하게`, `전교에서 가장`, 가정 내 활동, 진로 단정 표현과 같은 자체 편집 경고를 추가합니다. `editorial-caution`은 교육부의 공식 금지 규정이 아닙니다.

## 개인정보와 보안

| 구분 | 로컬 stdio | Remote MCP |
|---|---|---|
| 문안 전송 | 사용자 PC 밖으로 전송하지 않음 | 인터넷을 통해 운영 서버로 전송 |
| 애플리케이션 저장 | 하지 않음 | 하지 않음 |
| 애플리케이션 본문 로그 | 남기지 않음 | 남기지 않음 |
| 추가 확인 | MCP 호스트의 대화 보관 정책 | MCP 호스트와 Cloud Run의 로그·보관 정책 |

교육·실습용 공개 서버에는 실제 학생의 이름, 학번, 연락처 등 식별정보를 입력하지 말고 가명·비식별 예시만 사용하세요. 실제 학교 업무에 원격 서버를 사용하려면 학교 개인정보 처리 기준과 적법한 처리 근거를 별도로 검토해야 합니다.

## 길이 검사

CRLF를 LF로 정규화한 뒤 UTF-8 바이트를 계산합니다. 한글은 일반적으로 3Byte, 영문·숫자·Enter는 1Byte입니다.

| 항목 | 한도 |
|---|---:|
| 성명 | 60Byte |
| 주소 | 900Byte |
| 학적 특기사항 | 1,500Byte, 안내값 500자 |
| 출결 특기사항 | 1,500Byte, 안내값 500자 |
| 봉사활동 실적별 활동내용 | 150Byte, 안내값 50자 |
| 창체·일상생활·교과·행동특성 | `system-range`, 별도 고정 한도 미적용 |

## 공식 자료와 출처

교육부 「2026 학교생활기록부 기재요령(초등학교)」, 「학교생활기록 작성 및 관리지침」 교육부훈령 제555호 및 별표 7~11을 사용했습니다. 문서별 제목, 날짜, URL, SHA-256과 가공 내역은 [ATTRIBUTION.md](ATTRIBUTION.md)와 [원본 감사 기록](docs/source-audit.md)에 있습니다.

코드는 MIT 라이선스입니다. 교육부 공식 문서 및 문서에서 추출·가공한 데이터는 코드의 MIT 라이선스에 자동 포함되지 않습니다. 배포·재사용 전 [DATA_LICENSE.md](DATA_LICENSE.md)와 원 게시물의 최신 공공누리·권리표시를 확인하세요.

## 검증 명령

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run verify:site
npm pack --dry-run
```

공식 원본을 로컬에 보유한 유지관리자는 `SCHOOL_RECORD_SOURCE_DIR`을 지정해 해시와 추출 결과를 추가 검증할 수 있습니다.

```powershell
$env:SCHOOL_RECORD_SOURCE_DIR="C:\path\to\official-sources"
npm.cmd run verify:sources
node --test tests/source-integration.test.ts
```

## 문제 해결

### AI가 도구를 찾지 못합니다

MCP 등록 후 AI 앱을 완전히 종료하고 다시 실행한 다음 새 대화를 여세요. 로컬 모드는 `dist/index.js`, Remote MCP HTTP는 `/mcp` URL을 사용해야 합니다.

### `codex` 명령을 찾을 수 없습니다

Codex Desktop과 Codex CLI의 PATH 등록은 별개일 수 있습니다. 앱의 MCP 설정 화면을 사용하거나 Codex CLI 실행 파일의 절대 경로를 사용하세요.

### Remote MCP가 `404`를 반환합니다

HTTP 선택 시 URL 끝이 `/mcp`, SSE 선택 시 `/sse`인지 확인하세요. SSE를 환경변수로 비활성화했다면 `/sse`는 제공되지 않습니다.

### 빌드 후에도 이전 동작이 보입니다

`npm run build`를 다시 실행하고 로컬 MCP 프로세스 또는 배포된 Cloud Run 리비전을 재시작하세요.

## 프로젝트 상태

이 저장소는 교육·실습용 오픈소스 프로젝트입니다. 현재 규칙팩의 적용 범위와 알려진 한계는 [docs/limitations.md](docs/limitations.md), 규칙별 감사 결과는 [docs/rule-audit.md](docs/rule-audit.md), 공식 자료 갱신 절차는 [docs/source-update.md](docs/source-update.md)를 참고하세요.
