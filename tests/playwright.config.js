const { defineConfig, devices } = require('@playwright/test');

// 💡 [치트키] 깃허브 가상 서버가 현재 구동 중인 저장소 이름에서 'hanja' 또는 'hanja-test'를 알아서 쪼개어 가져옵니다.
const githubRepo = process.env.GITHUB_REPOSITORY; 
const repoName = githubRepo ? githubRepo.split('/')[1] : 'hanja-test';

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'html',
  use: {
    // 💡 이제 주소를 수동으로 고칠 필요가 없습니다. 저장소 이름에 맞게 알아서 주소가 자동 완성됩니다.
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
  webServer: process.env.CI ? {
    command: 'npx serve -p 8080 .',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
  } : undefined,
});