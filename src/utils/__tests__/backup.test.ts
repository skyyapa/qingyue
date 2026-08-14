import { beforeEach, describe, expect, it } from 'vitest'
import * as db from '@/db'
import { buildBackup, importBackupBuffer } from '@/utils/backup'
import { loadSources, saveSources } from '@/book-source/store'
import type { BookSource } from '@/book-source/types'
import type { BookMeta } from '@/types'

function makeMeta(id: string): BookMeta {
  return {
    id,
    title: `书${id}`,
    author: '作者',
    source: 'txt',
    chapterCount: 1,
    chapterTitles: ['第一章'],
    chapterChars: [10],
    totalChars: 10,
    group: '',
    createdAt: Date.now(),
    progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
  }
}

function makeSource(id: string): BookSource {
  return {
    id,
    name: `源${id}`,
    baseUrl: `http://demo.example/${id}`,
    enabled: true,
    search: { url: '/search?q={{keyword}}', list: '.item', title: 'a@text', bookUrl: 'a@href' },
    chapters: { url: '{{bookUrl}}', list: '.list a', title: 'a@text', itemUrl: 'a@href' },
    content: { url: '{{chapterUrl}}', content: '.content@html' },
  }
}

function encode(data: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(data)).buffer
}

describe('数据备份往返', () => {
  beforeEach(async () => {
    localStorage.clear()
    for (const id of ['bk1', 'bk2', 'bk3']) {
      await db.deleteBook(id)
    }
  })

  it('导出包含书籍/章节/分组/统计/书源，恢复后数据完整', async () => {
    await db.addBook(makeMeta('bk1'))
    await db.saveChapters([{ id: 'bk1:0', bookId: 'bk1', index: 0, title: '第一章', text: '正文内容。' }])
    localStorage.setItem('qingyue:groups', JSON.stringify(['玄幻', '武侠']))
    localStorage.setItem('qingyue:stats', JSON.stringify({ byDate: { '2026-08-14': 120 } }))
    saveSources([makeSource('s1')])

    const data = await buildBackup()
    expect(data.app).toBe('qingyue')
    expect(data.books).toHaveLength(1)
    expect(data.chapters).toHaveLength(1)
    expect(data.groups).toEqual(['玄幻', '武侠'])
    expect(data.stats.byDate['2026-08-14']).toBe(120)
    expect(data.sources.map((s) => s.id)).toContain('s1')

    // 恢复：同 ID 书籍跳过（合并式），分组/统计/书源合并
    const result = await importBackupBuffer(encode(data))
    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(JSON.parse(localStorage.getItem('qingyue:groups')!)).toContain('玄幻')
    expect(loadSources().map((s) => s.id)).toContain('s1') // 含内置演示源
  })

  it('新书从备份恢复后正文可读', async () => {
    await db.addBook(makeMeta('bk2'))
    const data = await buildBackup()
    const imported = await importBackupBuffer(
      encode({ ...data, books: [makeMeta('bk3')], chapters: [{ id: 'bk3:0', bookId: 'bk3', index: 0, title: '第一章', text: '恢复的正文。' }] })
    )
    expect(imported.imported).toBe(1)
    const meta = await db.getBookMeta('bk3')
    expect(meta?.title).toBe('书bk3')
    const chapter = await db.getChapter('bk3', 0)
    expect(chapter?.text).toBe('恢复的正文。')
  })

  it('非法备份文件报错', async () => {
    await expect(importBackupBuffer(encode({ foo: 1 }))).rejects.toThrow(/不是有效的备份/)
    await expect(importBackupBuffer(encode({ app: 'qingyue', books: 'x' }))).rejects.toThrow(/不是有效的备份/)
  })
})
