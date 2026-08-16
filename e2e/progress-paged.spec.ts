import { expect, test } from '@playwright/test'

/**
 * 进度 bug 复现与验证：翻页模式 + 本地 TXT。
 * 短章书（每章一屏内可见，无法滚动）：「看完了却只显示非100%」的根因是
 * readRatio 在内容不足以滚动（max<=0）时返回 0，把短章字数按 0% 计入。
 * 修复后：跳到最后一章（看完），全书占比应接近 100%。
 */
test.describe('翻页模式全书进度（短章书）', () => {
  test('读完最后一章后全书占比接近 100%', async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000)
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/短章书.txt')
    await page.waitForURL(/#\/reader\//)
    await page.getByRole('button', { name: '⚙' }).click()
    await page.getByRole('button', { name: '翻页', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.paged-area')).toBeVisible()

    // 短章无可滚动 → max=0，readRatio 应返回 1（修复后）并自动保存本页进度
    const firstMax = await page.locator('.paged-area').evaluate((el) => el.scrollWidth - el.clientWidth)
    console.log('第一章可滚动宽度 max =', firstMax)

    // 跳到最后一章（short chapter，max<=0，章节 watch 会自动视为读完并保存）
    await page.getByRole('button', { name: '☰' }).click()
    await page.locator('.toc-item').last().click()
    await page.getByRole('button', { name: '☰' }).click()
    // 等章节 watch 的防抖保存（500ms）完成
    await page.waitForTimeout(1200)

    const chapterPos = (await page.locator('.pos-chapter').textContent()) ?? ''
    console.log('chapterPos =', chapterPos)
    const text = (await page.locator('.pos-book').textContent()) ?? ''
    console.log('pos-book =', text)
    const pct = Number(/(\d+)/.exec(text)?.[1] ?? 0)
    // 读完全书占比应接近 100%（短章不再按 0% 计）
    expect(pct).toBeGreaterThan(95)
  })
})
