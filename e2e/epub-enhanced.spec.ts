import { expect, test } from '@playwright/test'

/** EPUB 增强：NCX 目录标题 + 内嵌图片渲染 */
test.describe('EPUB 增强', () => {
  test('NCX 目录标题生效，正文图片渲染', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/带图样书.epub')
    await page.waitForURL(/#\/reader\//)
    // NCX 目录标题优先于正文 h1
    await expect(page.locator('.title-chapter')).toHaveText('第一章 目录名甲')
    await expect(page.locator('.chapter-heading')).toHaveText('第一章 目录名甲')
    // 正文渲染
    await expect(page.locator('.para').first()).toContainText('这是第一章的正文')
    // 内嵌图片渲染为 <img>
    const img = page.locator('.para-img')
    await expect(img).toHaveCount(1)
    const src = await img.getAttribute('src')
    expect(src).toMatch(/^data:image\/png;base64,/)
    // 翻章：NCX 标题同样生效
    await page.getByRole('button', { name: '下一章', exact: true }).click()
    await expect(page.locator('.title-chapter')).toHaveText('第二章 目录名乙')
  })
})
