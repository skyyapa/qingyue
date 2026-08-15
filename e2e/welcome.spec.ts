import { expect, test, type Page } from '@playwright/test'

/** 欢迎引导（全屏）：默认每次打开弹出，用户可勾选「以后不再显示」 */
test.describe('欢迎引导', () => {
  /** 仅首次导航清除 dismiss：标记存 sessionStorage（reload 仍保留，window 标记会丢） */
  async function clearOnce(page: Page): Promise<void> {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('welcome-test-cleared') !== '1') {
        localStorage.removeItem('qingyue:welcome-dismissed')
        sessionStorage.setItem('welcome-test-cleared', '1')
      }
    })
  }

  test('首次打开弹出引导，可关闭', async ({ page }) => {
    await clearOnce(page)
    await page.goto('/')
    await expect(page.getByText('欢迎使用轻阅')).toBeVisible()
    await expect(page.getByText('在线书源')).toBeVisible()
    await page.getByRole('button', { name: '开始使用' }).click()
    await expect(page.getByText('欢迎使用轻阅')).toBeHidden()
  })

  test('勾选「以后不再显示」后刷新不再弹出', async ({ page }) => {
    await clearOnce(page)
    await page.goto('/')
    await expect(page.getByText('欢迎使用轻阅')).toBeVisible()
    await page.getByLabel('以后打开不再显示引导').check()
    await page.getByRole('button', { name: '开始使用' }).click()
    await page.reload()
    await expect(page.getByText('欢迎使用轻阅')).toBeHidden()
  })

  test('已选择不再显示时直接跳过引导', async ({ page }) => {
    // storageState 已预置 qingyue:welcome-dismissed=1
    await page.goto('/')
    await expect(page.getByText('欢迎使用轻阅')).toBeHidden()
  })
})
