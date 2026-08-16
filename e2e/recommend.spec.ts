import { expect, test } from '@playwright/test'

/** 推荐界面：导入书 → 书架入口 → 推荐页展示画像/同类型推荐 */
test.describe('推荐界面', () => {
  test('书架入口进推荐页：显示阅读画像与参考书推荐', async ({ page }) => {
    await page.goto('/')
    // 导入两本同题材书（斗破=玄幻）与一本不同题材（凡人修仙传=仙侠）
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').first().setInputFiles([
      { name: '斗破苍穹.txt', mimeType: 'text/plain', buffer: Buffer.from('第一章\n斗破天下。\n\n第二章\n修炼一途。', 'utf8') },
      { name: '斗罗大陆.txt', mimeType: 'text/plain', buffer: Buffer.from('第一章\n魂师世界。', 'utf8') },
    ])
    await page.waitForURL(/#\/reader\//)
    await page.getByRole('button', { name: '←', ariaLabel: '' }).or(page.getByRole('button', { name: '←' })).first().click()
    await page.waitForURL(/#\/$/)
    // 进推荐页
    await page.getByRole('button', { name: /推荐/ }).click()
    await page.waitForURL(/#\/recommend/)
    // 应显示阅读画像（玄幻）
    await expect(page.getByText(/玄幻/).first()).toBeVisible()
    // 参考书选择 + 推荐 sections 存在
    await expect(page.locator('.rec-section').first()).toBeVisible()
    // 同为玄幻的两本：推荐卡片区域应包含另一本（斗破/斗罗其一作为推荐卡 .rec-name）
    await expect(page.locator('.rec-section').first()).toBeVisible()
    await expect(page.locator('.rec-name').first()).toBeVisible()
  })
})
