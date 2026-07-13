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