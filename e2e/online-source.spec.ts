import { expect, test } from '@playwright/test'
import { encodeSourcePayload, DEMO_SOURCE } from '../src/book-source/store'
import type { BookSource } from '../src/book-source/types'

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

  test('正文分页：多页正文自动拼接', async ({ page }) => {
    await page.goto('/')
    await page.locator('.search-input').fill('数据')
    await page.getByRole('button', { name: /在线搜索/ }).click()
    await page.getByRole('button', { name: /数据之海/ }).click()
    await page.waitForURL(/#\/reader\//)
    await expect(page.locator('.title-chapter')).toHaveText('第一章 信号')
    await expect(page.locator('.para').first()).toContainText('午夜零点')
    // 正文分页：第二页内容也已被拼接进同一章
    await expect(page.locator('.para').last()).toContainText('深海的对话')
  })

  test('分页目录：跨两页抓取全部章节', async ({ page }) => {
    await page.goto('/')
    await page.locator('.search-input').fill('分页')
    await page.getByRole('button', { name: /在线搜索/ }).click()
    await page.getByRole('button', { name: /分页之书/ }).click()
    await page.waitForURL(/#\/reader\//)
    await expect(page.locator('.title-chapter')).toHaveText('第一章 风起')
    // 返回书架：卡片进度应显示 1/6（第 2 页目录的 3 章也被抓取）
    await page.goto('/')
    const card = page.locator('.book-card').filter({ hasText: '分页之书' })
    await expect(card.locator('.progress-text')).toHaveText(/第 1\/6 章/)
  })

  test('书源分享链接：打开即导入', async ({ page }) => {
    const shareSource: BookSource = {
      id: 'share-test',
      name: '分享测试源',
      baseUrl: '',
      enabled: true,
      search: DEMO_SOURCE.search,
      chapters: DEMO_SOURCE.chapters,
      content: DEMO_SOURCE.content,
    }
    const payload = encodeSourcePayload(shareSource)
    await page.goto(`/#/source-import/${payload}`)
    await expect(page.getByText('分享测试源')).toBeVisible()
    await page.getByRole('button', { name: '导入书源' }).click()
    await expect(page.getByText(/导入完成：新增 1 个/)).toBeVisible()
    // 返回书架后可在书源管理看到
    await page.getByRole('button', { name: '返回书架' }).click()
    await page.getByRole('button', { name: '源' }).click()
    await expect(page.getByText('分享测试源')).toBeVisible()
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

  test('书源管理：分享面板生成分享链接', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '源' }).click()
    await page.getByRole('button', { name: '分享' }).first().click()
    await expect(page.getByText(/分享「轻阅演示」/)).toBeVisible()
    await expect(page.locator('.share-input')).toBeVisible()
    await expect(page.locator('.share-input')).toHaveValue(/#\/source-import\//)
  })
})
