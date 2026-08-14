import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '@/db'
import { buildTaskMessages, runAITask, type KnowledgeSnapshot } from '@/ai/assistant'
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
  relations: [{ id: 'r1', bookId: 'b', a: 'e1', b: 'e2', weight: 4 } as Relation],
  chapterCount: 3,
  chapterTitles: ['第1章', '第2章', '第3章'],
  chapterTexts: ['第一章正文。林夜出现。', '第二章正文。', '第三章正文。'],
}

describe('buildTaskMessages 上下文组装', () => {
  it('who：携带实体信息与例句', () => {
    const msgs = buildTaskMessages(snapshot, 'who', { entityId: 'e1' })
    expect(msgs[0].content).toContain('测试书')
    expect(msgs[1].content).toContain('林夜')
    expect(msgs[1].content).toContain('常共现')
    expect(msgs[1].content).toContain('例句')
  })

  it('recap：只取当前章之前的最近章节', () => {
    const msgs = buildTaskMessages(snapshot, 'recap', { chapterIndex: 2 })
    expect(msgs[1].content).toContain('第1章')
    expect(msgs[1].content).toContain('第2章')
    expect(msgs[1].content).not.toContain('第3章')
    expect(msgs[1].content).toContain('当前读到第 3 章')
  })

  it('explain：携带选中文字与当前章上下文', () => {
    const msgs = buildTaskMessages(snapshot, 'explain', { chapterIndex: 0, text: '这是什么意思' })
    expect(msgs[1].content).toContain('这是什么意思')
    expect(msgs[1].content).toContain('登场：林夜')
    expect(msgs[1].content).toContain('林夜对苏晚说')
  })

  it('timeline：按章节收集事件', () => {
    const msgs = buildTaskMessages(snapshot, 'timeline', {})
    expect(msgs[1].content).toContain('第1章：登场：林夜｜林夜对苏晚说')
    expect(msgs[1].content).toContain('第2章')
  })

  it('ask：自由提问携带当前章摘要', () => {
    const msgs = buildTaskMessages(snapshot, 'ask', { chapterIndex: 1, text: '苏晚的剑法？' })
    expect(msgs[1].content).toContain('苏晚的剑法？')
    expect(msgs[1].content).toContain('林夜与苏晚同行')
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
