import { expect, test, devices } from '@playwright/test'

/** 移动端体验：iPhone 视口（触屏 + 刘海安全区仿真）下书架与阅读器布局可用、无横向溢出 */
// iPhone 13 描述符的 defaultBrowserType 是 webkit，本仓库只用 chromium，剔除之
const iphone13 = { ...devices['iPhone 13'] }
delete (iphone13 as { defaultBrowserType?: string }).defaultBrowserType
test.use({ ...iphone13 })

test.describe('移动端体验', () => {

  async function importBook(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/江湖夜雨.txt')
    await page.waitForURL(/#\/reader\//)
  }

  test('书架：无横向溢出，搜索框 16px（iOS 聚焦不放大）', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('书架还是空的')).toBeVisible()
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    expect(noOverflow).toBe(true)
    // 顶栏搜索框可直接聚焦输入，字号 16px 起避免 iOS 自动放大页面
    const input = page.locator('.search-input')
    await expect(input).toBeVisible()
    await input.fill('江湖')
    expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px')
  })

  test('书架：分组删除按钮常驻可见（触屏无 hover）', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 分组' }).click()
    await page.locator('.dialog-input').fill('玄幻')
    await page.getByRole('button', { name: '创建', exact: true }).click()
    await expect(page.getByRole('button', { name: '玄幻' })).toBeVisible()
    // 无需 hover，删除钮直接可见可点
    const del = page.locator('.group-tab-del')
    await expect(del).toBeVisible()
    await del.click()
    await page.getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.getByRole('button', { name: '玄幻' })).toHaveCount(0)
  })

  test('阅读器：中央点击切换工具栏显隐', async ({ page }) => {
    await importBook(page)
    await expect(page.locator('.reader-top')).toBeVisible()
    await page.touchscreen.tap(195, 400)
    await expect(page.locator('.reader')).toHaveClass(/bars-hidden/)
    // 双击抑制窗口后再次点击，工具栏呼出
    await page.waitForTimeout(450)
    await page.touchscreen.tap(195, 400)
    await expect(page.locator('.reader')).not.toHaveClass(/bars-hidden/)
  })

  test('翻页模式：左右区域点按翻页（页内/跨章）', async ({ page }) => {
    await importBook(page)
    await page.getByRole('button', { name: '⚙' }).click()
    await page.getByRole('button', { name: '翻页', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.paged-area')).toBeVisible()
    // 状态 = 页数 + 章标题 + 横向位置，点击后任一变化即翻页成功
    const state = () =>
      page.evaluate(() => {
        const el = document.querySelector('.paged-area') as HTMLElement | null
        return `${document.querySelector('.pos-main')?.textContent ?? ''}|${document.querySelector('h1.chapter-heading')?.textContent ?? ''}|${el?.scrollLeft ?? 0}`
      })
    const before = await state()
    await page.touchscreen.tap(340, 400) // 右侧区域
    await expect.poll(state).not.toBe(before)
    const afterRight = await state()
    await page.touchscreen.tap(50, 400) // 左侧区域
    await expect.poll(state).not.toBe(afterRight)
  })

  test('阅读器：顶底栏无横向溢出，标题截断不挤压按钮', async ({ page }) => {
    await importBook(page)
    await expect(page.locator('.title-book')).toHaveText('江湖夜雨')
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    expect(noOverflow).toBe(true)
    // 顶栏按钮齐全且都在视口内（标题被截断而不是把按钮挤出；按钮可访问名是其图标字符）
    for (const name of ['←', '☰', '⚙']) {
      const btn = page.getByRole('button', { name })
      await expect(btn).toBeVisible()
      const box = await btn.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    }
    // 底栏翻章入口可用
    await expect(page.getByRole('button', { name: '下一章', exact: true })).toBeVisible()
  })

  test('阅读器：章节搜索条可用且输入框 16px', async ({ page }) => {
    await importBook(page)
    await page.keyboard.press('Control+f')
    const input = page.locator('.reader-search input')
    await expect(input).toBeVisible()
    await input.fill('雨')
    await expect(page.locator('mark.search-hit')).toHaveCount(2)
    expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px')
  })

  test('阅读器翻页模式：移动视口下无横向溢出', async ({ page }) => {
    await importBook(page)
    await page.getByRole('button', { name: '⚙' }).click()
    await page.getByRole('button', { name: '翻页', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.paged-area')).toBeVisible()
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    expect(noOverflow).toBe(true)
    await expect(page.locator('.pos-chapter')).toHaveText('1 / 5 章')
  })
})
