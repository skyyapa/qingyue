import { beforeEach, describe, expect, it } from 'vitest'
import * as db from '@/db'
import { buildBookExport, exportBookFile, importBookBuffer, isBookExport } from '@/utils/export'
import type { BookMeta } from '@/types'

function makeMeta(id: string): BookMeta {
  return {
    id,
    title: `书${id}`,
    author: '作者',
    source: 'txt',
    chapterCount: 2,
    chapterTitles: ['第一章', '第二章'],
    chapterChars: [10, 10],
    totalChars: 20,
    group: '',
    createdAt: Date.now(),
    progress: { chapterIndex: 1, scrollRatio: 0.5, updatedAt: Date.now() },
  }
}

/** 造一本带知识库的书 */
async function seedBook(id: string): Promise<void> {
  await db.addBook(makeMeta(id))
  await db.saveChapters([
    { id: `${id}:0`, bookId: id, index: 0, title: '第一章', text: '正文一。' },
    { id: `${id}:1`, bookId: id, index: 1, title: '第二章', text: '正文二。' },
  ])
  await db.putEntities([
    {
      id: `${id}-e1`,
      bookId: id,
      name: '林夜',
      type: 'person',
      aliases: [],
      chapters: [0],
      count: 3,
      samples: ['例句'],
      note: '',
      custom: false,
      locked: false,
    },
  ])
  await db.saveChapterIndexes([
    { id: `${id}:0`, bookId: id, index: 0, entityCounts: { [`${id}-e1`]: 2 }, topWords: ['林夜'], summary: '登场：林夜', keySentences: [] },
  ])
  await db.saveRelations([{ id: `${id}:r1`, bookId: id, a: `${id}-e1`, b: `${id}-e1`, weight: 1 }])
}

describe('单书导出/导入', () => {
  beforeEach(async () => {
    for (const id of ['ex1', 'ex2', 'ex3']) {
      await db.deleteBook(id)
    }
  })

  it('导出包含正文/进度/知识库，文件可下载', async () => {
    await seedBook('ex1')
    const data = await buildBookExport('ex1')
    expect(data).not.toBeNull()
    expect(data!.app).toBe('qingyue-book')
    expect(data!.chapters).toHaveLength(2)
    expect(data!.entities).toHaveLength(1)
    expect(data!.chapterIndexes).toHaveLength(1)
    expect(data!.relations).toHaveLength(1)
    expect(data!.meta.progress.chapterIndex).toBe(1) // 进度保留
    const file = await exportBookFile('ex1')
    expect(file?.filename).toBe('书ex1.qingyue.json')
    expect(isBookExport(JSON.parse(await file!.blob.text()))).toBe(true)
    expect(await buildBookExport('不存在')).toBeNull()
  })

  it('导入单书文件：新书完整恢复，同 ID 跳过', async () => {
    await seedBook('ex2')
    const data = await buildBookExport('ex2')
    const buffer = new TextEncoder().encode(JSON.stringify(data)).buffer

    // 导入到「另一个设备」（先删掉原书模拟）
    await db.deleteBook('ex2')
    const first = await importBookBuffer(buffer)
    expect(first.imported).toBe(1)
    expect(first.meta?.title).toBe('书ex2')
    // 正文/知识库/进度齐全
    expect(await db.getChapter('ex2', 1)).toBeDefined()
    expect(await db.listEntities('ex2')).toHaveLength(1)
    expect(await db.listChapterIndexes('ex2')).toHaveLength(1)
    expect((await db.getBookMeta('ex2'))?.progress.chapterIndex).toBe(1)

    // 再次导入（书已存在）→ 跳过
    const again = await importBookBuffer(buffer)
    expect(again.imported).toBe(0)
    expect(again.skipped).toBe(1)
  })

  it('非法单书文件报错', async () => {
    await expect(importBookBuffer(new TextEncoder().encode('{bad json').buffer)).rejects.toThrow(/JSON/)
    await expect(importBookBuffer(new TextEncoder().encode('{"foo":1}').buffer)).rejects.toThrow(/单书/)
    // 全量备份文件不是单书格式
    await expect(importBookBuffer(new TextEncoder().encode('{"app":"qingyue","books":[]}').buffer)).rejects.toThrow(/单书/)
  })
})
