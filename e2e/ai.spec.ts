import { expect, test } from '@playwright/test'

/** AI Provider 设置：预设切换、配置表单、测试连接与启用 */
test.describe('AI Provider', () => {
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
})
