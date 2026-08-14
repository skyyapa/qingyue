import { expect, test } from '@playwright/test'

/** AI Provider 设置与阅读助手 AI 能力 */
test.describe('AI Provider', () => {
  async function importBook(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/江湖夜雨.txt')
    await page.waitForURL(/#\/reader\//)
  }

  test('预设切换、配置持久化、测试连接错误提示', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'AI' }).click()
    await expect(page.locator('.ai-modal')).toBeVisible()
    // 5 个预设齐全
    await expect(page.locator('.provider-item')).toHaveCount(5)
    // 选中 DeepSeek：默认 Base URL / Model 预填
    await page.getByRole('button', { name: /DeepSeek/ }).click()
    await expect(page.locator('.ai-row input').nth(0)).toHaveValue('https://api.deepseek.com/v1')
    // 填写 Key 并测试连接（无真实服务 → 友好错误提示）
    await page.locator('.ai-row input').nth(1).fill('sk-invalid-test-key')
    await page.getByRole('button', { name: '测试连接' }).click()
    await expect(page.locator('.ai-test.fail')).toBeVisible()
    // 启用并关闭
    await page.getByRole('button', { name: '启用此 Provider' }).click()
    await expect(page.locator('.ai-modal')).toHaveCount(0)
    // 重新打开：DeepSeek 显示已启用
    await page.getByRole('button', { name: 'AI' }).click()
    await expect(page.locator('.provider-state.on')).toHaveText('已启用')
    await expect(page.locator('.ai-row input').nth(1)).toHaveValue('sk-invalid-test-key') // Key 持久化
  })

  test('阅读助手 AI tab：未配置时显示引导', async ({ page }) => {
    await importBook(page)
    await page.getByRole('button', { name: '助' }).click()
    await page.getByRole('button', { name: '开始分析' }).click()
    await expect(page.getByText(/已分析/)).toBeVisible()
    await page.getByRole('button', { name: 'AI', exact: true }).click()
    await expect(page.getByText('未配置 AI Provider')).toBeVisible()
  })

  test('阅读助手 AI：配置后执行任务并渲染回答（mock 响应）', async ({ page }) => {
    // 预置 Provider 配置（模拟用户已在书架配置 DeepSeek）
    await page.addInitScript(() => {
      localStorage.setItem(
        'qingyue:aiProviders',
        JSON.stringify({
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-e2e', model: 'deepseek-chat', enabled: true },
        })
      )
    })
    // mock AI chat 响应
    await page.route('**/chat/completions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: '**前情回顾**：林风与苏瑶初识于客栈。' } }] }),
      })
    )
    await importBook(page)
    await page.getByRole('button', { name: '助' }).click()
    await page.getByRole('button', { name: '开始分析' }).click()
    await expect(page.getByText(/已分析/)).toBeVisible()
    await page.getByRole('button', { name: 'AI', exact: true }).click()
    // 七个任务 chips 齐全
    await expect(page.locator('.ai-chips .chip')).toHaveCount(7)
    // 执行「前情回顾」
    await page.getByRole('button', { name: '前情回顾' }).click()
    await expect(page.locator('.ai-text')).toContainText('林风与苏瑶初识于客栈')
    await expect(page.locator('.ai-text b')).toHaveText('前情回顾') // **粗体** 受控渲染
  })
})
