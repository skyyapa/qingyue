/** AI 阅读助手：六个实用任务（这是谁/前情回顾/剧情解释/人物关系/世界观解释/事件时间线）
 *  上下文从本地知识库组装（实体/章节摘要/事件句/共现关系），避免整本书塞进 prompt
 */
import * as db from '@/db'
import { chatCompletion, type ChatMessage } from './client'
import type { AIProviderConfig } from './presets'

export type AITask = 'who' | 'recap' | 'explain' | 'relation' | 'world' | 'timeline' | 'ask'

export interface AITaskParams {
  /** 选中的正文文字 */
  text?: string
  /** 目标实体 id（who/relation/world） */
  entityId?: string
  /** 当前章节号 */
  chapterIndex?: number
}

export const AI_TASK_LABELS: Record<AITask, string> = {
  who: '这是谁',
  recap: '前情回顾',
  explain: '剧情解释',
  relation: '人物关系',
  world: '世界观解释',
  timeline: '事件时间线',
  ask: '自由提问',
}

/** 知识库快照（任务上下文数据源） */
export interface KnowledgeSnapshot {
  bookTitle: string
  entities: import('@/types').Entity[]
  indexes: import('@/types').ChapterIndex[]
  relations: import('@/types').Relation[]
  chapterCount: number
  chapterTitles: string[]
  chapterTexts: string[]
}

/** 读取知识库与已缓存章节（章节正文截断，控制 token） */
export async function loadKnowledge(bookId: string, maxChapterText = 400): Promise<KnowledgeSnapshot> {
  const meta = await db.getBookMeta(bookId)
  const [entities, indexes, relations, chapters] = await Promise.all([
    db.listEntities(bookId),
    db.listChapterIndexes(bookId),
    db.listRelations(bookId),
    db.listChapters(bookId),
  ])
  return {
    bookTitle: meta?.title ?? '本书',
    entities,
    indexes: [...indexes].sort((a, b) => a.index - b.index),
    relations,
    chapterCount: meta?.chapterCount ?? chapters.length,
    chapterTitles: meta?.chapterTitles ?? [],
    chapterTexts: chapters.map((c) => {
      const clean = c.text
        .replace(/\[\/?[biu]\]/g, '')
        .replace(/\[img:\d+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      return clean.length > maxChapterText ? `${clean.slice(0, maxChapterText)}…` : clean
    }),
  }
}

/** 截断列表到上限并附计数 */
function take<T>(list: T[], n: number): T[] {
  return list.slice(0, n)
}

/** 实体 → 上下文文本块 */
function entityBlock(k: KnowledgeSnapshot, id: string): string {
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
  return lines.join('\n')
}

/** 按任务组装系统提示与用户消息（纯函数，可单测） */
export function buildTaskMessages(
  k: KnowledgeSnapshot,
  task: AITask,
  params: AITaskParams
): ChatMessage[] {
  const system = `你是小说《${k.bookTitle}》的资深读者和文学分析助手。根据提供的知识库信息回答问题，用简体中文，简洁准确，不要编造书中没有的信息；回答不超过 200 字。`
  const book = `全书共 ${k.chapterCount} 章。`

  switch (task) {
    case 'who': {
      const e = k.entities.find((x) => x.id === params.entityId)
      const block = e ? entityBlock(k, e.id) : ''
      const sel = params.text ? `用户选中文字：「${params.text}」` : ''
      return [
        { role: 'system', content: system },
        { role: 'user', content: `请介绍这个角色/设定是谁：\n${sel}\n${book}\n${block || '知识库中暂无该对象信息，请根据常识谨慎回答。'}` },
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
          content: `当前读到第 ${(params.chapterIndex ?? 0) + 1} 章。请回顾此前剧情，重点讲清：主要人物、当前处境、未解决的线索。\n${book}\n此前章节（最近 ${recent.length} 章）：\n${recent.join('\n') || '暂无已读章节记录'}`,
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
          content: `请解释这段剧情/这句话的含义与背景。\n选中文字：「${text}」\n当前章节摘要：${current?.summary ?? '无'}${ev ? `\n本章事件：${ev}` : ''}\n章节片段：${chapter.slice(0, 500)}`,
        },
      ]
    }
    case 'relation': {
      const e = k.entities.find((x) => x.id === params.entityId)
      const block = e ? entityBlock(k, e.id) : ''
      return [
        { role: 'system', content: system },
        { role: 'user', content: `请梳理「${e?.name ?? '该人物'}」与他人的关系（师徒/盟友/对手/同门等，如能判断），以及他在当前故事中的位置。\n${book}\n${block || '知识库信息有限，请谨慎回答。'}` },
      ]
    }
    case 'world': {
      const e = k.entities.find((x) => x.id === params.entityId)
      const places = take(k.entities.filter((x) => x.type === 'place').slice(0, 8), 8)
      const orgs = take(k.entities.filter((x) => x.type === 'org').slice(0, 8), 8)
      const block = e ? entityBlock(k, e.id) : ''
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `请解释小说的世界观设定。\n${block ? `重点设定：「${e?.name}」\n${block}\n` : ''}主要地点：${places.map((p) => p.name).join('、') || '暂无'}\n主要势力：${orgs.map((o) => o.name).join('、') || '暂无'}\n全书等级/力量体系请根据出现设定推断（如无明确描述请说明）。`,
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
          content: `请根据章节信息整理一条清晰的事件时间线（按章节顺序，用「第N章：事件」格式，合并重复）。\n${book}\n${events.map((x) => `第${x.n}章：${x.sum}${x.ev.length ? `｜${x.ev.join('；')}` : ''}`).join('\n') || '暂无事件记录'}`,
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
          content: `${params.text ?? ''}\n\n当前章节摘要：${current?.summary ?? '无'}${(current?.events ?? []).length ? `｜${(current?.events ?? []).join('；')}` : ''}\n章节片段：${chapter.slice(0, 400)}`,
        },
      ]
    }
  }
}

/** 执行 AI 任务：知识库上下文 → chat 请求 → 返回回答 */
export async function runAITask(
  cfg: AIProviderConfig,
  bookId: string,
  task: AITask,
  params: AITaskParams
): Promise<string> {
  const knowledge = await loadKnowledge(bookId)
  const messages = buildTaskMessages(knowledge, task, params)
  return chatCompletion(cfg, messages)
}
