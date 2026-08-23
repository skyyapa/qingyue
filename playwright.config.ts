import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`
const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? `npm run dev -- --port ${port} --strictPort`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // 预置「已关闭欢迎引导」：全屏引导默认不遮挡既有测试；welcome.spec 单独清除验证。
    // 用动态 origin，避免 PLAYWRIGHT_PORT 切到备用端口时 storageState 失效。
    storageState: {
      cookies: [],
      origins: [{ origin: baseURL, localStorage: [{ name: 'qingyue:welcome-dismissed', value: '1' }] }],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // 真实 WebKit 引擎（Playwright 版 Safari 内核）+ iPhone 视口：验证 iOS Safari / iOS PWA 行为
      name: 'webkit-ios',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: webServerCommand,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
