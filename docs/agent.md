# Agent handoff — 바른한자

최종 갱신: 2026-10-31. 다음 세션은 이 문서를 먼저 읽고, 변경·검증·배포 결과와 새 결정을 계속 갱신한다.

## 사용자 결정 / 작업 원칙
- 대한검정회 기준 아동 한자 학습용 정적 웹앱. 한국어문회 기준이라는 README 문구는 오류.
- 개발은 GitHub 웹/VS Code Online와 에이전트가 수행. 사용자 로컬 PC 환경을 요구하지 않는다.
- 에이전트가 코딩 → GitHub Actions 테스트 → preview 배포 → 결과 확인을 수행한다.
- 병합 및 운영 이관은 별도 명시적 요청 전에는 수행하지 않는다.
- README 갱신은 소스/구조 작업 후로 보류. 새 작업 문서는 docs/ 안에 둔다.
- 완전 오프라인은 필수가 아니다. 말하기 인식은 온라인 유지 가능. 학습팩 다운로드 UI 불필요.
- Hanzi Writer를 기본 엔진으로 유지하고 일부 한자만 검증된 예외 획 데이터로 대체할 계획.
- 카드/모달 한자는 이제 공통 획 데이터에서 생성한 정적 SVG 사용. 상세 쓰기에도 같은 resolver 적용. 敬13획과 기본 누락16자는 예외 manifest로 관리.

## 브랜치 / 배포
- 현재 Continue 후 작업 브랜치: arena/0e0b3d2c-hanja-test(active). 이전 작업 브랜치는 arena/645f2a96-hanja-test. 현재 세션은 새 브랜치에서만 작업한다.
- GitHub Pages: https://zzexxous-pixel.github.io/hanja-test/
- 미리보기: https://zzexxous-pixel.github.io/hanja-test/preview/
- 사용자가 github-pages 환경 허용 브랜치에 arena/* 추가 완료. 이전 권한 차단은 해결되었다.
- 사용자가 이전 preview에서 구버전 즐겨찾기 변환과 기능을 직접 확인하여 정상 동작을 확인했다.
- Pages는 저장소당 하나의 산출물: preview 배포도 main 루트와 preview를 함께 패키징해야 한다.
- main 배포 역시 preview를 보존하도록 동일 빌드를 사용한다. 다음 작업 브랜치로 넘어가면 repo variable PREVIEW_REF를 origin/arena/새브랜치 로 지정하거나 deploy.yml 기본값을 갱신한다.
- 현재 브랜치 deploy.yml 기본 preview ref: origin/arena/0e0b3d2c-hanja-test. main에는 아직 미병합. preview 브랜치 push는 자기 HEAD를 사용한다.
- 배포는 .github/workflows/deploy.yml push(main, arena/**) / workflow_dispatch. verify.yml 재사용.
- docs/ 및 Markdown만 변경하면 자동 배포 생략. 필요하면 수동 workflow_dispatch.
- 운영 hanja 이관은 deploy-to-prod.yml의 수동 실행만. main에서만 허용, 기존 source force-push 관례 유지.

## 구현 완료
- bookmarkStore.js: hanja_bookmarks_v2 = {schemaVersion:2, characters:[한자...]}.
- TEMP migrateLegacy(): 구버전 hanja_bookmarks 숫자 배열을 마지막 선택 급수의 기존 정렬 순서로 자동 변환.
- 사용자 조작·알림 없음. **구버전 키는 성공/실패와 무관하게 삭제하거나 수정하지 않는다**(사용자 결정 변경). 신버전 키가 없을 때만 최초 복사하고, 이후 두 저장소는 독립적으로 동작. 실패 시 다음 실행에서 복사 재시도.
- 임시 복사 코드 제거 시 함수와 script.js 호출을 함께 제거. 완전 테스트 및 운영 반영 후 사용자가 문제없음을 확인하고 요청할 때까지 구버전 로직/데이터를 유지. 예전 인덱스의 원래 의도나 이전 버전이 이미 삭제한 값은 복구 불가능.
- 급수 밖 즐겨찾기 보존, 현재 급수에 포함된 문자만 표시. 일반 13페이지/즐겨찾기는 'favorites' 식별자로 분리.
- 서비스워커 cache prefix와 조회를 scope별 분리하여 preview가 main 캐시를 삭제하지 않게 함.
- 이번 구조: 루트 playwright.config.js, tests/{unit,e2e,visual,smoke}, scripts/{build.mjs,serve.mjs,validate-data.mjs}, package-lock.json.
- 앱은 정적 파일. 빌드는 allowlist 복사 + Tailwind CSS 생성 + 버전 치환뿐. 서버 번들/SSR/DB 작업 없음.
- CI는 한 번 npm ci/정적 패키징/E2E 후 검증된 동일 _site를 Pages artifact로 배포. 배포 job에는 설치/재빌드 없음.
- 기존 E2E의 배포 주소 하드코딩 제거. 실행기 내부 임시 서버 대상으로 데스크톱/모바일 Chromium 실행.
- visual 스펙은 opt-in 초안: 공식 baseline 미승인. 일반 CI 성공을 시각 검증 완료로 표현하지 않는다.
- README 및 기존 tests/*MANUAL.md는 옛 경로/절차를 포함하며 추후 갱신 필요.

## 테스트 / 실행
- npm ci
- npm run check (구문 및 급수 데이터 구조/수량; 대한검정회 원본 대조 아님)
- npm run test:unit
- npm run build (작업 소스를 _site/로 패키징)
- npm run build:preview (origin/main을 /, 작업 소스를 /preview/로 패키징)
- APP_PATH=/preview/ npm run test:e2e (Actions에서는 env 지정)
- SMOKE_URL=... EXPECTED_SHA=... npm run test:smoke (배포 후 HTTP 검사)
- VISUAL_TEST=1 npx playwright test --project desktop-chromium (baseline 준비/검수 후)
- 이 sandbox는 Playwright 브라우저 CDN이 차단될 수 있다. 브라우저 검증은 GitHub Actions에서 수행하며 로그/annotations와 배포 smoke 결과까지 확인한다.

## 데이터 / 자형 이슈
- 데이터: 8급30, 7급50, 6급70, 준5급100, 5급250, 준4급400, 4급600, 준3급800, 3급1000(누적 중복 제거). 준2급 이상 비어 있음.
- 사용자 제공 대한검정회 자료상 敬(공경할 경)은13획. 기본 Hanzi 데이터는12획이나 현재 앱에는 AnimCJK 번체 계열13획을 예외 적용. 전체 자형/획순 검수 완료와는 구분.
- AnimCJK 실제 파일 확인: svgsZhHant/25964.svg=13개 윤곽, svgsKo/25964.svg=12개. KanjiVG 0656c.svg=12개.
- 지역명이 한국어라고 정답으로 간주하면 안 됨. 13획 일치만으로 자형/순서까지 검증된 것도 아님.
- AnimCJK svg/graphics는 Arphic Public License. 코드 라이선스와 혼동 금지. 공식 견본 이미지 재배포/스크래핑 허용 여부도 별도 확인.
- 현재 라이브러리3.7.3/데이터2.0.1을 npm 잠금 파일로 고정하고 배포 시 지원 글자1,000자만 자체 파일로 패키징. 런타임 획 데이터·쓰기 라이브러리 CDN 사용 없음. 전부 메모리로 읽거나 SW 프리캐시하지 않으며 요청한 글자만 로딩. 폰트어썸/음성 인식 등 다른 온라인 기능은 남아 있다.
- 자세한 후속 계획: stroke-data-plan.md, testing-deployment.md.

## 검증 결과 (이번 변경)
- 로컬 구문/데이터 검사 및 단위 테스트 6개 통과, 정적 preview 패키징 통과.
- GitHub Actions 41025691561: E2E 26/26 통과(21.7초), Pages 배포 성공, 배포 후 HTTP/SHA smoke 성공. https://github.com/zzexxous-pixel/hanja-test/actions/runs/41025691561
- main 배포는 root(main)와 보존 preview 둘 다 E2E 검증하도록 구성. arena push에서는 수정된 preview만 검증하며 기존 main 소스까지 바꾸지 않는다.

- 최종 코드 검증/배포: e1df782, Actions 41025913096. 단위6개 및 데스크톱/모바일 E2E26개 통과(19.8초), Pages 배포와 HTTP/SHA smoke 성공. https://github.com/zzexxous-pixel/hanja-test/actions/runs/41025913096
- 이후 인수인계 문서만 갱신한 커밋은 paths-ignore에 따라 배포하지 않는다. 배포 SHA는 위 코드 커밋이다.

## 2026-10-30 후속 구현
- scripts/strokes.mjs: 정확한 문자 코드로 데이터 선택, source SHA 검증, AnimCJK 윤곽 변환(행렬[1,0,0,-1,0,900])과 중심선 표본화, 1,000자 JSON/SVG 생성.
- manifest 확장으로 향후 예외 추가 가능. 敬의 radStrokes=[9,10,11,12](4획), 총13획. 기본 데이터 누락16자도 동일 체계. 세부 목록/미확인 상태는 glyph-audit.md.
- 사용자 근거만으로 획수1건 확인. 자형/전체 획순은 여전히 미검수이므로 과장 금지.
- preview/review/는 실제 SVG와 기본/적용/공식 획수를 보여주는 검색 가능 검수표. 공식 견본 이미지는 배포하지 않음.
- 사용자에게 공식 자형·획수 파일/URL 및 획순 도해 제공을 요청해야 전체 대조를 완료할 수 있다.
- 테스트에 실제 로컬 Hanzi Writer 사용한13획 입력/오답/완료, 예외 오류/재시도, 정확한 문자코드 누락 보완, SVG 일치를 추가했다.
- Fault injection E2E는 SW 캐시가 page.route를 우회하지 않게 serviceWorkers:block 사용. 일반 E2E는 기존대로.
- README는 아직 보류. 로컬 단위8개 통과. 최종 코드6d1e8c0 / Actions41028934572: 데스크톱·모바일 E2E34개 통과(26.1초), Pages preview 배포와 HTTP/SHA smoke 성공.
- 실행 결과: https://github.com/zzexxous-pixel/hanja-test/actions/runs/41028934572
- 배포: https://zzexxous-pixel.github.io/hanja-test/preview/
- 검수표: https://zzexxous-pixel.github.io/hanja-test/preview/review/
- 13획 실제 입력/역방향 오답/완료, 로딩 오류 표시/닫기/재시도까지 검증했다. 실기기 저사양 성능/공식 전체획순 검수를 완료했다고 표현하지 말 것.

## 최신 사용자 결정: 신/구 즐겨찾기 공존
- 사용자: 敬13획과 메인 SVG 변경 확인 완료. 전체 글자 검수는 공식 자료 제공 시까지 보류. 추가 조사/수집을 진행하지 않는다.
- 구버전은 hanja_bookmarks(인덱스), 신버전은 hanja_bookmarks_v2(문자)를 각각 사용한다.
- TEMP 최초 복사는 구버전 키를 읽기만 한다. 구버전 데이터를 삭제/정규화/덮어쓰기/동기화하지 않는다.
- v2가 이미 있으면(빈 배열 포함) 기존 구버전 값이나 이후 구버전 변경을 재가져오지 않는다.
- 신버전 추가/삭제가 구버전에 반영되지 않고, 구버전 추가/삭제도 신버전에 반영되지 않는 것이 의도한 동작이다.
- 과거 삭제 방식으로 이미 없어진 구버전 키를 v2로 임의 재생성하지 않는다. 사용자가 구버전에서 다시 등록하면 해당 저장소가 독립적으로 생성된다.
- 일반 설정(급수 등)은 종전처럼 공유된다. 이번 변경은 즐겨찾기 저장소 분리만 다룬다.
- 기존 구버전 앱 자체/운영 저장소는 수정하지 않는다. preview에서 검증 후 사용자 운영 반영 요청을 기다린다.
- 검증: 로컬 단위11개 통과. E2E에 최초복사 원본 보존과 두 탭의 독립 수정/빈v2 재가져오기 방지 검증 추가. GitHub/배포 결과는 아래 갱신.
- 최종 검증/배포: 코드263b465, Actions41031054277. 단위11개, 데스크톱/모바일 E2E36개(34.8초) 통과. preview 배포 및 HTTP/SHA smoke 성공. https://github.com/zzexxous-pixel/hanja-test/actions/runs/41031054277
- 병합/운영 이관 없음. 문서만 후속 갱신한 커밋은 배포하지 않음.

## Continue 후 8급 PDF 1차 검토
- 사용자 제공 `8급 신출한자 훈음표.pdf` 1페이지를 확보해 8급30자 완성 자형 대조를 시작했다. 다른 급수는 자료 대기.
- 결과/파일hash/검토한계: glyph-audit-grade8.md 참조. PDF 내장 글꼴의 실제 글자 영역을 렌더링하고 현재 SVG와30자 모두 대조.
- 1차에서 명백한 구성요소 치환/누락을 찾지 못했지만, 인쇄체/붓글씨의 세부 자형 차이는 존재. 사용자 승인 전 공식 검수완료로 올리지 않는다.
- 六의 세로/점, 父·八의 시작획, 子의 꺾임 등은 서체 차이 관찰 항목. 오류로 확정하지 않았다.
- 총획/획순은 이 PDF로 확인할 수 없으며 관련 공식 필드는 변경하지 않는다.
- 사용자 원본과 비교 캡처는 `_audit/pdf8/`에만 두고 Git/Pages에는 게시하지 않음. 앱 소스/자형 데이터/배포 설정 변경 없음.
- 새 브랜치의 preview 대상 ref 갱신은 아직 하지 않았다. 문서 검토만 했으므로 배포하지 않는다.

## 産(낳을 산) 반쪽 표시 수정 — 새 브랜치
- 사용자 스크린샷 #251의 産(U+7523)은 CSS 잘림이 아니라 기본 hanzi-writer-data@2.0.1 자체가 왼쪽으로 좁게 배치된 문제. 중심선 x최대565.
- AnimCJK 고정 commit의 svgsJa/29987.svg(동일 코드포인트 産)로 예외를 추가. 產(U+7522)로 글자를 바꾸거나 기존 데이터를 가로로 늘리지 않음.
- 윤곽/중심선 모두 변환해 메인 카드·모달·쓰기 공통으로 적용.11획, 부수生5획. 공식 전체 자형/획순 검수 완료를 주장하지 않음.
- 예외18개(敬 + 기본누락16개 + 産). 단위12개 통과. E2E에 産의 전체 폭/11획/동일SVG/카드이미지 표시 검증 추가(데스크톱+모바일 총38개).
- deploy.yml의 main용 preview 기본 ref를 origin/arena/0e0b3d2c-hanja-test로 갱신(향후 병합 시 적용). arena push는 자신의 HEAD를 preview에 배포한다.
- 이번에는 preview만 배포하며 main 병합/운영 이관은 요청 전 수행하지 않는다.
- 최종 검증/배포: 코드4e01835, Actions41067180545. 단위12개 및 데스크톱/모바일 E2E38개(40.5초) 통과. 새 브랜치 preview 배포와 HTTP/SHA smoke 성공. https://github.com/zzexxous-pixel/hanja-test/actions/runs/41067180545
- 기본 사이트 main은 그대로 유지했고 병합하지 않았다. 사용자 확인 대상: https://zzexxous-pixel.github.io/hanja-test/preview/ 의 4급 #251 産 및 상세 쓰기.

## 간헐적 깨진 이미지/초기 순차 표시 개선
- 사용자 신고: SVG 이미지가 간헐적으로 깨지고 새로고침하면 정상, 처음에 한자들이 한 개씩 나타남. 개별 실패의 실제 HTTP/브라우저 로그는 없어 특정 네트워크 원인 확정은 하지 않음.
- 개별 lazy img 대신 화면에 보이는 글자만 50자 단위 JSON 번들로 불러와 inline SVG로 일괄 삽입. 첫50자는 한 번의 글자 데이터 요청(기존 최대50개). 최종 4급 첫 페이지 번들99,716 bytes + 전체 index25,771 bytes(압축 전). 전1000자를 처음부터 받지 않음.
- 기존 생성 SVG/쓰기 데이터는 그대로 유지(검수 및 다운로드 호환). bundle도 selectData와 동일한 획을 사용하므로 産/敬 예외 유지.
- 각 번들 filename에 내용 SHA256 일부 포함. 메모리/진행중 요청 공유. 최대3회 자동 시도, 8초 요청시간 제한. 재시도는 reload로 SW 캐시 우회·갱신.
- 모든 대상 번들 완료 후 동기 DOM 교체해 글자별 로드/디코드에 따른 순차 점등 제거. 로드 전은 옅은 placeholder. 모두 실패 시에만 읽을 수 있는 시스템 글꼴 대체(공식 검수 자형 대체 아님); online/다시 방문/탭재진입 때 원본 SVG 복구 재시도.
- SW 쿼리 무시 제거, reload/no-store 요청 우회, cache quota 오류 처리, 오프라인 데이터 요청에 명시적503 반환(기존 undefined 대신).
- 단위14개 통과. E2E에 요청수/일시503 자동복구/잘못된 JSON fallback와 online복구 검증 추가. 총44개 예정. 배포/브라우저 결과는 후속 기록.
- CI41068316102 최초40/44 통과,4개 실패. 앱은 급수 누적 목록을 음순으로 재정렬하므로 원래 급수순 묶음으로는 한 페이지가 여러 번들을 요청(4급 첫페이지5개). 이를 숨기지 않고 생성 단계에서 각 급수의 실제 음순50자 페이지에 맞춘 번들로 수정. 동일내용 번들은 hash로 중복 제거. 테스트 주입 대상도 실제 급수 페이지 파일에서 가져오도록 수정.
- 온라인복구 테스트에서 첫페이지50자중1자만 오류 주입되었던 것 역시 위 급수순/음순 불일치 영향. 모든 급수의 모든 페이지 번들 구성과 브라우저 실제 정렬이 일치하는 검증을 추가(총46 E2E).

- SW CacheStorage 읽기 자체가 차단되어도 네트워크로 진행하도록 보완하고 단위 검사 추가(현재15개). 할당량 오류는 응답 성공을 깨뜨리지 않음.

- 2차CI41068687626은캐시 복원에서 GitHub 'Egress is over the account limit'로 약9분 지연 후 진행.44/46 E2E 통과, 새 급수순 대조2개는 private getEum을 테스트가 global로 호출해 실패. 테스트를 실제 공개 API HanjaApp.setGrade + hanjaData 결과 비교로 수정(앱 기능 오류는 아님). setup-node cache 다운로드 세그먼트 대기를1분으로 제한해 준비 단계 장기정체 완화.
- 최종코드 e4fe947, Actions41070485512 성공: 단위15개, Chromium 데스크톱/모바일 E2E46개 통과. 50자 일반페이지1개 bundle 요청, 503 자동재시도, 잘못된JSON fallback/online복구, 전급수 전페이지 실제 음순 일치 모두 확인.
- Pages preview 배포10초/배포후 HTTP·SHA smoke6초 성공. https://github.com/zzexxous-pixel/hanja-test/actions/runs/41070485512
- 확인 URL https://zzexxous-pixel.github.io/hanja-test/preview/ . main 미병합, 운영 이관 없음. 절대 로딩시간이나 배속 향상 수치는 실기기 비교 측정하지 않았으므로 주장하지 않는다.
- 후속 문서 커밋938cb3a의 push는 GitHub remote Internal Server Error(HTTP500)로2회 실패. 코드 e4fe947 및 preview는 이미 원격/배포 완료이며 영향 없음. 문서 커밋만 로컬 ahead 상태이므로 다음 작업에서 push 재시도. 인증 오류가 아니다. 실행 로그 다운로드도 results-receiver 호스트 제한으로 EOF, workflow의 최종 성공은 gh run watch로 확인했다.


## 2026-10-31 크기 조정 및 전 급수 PDF 검토
- 사용자 요청: 메인 한자 +2포인트, 훈음 -2포인트. 문자 그대로 CSS pt 적용:64px=48pt →50pt(66.667px),28px=21pt →19pt(25.333px). grid min-width도 동일 변수 사용, 상세 모달 크기 유지.
- 사용자 추가 PDF8개970자 + 기존8급30자 = 9개12페이지1000자. 원본 내장 글꼴 렌더링으로22장 대조 이미지 전부 확인, 구성요소 민감 항목23자 확대 재확인. 명백한 누락/치환 발견 없음. '서체 차이 허용' 기준은 사용자가 명시적으로 승인.
- docs/glyph-audit-all-grades.md에 방법/신출 수량/한계 기록. scripts/compare-pdf-glyphs.py는 재현용 선택도구이며 승인 자동화 아님. PDF/캡처는 공개하지 않음.
- data/glyph-reference.json:1000자 자형1차 대조완료, 원본9개SHA256와 선택SVG별해시 저장. 바뀐 SVG는 보고서에서 pending으로 복귀. 기관 인증 아님. 획순1000자 미확인, 공식획수敬13만기존근거유지.
- 기존 report는 reference 존재 자체로 획수 확인을 판정해 새 자형근거가 있는999자를 잘못 mismatch 처리할 수 있었음. strokeCount가 정수일 때만 비교하도록 수정하고 회귀 테스트 추가.
- 자형 데이터/한자 코드/훈음은 변경하지 않음. 敬/産 포함18개 예외 그대로.
- 로컬 syntax/data check, unit16개, preview build 통과. 브라우저48개 예정; 배포 결과 후속 기록.
- 세션 복원 시 git HEAD가 main merge였고 이전 수정은 작업트리로만 복원되어 있었음. 원격 e4fe947과 파일 비교(차이는 기존 handoff4줄뿐) 후 git reset --soft origin/arena/0e0b3d2c-hanja-test로 동일 활성 브랜치 이력만 정렬. 이전 코드 수정 손실 없음.
- 최종 Actions41155958530 성공: 코드265b365, 단위16개·데스크톱/모바일 E2E48개(37.8초) 통과. 새 크기의 실제 computed style/SVG 폭·높이 검증 포함. Pages9초·HTTP/SHA smoke4초 성공. https://github.com/zzexxous-pixel/hanja-test/actions/runs/41155958530
- 사용자 확인: /preview/ 크기 조정, /preview/review/ 자형1차 대조 완료 상태. main 병합·운영 이관 없음.

## 2026-10-31 메인 카드再調整
- 사용자 추가 요청: 현재 크기에서 한자 +5pt(50→55pt), 훈음 -2pt(19→17pt). 상세창 크기 유지. 카드 SVG 및 그리드 기준 변수 함께 반영. E2E 크기 기대값 갱신.
