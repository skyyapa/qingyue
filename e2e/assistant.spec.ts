import { expect, test, type Page } from '@playwright/test'

/** 阅读助手：知识库分析 → 人物识别 → 实体卡片 → 搜索过滤 → 正文定位 */
test.describe('阅读助手', () => {
  async function importAndAnalyze(page: Page): Promise<void> {
    await page.addInitScript(() => localStorage.setItem('qingyue:welcome-dismissed', '1'))
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/江湖夜雨.txt')
    await page.waitForURL(/#\/reader\//)
    await page.getByRole('button', { name: '助' }).click()
    await page.getByRole('button', { name: '开始分析' }).click()
    await expect(page.getByRole('button', { name: /林风/ })).toBeVisible()
    await page.locator('.assistant-head button').click()
    await page.locator('.reader-bottom .btn-nav').last().click()
    await expect(page.locator('h1.chapter-heading')).toHaveText('第一章 初入江湖')
    await page.getByRole('button', { name: '助' }).click()
    await expect(page.getByRole('button', { name: /苏瑶/ })).toBeVisible()
  }

  test('分析知识库并识别人物', async ({ page }) => {
    await importAndAnalyze(page)
    await expect(page.getByText(/已分析/)).toBeVisible()
    await expect(page.getByRole('button', { name: /苏瑶/ })).toBeVisible()
    // 打开林风实体卡片
    await page.getByRole('button', { name: /林风/ }).first().click()
    await expect(page.getByText('出现章节')).toBeVisible()
    await expect(page.getByText('例句')).toBeVisible()
  })

  test('人物列表支持搜索过滤', async ({ page }) => {
    await importAndAnalyze(page)
    await page.getByPlaceholder(/搜索人物/).fill('苏')
    await expect(page.getByRole('button', { name: /林风/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /苏瑶/ })).toBeVisible()
    await page.getByPlaceholder(/搜索人物/).fill('不存在的人')
    await expect(page.getByText('没有匹配的人物')).toBeVisible()
  })

  test('例句「定位」跳转到正文并高亮锚点', async ({ page }) => {
    await importAndAnalyze(page)
    await page.getByRole('button', { name: /林风/ }).first().click()
    // 例句带出处章节时显示「定位」按钮；第 1 条例句出自序章（正文过短无法滚动），
    // 用第 2 条（第一章）验证跨章跳转
    await page.setViewportSize({ width: 900, height: 300 })
    const locate = page.getByRole('button', { name: '定位' }).nth(1)
    await expect(locate).toBeVisible()
    await locate.click()
    // 正文切到例句所在章节，滚动到例句段落并短暂高亮
    await expect(page.locator('h1.chapter-heading')).toHaveText('第一章 初入江湖')
    await expect(page.locator('p.anchor-flash').first()).toBeVisible()
    await expect
      .poll(async () => page.locator('.scroll-area').evaluate((el) => el.scrollTop), { timeout: 4000 })
      .toBeGreaterThan(0)
  })

  test('时间线 tab：全书事件聚合并可跳转', async ({ page }) => {
    await importAndAnalyze(page)
    await page.getByRole('button', { name: '时间线', exact: true }).click()
    // 事件句（「林风对苏瑶说」）聚合显示
    await expect(page.locator('.timeline-item').first()).toBeVisible()
    await expect(page.locator('.timeline-text').first()).toContainText('林风对苏瑶说')
    await expect(page.locator('.timeline-meta').first()).toContainText('出现于')
    // 点击事件跳转到首次出现章节
    await page.locator('.timeline-item').first().click()
    await expect(page.locator('.title-chapter')).toHaveText('第一章 初入江湖')
  })

  test('设定 tab 包含境界分类', async ({ page }) => {
    await importAndAnalyze(page)
    await page.getByRole('button', { name: '设定', exact: true }).click()
    await expect(page.getByRole('button', { name: '境界', exact: true })).toBeVisible()
  })
})
