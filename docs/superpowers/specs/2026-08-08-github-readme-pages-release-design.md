# School Record Validator MCP GitHub README and Pages Release Design

## 1. Objective

School Record Validator MCP 0.2.0을 공개 GitHub 저장소 `ARTHONG1/-school-record-validator-mcp`에 첫 배포한다. 저장소 첫 화면의 README는 정확한 설치·운영 문서가 되고, GitHub Pages는 일반 초등교사가 프로젝트의 목적과 사용법을 쉽게 이해하는 안내 홈페이지가 된다.

프로젝트는 현직 교사 AI찬우쌤이 운영하는 교육·실습용 오픈 프로젝트이며, `classddok.com` 운영자라는 소개와 교육 공공성을 위한 제작 목적을 명시한다. 교육부가 제작·검수·승인한 공식 서비스가 아니라는 점도 첫 화면과 사용 안내에 반복해 표시한다.

## 2. Audiences

### Primary audience

- MCP나 개발 도구에 익숙하지 않은 초등교사
- AI 에이전트에 생활기록부 점검 기능을 연결하려는 교사
- 결과의 `pass`, `needs_context`, `review`, `blocked` 차이를 알고 싶은 사용자

### Secondary audience

- 로컬 stdio MCP를 설치하는 개발자
- Remote MCP를 workflow에 연결하는 AI 에이전트 제작자
- 규칙팩, 근거 해시, 데이터 출처와 라이선스를 검토하는 기술 사용자

## 3. Scope

### Included

- 검증 완료된 MCP 0.2.0 전체 공개
- 실제 저장소 URL이 반영된 상세 README
- 정적 GitHub Pages 안내 홈페이지
- Remote MCP와 로컬 stdio 설치 안내
- 결과 상태, 7개 도구, 사용 예시, 시스템 프롬프트 예시
- 개인정보·법적 한계·공식 출처·공공누리·라이선스 안내
- 반응형 UI, 키보드 접근성, 복사 버튼, 설치 방식 탭
- GitHub Actions CI 및 Pages 자동 배포
- 저장소 description, homepage, topics 설정

### Excluded

- 홈페이지에서 학생 문안을 입력하거나 검증하는 기능
- 로그인, 사용자 계정, 데이터베이스, 분석·추적 도구
- 학생 정보 저장 또는 전송
- 중학교·고등학교 규칙팩
- 커스텀 도메인 연결
- Cloud Run 애플리케이션 재배포

## 4. Repository Strategy

현재 `school-record-validator-mcp`는 상위의 큰 작업공간 Git 저장소 안에서 untracked 폴더로 존재한다. 상위 저장소에는 다수의 무관한 파일과 사용자 변경이 있으므로 상위 저장소에서 stage하거나 push하지 않는다.

대상 GitHub 저장소가 비어 있으므로, 실행 시 현재 MCP 폴더를 독립 Git 저장소로 초기화한다.

1. `school-record-validator-mcp/.git`이 없는지 재확인한다.
2. `git init -b main`으로 독립 저장소를 만든다.
3. `origin`을 `https://github.com/ARTHONG1/-school-record-validator-mcp.git`으로 설정한다.
4. `.gitignore`를 이용해 `node_modules`, 빌드 중간물, 원본 문서, 계획 메모를 제외한다.
5. 공개 대상 파일만 검토한 뒤 첫 커밋을 만들고 `main`에 push한다.

첫 배포 대상이 빈 저장소이므로 PR 없이 `main` 최초 push를 사용한다. 이후 변경부터는 feature branch와 PR을 기본으로 한다.

## 5. README Information Architecture

README는 GitHub 저장소 첫 화면에서 3분 안에 프로젝트를 이해하고 연결할 수 있도록 다음 순서를 사용한다.

1. 프로젝트 이름과 한 문장 설명
2. 상태 badges: CI, Node 22.18+, MCP transport, school level, academic year, license
3. 핵심 CTA: GitHub Pages 보기, Remote MCP 연결, 로컬 설치
4. 프로젝트 목적과 제작자 소개
5. 공식 서비스가 아니라는 중요 안내
6. 작동 방식 5단계
7. 지원 범위와 7개 도구 표
8. Remote MCP 연결 값
9. 로컬 stdio 설치와 Windows/Codex 예시
10. AI 에이전트 시스템 프롬프트와 strict schema 예시
11. 결과 상태 계약과 입력/출력 예시
12. 개인정보·보안 비교
13. 공식 출처·가공 사실·데이터 라이선스
14. 테스트와 유지관리 명령
15. FAQ와 문제 해결
16. 기여·Issue·라이선스·홈페이지 링크

README의 모든 placeholder를 실제 값으로 교체한다.

- Repository: `https://github.com/ARTHONG1/-school-record-validator-mcp`
- Clone: `https://github.com/ARTHONG1/-school-record-validator-mcp.git`
- Pages: `https://arthong1.github.io/-school-record-validator-mcp/`
- Remote MCP: `https://school-record-validator-mcp-48287429068.asia-northeast3.run.app/mcp`

## 6. GitHub Pages Information Architecture

GitHub Pages는 한 페이지형 정적 안내 사이트이며 상단 고정 탐색을 사용한다.

### First viewport

- 프로젝트 이름을 가장 큰 신호로 표시
- `2026 초등 학교생활기록부 문안을 공식 근거로 점검하는 교육·실습용 MCP` 설명
- `Remote MCP 주소 복사`와 `설치 방법 보기` CTA
- 교육부 공식 서비스가 아니라는 짧은 표시
- 다음 섹션의 일부가 첫 화면 아래에 보이도록 높이를 제한
- 실제 MCP 연결과 결과 흐름을 보여주는 비식별 제품 화면 이미지 사용

### Main sections

1. `이 MCP는 무엇인가요?`
2. `어떻게 작동하나요?`
3. `무엇을 점검하나요?`
4. `3분 연결 가이드`
5. `결과를 읽는 방법`
6. `7개 도구`
7. `실제 사용 예시`
8. `AI 시스템 프롬프트`
9. `개인정보와 안전`
10. `공식 근거와 프로젝트 한계`
11. `자주 묻는 질문`
12. `AI찬우쌤과 프로젝트 정보`

## 7. Visual Design

운영 도구에 맞는 조용하고 신뢰감 있는 문서형 인터페이스를 사용한다.

- 배경: 흰색과 매우 옅은 회색
- 주요 색상: 짙은 녹색, 파란색
- 상태 색상: 통과 녹색, 정보 확인 파란색, 검토 황색, 차단 적색
- 카드 반경: 최대 8px
- 제목은 페이지 규모에 맞게 사용하고 카드 내부에는 과도한 큰 글자를 사용하지 않음
- 버튼에는 가능한 경우 Lucide 아이콘 사용
- 기능 설명용 중첩 카드와 장식성 gradient, orb, bokeh 사용 금지
- 폰트 크기를 viewport 폭으로 자동 확대하지 않음
- 모든 텍스트는 모바일 360px에서 잘리지 않아야 함

시각 자료는 최소 세 개를 준비한다.

- Hero용 비식별 MCP 연결·검증 흐름 이미지
- Remote MCP 등록 화면 예시
- 결과 상태 예시 화면

제품 UI를 모방한 자료는 실제 프로젝트 정보만 사용하고 학생 실명·학번·연락처를 포함하지 않는다. 이미지에는 alt text와 캡션을 제공한다.

## 8. Site Implementation

사이트는 빌드 도구가 필요 없는 정적 파일로 구성한다.

```text
site/
  index.html
  styles.css
  app.js
  assets/
    mcp-flow.webp
    remote-registration.webp
    validation-states.webp
```

- `index.html`: 의미론적 section, navigation, 표, code example, FAQ
- `styles.css`: responsive layout, 상태 색상, focus style, print style
- `app.js`: 복사 버튼, 설치 방식 tabs, mobile navigation, FAQ disclosure 보조
- 모든 asset URL은 `./assets/...` 상대경로를 사용한다.
- JavaScript가 비활성화되어도 본문과 설치 정보는 모두 읽을 수 있어야 한다.
- 외부 CDN, 분석 스크립트, 광고, 쿠키를 사용하지 않는다.

## 9. GitHub Actions

### CI

기존 `.github/workflows/ci.yml`을 유지한다. push와 pull request에서 다음을 실행한다.

- Node.js 22.18.x
- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`

### Pages

`.github/workflows/pages.yml`을 추가한다.

- trigger: `main` push와 manual dispatch
- permissions: `contents: read`, `pages: write`, `id-token: write`
- concurrency: `pages`, 진행 중 배포 취소 허용
- `actions/configure-pages`
- `actions/upload-pages-artifact` with `site/`
- `actions/deploy-pages`
- environment URL을 deployment output으로 연결

GitHub 저장소 Pages build type은 workflow로 설정한다.

## 10. Content Accuracy and Safety

- `pass`는 공식 승인이라는 뜻이 아니라고 설명한다.
- `needs_context`는 위반이 아니라 최종 기재 전 작성 경위 확인이라고 설명한다.
- `official_plus_editorial`의 자체 편집 경고는 교육부 공식 금지와 분리한다.
- 공개 Remote MCP에는 실제 학생 개인정보를 넣지 않도록 모든 설치 안내 주변에 표시한다.
- Remote MCP는 현재 헤더 없이 공개되지만 HTTP 10MB, 문안 200,000자, 배치 100건 한도를 명시한다.
- 출처는 `ATTRIBUTION.md`, `DATA_LICENSE.md`, `docs/source-audit.md`로 연결한다.
- 교육 공공 목적과 현직 교사 제작 사실은 면책 문구를 약화시키는 근거로 사용하지 않는다.

## 11. Verification

### Repository checks

- 비밀키, 토큰, 로컬 절대경로, 학생 개인정보 검색
- `.gitignore` 제외 파일이 stage되지 않았는지 확인
- README 내부 링크와 Pages URL 확인
- `npm pack --dry-run` 공개 파일 목록 확인

### MCP checks

- 전체 test/typecheck/build/e2e 재실행
- SDK client가 7개 도구를 discovery하는지 확인
- 정상 문안, `needs_context`, 금지 문안, 검색 질의 smoke test

### Site checks

- HTML semantics와 필수 meta tags 검사
- 모든 내부 링크와 anchor 확인
- copy button, tabs, mobile navigation, FAQ 확인
- 360x800, 768x1024, 1440x900 screenshot 검토
- text overflow, overlap, horizontal scroll 검사
- keyboard focus와 reduced motion 확인
- GitHub Pages 배포 후 production URL smoke test

## 12. Release Result

완료 시 다음 결과를 제공한다.

- 공개 GitHub 저장소의 `main` branch
- 통과한 GitHub Actions CI
- 배포된 GitHub Pages 홈페이지
- repository description, homepage URL, topics
- MCP 0.2.0 소스와 공식 문서 출처·라이선스 안내
- 첫 release tag `v0.2.0`은 저장소와 Pages 검증 후 생성한다.

