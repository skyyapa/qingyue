import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import * as db from '@/db'
import type { BookMeta, Chapter, Entity } from '@/types'

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

  it('putEntity 剥离 Vue reactive Proxy（避免 DataCloneError）', async () => {
    await db.addBook(makeMeta('p'))
    // 模拟从 AssistantPanel 的 ref 深层 reactive 数组拿到的实体：嵌套数组也是 Proxy
    const proxyEntity = reactive<Entity>({
      id: 'p1',
      bookId: 'p',
      name: '苏晚',
      type: 'person',
      aliases: ['苏姑娘'],
      chapters: [0, 2],
      count: 7,
      samples: ['苏晚笑着说'],
      sampleChapters: [0],
      note: '',
      custom: true,
      locked: true,
    })
    // 存入后读回：不应抛 DataCloneError，且数组字段完整
    await expect(db.putEntity(proxyEntity)).resolves.toBeUndefined()
    const back = await db.listEntities('p')
    expect(back).toHaveLength(1)
    expect(back[0].aliases).toEqual(['苏姑娘'])
    expect(back[0].chapters).toEqual([0, 2])
    expect(back[0].samples).toEqual(['苏晚笑着说'])
    // 读回的应是普通对象（非 Proxy）
    expect(Object.prototype.toString.call(back[0]).includes('Object')).toBe(true)
  })

  it('EPUB 内嵌字体存取与删除书连带清理', async () => {
    await db.addBook(makeMeta('h'))
    await db.saveBookFonts('h', [{ family: 'MyFont', dataUrl: 'data:font/ttf;base64,AAAA' }])
    const fonts = await db.getBookFonts('h')
    expect(fonts).toHaveLength(1)
    expect(fonts?.[0].family).toBe('MyFont')

    // 覆盖式保存（空数组 = 清除）
    await db.saveBookFonts('h', [])
    expect(await db.getBookFonts('h')).toEqual([])

    // 删除书连带清理字体
    await db.saveBookFonts('h', [{ family: 'X', dataUrl: 'data:font/ttf;base64,BBBB' }])
    await db.deleteBook('h')
    expect(await db.getBookFonts('h')).toBeUndefined()
  })

  it('replaceRelations 整体替换：旧关系不残留（幽灵关系修复）', async () => {
    await db.addBook(makeMeta('f'))
    // 先写入 3 条旧关系
    await db.saveRelations([
      { id: 'f:a:b', bookId: 'f', a: 'a', b: 'b', weight: 5 },
      { id: 'f:a:c', bookId: 'f', a: 'a', b: 'c', weight: 3 },
      { id: 'f:b:c', bookId: 'f', a: 'b', b: 'c', weight: 2 },
    ])
    // 整体替换为 1 条（模拟实体删除后重建）
    await db.replaceRelations('f', [{ id: 'f:a:b', bookId: 'f', a: 'a', b: 'b', weight: 7 }])
    const after = await db.listRelations('f')
    expect(after).toHaveLength(1)
    expect(after[0].a).toBe('a')
    expect(after[0].weight).toBe(7)

    // 替换为空数组 = 清空
    await db.replaceRelations('f', [])
    expect(await db.listRelations('f')).toHaveLength(0)

    // 其他书的关系不受影响
    await db.addBook(makeMeta('g'))
    await db.saveRelations([{ id: 'g:x:y', bookId: 'g', a: 'x', b: 'y', weight: 1 }])
    await db.replaceRelations('f', [])
    expect(await db.listRelations('g')).toHaveLength(1)
  })
})
