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
    // 7 个预设齐全（OpenAI 官方/兼容中转/DeepSeek/Gemini/Ollama/LM Studio/vLLM）
    await expect(page.locator('.provider-item')).toHaveCount(7)
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

  test('防剧透：AI 请求体只含已读章节数据（读到序章，无第二章信息）', async ({ page }) => {
    // 预置 Provider 配置
    await page.addInitScript(() => {
      localStorage.setItem(
        'qingyue:aiProviders',
        JSON.stringify({
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-e2e', model: 'deepseek-chat', enabled: true },
        })
      )
    })
    // 捕获请求体并 mock 响应
    let lastBody = ''
    await page.route('**/chat/completions', async (route) => {
      lastBody = route.request().postData() ?? ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: '林风是序章出场的少年。' } }] }),
      })
    })
    await importBook(page) // 默认停在序章（第 1 章，chapterIndex 0）
    await page.getByRole('button', { name: '助' }).click()
    await page.getByRole('button', { name: '开始分析' }).click()
    await expect(page.getByText(/已分析/)).toBeVisible()
    await page.getByRole('button', { name: 'AI', exact: true }).click()
    // 十个任务 chips
    await expect(page.locator('.ai-chips .chip')).toHaveCount(10)
    // 问「这是谁」：输入林风
    await page.locator('.ai-input-row input').fill('林风')
    await page.getByRole('button', { name: '这是谁' }).click()
    await expect(page.locator('.ai-text')).toContainText('林风是序章出场的少年')
    // 请求体防剧透：含防剧透指令（私人管家「不剧透」规则）与进度，且不含未读章节数据
    expect(lastBody).toContain('不剧透')
    expect(lastBody).toContain('第 1 至第 1 章')
    expect(lastBody).not.toContain('第二章')
    expect(lastBody).not.toContain('江湖雨剑谱') // 第一章内容不可见
    expect(lastBody).not.toContain('苏瑶') // 未来章节才出现的实体名不入上下文
    expect(lastBody).not.toContain('黑衣人')
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
    // 十个任务 chips（含伏笔回顾/章节摘要；经历时间线为实体卡片入口不在此列）
    await expect(page.locator('.ai-chips .chip')).toHaveCount(10)
    // 执行「前情回顾」
    await page.getByRole('button', { name: '前情回顾' }).click()
    await expect(page.locator('.ai-text')).toContainText('林风与苏瑶初识于客栈')
    await expect(page.locator('.ai-text b')).toHaveText('前情回顾') // **粗体** 受控渲染
  })

  test('AI 阅读浮层：四操作与多模型策略（总结走摘要模型）', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'qingyue:aiProviders',
        JSON.stringify({
          deepseek: {
            baseUrl: 'https://api.deepseek.com/v1',
            apiKey: 'sk-e2e',
            model: 'deepseek-chat',
            easyModel: 'cheap-easy',
            summaryModel: 'cheap-summary',
            enabled: true,
          },
        })
      )
    })
    let lastBody = ''
    await page.route('**/chat/completions', async (route) => {
      lastBody = route.request().postData() ?? ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: '**本章摘要**：林风与苏瑶交谈。' } }] }),
      })
    })
    await importBook(page)
    await page.getByRole('button', { name: '助' }).click()
    await page.getByRole('button', { name: '开始分析' }).click()
    await expect(page.getByText(/已分析/)).toBeVisible()
    await page.locator('.assistant-head button').click()
    // 浮层四操作
    await page.getByRole('button', { name: '⚡' }).click()
    await expect(page.locator('.fab-item')).toHaveCount(4)
    // 总结本章 → 底部面板就地显示回答
    await page.getByRole('button', { name: '📝 总结本章' }).click()
    await expect(page.locator('.ai-fab-panel .fab-answer')).toContainText('林风与苏瑶交谈')
    // 多模型策略：摘要任务使用 summaryModel
    expect(JSON.parse(lastBody).model).toBe('cheap-summary')
  })

  test('实体卡片：经历时间线（静态 + AI 梳理）', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'qingyue:aiProviders',
        JSON.stringify({
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-e2e', model: 'deepseek-chat', enabled: true },
        })
      )
    })
    let lastBody = ''
    await page.route('**/chat/completions', async (route) => {
      lastBody = route.request().postData() ?? ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: '林风的经历时间线如下…' } }] }),
      })
    })
    await importBook(page)
    await page.getByRole('button', { name: '助' }).click()
    await page.getByRole('button', { name: '开始分析' }).click()
    await expect(page.getByText(/已分析/)).toBeVisible()
    // 打开林风实体卡片：静态经历时间线
    await page.getByRole('button', { name: /林风/ }).first().click()
    await expect(page.locator('.entity-timeline')).toBeVisible()
    await expect(page.locator('.tl-item').first()).toBeVisible()
    // AI 梳理经历 → 结果显示在 AI tab
    await page.getByRole('button', { name: '✨ AI 梳理经历' }).click()
    await expect(page.locator('.ai-text')).toContainText('林风的经历时间线如下')
    expect(lastBody).toContain('经历')
  })
})
