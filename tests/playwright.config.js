// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'html',
  use: {
    // 테스트할 때 기본 주소
    //baseURL: 'http://localhost:8080', 
    // 깃헙 페이지 주소를 기본 주소로 설정
    baseURL: 'https://zzexxous-pixel.github.io/hanja-test/', 
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }, // 모바일 제스처 테스트용
  ],

  // 💡 [핵심] 테스트가 켜질 때 현재 폴더의 HTML을 8080 포트로 띄우는 설정
  /*webServer: {
    command: 'npx serve -p 8080 .',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },*/
});