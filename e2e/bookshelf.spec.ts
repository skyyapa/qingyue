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

  test('阅读界面：切换主题皮肤与拟真书页', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/江湖夜雨.txt')
    await page.waitForURL(/#\/reader\//)
    await expect(page.locator('.title-book')).toHaveText('江湖夜雨')
    // 拟真书页默认开启
    await expect(page.locator('.reader.bookpage')).toBeVisible()
    // 打开阅读设置
    await page.locator('button[title="阅读设置"]').click()
    // 主题画廊应含 10 套皮肤
    await expect(page.locator('.theme-card')).toHaveCount(10)
    // 切换主题：深蓝 → html data-theme 随之变化
    await page.getByRole('button', { name: '深蓝' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean')
    // 关闭拟真书页 → 再开启
    await page.getByRole('button', { name: '简洁' }).click()
    await expect(page.locator('.reader.bookpage')).toHaveCount(0)
    await page.getByRole('button', { name: '拟真书页' }).click()
    await expect(page.locator('.reader.bookpage')).toBeVisible()
  })

  test('重置阅读进度：回到第一章', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/江湖夜雨.txt')
    await page.waitForURL(/#\/reader\//)
    // 翻到第二章，返回书架
    await page.getByRole('button', { name: '下一章', exact: true }).click()
    await expect(page.locator('.title-chapter')).toHaveText('第一章 初入江湖')
    await page.getByRole('button', { name: '←' }).click()
    await expect(page.locator('.progress-text')).toContainText('第 2/5 章')
    // 卡片 ⋯ 菜单 → 重置阅读进度
    await page.locator('.book-card').hover()
    await page.locator('button[title="移动到分组"]').click()
    await page.getByRole('button', { name: '重置阅读进度' }).click()
    await page.getByRole('button', { name: '重置', exact: true }).click() // 确认对话框
    // 重新打开：回到序章
    await page.locator('.book-card').click()
    await page.waitForURL(/#\/reader\//)
    await expect(page.locator('.title-chapter')).toHaveText('序章')
    await expect(page.locator('.pos-chapter')).toHaveText('1 / 5 章')
  })
})
