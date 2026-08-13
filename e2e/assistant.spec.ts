import { expect, test } from '@playwright/test'

/** 阅读助手：知识库分析 → 人物识别 → 实体卡片 */
test.describe('阅读助手', () => {
  test('分析知识库并识别人物', async ({ page }) => {
    await page.goto('/')
    // 导入一本有角色的书
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/江湖夜雨.txt')
    await page.waitForURL(/#\/reader\//)
    // 打开阅读助手 → 开始分析
    await page.getByRole('button', { name: '助' }).click()
    await expect(page.getByText('还没有知识库')).toBeVisible()
    await page.getByRole('button', { name: '开始分析' }).click()
    // 分析完成：人物列表出现
    await expect(page.getByText(/已分析/)).toBeVisible()
    await expect(page.getByRole('button', { name: /林风/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /苏瑶/ })).toBeVisible()
    // 打开林风实体卡片
    await page.getByRole('button', { name: /林风/ }).first().click()
    await expect(page.getByText('出现章节')).toBeVisible()
    await expect(page.getByText('例句')).toBeVisible()
  })
})
