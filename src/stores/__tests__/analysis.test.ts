import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as db from '@/db'
import { useBooksStore } from '@/stores/books'
import { useAnalysisStore } from '@/stores/analysis'
import type { BookMeta, Entity } from '@/types'

function makeMeta(id: string): BookMeta {
  return {
    id,
    title: '测试书',
    author: '作者',
    source: 'txt',
    chapterCount: 2,
    chapterTitles: ['第1章', '第2章'],
    chapterChars: [10, 10],
    totalChars: 20,
    group: '',
    createdAt: Date.now(),
    progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
    analysis: { status: 'done', progress: 1, entityCount: 2, ignoredNames: [], updatedAt: Date.now() },
  }
}

function makeEntity(id: string, bookId: string, name: string, over: Partial<Entity> = {}): Entity {
  return {
    id,
    bookId,
    name,
    type: 'person',
    aliases: [],
    chapters: [0],
    count: 3,
    samples: ['例句一'],
    note: '',
    custom: false,
    locked: false,
    ...over,
  }
}

describe('analysis store 实体操作', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('addCustomEntity 创建手动实体（custom + locked，不受自动分析覆盖）', async () => {
    const meta = makeMeta('a1')
    await db.addBook(meta)
    useBooksStore().books = [meta]
    const analysis = useAnalysisStore()

    const e = await analysis.addCustomEntity('a1', '神秘人', 'person')
    expect(e.custom).toBe(true)
    expect(e.locked).toBe(true)
    const saved = await db.getEntity(e.id)
    expect(saved?.name).toBe('神秘人')
    expect(saved?.type).toBe('person')
  })

  it('updateEntity 改名后旧名与新名都进入忽略列表', async () => {
    const meta = makeMeta('a2')
    await db.addBook(meta)
    useBooksStore().books = [meta]
    const analysis = useAnalysisStore()
    const e = makeEntity('e1', 'a2', '旧名')
    await db.putEntity(e)

    await analysis.updateEntity({ ...e, name: '新名', locked: true }, { renamedFrom: '旧名' })

    const saved = await db.getEntity('e1')
    expect(saved?.name).toBe('新名')
    expect(saved?.locked).toBe(true)
    const after = await db.getBookMeta('a2')
    expect(after?.analysis?.ignoredNames).toContain('旧名')
    expect(after?.analysis?.ignoredNames).toContain('新名')
  })

  it('deleteEntity 删除实体，名字进忽略列表，并清理索引与关系引用', async () => {
    const meta = makeMeta('a3')
    await db.addBook(meta)
    useBooksStore().books = [meta]
    const analysis = useAnalysisStore()
    const a = makeEntity('pa', 'a3', '甲')
    const b = makeEntity('pb', 'a3', '乙')
    await db.putEntities([a, b])
    await db.saveChapterIndexes([
      { id: 'a3:0', bookId: 'a3', index: 0, entityCounts: { pa: 2, pb: 1 }, topWords: [], summary: 's', keySentences: [] },
    ])
    await db.saveRelations([{ id: 'r1', bookId: 'a3', a: 'pa', b: 'pb', weight: 3 }])

    await analysis.deleteEntity(a)

    expect(await db.getEntity('pa')).toBeUndefined()
    const after = await db.getBookMeta('a3')
    expect(after?.analysis?.ignoredNames).toContain('甲')
    const idxs = await db.listChapterIndexes('a3')
    expect(idxs[0].entityCounts).toEqual({ pb: 1 })
    expect(await db.listRelations('a3')).toHaveLength(0)
  })

  it('mergeEntities 合并别名/章节/次数/例句，改写引用且无自环残留', async () => {
    const meta = makeMeta('a4')
    await db.addBook(meta)
    useBooksStore().books = [meta]
    const analysis = useAnalysisStore()
    const base = makeEntity('base', 'a4', '本名', { aliases: ['旧别名'], samples: ['句子1'], sampleChapters: [0] })
    const target = makeEntity('tgt', 'a4', '外号', {
      aliases: ['小号'],
      chapters: [1],
      count: 5,
      samples: ['句子2'],
      sampleChapters: [1],
    })
    await db.putEntities([base, target])
    await db.saveChapterIndexes([
      { id: 'a4:0', bookId: 'a4', index: 0, entityCounts: { base: 2 }, topWords: [], summary: 's', keySentences: [] },
      { id: 'a4:1', bookId: 'a4', index: 1, entityCounts: { tgt: 3 }, topWords: [], summary: 's', keySentences: [] },
    ])
    await db.saveRelations([{ id: 'r1', bookId: 'a4', a: 'tgt', b: 'base', weight: 4 }])

    await analysis.mergeEntities(base, target)

    const saved = await db.getEntity('base')
    expect(saved?.aliases).toEqual(expect.arrayContaining(['外号', '小号']))
    expect(saved?.chapters).toEqual([0, 1])
    expect(saved?.count).toBe(8)
    expect(saved?.samples).toContain('句子2')
    expect(saved?.sampleChapters).toEqual([0, 1])
    expect(await db.getEntity('tgt')).toBeUndefined()
    // 引用改写：target 计数并入 base；tgt↔base 关系改写成自环后被过滤
    const idxs = await db.listChapterIndexes('a4')
    expect(idxs.find((i) => i.index === 0)?.entityCounts).toEqual({ base: 2 })
    expect(idxs.find((i) => i.index === 1)?.entityCounts).toEqual({ base: 3 })
    expect(await db.listRelations('a4')).toHaveLength(0)
    const after = await db.getBookMeta('a4')
    expect(after?.analysis?.ignoredNames).toContain('外号')
  })
})
