import { expect, test } from '@playwright/test'

/** P0 防剧透最终测试：150 章长书，第 100 章揭晓主角真实身份
 *  读到第 80 章问「主角真实身份」→ 请求体不得含揭晓内容；
 *  读到第 101 章再问 → 揭晓内容可见（对照验证机制有效） */
test.describe('防剧透最终测试', () => {
  async function setup(page: import('@playwright/test').Page): Promise<{ lastBody: () => string }> {
    // 预置 Provider 配置 + 捕获 chat 请求体
    await page.addInitScript(() => {
      localStorage.setItem(
        'qingyue:aiProviders',
        JSON.stringify({
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-e2e', model: 'deepseek-chat', enabled: true },
        })
      )
    })
    let body = ''
    await page.route('**/chat/completions', async (route) => {
      body = route.request().postData() ?? ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      })
    })
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/身世之谜.txt')
    await page.waitForURL(/#\/reader\//)
    // 分析全书（150 章）
    await page.getByRole('button', { name: '助' }).click()
    await page.getByRole('button', { name: '开始分析' }).click()
    await expect(page.getByText(/已分析/)).toBeVisible({ timeout: 60000 })
    await page.locator('.assistant-head button').click() // 关闭助手抽屉
    return { lastBody: () => body }
  }

  async function jumpToChapter(page: import('@playwright/test').Page, chapterNo: number): Promise<void> {
    await page.getByRole('button', { name: '☰' }).click()
    await page.locator('.toc-item').nth(chapterNo - 1).click()
    await expect(page.locator('.pos-chapter')).toHaveText(`${chapterNo} / 150 章`)
  }

  async function askIdentity(page: import('@playwright/test').Page): Promise<void> {
    await page.getByRole('button', { name: '助' }).click()
    await page.getByRole('button', { name: 'AI', exact: true }).click()
    await page.locator('.ai-input-row input').fill('林夜的真实身份是什么？')
    await page.getByRole('button', { name: '自由提问' }).click()
    await expect(page.locator('.ai-text')).toHaveText('ok')
    await page.locator('.assistant-head button').click() // 关闭助手，避免遮挡
  }

  test('读到第 80 章问身份：请求体不含第 100 章的揭晓内容', async ({ page }) => {
    const { lastBody } = await setup(page)
    await jumpToChapter(page, 80)
    await askIdentity(page)
    const body = lastBody()
    // 防剧透指令与进度边界正确
    expect(body).toContain('不剧透')
    expect(body).toContain('第 1 至第 80 章')
    // 第 100 章才出现的揭晓内容绝不泄漏
    expect(body).not.toContain('远古神子')
    expect(body).not.toContain('真实身份是远古神子')
  })

  test('读到第 101 章：进度边界推进正确，读到第 100 章后摘要可引用揭晓（对照验证）', async ({ page }) => {
    const { lastBody } = await setup(page)
    // 读到第 101 章问身份：进度边界正确（ask 只引用当前章正文，不引用历史章正文属设计）
    await jumpToChapter(page, 101)
    await askIdentity(page)
    expect(lastBody()).toContain('第 1 至第 101 章')
    expect(lastBody()).not.toContain('远古神子') // ask 不带历史章正文
    // 跳到第 100 章（揭晓章）→ 章节摘要任务带该章全文 → 揭晓内容可引用
    await jumpToChapter(page, 100)
    await page.getByRole('button', { name: '助' }).click()
    await page.getByRole('button', { name: 'AI', exact: true }).click()
    await page.getByRole('button', { name: '章节摘要' }).click()
    await expect(page.locator('.ai-text')).toHaveText('ok')
    expect(lastBody()).toContain('远古神子') // 已读第 100 章 → AI 可引用揭晓内容
  })
})
