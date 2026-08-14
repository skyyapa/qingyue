/** AI 阅读助手：进度感知任务（这是谁/前情回顾/剧情解释/人物关系/世界观/事件时间线/
 *  伏笔回顾/章节摘要/自由提问）
 *  上下文从本地知识库组装，且**默认只使用已读章节（第 1～当前章）的数据**——
 *  防剧透：问「林凡是什么身份」不会被告知第 900 章的答案
 */
import * as db from '@/db'
import { chatCompletion, type ChatMessage } from './client'
import type { AIProviderConfig } from './presets'
import type { ChapterIndex, Entity, Relation } from '@/types'

export type AITask = 'who' | 'recap' | 'explain' | 'relation' | 'world' | 'timeline' | 'ask' | 'foreshadow' | 'summarize'

export interface AITaskParams {
  /** 选中的正文文字 */
  text?: string
  /** 目标实体 id（who/relation/world） */
  entityId?: string
  /** 当前章节号（防剧透边界与任务上下文） */
  chapterIndex?: number
}

export const AI_TASK_LABELS: Record<AITask, string> = {
  who: '这是谁',
  recap: '前情回顾',
  explain: '剧情解释',
  relation: '人物关系',
  world: '世界观解释',
  timeline: '事件时间线',
  foreshadow: '伏笔回顾',
  summarize: '章节摘要',
  ask: '自由提问',
}

/** 知识库快照（任务上下文数据源；readUpTo 之外的章节数据已被剔除） */
export interface KnowledgeSnapshot {
  bookTitle: string
  entities: Entity[]
  indexes: ChapterIndex[]
  relations: Relation[]
  chapterCount: number
  /** 已读章节标题（未读章节标题剔除，防剧透） */
  chapterTitles: string[]
  /** 已读章节正文（未读章节为空串；下标 = 章节号） */
  chapterTexts: string[]
  /** 防剧透边界：允许使用的最大章节号（含） */
  readUpTo: number
}

/** 读取知识库与已读章节（章节正文截断控制 token；未读章节数据剔除，防剧透） */
export async function loadKnowledge(
  bookId: string,
  opts: { upTo?: number; maxChapterText?: number } = {}
): Promise<KnowledgeSnapshot> {
  const { upTo, maxChapterText = 400 } = opts
  const meta = await db.getBookMeta(bookId)
  const [entities, indexes, relations, chapters] = await Promise.all([
    db.listEntities(bookId),
    db.listChapterIndexes(bookId),
    db.listRelations(bookId),
    db.listChapters(bookId),
  ])
  const chapterCount = meta?.chapterCount ?? chapters.length
  const readUpTo = upTo === undefined ? Math.max(0, chapterCount - 1) : Math.min(upTo, chapterCount - 1)

  // 实体：出现章节与例句只保留已读部分
  const readEntities = entities.map((e) => ({
    ...e,
    chapters: e.chapters.filter((c) => c <= readUpTo),
    samples: e.sampleChapters
      ? e.samples.filter((_, i) => (e.sampleChapters?.[i] ?? 0) <= readUpTo)
      : e.samples,
  }))

  // 关系：两端实体在已读章节仍有出现才保留
  const readIds = new Set(readEntities.filter((e) => e.chapters.length > 0).map((e) => e.id))
  const readRelations = relations.filter((r) => readIds.has(r.a) && readIds.has(r.b))

  // 章节索引 / 标题 / 正文：只保留已读
  const readIndexes = [...indexes].filter((idx) => idx.index <= readUpTo).sort((a, b) => a.index - b.index)
  const titles = (meta?.chapterTitles ?? []).map((t, i) => (i <= readUpTo ? t : ''))

  const cleanText = (text: string) =>
    text
      .replace(/\[\/?[biu]\]/g, '')
      .replace(/\[img:\d+\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const textByIndex = new Map(chapters.map((c) => [c.index, c.text]))
  const chapterTexts: string[] = []
  for (let i = 0; i < chapterCount; i++) {
    const raw = i <= readUpTo ? textByIndex.get(i) ?? '' : ''
    const clean = cleanText(raw)
    chapterTexts.push(clean.length > maxChapterText ? `${clean.slice(0, maxChapterText)}…` : clean)
  }

  return {
    bookTitle: meta?.title ?? '本书',
    entities: readEntities,
    indexes: readIndexes,
    relations: readRelations,
    chapterCount,
    chapterTitles: titles,
    chapterTexts,
    readUpTo,
  }
}

/** 截断列表到上限 */
function take<T>(list: T[], n: number): T[] {
  return list.slice(0, n)
}

/** 实体 → 上下文文本块（withSnippet 时附带相关章节片段） */
function entityBlock(k: KnowledgeSnapshot, id: string, withSnippet = false): string {
  const e = k.entities.find((x) => x.id === id)
  if (!e) return ''
  const co = k.relations
    .filter((r) => r.a === id || r.b === id)
    .map((r) => {
      const otherId = r.a === id ? r.b : r.a
      const other = k.entities.find((x) => x.id === otherId)
      return other ? `${other.name}（共现 ${r.weight} 次）` : ''
    })
    .filter(Boolean)
    .slice(0, 6)
  const related = k.indexes
    .filter((idx) => idx.entityCounts[id])
    .map((idx) => idx.events?.filter((ev) => ev.includes(e.name)).slice(0, 2) ?? [])
    .flat()
    .slice(0, 6)
  const lines = [
    `名称：${e.name}`,
    `类型：${e.type}`,
    e.aliases.length ? `别名：${e.aliases.join('、')}` : '',
    `出现章节：${e.chapters.length} 章 / ${e.count} 次`,
    e.samples[0] ? `例句：「${e.samples[0]}」` : '',
    co.length ? `常共现：${co.join('、')}` : '',
    related.length ? `相关事件：${related.join('；')}` : '',
  ].filter(Boolean)
  if (withSnippet) {
    // 相关章节片段：实体出现的前 2 章正文（片段截取实体名附近）
    for (const cn of e.chapters.slice(0, 2)) {
      const text = k.chapterTexts[cn]
      if (!text) continue
      const idx = text.indexOf(e.name)
      const start = Math.max(0, idx >= 0 ? idx - 20 : 0)
      lines.push(`第${cn + 1}章片段：${text.slice(start, start + 220)}…`)
    }
  }
  return lines.join('\n')
}

/** 防剧透系统提示（所有任务共用） */
function systemPrompt(k: KnowledgeSnapshot): string {
  return (
    `你是小说《${k.bookTitle}》的资深读者和文学分析助手。根据提供的知识库信息回答问题，用简体中文，简洁准确，不要编造书中没有的信息；回答不超过 200 字。` +
    `\n**防剧透规则**：你只能基于已读章节（第 1 至第 ${k.readUpTo + 1} 章）的信息回答；` +
    `如果答案涉及未读章节的内容，请直接说明「该信息涉及未读章节」，绝不透露任何未读情节。`
  )
}

/** 按任务组装系统提示与用户消息（纯函数，可单测） */
export function buildTaskMessages(
  k: KnowledgeSnapshot,
  task: AITask,
  params: AITaskParams
): ChatMessage[] {
  const system = systemPrompt(k)
  const progress = `当前读到第 ${(params.chapterIndex ?? 0) + 1} 章。`
  const book = `全书共 ${k.chapterCount} 章。`

  switch (task) {
    case 'who': {
      const e = k.entities.find((x) => x.id === params.entityId)
      const block = e ? entityBlock(k, e.id, true) : ''
      const sel = params.text ? `用户选中文字：「${params.text}」` : ''
      return [
        { role: 'system', content: system },
        { role: 'user', content: `请介绍这个角色/设定是谁：\n${sel}\n${progress}\n${book}\n${block || '知识库中暂无该对象信息，请根据常识谨慎回答。'}` },
      ]
    }
    case 'recap': {
      const upTo = params.chapterIndex ?? 0
      const recent = k.indexes
        .filter((idx) => idx.index < upTo)
        .slice(-12)
        .map((idx) => {
          const ev = (idx.events ?? []).join('；')
          return `第${idx.index + 1}章${k.chapterTitles[idx.index] ? `（${k.chapterTitles[idx.index]}）` : ''}：${idx.summary}${ev ? `｜事件：${ev}` : ''}`
        })
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${progress}请回顾此前剧情，重点讲清：主要人物、当前处境、未解决的线索。\n${book}\n此前章节（最近 ${recent.length} 章）：\n${recent.join('\n') || '暂无已读章节记录'}`,
        },
      ]
    }
    case 'explain': {
      const idx = params.chapterIndex ?? 0
      const current = k.indexes[idx]
      const text = params.text ?? ''
      const chapter = k.chapterTexts[idx] ?? ''
      const ev = (current?.events ?? []).join('；')
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${progress}请解释这段剧情/这句话的含义与背景。\n选中文字：「${text}」\n当前章节摘要：${current?.summary ?? '无'}${ev ? `\n本章事件：${ev}` : ''}\n章节片段：${chapter.slice(0, 500)}`,
        },
      ]
    }
    case 'relation': {
      const e = k.entities.find((x) => x.id === params.entityId)
      const block = e ? entityBlock(k, e.id, true) : ''
      return [
        { role: 'system', content: system },
        { role: 'user', content: `${progress}请梳理「${e?.name ?? '该人物'}」与他人的关系（师徒/盟友/对手/同门等，如能判断），以及他在当前故事中的位置。\n${book}\n${block || '知识库信息有限，请谨慎回答。'}` },
      ]
    }
    case 'world': {
      const e = k.entities.find((x) => x.id === params.entityId)
      const places = take(k.entities.filter((x) => x.type === 'place').slice(0, 8), 8)
      const orgs = take(k.entities.filter((x) => x.type === 'org').slice(0, 8), 8)
      const realms = take(k.entities.filter((x) => x.type === 'realm').slice(0, 10), 10)
      const block = e ? entityBlock(k, e.id) : ''
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${progress}请解释小说的世界观设定。\n${block ? `重点设定：「${e?.name}」\n${block}\n` : ''}主要地点：${places.map((p) => p.name).join('、') || '暂无'}\n主要势力：${orgs.map((o) => o.name).join('、') || '暂无'}\n境界体系：${realms.map((r) => r.name).join('、') || '暂无明确境界记录'}\n请顺带推断等级/力量体系的晋升脉络（如无法判断请说明）。`,
        },
      ]
    }
    case 'timeline': {
      const events = k.indexes
        .map((idx) => ({ n: idx.index + 1, ev: (idx.events ?? []).slice(0, 2), sum: idx.summary }))
        .filter((x) => x.ev.length || x.sum)
        .slice(0, 40)
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${progress}请根据已读章节信息整理一条清晰的事件时间线（按章节顺序，用「第N章：事件」格式，合并重复）。\n${book}\n${events.map((x) => `第${x.n}章：${x.sum}${x.ev.length ? `｜${x.ev.join('；')}` : ''}`).join('\n') || '暂无事件记录'}`,
        },
      ]
    }
    case 'foreshadow': {
      // 伏笔回顾：已读章节的关键句、事件与身份不明的实体
      const keys = k.indexes
        .map((idx) => ({
          n: idx.index + 1,
          ev: (idx.events ?? []).slice(0, 2),
          s: (idx.keySentences ?? []).slice(0, 2),
        }))
        .slice(-20)
      const unknowns = take(k.entities.filter((x) => x.type === 'unknown' && x.chapters.length > 0).slice(0, 10), 10)
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${progress}请回顾已读章节，列出可能尚未揭晓的伏笔/悬念/未解之谜（人物身份、神秘事件、未兑现的约定等），并指出首次出现的章节。\n${book}\n线索（最近 ${keys.length} 章）：\n${keys.map((x) => `第${x.n}章：${x.ev.join('；')}${x.s.length ? `｜关键句：${x.s.join('；')}` : ''}`).join('\n') || '暂无'}\n身份不明的实体：${unknowns.map((u) => u.name).join('、') || '暂无'}`,
        },
      ]
    }
    case 'summarize': {
      const idx = params.chapterIndex ?? 0
      const chapter = k.chapterTexts[idx] ?? ''
      const ev = (k.indexes[idx]?.events ?? []).join('；')
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${progress}请用 120 字以内概括本章情节（不含剧透总结未读章节）。\n第 ${idx + 1} 章${k.chapterTitles[idx] ? `（${k.chapterTitles[idx]}）` : ''}正文：\n${chapter.slice(0, 1500)}${ev ? `\n本章事件：${ev}` : ''}`,
        },
      ]
    }
    case 'ask': {
      const idx = params.chapterIndex ?? 0
      const current = k.indexes[idx]
      const chapter = k.chapterTexts[idx] ?? ''
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${progress}${params.text ?? ''}\n\n当前章节摘要：${current?.summary ?? '无'}${(current?.events ?? []).length ? `｜${(current?.events ?? []).join('；')}` : ''}\n章节片段：${chapter.slice(0, 400)}`,
        },
      ]
    }
  }
}

/** 执行 AI 任务：进度感知知识库上下文（防剧透）→ chat 请求 → 返回回答 */
export async function runAITask(
  cfg: AIProviderConfig,
  bookId: string,
  task: AITask,
  params: AITaskParams
): Promise<string> {
  const knowledge = await loadKnowledge(bookId, { upTo: params.chapterIndex ?? 0 })
  const messages = buildTaskMessages(knowledge, task, params)
  return chatCompletion(cfg, messages)
}
