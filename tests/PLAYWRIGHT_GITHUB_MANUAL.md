# 📘 4급 한자 마스터 - 깃허브(CI/CD) 자동화 테스트 통합 매뉴얼 (최종본)

## ⏱️ [요약] 깃허브 CI 테스트 핵심 가이드

### 1. 이것만 기억하세요 (핵심 3대 명령어 - 로컬 검증용)

* **기능 전체 검증:** `npx playwright test`
* **디자인 스냅샷 갱신:** `npx playwright test --update-snapshots`
* **에러 시각 리포트 창 열기:** `npx playwright show-report`

### 2. 가상 서버가 자동으로 움직이는 순간 (리소스 절약)

* 오직 **HTML, JS, CSS 파일이 변경되어 배포(`push`)될 때만** 깃허브 가상 서버가 깨어납니다.
* 마크다운(`README.md`) 등 문서나 워크플로우 명세서 수정 시에는 자원을 낭비하지 않고 철저히 침묵하여 무료 제공 시간(월 2,000분)을 절약합니다.

### 3. 고속 브라우저 캐싱 아키텍처 (Speed Optimization)

* 깃허브 가상 컴퓨터 내부에 플레이라이트 전용 비밀 창고(`~/.cache/ms-playwright`)를 개설합니다.
* 2회차 빌드부터는 크롬 브라우저 다운로드 게이지 바 자체가 뜨지 않고 **단 3초 만에 환경 정비를 끝낸 뒤 10대 시나리오 테스트로 즉시 돌입**합니다.

### 4. 제로 에디트(Zero-Edit) 자율 구동

* 테스트용 저장소(`hanja-test`)와 운영용 저장소(`hanja`)의 코드가 주소 수정 없이 **100% 호환**됩니다.
* 저장소 이름에서 타겟 도메인을 자동으로 분리 추출하므로 인적 오타 실수를 원천 차단합니다.

---

## 1. 온라인 VS Code 맞춤형 `package.json` 설정

온라인 가상 공간(`.`)에서는 Node.js가 없어 설계도 파일(`package-lock.json`)을 생성할 수 없으므로, 초경량 가이드북 역할을 하는 `package.json`을 직접 생성해 줍니다.

프로젝트 루트 폴더에 **`package.json`** 파일을 새로 만들고 아래 코드를 그대로 붙여넣습니다. (두 저장소 호환을 위해 프로젝트명은 `hanja-core`로 통일합니다.)

```json
{
  "name": "hanja-core",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {
    "@playwright/test": "^1.45.0"
  }
}

```

> **💡 초보자 안내 (보안 경고 관련 팁):**
> 온라인 VS Code에서 이 파일을 만들면 첫 번째 중괄호(`{`)에 빨간색 밑줄과 함께 **"스키마를 로드할 수 없습니다. 신뢰할 수 없는 작업 영역..."**이라는 경고(숫자 1)가 뜰 수 있습니다. 이는 문법 에러가 아니라 브라우저 가상 툴의 외부 파일 다운로드 보안 가드가 켜져서 발생하는 안내창일 뿐입니다. **실제 배포 및 테스트 구동에는 아무런 영향이 없으므로 무시하셔도 완벽하게 안전합니다.**

---

## 2. 주소 자동 추출형 `playwright.config.js` 설정

테스트 저장소와 운영 저장소에서 아무런 수정 없이 복사·붙여넣기만 해도 깃허브 가상 전역 변수(`process.env.GITHUB_REPOSITORY`)를 파싱하여 대상 주소를 스스로 알아내는 스마트 설정입니다.

루트 폴더의 `playwright.config.js` 파일을 열고 아래 코드로 교체합니다.

```javascript
const { defineConfig, devices } = require('@playwright/test');

// 💡 깃허브 가상 서버가 현재 실행 중인 저장소 이름(hanja 또는 hanja-test)을 자동으로 파싱합니다.
const githubRepo = process.env.GITHUB_REPOSITORY; 
const repoName = githubRepo ? githubRepo.split('/')[1] : 'hanja-test';

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'html',
  use: {
    // 💡 저장소 이름에 맞게 배포 주소가 실시간으로 조립되므로, 더 이상 수동 수정이 필요 없습니다.
    baseURL: process.env.CI 
      ? 'http://localhost:8080' 
      : `https://zzexxous-pixel.github.io/${repoName}/`, 
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // 💡 깃허브 가상 서버 환경(CI)일 때만 미니 서버를 작동시켜 자원 낭비를 완벽히 차단합니다.
  webServer: process.env.CI ? {
    command: 'npx serve -p 8080 .',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
  } : undefined,
});

```

---

## 3. 테스트 코드 내 OS 방어막 구축 (`tests/hanjaMaster.spec.js`)

깃허브 서버(리눅스)와 내 컴퓨터(윈도우)의 운영체제 간 폰트/스크롤바 렌더링 차이로 인해 디자인 스냅샷 비교 검사가 실패하는 현상을 원천 방어합니다.

`tests/hanjaMaster.spec.js` 파일 내 **시나리오 1번과 4번의 스냅샷 검증 코드**를 아래와 같이 윈도우 환경 판별 조건문으로 감싸줍니다.

```javascript
// 💡 시나리오 1번 내부의 디자인 스냅샷 코드 수정
if (process.platform === 'win32') {
  await expect(page).toHaveScreenshot('01-init-layout.png');
}

// 💡 시나리오 4번 내부의 디자인 스냅샷 코드 수정
if (process.platform === 'win32') {
  await expect(page).toHaveScreenshot('02-quiz-mode-blur.png');
}

```

*(기능 검증 10개는 클라우드 가상 서버에서 완벽히 수행하고, 엄격한 픽셀 매칭 스냅샷은 유저님이 로컬 PC에서 테스트를 구동할 때만 활성화됩니다.)*

---

## 4. 깃허브 액션즈 워크플로우 구성 (`.github/workflows/playwright.yml`)

초고속 브라우저 저장 창고 메커니즘을 이식하여 공회전 시간을 완벽하게 지워버린 무결성 CI 가동 명세서 최종본입니다.

`.github/workflows/playwright.yml` 경로에 파일을 생성하고 아래 코드를 붙여넣습니다.

```yaml
name: 한자 마스터 CI 기능 전수 테스트
on:
  push:
    branches: [ main, master ]
    # 💡 HTML, JS, CSS 파일이 변경되어 올라올 때만 가상 서버 가동 (리소스 절약)
    paths:
      - '**.html'
      - '**.js'
      - '**.css'
  pull_request:
    branches: [ main, master ]
    paths:
      - '**.html'
      - '**.js'
      - '**.css'

jobs:
  playwright-test:
    timeout-minutes: 10
    runs-on: ubuntu-latest # 깃허브 최신 리눅스 가상 컴퓨터 환경 빌드
    steps:
    - name: 소스코드 동기화
      uses: actions/checkout@v4

    - name: Node.js 런타임 설치
      uses: actions/setup-node@v4
      with:
        node-version: lts/*

    - name: 프로젝트 의존성 라이브러리 자동 설치
      run: npm install

    # 💡 [고속화 핵심] 가상 컴퓨터 내부에 크롬 브라우저 전용 창고(Cache)를 개설합니다.
    - name: Playwright 브라우저 캐시 상태 확인
      uses: actions/cache@v4
      id: playwright-cache
      with:
        path: ~/.cache/ms-playwright
        key: ${{ runner.os }}-playwright-${{ hashFiles('package.json') }}

    # 💡 창고에 크롬이 없을 때만(최초 1회) 177MB 파일을 새로 다운로드합니다.
    - name: 가상 브라우저(크롬) 엔진 신규 다운로드 (캐시 미적중 시)
      if: steps.playwright-cache.outputs.cache-hit != 'true'
      run: npx playwright install --with-deps chromium

    # 💡 창고에 크롬이 있다면 다운로드를 건너뛰고 리눅스 시스템 런타임 환경만 3초 만에 주입합니다.
    - name: 리눅스 시스템 브라우저 종속성만 초고속 주입 (캐시 적중 시)
      if: steps.playwright-cache.outputs.cache-hit == 'true'
      run: npx playwright install-deps chromium

    - name: 🔥 Playwright 10대 철벽 시나리오 가동
      run: npx playwright test

    - name: 실패 예외 대응 - 테스트 실패 시 결과 HTML 리포트 업로드
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 7

```

---

## 5. 수립된 10대 자동화 테스트 시나리오 요약표

| 번호 | 테스트 시나리오명 | 검증 핵심 내용 (무결성 Pass 기준) | 관련 모듈 |
| --- | --- | --- | --- |
| **1** | 메인 페이지 초기 로드 및 디자인 검사 | 타이틀 노출, 페이저 인디케이터(`1 / 12`), 첫 카드(`價`) 데이터 검증 및 초기 레이아웃 스냅샷 생성 | UI 렌더링 |
| **2** | 한자 카드 클릭 시 상세 모달창 검증 | 카드 클릭 시 `#detail-modal` 노출, 한자/훈음 매핑 일치성 및 네이버 사전 동적 URL 연결 구조 검증 | 모달 제어 |
| **3** | 페이지네이션 및 즐겨찾기 실시간 연동 | 페이지 좌우 이동, 별표 클릭 시 즐겨찾기 탭(`★ / 12`) 공간으로 인메모리 카드가 실시간 가상 복사되어 출력되는지 검증 | 데이터 동기화 |
| **4** | 말하기 도전 모드 활성화 및 블러 검사 | 도전 버튼 클릭 시 `theme-emerald` 테마 전환, 훈음 영역 CSS 가림막 블러 처리 스냅샷 및 수동 클릭 시 해제 검증 | 퀴즈 모드 UI |
| **5** | 음성 인식 모킹 정답 파이프라인 테스트 | 가상 오디오 채널 가로채기(Mocking) 후 정답 단어(`"값 가"`) 최종 패킷 주입 시 레벤슈타인 거리를 통과해 `⭕` 마크가 찍히고 블러가 자동 해제되는지 검증 | 음성 인식 엔진 |
| **6** | 헤더 타이틀 이스터에그 연타 검증 | 상단 타이틀 영역을 2.5초 이내에 연속 5회 연타했을 때 순환 로그 버퍼를 갖춘 시스템 터미널 드로어(`#dev-console`)가 팝업되는지 검증 | 시스템 디버그 |
| **7** | 글꼴 크기 조작 및 영구 저장 검증 | 확대 버튼 클릭 시 루트 CSS 변수(`--hanja-size`)가 3px 증가하고, 브라우저 `localStorage`에 영구 세이브 및 보존되는지 상태 추적 | 브라우저 저장소 |
| **8** | 음성 인식 실패 시 오답 가드 검증 | 가짜 마이크에 오답 발음 주입 시 채점 엔진이 오답으로 분류하여 `❌` 마크를 찍고, 훈음 블러 잠금 효과를 강력하게 유지하는지 검증 | 채점 알고리즘 |
| **9** | 음성 인식 도중 카드 재클릭 취소 검증 | 마이크가 켜진 상태(`recording-active`)에서 유저가 카드를 재클릭하면 오디오 스트림이 파괴(`cancel`)되고 대기 상태(`#번호`)로 안전하게 원복되는지 검증 | 인터럽트 제어 |
| **10** | 도전 모드 해제 시 전역 캐시 리셋 검증 | 도전 그만하기 클릭 시, 테스트 과정에서 임시 부여되었던 결과 상태 클래스 및 정답(`solved`) 흔적들이 전역 메모리 및 화면상에서 일괄 청소되는지 검증 | 라이프사이클 |

---

## 6. 클라우드 QA 가동 및 실패 리포트 디버깅법

1. 온라인 VS Code 환경에서 소스코드를 수정한 뒤 평소처럼 배포(`git push`)합니다.
2. 내 깃허브 저장소 상단의 **Actions** 탭으로 이동하면 가상 서버가 실시간으로 10대 시나리오를 가동하는 것을 볼 수 있으며, 성공 시 이름 옆에 초록색 체크 마크(Passed)가 표시됩니다.
3. 만약 무언가 고장 나 빨간색 엑스 마크(Failed)가 떴다면, 해당 항목 상세 페이지 맨 아래 `Artifacts` 섹션에 업로드된 **`playwright-report`** 압축파일을 다운로드합니다.
4. 압축 파일 내의 `index.html`을 실행하면 가상 브라우저가 어떤 줄의 기능과 컴포넌트를 망가뜨렸는지 시각적인 오답 노트 리포트를 제공합니다. 해당 로그를 그대로 복사하여 제미나이에게 주면 완벽하게 고쳐낼 것입니다.