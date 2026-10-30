const { defineConfig, devices } = require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests',
  testMatch: process.env.VISUAL_TEST ? '**/visual/*.spec.js' : '**/e2e/*.spec.js',
  fullyParallel:true,
  forbidOnly:!!process.env.CI,
  retries:process.env.CI?1:0,
  workers:process.env.CI?2:undefined,
  reporter:[['list'],['github'],['html',{open:'never'}]],
  use:{baseURL:`http://127.0.0.1:8080${process.env.APP_PATH||'/'}`,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run serve:test',url:'http://127.0.0.1:8080/',reuseExistingServer:!process.env.CI},
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome']}},
    {name:'mobile-chromium',use:{...devices['Pixel 7']}}
  ]
});
