# Agent handoff — 바른한자

최종 갱신: 2026-10-30. 다음 세션은 이 문서를 먼저 읽고, 변경·검증·배포 결과와 새 결정을 계속 갱신한다.

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
- 이 세션 작업 브랜치: arena/645f2a96-hanja-test. 다른 브랜치로 전환/푸시하지 않는다.
- GitHub Pages: https://zzexxous-pixel.github.io/hanja-test/
- 미리보기: https://zzexxous-pixel.github.io/hanja-test/preview/
- 사용자가 github-pages 환경 허용 브랜치에 arena/* 추가 완료. 이전 권한 차단은 해결되었다.
- 사용자가 이전 preview에서 구버전 즐겨찾기 변환과 기능을 직접 확인하여 정상 동작을 확인했다.
- Pages는 저장소당 하나의 산출물: preview 배포도 main 루트와 preview를 함께 패키징해야 한다.
- main 배포 역시 preview를 보존하도록 동일 빌드를 사용한다. 다음 작업 브랜치로 넘어가면 repo variable PREVIEW_REF를 origin/arena/새브랜치 로 지정하거나 deploy.yml 기본값을 갱신한다.
- 현재 기본 preview ref: origin/arena/645f2a96-hanja-test. preview 브랜치 push는 자기 HEAD를 사용한다.
- 배포는 .github/workflows/deploy.yml push(main, arena/**) / workflow_dispatch. verify.yml 재사용.
- docs/ 및 Markdown만 변경하면 자동 배포 생략. 필요하면 수동 workflow_dispatch.
- 운영 hanja 이관은 deploy-to-prod.yml의 수동 실행만. main에서만 허용, 기존 source force-push 관례 유지.

## 구현 완료
- bookmarkStore.js: hanja_bookmarks_v2 = {schemaVersion:2, characters:[한자...]}.
- TEMP migrateLegacy(): 구버전 hanja_bookmarks 숫자 배열을 마지막 선택 급수의 기존 정렬 순서로 자동 변환.
- 사용자 조작·알림 없음. 새 값 저장 성공 후 구버전 제거, 실패 시 보존/다음 실행 재시도.
- 변환 코드 제거 시 함수와 script.js 호출을 함께 제거. 제거 시점은 사용자가 결정. 예전 인덱스의 원래 의도까지 완전 복원 불가능.
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
- README는 아직 보류. 로컬 단위8개 통과. 이번 최종 GitHub/배포 결과는 실행 후 추가 기록.
