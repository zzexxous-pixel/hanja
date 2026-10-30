const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/preview',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['github'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:8080/preview/', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'python3 -m http.server 8080 --bind 0.0.0.0 --directory _site', url: 'http://127.0.0.1:8080/preview/', reuseExistingServer: !process.env.CI }
});
