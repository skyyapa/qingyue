import { expect, test } from '@playwright/test'

/** 核心旅程：导入 → 书架 → 阅读 → 翻章 → 刷新续读 */
test.describe('书架与阅读', () => {
  test('空书架引导', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('轻阅', { exact: true })).toBeVisible()
    await expect(page.getByText('书架还是空的')).toBeVisible()
  })

  test('导入 TXT → 阅读 → 翻章 → 刷新续读', async ({ page }) => {
    await page.goto('/')
    // 打开导入对话框并上传
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/江湖夜雨.txt')
    // 导入完成后自动进入阅读器
    await page.waitForURL(/#\/reader\//)
    await expect(page.locator('.title-book')).toHaveText('江湖夜雨')
    await expect(page.locator('.title-chapter')).toHaveText('序章')
    // 正文渲染
    await expect(page.locator('.para').first()).toContainText('夜色如墨')
    // 翻章
    await page.getByRole('button', { name: '下一章', exact: true }).click()
    await expect(page.locator('.title-chapter')).toHaveText('第一章 初入江湖')
    await expect(page.locator('.para').first()).toContainText('林风对苏瑶说')
    // 刷新续读
    await page.reload()
    await expect(page.locator('.title-chapter')).toHaveText('第一章 初入江湖')
    // 返回书架，卡片显示进度
    await page.getByRole('button', { name: '←' }).click()
    await expect(page.locator('.book-title')).toHaveText('江湖夜雨')
    await expect(page.locator('.progress-text')).toContainText('第 2/5 章')
  })
})
