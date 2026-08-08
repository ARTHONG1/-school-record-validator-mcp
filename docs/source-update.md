# 공식 문서 갱신 절차

이 절차는 교육부 훈령, 별표 또는 초등학교 기재요령이 개정됐을 때 새 규칙팩을 만드는 release gate입니다. 기존 규칙팩과 봉인 데이터는 덮어쓰지 않습니다.

## 준비

1. 새 공식 파일을 기존 스냅샷과 분리된 로컬 디렉터리에 둡니다.
2. 게시처, 문서 제목, 시행일, 대상 학교급이 공식 게시물과 일치하는지 사람이 확인합니다.
3. 원문 바이트의 SHA-256을 계산하고 `sources/manifest.json`을 새 rule pack version으로 갱신합니다. 로컬 절대 경로는 manifest나 산출물에 기록하지 않습니다.
4. 이전 pack ID와 데이터 파일은 immutable archive로 남깁니다.

## 검증과 생성

PowerShell에서는 `npm` 대신 `npm.cmd`를 사용합니다. 원본 디렉터리는 명령 인자로만 전달합니다.

```powershell
cd 'C:\path\to\school-record-validator-mcp'
$env:SCHOOL_RECORD_SOURCE_DIR='C:\path\to\official-sources'
npm.cmd run verify:sources
npm.cmd run ingest
```

1. `verify:sources` 결과에서 기대한 파일 수, 파일명, SHA-256을 확인하고 이전 파일이나 중·고등학교 자료가 혼입되지 않았는지 검토합니다.
2. corpus를 재생성한 뒤 청크 추가, 삭제, locator, 인쇄 쪽수와 PDF 쪽수의 diff를 사람이 검토합니다.
3. 모든 `verifiedQuote`가 새 청크에 존재하는지 확인하고, 정규화 비교 결과와 문맥을 사람이 다시 승인합니다.
4. 변경된 규칙과 golden test를 같은 변경 단위로 갱신합니다. 공식 규칙과 `editorial-caution`을 섞지 않습니다.
5. 상위·하위 공식 근거가 충돌하면 자동 판정을 추가하지 말고 충돌 검토 항목으로 남깁니다.

## 봉인과 release gate

```powershell
npm.cmd run seal:data
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e
```

`seal:data`는 최종 7개 데이터 파일의 SHA-256을 다시 봉인합니다. 원본 매니페스트, 근거 말뭉치, 검증 인용, 규칙팩의 해시 연결이 모두 일치해야 서버가 시작됩니다.

릴리스 전 다음을 확인합니다.

- 활성 원본은 초등학교 PDF, 현행 훈령 본문과 교차검증본, 별표 7~11의 8개뿐입니다.
- 초등 PDF는 161쪽이며 인쇄 쪽수와 PDF 쪽수를 별도 locator로 유지합니다.
- 모든 공식 규칙이 실제 청크, source ID, 원문 SHA-256과 검증된 인용을 가집니다.
- 원본 통합 테스트는 `SCHOOL_RECORD_SOURCE_DIR`이 설정된 로컬 release gate에서만 실행합니다.
- Gitignored 원본 파일은 커밋하거나 npm 배포물에 넣지 않습니다.
- CI는 커밋된 봉인 corpus와 규칙만으로 통과해야 합니다.
- 이전 규칙팩과 데이터는 삭제하지 않고 immutable archive로 보존합니다.
