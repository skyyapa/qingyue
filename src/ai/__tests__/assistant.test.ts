import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '@/db'
import { buildTaskMessages, callWithModelFallback, findSnippet, loadKnowledge, pickAnchor, planChapterLoads, runAITask, taskTier, type KnowledgeSnapshot } from '@/ai/assistant'
import { defaultProviderConfig } from '@/ai/presets'
import type { BookMeta, ChapterIndex, Entity, Relation } from '@/types'

function makeMeta(id: string): BookMeta {
  return {
    id,
    title: '测试书',
    author: '作者',
    source: 'txt',
    chapterCount: 3,
    chapterTitles: ['第1章', '第2章', '第3章'],
    chapterChars: [10, 10, 10],
    totalChars: 30,
    group: '',
    createdAt: Date.now(),
    progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
  }
}

function makeEntity(id: string, name: string, type: Entity['type']): Entity {
  return { id, bookId: 'b', name, type, aliases: [], chapters: [0], count: 5, samples: ['例句'], note: '', custom: false, locked: false }
}

function makeIndex(n: number, summary: string, events: string[]): ChapterIndex {
  return { id: `b:${n}`, bookId: 'b', index: n, entityCounts: { e1: 1 }, topWords: [], summary, keySentences: [], events }
}

const snapshot: KnowledgeSnapshot = {
  bookTitle: '测试书',
  entities: [makeEntity('e1', '林夜', 'person'), makeEntity('e2', '落星谷', 'place')],
  indexes: [makeIndex(0, '登场：林夜', ['林夜对苏晚说']), makeIndex(1, '登场：林夜、苏晚', ['林夜与苏晚同行']), makeIndex(2, '登场：苏晚', [])],
  relations: [{ id: 'r1', bookId: 'b', a: 'e1', b: 'e2', weight: 4, chapterWeights: [4] } as Relation],
  chapterCount: 3,
  chapterTitles: ['第1章', '第2章', '第3章'],
  readUpTo: 2,
  staleData: false,
}

/** 按需加载的章节正文（测试辅助） */
const texts = new Map<number, string>([
  [0, '第一章正文。林夜出现。'],
  [1, '第二章正文。'],
  [2, '第三章正文。'],
])

describe('buildTaskMessages 上下文组装', () => {
  it('who：携带实体信息与例句', () => {
    const msgs = buildTaskMessages(snapshot, 'who', { entityId: 'e1' }, texts)
    expect(msgs[0].content).toContain('测试书')
    expect(msgs[1].content).toContain('林夜')
    expect(msgs[1].content).toContain('常共现')
    expect(msgs[1].content).toContain('例句')
  })

  it('recap：只取当前章之前的最近章节', () => {
    const msgs = buildTaskMessages(snapshot, 'recap', { chapterIndex: 2 }, texts)
    expect(msgs[1].content).toContain('第1章')
    expect(msgs[1].content).toContain('第2章')
    expect(msgs[1].content).not.toContain('第3章')
    expect(msgs[1].content).toContain('当前读到第 3 章')
  })

  it('explain：携带选中文字与当前章上下文', () => {
    const msgs = buildTaskMessages(snapshot, 'explain', { chapterIndex: 0, text: '这是什么意思' }, texts)
    expect(msgs[1].content).toContain('这是什么意思')
    expect(msgs[1].content).toContain('登场：林夜')
    expect(msgs[1].content).toContain('林夜对苏晚说')
  })

  it('timeline：按章节收集事件', () => {
    const msgs = buildTaskMessages(snapshot, 'timeline', {}, texts)
    expect(msgs[1].content).toContain('第1章：登场：林夜｜林夜对苏晚说')
    expect(msgs[1].content).toContain('第2章')
  })

  it('ask：自由提问携带当前章摘要', () => {
    const msgs = buildTaskMessages(snapshot, 'ask', { chapterIndex: 1, text: '苏晚的剑法？' }, texts)
    expect(msgs[1].content).toContain('苏晚的剑法？')
    expect(msgs[1].content).toContain('林夜与苏晚同行')
  })

  it('防剧透：system 提示只能使用已读章节，各任务携带当前进度', () => {
    for (const task of ['who', 'recap', 'explain', 'relation', 'world', 'timeline', 'foreshadow', 'summarize', 'ask'] as const) {
      const msgs = buildTaskMessages({ ...snapshot, readUpTo: 1 }, task, { chapterIndex: 1 }, texts)
      expect(msgs[0].content).toContain('不剧透')
      expect(msgs[0].content).toContain('第 1 至第 2 章')
      expect(msgs[0].content).toContain('未读章节')
      if (task !== 'who' && task !== 'relation' && task !== 'summarize') {
        expect(msgs[1].content).toContain('当前读到第 2 章')
      }
    }
  })

  it('who：携带相关章节片段（snippet）', () => {
    const msgs = buildTaskMessages(snapshot, 'who', { entityId: 'e1', chapterIndex: 0 }, texts)
    expect(msgs[1].content).toContain('第1章片段')
    expect(msgs[1].content).toContain('林夜出现')
  })

  it('foreshadow：伏笔回顾携带关键句与身份不明实体', () => {
    const msgs = buildTaskMessages(snapshot, 'foreshadow', { chapterIndex: 2 }, texts)
    expect(msgs[1].content).toContain('伏笔')
    expect(msgs[1].content).toContain('未解之谜')
    expect(msgs[0].content).toContain('不剧透')
  })

  it('summarize：章节摘要携带当前章正文', () => {
    const msgs = buildTaskMessages(snapshot, 'summarize', { chapterIndex: 0 }, texts)
    expect(msgs[1].content).toContain('概括本章情节')
    expect(msgs[1].content).toContain('林夜出现')
  })
})

describe('loadKnowledge 防剧透截断', () => {
  beforeEach(async () => {
    await db.deleteBook('sp') // 模块级 dbPromise 使库跨用例共享，先清理
    await db.addBook(makeMeta('sp'))
    await db.saveChapters([
      { id: 'sp:0', bookId: 'sp', index: 0, title: '第1章', text: '林夜登场。' },
      { id: 'sp:1', bookId: 'sp', index: 1, title: '第2章', text: '苏晚出现。' },
      { id: 'sp:2', bookId: 'sp', index: 2, title: '第3章', text: '林夜身世揭晓！' },
    ])
    await db.putEntities([
      makeEntity('pe1', '林夜', 'person'),
      { ...makeEntity('pe2', '苏晚', 'person'), chapters: [1], samples: ['第二章例句'], sampleChapters: [1] },
    ].map((e) => ({ ...e, bookId: 'sp' })))
    await db.saveChapterIndexes(
      [makeIndex(0, '登场：林夜', ['林夜登场']), makeIndex(1, '登场：苏晚', []), makeIndex(2, '登场：林夜', ['林夜身世揭晓'])].map((x) => ({
        ...x,
        bookId: 'sp',
        id: `sp:${x.index}`,
        entityCounts: { pe1: 2 },
      }))
    )
    await db.saveRelations([{ id: 'sp:r1', bookId: 'sp', a: 'pe1', b: 'pe2', weight: 3 } as Relation])
  })

  it('读到第 1 章时：未读章节索引/标题全部剔除；未来实体彻底移除，实体计数按已读重建', async () => {
    const k = await loadKnowledge('sp', { upTo: 0 })
    expect(k.readUpTo).toBe(0)
    expect(k.indexes.map((i) => i.index)).toEqual([0])
    expect(k.chapterTitles[2]).toBe('') // 未读标题为空（防剧透）
    // 第 2 章才出现的苏晚：已读范围内无出现 → 从 entities 彻底剔除（防未来实体名泄漏）
    expect(k.entities.find((e) => e.name === '苏晚')).toBeUndefined()
    // 苏晚被剔除 → 关系也被过滤
    expect(k.relations).toHaveLength(0)
    // 林夜计数按已读章节 entityCounts 重建
    const lin = k.entities.find((e) => e.name === '林夜')!
    expect(lin.chapters).toEqual([0])
    expect(lin.samples).toEqual([]) // 无 sampleChapters 的旧例句严格舍弃
    expect(lin.count).toBe(2) // 第 1 章 entityCounts 计数（pe1: 2）
    // 正文不预加载：loadKnowledge 无 chapterTexts；由 planChapterLoads 按需决定
    expect((k as unknown as Record<string, unknown>).chapterTexts).toBeUndefined()
    expect(planChapterLoads(k, 'who', { entityId: lin.id })).toEqual([0])
  })

  it('读到第 2 章时：第 3 章数据仍不可见', async () => {
    const k = await loadKnowledge('sp', { upTo: 1 })
    expect(k.indexes.map((i) => i.index)).toEqual([0, 1])
    expect(k.chapterTitles[2]).toBe('')
    const lin = k.entities.find((e) => e.name === '林夜')!
    expect(lin.samples).toEqual([]) // 无 sampleChapters 的旧例句严格舍弃 // 「林夜身世揭晓」所在第 3 章未读
  })

  it('关系权重按已读章节重建（chapterWeights 求和）', async () => {
    // 第 1 章共现 2、第 3 章共现 10 → 读到第 1 章权重应只有 2（覆盖 beforeEach 的同 id 关系）
    const r: Relation = {
      id: 'sp:r1',
      bookId: 'sp',
      a: 'pe1',
      b: 'pe2',
      weight: 12,
      chapterWeights: [2, 0, 10],
    }
    await db.saveRelations([r])
    const k1 = await loadKnowledge('sp', { upTo: 0 })
    // 苏晚（pe2）第 2 章才出现 → 已读第 1 章无出现 → 关系被剔除
    expect(k1.relations).toHaveLength(0)
    // 苏晚在第 1 章出现后（upTo=1），关系权重 = 已读章求和 2
    const k2 = await loadKnowledge('sp', { upTo: 1 })
    expect(k2.relations).toHaveLength(1)
    expect(k2.relations[0].weight).toBe(2) // 第 3 章的 10 不计入
    // 林夜旧例句（无 sampleChapters）同样标记 staleData，提示重新分析
    const k3 = await loadKnowledge('sp', { upTo: 2 })
    expect(k3.relations[0].weight).toBe(12)
  })

  it('严格防剧透：旧关系（无 chapterWeights）直接剔除并标记 staleData', async () => {
    // beforeEach 保存的是无 chapterWeights 的旧关系
    const k = await loadKnowledge('sp', { upTo: 1 })
    expect(k.relations).toHaveLength(0) // 旧关系不传给 AI（不再降级截断）
    expect(k.staleData).toBe(true) // 提示重新分析
  })

  it('严格防剧透：旧实体无 sampleChapters 时例句舍弃', async () => {
    // 林夜无 sampleChapters（makeEntity 默认）→ samples 应被舍弃
    const k = await loadKnowledge('sp', { upTo: 1 })
    const lin = k.entities.find((e) => e.name === '林夜')!
    expect(lin.samples).toEqual([]) // 无出处的旧例句不泄漏
    // 苏晚有 sampleChapters → 已读内的例句保留
    const suwan = k.entities.find((e) => e.name === '苏晚')!
    expect(suwan.samples).toEqual(['第二章例句'])
  })

  it('稀疏章节索引：在线书只缓存部分章时按 index 查找', async () => {
    // 新书只存第 0、2 章索引（模拟在线书稀疏缓存）
    await db.addBook(makeMeta('sparse'))
    await db.saveChapterIndexes(
      [makeIndex(0, '登场：林夜', ['林夜登场']), makeIndex(2, '登场：林夜', ['林夜身世揭晓'])].map((x) => ({
        ...x,
        bookId: 'sparse',
        id: `sparse:${x.index}`,
        entityCounts: { pe1: 2 },
      }))
    )
    const k = await loadKnowledge('sparse', { upTo: 2 })
    expect(k.indexes.map((i) => i.index)).toEqual([0, 2]) // 稀疏
    const msgs = buildTaskMessages(k, 'explain', { chapterIndex: 2, text: '揭晓' }, texts)
    expect(msgs[1].content).toContain('林夜身世揭晓') // 命中第 2 章索引（非数组下标 2 处）
  })

  it('sampleChapters 比 samples 短时：无出处的多余例句被丢弃（不默认第 0 章）', async () => {
    // 实体 2 个例句、sampleChapters 只有 1 个 → 第 2 个例句无出处（本应来自未读章节）
    await db.putEntity({
      ...makeEntity('pe9', '路人甲', 'person'),
      bookId: 'sp',
      chapters: [1],
      samples: ['第二章例句A', '未读章节的例句'],
      sampleChapters: [1],
    })
    // 读到第 1 章：路人甲只在第 2 章出现 → 被剔除（防未来实体泄漏）
    const k = await loadKnowledge('sp', { upTo: 0 })
    expect(k.entities.find((e) => e.name === '路人甲')).toBeUndefined()
    // 读到第 2 章：第 1 个例句（第 2 章，已读）保留；无出处的第 2 个例句被丢弃
    const k2 = await loadKnowledge('sp', { upTo: 1 })
    const ren = k2.entities.find((e) => e.name === '路人甲')!
    expect(ren.samples).toEqual(['第二章例句A'])
  })

  it('findSnippet：锚点定位截取而非章节开头', () => {
    const text = '开头无关内容。'.repeat(30) + '林夜在此处出现，后续内容。'
    const snippet = findSnippet(text, '林夜在此处出现')
    expect(snippet).toContain('林夜在此处出现')
    expect(snippet.startsWith('开头无关内容。')).toBe(false) // 不是从章节开头截
    expect(snippet.startsWith('…')).toBe(true)
    // 锚点未匹配 → 返回空串（不硬塞章节开头）
    expect(findSnippet('无匹配内容', '不存在的词')).toBe('')
  })

  it('pickAnchor：从自由提问匹配最长实体名作为检索锚点', () => {
    const entities = [
      makeEntity('a', '林凡', 'person'),
      makeEntity('b', '灵剑宗', 'org'),
      makeEntity('c', '落星谷', 'place'),
    ]
    expect(pickAnchor('为什么林凡会突然离开灵剑宗？', entities)).toBe('灵剑宗')
    expect(pickAnchor('林凡去了哪里', entities)).toBe('林凡')
    expect(pickAnchor('今天天气不错', entities)).toBeNull() // 无实体 → 不硬塞片段
  })

  it('taskTier 多模型策略：摘要/简单/复杂任务分档', () => {
    expect(taskTier('summarize')).toBe('summary')
    expect(taskTier('daily')).toBe('summary')
    expect(taskTier('who')).toBe('easy')
    expect(taskTier('ask')).toBe('easy')
    expect(taskTier('recap')).toBe('easy')
    expect(taskTier('foreshadow')).toBe('easy')
    expect(taskTier('explain')).toBe('main')
    expect(taskTier('relation')).toBe('main')
    expect(taskTier('timeline')).toBe('main')
    expect(taskTier('personTimeline')).toBe('main')
  })

  it('daily：结构化输出（主要事件/新增人物/未解决伏笔）+ 今日首次登场人物', () => {
    const todaySnap: KnowledgeSnapshot = {
      ...snapshot,
      entities: [makeEntity('e1', '林夜', 'person'), makeEntity('e2', '苏晚', 'person')],
      indexes: [makeIndex(0, '登场：林夜', ['林夜对苏晚说'])],
    }
    const msgs = buildTaskMessages(todaySnap, 'daily', { chapterIndex: 0, todayChapters: [0] }, texts)
    expect(msgs[1].content).toContain('主要事件')
    expect(msgs[1].content).toContain('新增人物')
    expect(msgs[1].content).toContain('未解决伏笔')
    expect(msgs[1].content).toContain('林夜') // 今日首次登场
  })

  it('personTimeline：按出场章节梳理经历', () => {
    const msgs = buildTaskMessages(snapshot, 'personTimeline', { entityId: 'e1', chapterIndex: 2 }, texts)
    expect(msgs[1].content).toContain('经历')
    expect(msgs[1].content).toContain('第1章')
    expect(msgs[1].content).toContain('首次登场')
  })

  it('多模型策略：摘要任务使用 summaryModel，简单任务使用 easyModel', async () => {
    await db.addBook(makeMeta('tm'))
    await db.saveChapters([{ id: 'tm:0', bookId: 'tm', index: 0, title: '第1章', text: '林夜登场。' }])
    const cfg = defaultProviderConfig('deepseek')
    cfg.apiKey = 'sk'
    cfg.model = 'main-model'
    cfg.easyModel = 'cheap-easy'
    cfg.summaryModel = 'cheap-summary'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }))
    await runAITask(cfg, 'tm', 'summarize', { chapterIndex: 0 })
    let body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
    expect(body.model).toBe('cheap-summary')
    await runAITask(cfg, 'tm', 'who', { chapterIndex: 0 })
    body = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))
    expect(body.model).toBe('cheap-easy')
    await runAITask(cfg, 'tm', 'explain', { chapterIndex: 0, text: 'x' })
    body = JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body))
    expect(body.model).toBe('main-model')
    vi.unstubAllGlobals()
  })
})

describe('runAITask 端到端', () => {
  beforeEach(async () => {
    await db.addBook(makeMeta('b'))
    await db.saveChapters([
      { id: 'b:0', bookId: 'b', index: 0, title: '第1章', text: '林夜对苏晚说。' },
      { id: 'b:1', bookId: 'b', index: 1, title: '第2章', text: '苏晚点头。' },
    ])
    await db.putEntities([makeEntity('e1', '林夜', 'person')])
    await db.saveChapterIndexes([makeIndex(0, '登场：林夜', ['林夜对苏晚说'])])
  })

  it('知识库上下文 + mock 请求返回回答', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '林夜是主角。' } }] }),
    }))
    const cfg = defaultProviderConfig('deepseek')
    cfg.apiKey = 'sk-test'
    const reply = await runAITask(cfg, 'b', 'who', { entityId: 'e1' })
    expect(reply).toBe('林夜是主角。')
    // 请求体包含书名（system）与实体信息（user）
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
    expect(body.messages[0].content).toContain('测试书')
    expect(body.messages[1].content).toContain('林夜')
    vi.unstubAllGlobals()
  })
})

describe('callWithModelFallback 档位失败回退主模型', () => {
  it('档位模型失败 → 用主模型重试一次并返回结果', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { model: string }
        calls.push(body.model)
        if (body.model === 'bad-tier') throw new Error('model not found')
        return { ok: true, json: async () => ({ choices: [{ message: { content: '来自主模型' } }] }) } as Response
      })
    )
    const cfg = defaultProviderConfig('deepseek')
    cfg.apiKey = 'k'
    const effective = { ...cfg, model: 'bad-tier' }
    const reply = await callWithModelFallback(cfg, effective, [{ role: 'user', content: 'hi' }])
    expect(reply).toBe('来自主模型')
    expect(calls).toEqual(['bad-tier', cfg.model]) // 先档位后主模型
    vi.unstubAllGlobals()
  })

  it('主模型自身失败 → 原样抛出（不重复调用）', async () => {
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n++
        throw new Error('boom')
      })
    )
    const cfg = defaultProviderConfig('deepseek')
    cfg.apiKey = 'k'
    await expect(callWithModelFallback(cfg, cfg, [{ role: 'user', content: 'hi' }])).rejects.toThrow(/无法连接 AI 服务|boom/)
    expect(n).toBe(1) // 主模型失败不重复调用
    vi.unstubAllGlobals()
  })
})
