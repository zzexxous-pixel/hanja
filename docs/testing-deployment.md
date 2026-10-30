# 정적 앱 검증·배포 운영

## 최소한의 패키징
앱 런타임은 HTML/CSS/JS/이미지뿐이다. npm은 개발 도구(Tailwind/Playwright)에만 필요하다.
`build.mjs`는 배포 허용 목록만 복사하고 CSS 생성 및 버전 치환을 수행한다. node_modules, 테스트, docs, .git, 과거 데이터 복사본은 공개하지 않는다.
버전은 VERSION 변경 이후 커밋 수에 기반한다. build-info.json의 sha로 실제 배포본을 판별한다.

## 자동 흐름
1. push(main/arena/**) 또는 수동 실행 → verify.yml.
2. npm ci(잠금 파일 기반, npm 캐시) → 구문/데이터/단위 검사.
3. 정적 패키징 1회 → Actions 내부 Node 정적 서버 → 데스크톱/모바일 Chromium E2E.
4. 실패 시 스크린샷/trace/HTML 보고서 업로드. 성공 시 같은 _site를 Pages artifact로 업로드.
5. deploy job은 OIDC로 artifact 배포만 수행. npm/브라우저 설치와 재빌드 없음.
6. smoke job은 Node 내장 fetch로 파일 응답/버전/SHA 검사. npm ci/브라우저 없음.

PR에서는 검증만 하고 배포하지 않는다. 운영 이관은 main의 수동 workflow만 가능하다.
소스 이관 방식상 운영 저장소에서 별도 Pages 패키징이 필요하다. 이는 운영 파일의 버전/내용을 독립적으로 검증하기 위한 기존 구조이며 이관 job 자체는 재설치/빌드하지 않는다.

## Pages의 preview 보존
단일 Pages 산출물 안에 main 루트 + 선택 preview를 둔다. main 배포에서도 preview를 포함한다.
main에 통합되기 전에는 기존 main의 구형 워크플로가 이를 알지 못한다. 이번 브랜치의 개선은 병합 전까지 해당 브랜치 workflow에만 적용된다.
현재 선택 preview 기본 ref는 deploy.yml에 명시되어 있다. 다음 세션은 PREVIEW_REF 저장소 변수(예: origin/arena/...)로 변경한다.
다른 브랜치 preview 푸시 시에는 그 브랜치 HEAD를 검증한다. main 배포에서는 선택 preview도 함께 검사하므로 preview 오류로 main 배포가 막힐 수 있다. 긴급 시 preview 대상 선택을 먼저 조정한다.

## 테스트 범위와 한계
- 단위: 즐겨찾기 변환/손상/할당량/급수 변경, 한글 분해·거리·유사도.
- 데이터: 누적 수량·빈 훈음·중복 등 구조 검증. 기관별 정본 인증은 아니다.
- E2E: 기존 11개 + 즐겨찾기 2개 = 프로젝트당 13개, 데스크톱/모바일 총26개.
- 외부 폰트/쓰기 CDN은 핵심 E2E에서 차단. 음성 인식은 모킹. 실제 인식 정확도와 외부 쓰기 데이터 가용성을 보증하지 않는다.
- visual: opt-in baseline 검수 전 단계. 자체 제공 폰트/고정 브라우저로 baseline을 만들고 사람 승인 후 정규 게이트로 편입할 것.
- 후속: 쓰기 로컬 fixture와 채점·리사이즈·로딩 실패, 오프라인 캐시, 메모리/성능 예산, 실제 태블릿 마이크 점검.
- 배포 HTTP smoke는 파일/SHA 확인이지 브라우저 렌더링 검사 대체물이 아니다.
