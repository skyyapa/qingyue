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

  it('提取「A 对 B 说」事件句并纳入章节摘要', async () => {
    await db.addBook(makeBook('b3'))
    await db.saveChapters(CHAPTERS.map((text, i) => ({ id: `b3:${i}`, bookId: 'b3', index: i, title: `第${i + 1}章`, text })))
    await analyzeBook('b3', { onProgress: () => {} })

    const indexes = await db.listChapterIndexes('b3')
    expect(indexes[0].events).toContain('林夜对苏晚说')
    expect(indexes[0].summary).toContain('登场：')
    expect(indexes[0].summary).toContain('事件：林夜对苏晚说')
  })

  it('重分析后不再出现的实体被清理（锁定实体保留）', async () => {
    await db.addBook(makeBook('b4'))
    await db.saveChapters(CHAPTERS.map((text, i) => ({ id: `b4:${i}`, bookId: 'b4', index: i, title: `第${i + 1}章`, text })))
    // 用户手动添加的锁定实体（名字从未出现在正文）
    await db.putEntity({
      id: 'locked-person',
      bookId: 'b4',
      name: '李四',
      type: 'person',
      aliases: [],
      chapters: [],
      count: 0,
      samples: [],
      note: '',
      custom: false,
      locked: true,
    })
    await analyzeBook('b4', { onProgress: () => {} })
    expect((await db.listEntities('b4')).map((e) => e.name)).toContain('林夜')

    // 全书正文改为不再出现「林夜」（文本需足够长，「苏晚」PMI 才越过 2.5 阈值，见踩坑 #30）
    const PARAS3 = ['苏晚站在落星谷外的山道上，静静看着远处连绵起伏的群山。', '苏晚缓缓说道：「风起了，该出发了。」']
    const CHAPTERS3 = Array.from({ length: 6 }, (_, i) => `第${i + 1}章\n\n${PARAS3.join('\n\n')}`)
    await db.saveChapters(CHAPTERS3.map((text, i) => ({ id: `b4:${i}`, bookId: 'b4', index: i, title: `第${i + 1}章`, text })))
    await analyzeBook('b4', { onProgress: () => {} })

    const names = (await db.listEntities('b4')).map((e) => e.name)
    expect(names).not.toContain('林夜')
    expect(names).toContain('苏晚')
    expect(names).toContain('李四') // 锁定实体不被清理
    // 章节索引引用的实体都必须存在（无残留引用）
    const indexes = await db.listChapterIndexes('b4')
    for (const idx of indexes) {
      for (const id of Object.keys(idx.entityCounts)) {
        expect(await db.getEntity(id)).toBeDefined()
      }
    }
  })

  it('重分析时已有实体的别名参与匹配（计数归入、不新建实体）', async () => {
    const PARAS2 = [
      '小夜对苏晚说：「今晚月色不错。」苏晚点了点头。',
      '林夜看着苏晚，缓缓说道：「你的剑还不够快。」',
      '林夜掏出储物袋，拿出星辉石，苏晚站在旁边看着。',
      '林夜对苏晚说：「该来的总会来。」苏晚点了点头。',
    ]
    // 「小夜」仅前两章出现（共 2 次 < minFreq，不会是候选词）
    const CHAPTERS2 = Array.from({ length: 6 }, (_, i) =>
      i < 2 ? `第${i + 1}章\n\n${PARAS2[0]}\n\n${PARAS2[2]}` : `第${i + 1}章\n\n${PARAS2[1]}\n\n${PARAS2[3]}`
    )
    await db.addBook(makeBook('b5'))
    await db.saveChapters(CHAPTERS2.map((text, i) => ({ id: `b5:${i}`, bookId: 'b5', index: i, title: `第${i + 1}章`, text })))
    await analyzeBook('b5', { onProgress: () => {} })
    expect((await db.listEntities('b5')).map((e) => e.name)).not.toContain('小夜')

    // 用户把「小夜」合并为「林夜」的别名
    const lin = (await db.listEntities('b5')).find((e) => e.name === '林夜')!
    const beforeCount = lin.count
    lin.aliases = ['小夜']
    await db.putEntity(lin)

    await analyzeBook('b5', { onProgress: () => {} })

    const after = await db.listEntities('b5')
    const names = after.map((e) => e.name)
    expect(names).not.toContain('小夜') // 别名命中不新建实体
    const linAfter = after.find((e) => e.name === '林夜')!
    expect(linAfter.count).toBe(beforeCount + 2) // 「小夜」的 2 次命中归入林夜
    expect(linAfter.aliases).toContain('小夜')
    // 章节索引计数与实体总数一致（别名命中正确归入林夜 id）
    const indexes = await db.listChapterIndexes('b5')
    const total = indexes.reduce((acc, idx) => acc + (idx.entityCounts[linAfter.id] ?? 0), 0)
    expect(total).toBe(linAfter.count)
  })

  it('在线书（web）可分析已缓存的章节，未缓存章节跳过', async () => {
    const meta = makeBook('bw')
    meta.source = 'web'
    meta.webInfo = {
      sourceId: 'demo',
      sourceName: '演示',
      bookUrl: 'http://demo.example/book',
      chapterUrls: CHAPTERS.map((_, i) => `http://demo.example/${i}`),
    }
    await db.addBook(meta)
    // 只缓存前 5 章（第 6 章未抓取）
    await db.saveChapters(
      CHAPTERS.slice(0, 5).map((text, i) => ({ id: `bw:${i}`, bookId: 'bw', index: i, title: `第${i + 1}章`, text }))
    )
    await analyzeBook('bw', { onProgress: () => {} })

    const entities = await db.listEntities('bw')
    const names = entities.map((e) => e.name)
    expect(names).toContain('林夜')
    expect(names).toContain('苏晚')
    const after = await db.getBookMeta('bw')
    expect(after?.analysis?.status).toBe('done')
    // 章节索引只覆盖已缓存章节
    const indexes = await db.listChapterIndexes('bw')
    expect(indexes).toHaveLength(5)
    expect(indexes.map((i) => i.index)).toEqual([0, 1, 2, 3, 4])
  })

  it('稀疏缓存（在线书只缓存 0/2/4 章）：实体章节/索引/chapterWeights 用真实章节号', async () => {
    const meta = makeBook('bs')
    meta.source = 'web'
    meta.webInfo = {
      sourceId: 'demo',
      sourceName: '演示',
      bookUrl: 'http://demo.example/book',
      chapterUrls: CHAPTERS.map((_, i) => `http://demo.example/${i}`),
    }
    await db.addBook(meta)
    // 只缓存第 0、2、4 章（稀疏）
    await db.saveChapters(
      [0, 2, 4].map((i) => ({ id: `bs:${i}`, bookId: 'bs', index: i, title: `第${i + 1}章`, text: CHAPTERS[i] }))
    )
    await analyzeBook('bs', { onProgress: () => {} })

    // 章节索引必须是真实章节号（而非数组下标 0/1/2）
    const indexes = await db.listChapterIndexes('bs')
    expect(indexes.map((x) => x.index)).toEqual([0, 2, 4])
    // 实体出现章节同样是真实章节号
    const lin = (await db.listEntities('bs')).find((e) => e.name === '林夜')!
    expect(lin.chapters).toEqual([0, 2, 4])
    // chapterWeights 下标对齐真实章节号（第 0/2/4 章有共现权重）
    const relations = await db.listRelations('bs')
    for (const r of relations) {
      expect(r.chapterWeights?.[0]).toBeGreaterThan(0)
      expect(r.chapterWeights?.[1] ?? 0).toBe(0) // 未缓存第 1 章无数据
      expect(r.chapterWeights?.[2]).toBeGreaterThan(0)
      expect(r.chapterWeights?.[4]).toBeGreaterThan(0)
    }
  })
})
