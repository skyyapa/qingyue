import { expect, test } from '@playwright/test'

/** 阅读器本体：位置记忆 / 翻页模式键盘 / 窄屏布局 */
test.describe('阅读器本体', () => {
  async function importBook(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/江湖夜雨.txt')
    await page.waitForURL(/#\/reader\//)
  }

  test('上一章/下一章往返恢复阅读位置（位置记忆）', async ({ page }) => {
    // 缩小视口让短章节正文可滚动
    await page.setViewportSize({ width: 800, height: 300 })
    await importBook(page)
    // 进入第一章
    await page.getByRole('button', { name: '下一章', exact: true }).click()
    await expect(page.locator('h1.chapter-heading')).toHaveText('第一章 初入江湖')
    // 滚到章内位置
    await page.locator('.scroll-area').evaluate((el) => {
      el.scrollTop = 200
    })
    const ratioBefore = await page.locator('.scroll-area').evaluate(
      (el) => el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)
    )
    expect(ratioBefore).toBeGreaterThan(0)
    // 下一章 → 上一章：恢复原位置（而非回到顶部）
    await page.getByRole('button', { name: '下一章', exact: true }).click()
    await expect(page.locator('h1.chapter-heading')).toHaveText('第二章 客栈')
    await page.getByRole('button', { name: '上一章' }).click()
    await expect(page.locator('h1.chapter-heading')).toHaveText('第一章 初入江湖')
    await expect
      .poll(async () =>
        page.locator('.scroll-area').evaluate(
          (el) => el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)
        )
      )
      .toBeCloseTo(ratioBefore, 1)
  })

  test('翻页模式：方向键翻页，末页自动翻下一章', async ({ page }) => {
    await importBook(page)
    // 切换到翻页模式
    await page.getByRole('button', { name: '⚙' }).click()
    await page.getByRole('button', { name: '翻页', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.paged-area')).toBeVisible()
    // 连续按右方向键：页内翻页 → 末页后翻下一章（序章内容短，可能连翻数章）
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(page.locator('h1.chapter-heading')).not.toHaveText('序章')
    await expect(page.locator('.pos-chapter')).not.toHaveText('1 / 5 章')
  })

  test('窄屏顶栏/底栏无横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 700 })
    await importBook(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  })

  test('章节内搜索：高亮命中、逐处跳转、Esc 关闭清除', async ({ page }) => {
    await importBook(page)
    // Ctrl+F 唤起搜索条
    await page.keyboard.press('Control+f')
    await expect(page.locator('.reader-search')).toBeVisible()
    // 输入搜索词：序章含「雨声」「雨幕」两处
    await page.locator('.reader-search input').fill('雨')
    await expect(page.locator('mark.search-hit')).toHaveCount(2)
    await expect(page.locator('.search-count')).toHaveText('1/2')
    // 下一处 → 当前高亮切换
    await page.getByRole('button', { name: '↓' }).click()
    await expect(page.locator('.search-count')).toHaveText('2/2')
    await expect(page.locator('mark.search-hit.current')).toHaveCount(1)
    // 上一处
    await page.getByRole('button', { name: '↑' }).click()
    await expect(page.locator('.search-count')).toHaveText('1/2')
    // 无匹配
    await page.locator('.reader-search input').fill('不存在的词')
    await expect(page.locator('.search-count')).toHaveText('0/0')
    // Esc 关闭并清除高亮
    await page.keyboard.press('Escape')
    await expect(page.locator('.reader-search')).toHaveCount(0)
    await expect(page.locator('mark.search-hit')).toHaveCount(0)
  })
})
