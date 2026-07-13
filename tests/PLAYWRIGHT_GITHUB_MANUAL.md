깃허브 가상 서버(CI) 환경과 로컬 환경의 자원을 모두 아끼는 최적화 팁(`paths` 필터링 및 조건부 `webServer` 제어)까지 완벽하게 반영한 **‘4급 한자 마스터 - 깃허브(CI) 자동화 테스트 통합 매뉴얼’ 최종본**입니다.

이 내용을 복사하여 프로젝트 폴더에 `PLAYWRIGHT_GITHUB_MANUAL.md` 등으로 저장해 두고 사용하세요!

---

# 📑 4급 한자 마스터 - 깃허브(CI) 자동화 테스트 통합 매뉴얼

## ⏱️ [요약] 깃허브 CI 테스트 핵심 가이드

### 1. 가상 서버가 자동으로 움직이는 순간 (리소스 절약)

* 오직 **HTML, JS, CSS 파일이 변경되어 `git push` 될 때만** 깃허브 가상 서버가 깨어납니다.
* 마크다운(`README.md`)이나 단순 문서 수정 시에는 가상 서버가 켜지지 않아 제공 시간(월 2,000분)을 극도로 절약합니다.

### 2. 핵심 파일 및 관리 위치

* **깃허브 액션즈 설정:** `.github/workflows/playwright.yml`
* **플레이라이트 설정:** `playwright.config.js`
* **전수 테스트 시나리오:** `tests/hanjaMaster.spec.js`

---

## 1단계: 프로젝트 설정 파일 최적화 (`playwright.config.js`)

로컬 환경(내 컴퓨터)과 깃허브 가상 서버 환경을 영리하게 분리하는 설정입니다. 내 컴퓨터에서 실행할 때는 불필요한 백그라운드 미니 서버 가동을 전면 차단합니다.

루트 폴더의 `playwright.config.js` 파일을 열고 아래 코드로 교체합니다.

```javascript
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'html',
  use: {
    // 💡 [CI 환경 분기] 깃허브 서버에서는 내부 가상 주소(8080), 로컬에서는 라이브 배포 주소를 바라봅니다.
    baseURL: process.env.CI ? 'http://localhost:8080' : 'https://zzexxous-pixel.github.io/hanja-test/', 
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 💡 [웹서버 조건부 가동] 깃허브 가상 서버 환경(CI)일 때만 임시 가상 서버를 가동하고, 
  // 내 컴퓨터(로컬)에서 돌릴 때는 가상 서버를 켜지 않아 CPU 자원을 아낍니다.
  webServer: process.env.CI ? {
    command: 'npx serve -p 8080 .',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
  } : undefined,
});

```

---

## 2단계: 테스트 코드에 OS 방어막 치기 (`tests/hanjaMaster.spec.js`)

깃허브 가상 서버(리눅스)와 내 컴퓨터(윈도우)의 운영체제 차이로 인해 디자인 스냅샷 비교 테스트가 강제 실패하는 현상을 방어합니다.

`tests/hanjaMaster.spec.js` 파일 내 **시나리오 1번과 4번의 스냅샷 검증 코드**를 아래와 같이 `process.platform === 'win32'` 조건문으로 감싸줍니다.

```javascript
// 💡 시나리오 1번 내부의 스냅샷 코드 수정
if (process.platform === 'win32') {
  await expect(page).toHaveScreenshot('01-init-layout.png');
}

// 💡 시나리오 4번 내부의 스냅샷 코드 수정
if (process.platform === 'win32') {
  await expect(page).toHaveScreenshot('02-quiz-mode-blur.png');
}

```

*(이렇게 설정하면 핵심 기능 테스트 10개는 깃허브 서버에서 완벽히 검증하되, 엄격한 디자인 픽셀 대조 스냅샷은 유저님의 윈도우 PC에서 실행할 때만 안전하게 작동합니다.)*

---

## 3단계: 깃허브 액션즈 워크플로우 생성 (`.github/workflows/playwright.yml`)

코드가 푸시될 때 깃허브 가상 컴퓨터를 깨워 가상 크롬 브라우저 상에서 테스트를 수행하도록 지시하는 명세서입니다.

프로젝트 폴더 내에 `.github` 폴더를 만들고, 그 안에 `workflows` 폴더를 생성한 뒤 **`playwright.yml`** 파일을 만들어 아래 코드를 붙여넣습니다. (경로: `.github/workflows/playwright.yml`)

```yaml
name: 한자 마스터 CI 기능 전수 테스트
on:
  push:
    branches: [ main, master ]
    # 💡 [스마트 낭비 방지] 오직 핵심 웹 파일이 수정되어 올라올 때만 가상 서버를 가동합니다.
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
      run: npm ci

    - name: 가상 브라우저(크롬) 엔진 및 시스템 환경 빌드
      run: npx playwright install --with-deps chromium

    - name: 🔥 Playwright 10대 철벽 시나리오 가동
      run: npx playwright test

    - name: [실패 예외 대응] 테스트 실패 시 결과 HTML 리포트 업로드
      if: ${{ failure() }} # 오직 테스트가 실패했을 때만 구동되어 업로드 수행
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 7

```

---

## 4단계: 초보자를 위한 깃허브 CI 운영 및 트러블슈팅

### 1. 정상 작동 확인 방법 (초록불 확인)

1. 코드를 수정한 뒤 평소처럼 깃허브에 커밋 후 `git push` 합니다.
2. 내 깃허브 레포지토리 페이지 상단의 **Actions** 탭으로 이동합니다.
3. **"한자 마스터 CI 기능 전수 테스트"** 워크플로우가 돌아가는 모습을 볼 수 있으며, 성공 시 이름 옆에 시원한 초록색 체크 마크(Passed)가 표시됩니다.

### 2. 가상 서버에서 테스트가 실패(빨간불)했을 때 대처법

제미나이와 고도화 작업을 진행하다가 깃허브 Actions에 빨간색 엑스 마크(Failed)가 떴다면 당황하지 말고 아래 순서로 디버깅합니다.

1. 실패한 워크플로우 항목을 클릭하고 페이지 맨 아래로 내려갑니다.
2. `Artifacts` 섹션에 파일로 업로드되어 있는 **`playwright-report`** 압축파일을 다운로드합니다.
3. 압축을 풀고 `index.html` 파일을 더블 클릭해 열면, 10대 시나리오 중 **제미나이가 코드를 수정하다가 망가뜨린 기능 구역과 에러 원인 코드**가 명확하게 요약되어 나타납니다.
4. 해당 에러 화면이나 로그 메시지를 그대로 복사하여 제미나이에게 준 뒤, *"코드를 수정했더니 자동화 테스트에서 에러가 났어. 이 부분을 수정해줘"*라고 요청하면 완벽하게 해결책을 찾아낼 것입니다.