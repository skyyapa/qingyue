import { expect, test, type Page } from '@playwright/test'

/** 实时引导：欢迎卡 → 书架页逐个高亮关键入口，完成/跳过记忆 */
test.describe('欢迎引导', () => {
  /** 仅首次导航清除 dismiss：标记存 sessionStorage（reload 仍保留） */
  async function clearOnce(page: Page): Promise<void> {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('welcome-test-cleared') !== '1') {
        localStorage.removeItem('qingyue:welcome-dismissed')
        sessionStorage.setItem('welcome-test-cleared', '1')
      }
    })
  }

  test('首次打开欢迎卡，点「开始引导」进入步骤高亮并可走完', async ({ page }) => {
    await clearOnce(page)
    await page.goto('/')
    await expect(page.getByText('欢迎使用轻阅')).toBeVisible()
    await page.getByRole('button', { name: '开始引导' }).click()
    // 第 1 步：导入书籍（高亮 + 气泡）
    await expect(page.locator('.guide-bubble').getByText('1 / 4')).toBeVisible()
    await expect(page.locator('.guide-bubble').getByText('导入书籍')).toBeVisible()
    await page.getByRole('button', { name: '下一步' }).click()
    // 第 2 步：在线搜索
    await expect(page.locator('.guide-bubble').getByText('在线搜索')).toBeVisible()
    await page.getByRole('button', { name: '下一步' }).click()
    // 第 3 步：书源管理
    await expect(page.locator('.guide-bubble').getByText('书源管理')).toBeVisible()
    await page.getByRole('button', { name: '下一步' }).click()
    // 第 4 步：AI 阅读助手 → 完成
    await expect(page.locator('.guide-bubble').getByText('AI 阅读助手')).toBeVisible()
    await page.getByRole('button', { name: '完成' }).click()
    // 引导层关闭
    await expect(page.locator('.guide-bubble').getByText('1 / 4')).toBeHidden()
  })

  test('完成引导后刷新不再弹出', async ({ page }) => {
    await clearOnce(page)
    await page.goto('/')
    await page.getByRole('button', { name: '开始引导' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('button', { name: '完成' }).click()
    await page.reload()
    await expect(page.getByText('欢迎使用轻阅')).toBeHidden()
  })

  test('点「直接使用」跳过，不再记忆（下次仍弹）', async ({ page }) => {
    await clearOnce(page)
    await page.goto('/')
    await expect(page.getByText('欢迎使用轻阅')).toBeVisible()
    await page.getByRole('button', { name: '直接使用' }).click()
    await expect(page.getByText('欢迎使用轻阅')).toBeHidden()
    // 未写入 dismiss → reload 后仍弹
    await page.reload()
    await expect(page.getByText('欢迎使用轻阅')).toBeVisible()
  })

  test('已选择不再显示时直接跳过引导', async ({ page }) => {
    // storageState 已预置 qingyue:welcome-dismissed=1
    await page.goto('/')
    await expect(page.getByText('欢迎使用轻阅')).toBeHidden()
  })
})
