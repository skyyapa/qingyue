import { expect, test } from '@playwright/test'

/** 在线书源（演示书源，同源直连） */
test.describe('在线书源', () => {
  test('搜索 → 添加 → 阅读 → 缓存续读', async ({ page }) => {
    await page.goto('/')
    // 输入关键词，触发在线搜索
    await page.locator('.search-input').fill('数据')
    await page.getByRole('button', { name: /在线搜索/ }).click()
    // 结果出现
    await expect(page.getByRole('button', { name: /数据之海/ })).toBeVisible()
    // 添加并进入阅读器
    await page.getByRole('button', { name: /数据之海/ }).click()
    await page.waitForURL(/#\/reader\//)
    await expect(page.locator('.title-book')).toHaveText('数据之海')
    // 正文实时抓取
    await expect(page.locator('.title-chapter')).toHaveText('第一章 信号')
    await expect(page.locator('.para').first()).toContainText('午夜零点')
    // 翻章并验证缓存续读
    await page.getByRole('button', { name: '下一章', exact: true }).click()
    await expect(page.locator('.title-chapter')).toHaveText('第二章 深海')
    await page.reload()
    await expect(page.locator('.title-chapter')).toHaveText('第二章 深海')
  })

  test('书源管理对话框', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '源' }).click()
    await expect(page.getByRole('heading', { name: '书源管理' })).toBeVisible()
    await expect(page.getByText('轻阅演示')).toBeVisible()
    // 内置演示源不可删除
    await expect(page.getByRole('button', { name: '删除' })).toBeDisabled()
    // 搜索测试
    await page.getByRole('button', { name: '搜索测试' }).click()
    await page.locator('.test-input input').fill('数据')
    await page.getByRole('button', { name: '测试', exact: true }).click()
    await expect(page.locator('.test-item').first()).toContainText('数据之海')
  })
})
