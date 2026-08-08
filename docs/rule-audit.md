# 2026 초등 학교생활기록부 규칙 감사표

이 문서는 규칙팩 `kr-moe-school-record-elementary-2026.1`의 현재 감사 기록이다. 2026-07-31 기준으로 공식 원본 8개에서 고유 청크 515개를 생성했고, 그중 400개를 활성 검색 범위로 승인했다. 초등 기재요령 PDF는 페이지 좌표 기준 원시 청크 161개를 생성하지만, PDF 2쪽과 7쪽은 렌더링 이미지로 비텍스트 구분지ㆍ빈 페이지임을 확인해 활성 검색에서 제외했다. 공식 규칙은 `data/evidence/verified-excerpts.json`의 정확한 사람 검수 인용 12개와 대문자 SHA-256으로 연결되어 있다.

## 검수 상태

- 규칙팩: 2026 초등 전용 필드 10개, 공식 규칙 29개, 자체 편집 경고 3개
- corpus: 공식 문서 8개, 고유 청크 515개
- 활성 승인: 총 400개(PDF 159, 훈령 TXT 64, 별표 7/8/9/10/11 각각 27/61/76/10/3)
- 검증된 인용: `checkedBy: human`인 Evidence ID 12개, 인용문과 SHA-256 검증 완료
- 봉인 메타데이터: `data/bundle-manifest.json` 존재
- 결정성: corpus를 두 번 재생성해 산출물이 바이트 단위로 동일함을 확인
- 원본 검증: 공식 원본 통합 검사 4/4, 원본 파일 검증 8/8 통과
- 정규식 제한: backreference와 lookbehind를 사용하지 않음
- 초기 충돌 선언: 없음
- 공식 효력 순서: 교육부훈령·별표(100), 초등 기재요령(80), 자체 편집 경고(10)

아래 해시는 `data/evidence/verified-excerpts.json`의 Evidence ID와 인용문 SHA-256을 그대로 옮긴 것이다. 복수 Evidence ID를 사용하는 규칙은 각 ID와 해시를 같은 순서로 병기한다. AI 보조 작성 검증은 별도 참조값 저장을 요구하지 않으며, 교사가 최종 입력 전에 실제 수행, 허위·과장 여부와 기재 유의사항 준수 여부를 확인했는지를 본다.

## 공식 규칙

| Rule ID | Authority | Evidence ID | Source / locator | Quote SHA-256 | Detector | Outcome | 주요 예외 |
|---|---|---|---|---|---|---|---|
| `LENGTH-STUDENT-NAME` | official-policy | `EV-GUIDE-150-LIMITS` | 초등 기재요령 인쇄 150쪽 / PDF 156쪽 | `EFC7F88DF37A31D4E15A2C678CEA554751AD7EBC78B4846B1B20B39EF7F4E9F2` | NEIS Byte > 60 | block | 없음 |
| `LENGTH-ADDRESS` | official-policy | `EV-GUIDE-150-LIMITS` | 초등 기재요령 인쇄 150쪽 / PDF 156쪽 | `EFC7F88DF37A31D4E15A2C678CEA554751AD7EBC78B4846B1B20B39EF7F4E9F2` | NEIS Byte > 900 | block | 없음 |
| `LENGTH-ACADEMIC-STATUS-SPECIAL` | official-policy | `EV-GUIDE-150-LIMITS` | 초등 기재요령 인쇄 150쪽 / PDF 156쪽 | `EFC7F88DF37A31D4E15A2C678CEA554751AD7EBC78B4846B1B20B39EF7F4E9F2` | NEIS Byte > 1,500 | block | 없음 |
| `LENGTH-ATTENDANCE-SPECIAL` | official-policy | `EV-GUIDE-150-LIMITS` | 초등 기재요령 인쇄 150쪽 / PDF 156쪽 | `EFC7F88DF37A31D4E15A2C678CEA554751AD7EBC78B4846B1B20B39EF7F4E9F2` | NEIS Byte > 1,500 | block | 없음 |
| `LENGTH-VOLUNTEER-ACTIVITY` | official-policy | `EV-GUIDE-150-LIMITS` | 초등 기재요령 인쇄 150쪽 / PDF 156쪽 | `EFC7F88DF37A31D4E15A2C678CEA554751AD7EBC78B4846B1B20B39EF7F4E9F2` | 실적별 NEIS Byte > 150 | block | 없음 |
| `OFFICIAL-DIRECT-OBSERVATION` | official-policy | `EV-DIRECTIVE-4-2`, `EV-GUIDE-27-STUDENT-MATERIALS` | 훈령 제4조제2항, 초등 기재요령 인쇄 27쪽 / PDF 33쪽 | `1E6D5056B7AA67451494666AC4E6A10AA1975102DEDA1A1F641B6E77EAB2FB77`<br>`AE8A484C22659DA0637B889325215B21FA3D69DCF62CB24FBB7E36A8384C2601` | provenance metadata | block, review | 공식 문서가 인정하는 예외 자료는 교사 확인 필요 |
| `OFFICIAL-LANGUAGE-TEST` | official-policy | `EV-GUIDE-18-PROHIBITIONS` | 초등 기재요령 인쇄 18쪽 / PDF 24쪽 | `0C179CD6A18F9000412C6C4E665DA78115C0488C965C85545B1A676678646E60` | literal-any | block | 없음 |
| `OFFICIAL-CONTEST-PARTICIPATION-AWARD` | official-policy | `EV-GUIDE-18-PROHIBITIONS` | 초등 기재요령 인쇄 18쪽 / PDF 24쪽 | `0C179CD6A18F9000412C6C4E665DA78115C0488C965C85545B1A676678646E60` | same-sentence regex-any | block | 일반 수업 발표회는 대회 실적 표현이 아닐 때 제외 |
| `OFFICIAL-OUTSIDE-AWARD` | official-policy | `EV-GUIDE-18-PROHIBITIONS` | 초등 기재요령 인쇄 18쪽 / PDF 24쪽 | `0C179CD6A18F9000412C6C4E665DA78115C0488C965C85545B1A676678646E60` | regex-any | block | 없음 |
| `OFFICIAL-CERTIFICATION-TEST` | official-policy | `EV-GUIDE-18-PROHIBITIONS` | 초등 기재요령 인쇄 18쪽 / PDF 24쪽 | `0C179CD6A18F9000412C6C4E665DA78115C0488C965C85545B1A676678646E60` | same-sentence regex-any | block | 없음 |
| `OFFICIAL-PAPER-PUBLICATION` | official-policy | `EV-GUIDE-18-PROHIBITIONS` | 초등 기재요령 인쇄 18쪽 / PDF 24쪽 | `0C179CD6A18F9000412C6C4E665DA78115C0488C965C85545B1A676678646E60` | same-sentence regex-any | block | 수업 탐구 보고서는 논문 실적 표현이 아닐 때 제외 |
| `OFFICIAL-BOOK-PUBLICATION` | official-policy | `EV-GUIDE-18-PROHIBITIONS` | 초등 기재요령 인쇄 18쪽 / PDF 24쪽 | `0C179CD6A18F9000412C6C4E665DA78115C0488C965C85545B1A676678646E60` | same-sentence regex-any | block | 독서·교내 산출물은 출간 실적 표현이 아닐 때 제외 |
| `OFFICIAL-INTELLECTUAL-PROPERTY` | official-policy | `EV-GUIDE-18-PROHIBITIONS` | 초등 기재요령 인쇄 18쪽 / PDF 24쪽 | `0C179CD6A18F9000412C6C4E665DA78115C0488C965C85545B1A676678646E60` | same-sentence regex-any | block | 수업 중 발명 탐구는 출원·등록 실적 표현이 아닐 때 제외 |
| `OFFICIAL-OVERSEAS-ACTIVITY` | official-policy | `EV-GUIDE-18-PROHIBITIONS` | 초등 기재요령 인쇄 18쪽 / PDF 24쪽 | `0C179CD6A18F9000412C6C4E665DA78115C0488C965C85545B1A676678646E60` | literal-any | block | 없음 |
| `OFFICIAL-PARENT-SOCIOECONOMIC-STATUS` | official-policy | `EV-GUIDE-18-PROHIBITIONS` | 초등 기재요령 인쇄 18쪽 / PDF 24쪽 | `0C179CD6A18F9000412C6C4E665DA78115C0488C965C85545B1A676678646E60` | same-sentence regex-any | block | 직업·지위와 무관한 가족 배려 관찰은 제외 |
| `OFFICIAL-SCHOLARSHIP` | official-policy | `EV-GUIDE-18-PROHIBITIONS` | 초등 기재요령 인쇄 18쪽 / PDF 24쪽 | `0C179CD6A18F9000412C6C4E665DA78115C0488C965C85545B1A676678646E60` | literal-any | block | 없음 |
| `OFFICIAL-SPECIFIC-NAME` | official-policy | `EV-GUIDE-19-NARRATIVE-AUTHORITY` | 초등 기재요령 인쇄 19쪽 / PDF 25쪽 | `BB913B045BA4D6D4FC9F5AE3069E452003F21F4E386089B52944BA91D7C97627` | regex-any | review | 교육부·교육청·교육지원청 및 교육부 소속 6개 기관, 승인된 창체 주최·주관기관, 봉사활동 장소·주관기관명 |
| `OFFICIAL-QUALIFICATION` | official-policy | `EV-GUIDE-19-NARRATIVE-AUTHORITY` | 초등 기재요령 인쇄 19쪽 / PDF 25쪽 | `BB913B045BA4D6D4FC9F5AE3069E452003F21F4E386089B52944BA91D7C97627` | same-sentence regex-any | block | `자격` 단독 표현은 미탐지 |
| `OFFICIAL-FACTUAL-ACCURACY` | official-policy | `EV-GUIDE-19-NARRATIVE-AUTHORITY` | 초등 기재요령 인쇄 19쪽 / PDF 25쪽 | `BB913B045BA4D6D4FC9F5AE3069E452003F21F4E386089B52944BA91D7C97627` | provenance metadata | block, review | 없음 |
| `OFFICIAL-STUDENT-MATERIAL-CONDITIONS` | official-policy | `EV-GUIDE-27-STUDENT-MATERIALS` | 초등 기재요령 인쇄 27쪽 / PDF 33쪽 | `AE8A484C22659DA0637B889325215B21FA3D69DCF62CB24FBB7E36A8384C2601` | provenance metadata | block, review | 허용 5종 자료와 학교교육계획·교사 지도 조건 확인 |
| `OFFICIAL-STUDENT-FINAL-DRAFT` | official-policy | `EV-GUIDE-19-NARRATIVE-AUTHORITY` | 초등 기재요령 인쇄 19쪽 / PDF 25쪽 | `BB913B045BA4D6D4FC9F5AE3069E452003F21F4E386089B52944BA91D7C97627` | provenance metadata | block, review | 허용 학생 자료는 최종 기재문이 아님 |
| `OFFICIAL-AI-VERBATIM` | official-policy | `EV-GUIDE-19-NARRATIVE-AUTHORITY` | 초등 기재요령 인쇄 19쪽 / PDF 25쪽 | `BB913B045BA4D6D4FC9F5AE3069E452003F21F4E386089B52944BA91D7C97627` | provenance metadata | block, review | 없음 |
| `OFFICIAL-AI-VERIFICATION` | official-policy | `EV-GUIDE-19-NARRATIVE-AUTHORITY` | 초등 기재요령 인쇄 19쪽 / PDF 25쪽 | `BB913B045BA4D6D4FC9F5AE3069E452003F21F4E386089B52944BA91D7C97627` | provenance metadata | review | AI 미사용 시 제외; AI 보조 사용 시 저장된 참조값이 아니라 교사의 최종 확인 여부를 검토 |
| `FIELD-ATTENDANCE-PROHIBITED-CONTENT` | official-policy | `EV-GUIDE-59-ATTENDANCE` | 초등 기재요령 인쇄 59쪽 / PDF 65쪽 | `23832D4E7249FDE33E82E0D12E586C7FC7386B6B105DFA33A7B90951AF2D3A79` | regex-any | block | 없음 |
| `FIELD-CREATIVE-ACTIVITY-SCOPE` | official-policy | `EV-GUIDE-79-CREATIVE-SCOPE` | 초등 기재요령 인쇄 79쪽 / PDF 85쪽 | `BF2F67A33ACA094C28805BC251105D1AA27F73BA163EA20414E31B26F2D61EFA` | activity context metadata | block, review | 학교교육계획에 따른 학교 직접 주최·주관 국내 활동 |
| `FIELD-VOLUNTEER-SIMPLE-DONATION` | official-policy | `EV-GUIDE-84-VOLUNTEER` | 초등 기재요령 인쇄 84쪽 / PDF 90쪽 | `DFCFCB54E3F74FB27D9C08004489914371101B9F86A7B01A577EC767BB47A4A7` | regex-any | block | 기부 물품 분류·포장 등 실제 봉사는 맥락 확인 |
| `FIELD-VOLUNTEER-ELIGIBILITY` | official-policy | `EV-GUIDE-83-VOLUNTEER-SCOPE`, `EV-GUIDE-84-VOLUNTEER`, `EV-GUIDE-85-VOLUNTEER-PROCEDURE` | 초등 기재요령 인쇄 83~85쪽 / PDF 89~91쪽 | `2D8B89FA903221D9F3253075D6A3B0A911301FC4CF21377C649AB075B8AF95A8`<br>`DFCFCB54E3F74FB27D9C08004489914371101B9F86A7B01A577EC767BB47A4A7`<br>`5E564E47887F73CECAE4186262B14631DC1A0B15DB6ECC58237CF0444D136C9E` | volunteer context metadata | block, review | 없음 |
| `FIELD-SUBJECT-PROHIBITED-CONTENT` | official-policy | `EV-GUIDE-100-SUBJECT` | 초등 기재요령 인쇄 100쪽 / PDF 106쪽 | `9B0D45C63D1D709C3587F020F0AF0087814FC1BCAB9FDB2F6056C600CAC51903` | literal-any | block | 없음 |
| `FIELD-BEHAVIOR-CONTINUOUS-OBSERVATION` | official-policy | `EV-GUIDE-102-BEHAVIOR` | 초등 기재요령 인쇄 102쪽 / PDF 108쪽 | `C7D3AB63679BEAB025254446231612576F12F78CFDC58328427F4843FA77545A` | provenance metadata | review | 없음 |

## 자체 편집 경고

아래 규칙은 `official_plus_editorial` 프로필에서만 실행하며 교육부 공식 금지 규정으로 표시하거나 공식 Source ID를 인용하지 않는다.

| Rule ID | Authority | Source / quote hash | Detector | Outcome | 예외 |
|---|---|---|---|---|---|
| `EDITORIAL-UNSUPPORTED-SUPERLATIVE` | editorial-caution | N/A (local policy) | `전교에서 가장`, `항상`, `완벽하게`, `최고의` | review | 객관적 자료로 입증되고 공식 기재가 허용된 표현은 별도 검토 |
| `EDITORIAL-HOME-ACTIVITY` | editorial-caution | N/A (local policy) | `집에서`, `가정에서`, `부모와 함께` | review | 공식 예외 자료가 있으면 근거 확인 |
| `EDITORIAL-CAREER-CERTAINTY` | editorial-caution | N/A (local policy) | 진로 단정 bundled regex | review | 없음 |

## 감사 및 릴리스 상태

활성 청크 400개와 사람 검수 Evidence ID 12개는 모두 현재 corpus 청크를 참조하며, 규칙표의 공식 Evidence ID는 검증 인용으로 해소된다. `data/bundle-manifest.json`에는 corpus, 승인 목록, 검증 인용, 규칙팩과 원본 manifest의 봉인 해시가 기록되어 있어 번들이 봉인되어 있다.

공식 원본 통합 검사 4/4와 원본 파일 검증 8/8은 통과했고, corpus를 연속 두 번 생성한 결정성 검사도 통과했다. 최종 릴리스 검증에서 단위·통합 테스트 160/160, 타입 검사, 빌드, stdio E2E 1/1, 무출력 대기 smoke test가 모두 통과했다.
