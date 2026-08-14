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

  test('内嵌 CSS 排版还原：缩进/对齐/行距与粗斜体', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/带样式样书.epub')
    await page.waitForURL(/#\/reader\//)
    const paras = page.locator('.para')
    await expect(paras).toHaveCount(3)
    // 普通段落：body 行距继承 + 首行缩进
    const firstStyle = (await paras.first().getAttribute('style')) ?? ''
    expect(firstStyle).toContain('line-height: 1.8')
    expect(firstStyle).toContain('text-indent: 2em')
    // 居中段落（class 规则覆盖）
    const centerStyle = (await paras.nth(1).getAttribute('style')) ?? ''
    expect(centerStyle).toContain('text-align: center')
    // 行内粗体/斜体渲染为 <b>/<em>
    await expect(page.locator('.para b').first()).toHaveText('重点')
    await expect(page.locator('.para em').first()).toHaveText('斜体')
  })

  test('@font-face 内嵌字体注入为书级字体定义', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/带字体样书.epub')
    await page.waitForURL(/#\/reader\//)
    // 书级 @font-face 注入（style[data-book-fonts]）
    const fontStyle = await page.evaluate(
      () => document.querySelector('style[data-book-fonts]')?.textContent ?? ''
    )
    expect(fontStyle).toContain('@font-face')
    expect(fontStyle).toContain('"DemoFont"')
    expect(fontStyle).toContain('data:font/ttf;base64,')
    // 正文段落继承 body 的 font-family
    const paraStyle = (await page.locator('.para').first().getAttribute('style')) ?? ''
    expect(paraStyle).toContain('font-family')
  })
})
