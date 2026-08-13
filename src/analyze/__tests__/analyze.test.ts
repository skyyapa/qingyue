import { describe, expect, it } from 'vitest'
import * as db from '@/db'
import { analyzeBook } from '@/analyze/index'
import type { BookMeta } from '@/types'

/** 迷你书：林夜/苏晚 每章多段同段共现（6 章保证 PMI/共现权重稳定超过阈值，应生成关系） */
const PARAS = [
  '林夜对苏晚说：「这次一定要找到落星谷的入口。」苏晚点了点头。',
  '林夜看着苏晚，缓缓说道：「你的剑还不够快。」苏晚笑了笑。',
  '林夜掏出储物袋，拿出星辉石，苏晚站在旁边看着。',
  '林夜对苏晚说：「该来的总会来。」苏晚点了点头。',
]
const CHAPTERS = Array.from({ length: 6 }, (_, i) => `第${i + 1}章\n\n${PARAS.join('\n\n')}`)

function makeBook(id: string): BookMeta {
  return {
    id,
    title: '测试书',
    author: '作者',
    source: 'txt',
    chapterCount: CHAPTERS.length,
    chapterTitles: CHAPTERS.map((_, i) => `第${i + 1}章`),
    chapterChars: CHAPTERS.map((c) => c.length),
    totalChars: CHAPTERS.reduce((a, c) => a + c.length, 0),
    group: '',
    createdAt: Date.now(),
    progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
  }
}

describe('analyzeBook 分析管线', () => {
  it('识别实体并生成共现关系', async () => {
    await db.addBook(makeBook('b1'))
    await db.saveChapters(CHAPTERS.map((text, i) => ({ id: `b1:${i}`, bookId: 'b1', index: i, title: `第${i + 1}章`, text })))
    await analyzeBook('b1', { onProgress: () => {} })

    const entities = await db.listEntities('b1')
    const names = entities.map((e) => e.name)
    expect(names).toContain('林夜')
    expect(names).toContain('苏晚')

    const relations = await db.listRelations('b1')
    expect(relations.length).toBeGreaterThanOrEqual(1)
    const meta = await db.getBookMeta('b1')
    expect(meta?.analysis?.status).toBe('done')
    expect(meta?.analysis?.entityCount).toBeGreaterThanOrEqual(3)
  })

  it('重新分析后旧关系不残留（幽灵关系修复）', async () => {
    await db.addBook(makeBook('b2'))
    await db.saveChapters(CHAPTERS.map((text, i) => ({ id: `b2:${i}`, bookId: 'b2', index: i, title: `第${i + 1}章`, text })))
    await analyzeBook('b2', { onProgress: () => {} })
    expect((await db.listRelations('b2')).length).toBeGreaterThanOrEqual(1)

    // 模拟用户删除所有实体（全部加入忽略列表）后重新分析
    const meta = await db.getBookMeta('b2')
    const entities = await db.listEntities('b2')
    await db.updateBookAnalysis('b2', {
      ...meta!.analysis!,
      ignoredNames: entities.map((e) => e.name),
    })
    await analyzeBook('b2', { onProgress: () => {} })

    // 关系应被整体替换为空，而非残留旧关系
    expect(await db.listRelations('b2')).toHaveLength(0)
    // 章节索引同理不应引用被忽略实体
    const indexes = await db.listChapterIndexes('b2')
    for (const idx of indexes) {
      expect(Object.keys(idx.entityCounts)).toHaveLength(0)
    }
  })
})
