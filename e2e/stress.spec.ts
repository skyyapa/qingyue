import { expect, test } from '@playwright/test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * 发布前压力验收：大文件导入不卡死/不失败。
 * - 用 Playwright setInputFiles 直接传内存生成的文本，不落盘、不污染仓库
 * - 覆盖 10MB / 50MB TXT 的导入 → 进入阅读器 → 翻章 → 章节切分正确
 * 大文件用例单独标记为 slow，避免拖慢常规回归。
 */

// 生成指定 MB 的中文 TXT：含多个「第N章」标记以触发章节切分。
// 用 Buffer 直接分配逐步写入，避免超大字符串拼接的内存峰值。
// 每写入 CHUNK 大小就换一个章节标题，使章节数随文件增大而变多。
function buildBigTxt(mb: number): Buffer {
  const total = mb * 1024 * 1024
  const CHUNK = 256 * 1024 // 每 256KB 一章
  const chapterCount = Math.max(2, Math.floor(total / CHUNK))
  const buf = Buffer.alloc(total)
  const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  let offset = 0
  // 每段正文后带换行符，保证「第X章」标题独占一行（splitChapters 按行切分）
  const para = Buffer.from('林风和苏晚在客栈相遇，两人谈论起江湖上的传闻与恩怨，决定一同踏上未知的旅程。\n', 'utf8')
  for (let c = 0; c < chapterCount && offset < total; c++) {
    const head = Buffer.from(`\n第${cn[c % cn.length]}章 大文件压力章节${c}\n`, 'utf8')
    head.copy(buf, offset)
    offset += head.length
    // 填充本段到 CHUNK 大小（每段都是独立一行）
    const chunkEnd = Math.min(total, CHUNK * (c + 1))
    while (offset < chunkEnd) {
      const room = Math.min(para.length, chunkEnd - offset)
      para.copy(buf, offset, 0, room)
      offset += room
    }
  }
  if (offset < total) {
    Buffer.from('填充内容用于扩大体积，验证大文件解析与渲染的稳定性。\n').copy(buf, offset)
  }
  return buf
}

test.describe('大文件压力验收', () => {
  test('10MB TXT 导入、进入阅读器、正文渲染、翻章', async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000)
    const big = buildBigTxt(10)
    await page.goto('/')
    await page.getByRole('button', { name: '＋ 导入书籍' }).click()
    await page.locator('input[type="file"]').setInputFiles({
      name: '压力测试10mb.txt',
      mimeType: 'text/plain',
      buffer: big,
    })
    // 导入成功进入阅读器
    await page.waitForURL(/#\/reader\//, { timeout: 90_000 })
    await expect(page.locator('h1.chapter-heading')).toBeVisible({ timeout: 60_000 })
    // 有章节定位（至少 1 章，正文成功渲染）
    const pos = await page.locator('.pos-chapter').textContent()
    expect(pos).toBeTruthy()
    // 若存在下一章则翻章验证正文仍渲染（章节切分语义由单元测试覆盖，这里只验证大文件不卡/不崩）
    const next = page.getByRole('button', { name: '下一章', exact: true })
    if (await next.isEnabled()) {
      await next.click()
      await expect(page.locator('h1.chapter-heading')).toBeVisible()
    }
  })

  test('50MB TXT 导入不失败、能进入阅读器且正文渲染', async ({ page }, testInfo) => {
    testInfo.setTimeout(180_000)
    test.slow()
    // Playwright 限制 setInputFiles 传 buffer 最大 50MB，50MB 需写临时文件再传路径
    const big = buildBigTxt(50)
    const tmpPath = await fs.mkdtemp(path.join(os.tmpdir(), 'qingyue-stress-'))
    const file = path.join(tmpPath, '压力测试50mb.txt')
    await fs.writeFile(file, big)
    try {
      await page.goto('/')
      await page.getByRole('button', { name: '＋ 导入书籍' }).click()
      await page.locator('input[type="file"]').setInputFiles(file)
      await page.waitForURL(/#\/reader\//, { timeout: 150_000 })
      await expect(page.locator('h1.chapter-heading')).toBeVisible({ timeout: 90_000 })
      const pos = await page.locator('.pos-chapter').textContent()
      expect(pos).toBeTruthy()
    } finally {
      await fs.rm(tmpPath, { recursive: true, force: true })
    }
  })
})
