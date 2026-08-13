import { describe, expect, it } from 'vitest'
import * as db from '@/db'
import type { BookMeta, Chapter } from '@/types'

function makeMeta(id: string): BookMeta {
  return {
    id,
    title: `书${id}`,
    author: '作者',
    source: 'txt',
    chapterCount: 2,
    chapterTitles: ['第一章', '第二章'],
    chapterChars: [10, 20],
    totalChars: 30,
    group: '',
    createdAt: Date.now(),
    progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
  }
}

function makeChapter(bookId: string, index: number, text: string): Chapter {
  return { id: `${bookId}:${index}`, bookId, index, title: `第${index + 1}章`, text }
}

describe('IndexedDB 封装（fake-indexeddb）', () => {
  it('书籍增删查与排序', async () => {
    await db.addBook(makeMeta('a'))
    await db.addBook(makeMeta('b'))
    const list = await db.listBookMetas()
    expect(list).toHaveLength(2)
    // 新书在前
    expect(list[0].id).toBe('b')

    await db.deleteBook('a')
    const after = await db.listBookMetas()
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe('b')
  })

  it('章节保存与读取', async () => {
    await db.addBook(makeMeta('c'))
    await db.saveChapters([makeChapter('c', 0, '正文一'), makeChapter('c', 1, '正文二')])
    const ch0 = await db.getChapter('c', 0)
    expect(ch0?.text).toBe('正文一')
    const all = await db.listAllChapters()
    expect(all.filter((c) => c.bookId === 'c')).toHaveLength(2)
  })

  it('进度更新', async () => {
    await db.addBook(makeMeta('d'))
    await db.updateBookProgress('d', { chapterIndex: 1, scrollRatio: 0.5, updatedAt: 1 })
    const meta = await db.getBookMeta('d')
    expect(meta?.progress.chapterIndex).toBe(1)
    expect(meta?.progress.scrollRatio).toBe(0.5)
  })

  it('知识库实体/索引/关系存取', async () => {
    await db.addBook(makeMeta('e'))
    await db.putEntity({
      id: 'e1',
      bookId: 'e',
      name: '林夜',
      type: 'person',
      aliases: [],
      chapters: [0, 1],
      count: 10,
      samples: ['例句'],
      note: '',
      custom: false,
      locked: false,
    })
    const entities = await db.listEntities('e')
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe('林夜')

    await db.saveChapterIndexes([{ id: 'e:0', bookId: 'e', index: 0, entityCounts: { e1: 3 }, topWords: ['林夜'], summary: '登场：林夜', keySentences: [] }])
    await db.saveRelations([{ id: 'e:e1:e2', bookId: 'e', a: 'e1', b: 'e2', weight: 5 }])
    expect(await db.listChapterIndexes('e')).toHaveLength(1)
    expect(await db.listRelations('e')).toHaveLength(1)

    // 删除书连带清理
    await db.deleteBook('e')
    expect(await db.listEntities('e')).toHaveLength(0)
    expect(await db.listChapterIndexes('e')).toHaveLength(0)
    expect(await db.listRelations('e')).toHaveLength(0)
  })
})
