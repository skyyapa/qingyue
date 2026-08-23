/** AI 阅读助手：进度感知任务（这是谁/前情回顾/剧情解释/人物关系/世界观/事件时间线/
 *  伏笔回顾/章节摘要/自由提问）
 *  上下文从本地知识库组装，且**默认只使用已读章节（第 1～当前章）的数据**——
 *  防剧透：问「林凡是什么身份」不会被告知第 900 章的答案
 */
import * as db from '@/db'
import { chatCompletion, type ChatMessage } from './client'
import type { AIProviderConfig } from './presets'
import type { ChapterIndex, Entity, Relation } from '@/types'

export type AITask =
  | 'who'
  | 'recap'
  | 'explain'
  | 'relation'
  | 'world'
  | 'timeline'
  | 'ask'
  | 'foreshadow'
  | 'summarize'
  | 'daily'
  | 'personTimeline'

export interface AITaskParams {
  /** 选中的正文文字 */
  text?: string
  /** 目标实体 id（who/relation/world/personTimeline） */
  entityId?: string
  /** 当前章节号（UI 位置；不等于已读完整边界） */
  chapterIndex?: number
  /** 已读完整章节边界（含）。未传时按防剧透默认值：当前章之前 */
  readUpTo?: number
  /** 今日读过的章节号（daily 任务） */
  todayChapters?: number[]
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
  daily: '今日回顾',
  personTimeline: '经历时间线',
  ask: '自由提问',
}

/** 模型档位：多模型策略——简单任务/摘要任务可用更便宜的模型降低成本 */
export type ModelTier = 'main' | 'easy' | 'summary'

export function taskTier(task: AITask): ModelTier {
  switch (task) {
    case 'summarize':
    case 'daily':
      return 'summary' // 摘要类：用便宜模型
    case 'who':
    case 'recap':
    case 'foreshadow':
    case 'ask':
      return 'easy' // 简单问答：用便宜模型
    default:
      return 'main' // 复杂剧情分析：用主模型（GPT/Claude 等）
  }
}

/** 知识库快照（任务上下文数据源；readUpTo 之外的章节数据已被真正剔除） */
export interface KnowledgeSnapshot {
  bookTitle: string
  /** 只在已读章节出现过的实体（未来章节才出现的实体已剔除） */
  entities: Entity[]
  /** 已读章节索引（稀疏：在线书可能只缓存部分章节，查找需按 index 匹配） */
  indexes: ChapterIndex[]
  /** 已读范围内的关系（仅含新数据 chapterWeights；权重已按已读章节重建） */
  relations: Relation[]
  chapterCount: number
  /** 已读章节标题（未读章节标题剔除，防剧透；下标 = 章节号） */
  chapterTitles: string[]
  /** 防剧透边界：允许使用的最大章节号（含） */
  readUpTo: number
  /** 存在旧版数据（无每章权重的关系 / 无出处例句）——严格防剧透下已剔除，提示重新分析 */
  staleData: boolean
}

/** 读取知识库：按已读边界（readUpTo）真正重建——
 *  未来实体剔除、实体计数按已读章节求和、关系权重按已读章节重建；
 *  章节正文**不在此加载**（按需由 planChapterLoads + getChapter 懒加载） */
export async function loadKnowledge(
  bookId: string,
  opts: { upTo?: number } = {}
): Promise<KnowledgeSnapshot> {
  const { upTo } = opts
  const meta = await db.getBookMeta(bookId)
  const [entities, indexes, relations] = await Promise.all([
    db.listEntities(bookId),
    db.listChapterIndexes(bookId),
    db.listRelations(bookId),
  ])
  const chapterCount = meta?.chapterCount ?? 0
  const maxReadUpTo = Math.max(-1, chapterCount - 1)
  const readUpTo = upTo === undefined ? maxReadUpTo : Math.max(-1, Math.min(upTo, maxReadUpTo))

  const readIndexes = [...indexes].filter((idx) => idx.index <= readUpTo).sort((a, b) => a.index - b.index)

  // 实体计数按已读章节 entityCounts 求和（而非全书 count）
  const readCounts = new Map<string, number>()
  for (const idx of readIndexes) {
    for (const [id, n] of Object.entries(idx.entityCounts)) {
      readCounts.set(id, (readCounts.get(id) ?? 0) + n)
    }
  }
  // 例句严格防剧透：无出处（旧数据无 sampleChapters）的例句直接舍弃
  let staleData = false
  const readEntities = entities
    .map((e) => {
      let samples = e.samples
      if (e.sampleChapters) {
        // 只保留「有出处且出处章节 ≤ 已读边界」的例句；sampleChapters 比 samples 短时，
        // 多出的无出处例句用 Infinity 兜底（不默认第 0 章），避免未读章节例句泄漏
        samples = e.samples.filter((_, i) => (e.sampleChapters?.[i] ?? Infinity) <= readUpTo)
      } else if (e.samples.length > 0) {
        samples = [] // 旧数据例句无出处 → 舍弃，避免泄漏未读章节内容
        staleData = true
      }
      return {
        ...e,
        chapters: e.chapters.filter((c) => c <= readUpTo),
        count: readCounts.get(e.id) ?? 0,
        samples,
      }
    })
    .filter((e) => e.chapters.length > 0 || e.custom || e.locked)

  // 关系严格防剧透：只有带 chapterWeights 的新数据才可安全按已读重建；
  // 旧数据无法证明某对关系发生在已读章节 → 不传给 AI（提示重新分析）
  const readIds = new Set(readEntities.filter((e) => e.chapters.length > 0).map((e) => e.id))
  const readRelations: Relation[] = []
  for (const r of relations) {
    if (!readIds.has(r.a) || !readIds.has(r.b)) continue
    if (!r.chapterWeights) {
      staleData = true
      continue // 旧关系无每章权重 → 剔除
    }
    let w = 0
    for (let c = 0; c <= readUpTo && c < r.chapterWeights.length; c++) w += r.chapterWeights[c] ?? 0
    readRelations.push({ ...r, weight: w })
  }

  const titles = (meta?.chapterTitles ?? []).map((t, i) => (i <= readUpTo ? t : ''))

  return {
    bookTitle: meta?.title ?? '本书',
    entities: readEntities,
    indexes: readIndexes,
    relations: readRelations,
    chapterCount,
    chapterTitles: titles,
    readUpTo,
    staleData,
  }
}

/** 按任务确定需要加载正文的章节（按需懒加载，避免全量拉取章节） */
export function planChapterLoads(k: KnowledgeSnapshot, task: AITask, params: AITaskParams): number[] {
  switch (task) {
    case 'who':
    case 'relation': {
      const e = k.entities.find((x) => x.id === params.entityId)
      return e ? e.chapters.slice(0, 2) : []
    }
    case 'personTimeline':
      return [] // 用章节索引摘要/事件即可，无需正文
    case 'explain':
    case 'summarize': {
      const idx = params.chapterIndex ?? 0
      return idx <= k.readUpTo ? [idx] : []
    }
    case 'ask':
      return [] // 自由提问不主动加载当前章全文，避免章内未读尾部泄漏
    default:
      return []
  }
}

/** 清洗章节正文（标记/图片占位符/空白） */
function cleanText(text: string): string {
  return text
    .replace(/\[\/?[biu]\]/g, '')
    .replace(/\[img:\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 在章节完整正文中定位锚点（实体名/选中文字），截取前后片段；无锚点/未匹配返回空串 */
export function findSnippet(chapterText: string, anchor: string, before = 160, after = 280): string {
  if (!chapterText || !anchor) return ''
  const idx = chapterText.indexOf(anchor)
  if (idx < 0) return ''
  const start = Math.max(0, idx - before)
  const end = Math.min(chapterText.length, idx + anchor.length + after)
  return `${start > 0 ? '…' : ''}${chapterText.slice(start, end)}${end < chapterText.length ? '…' : ''}`
}

/** 从自由提问中挑选最长实体名作为检索锚点（匹配不到返回 null，不硬塞章节开头） */
export function pickAnchor(question: string, entities: Entity[]): string | null {
  let best: string | null = null
  for (const e of entities) {
    if (e.name.length >= 2 && question.includes(e.name)) {
      if (!best || e.name.length > best.length) best = e.name
    }
  }
  return best
}

/** 截断列表到上限 */
function take<T>(list: T[], n: number): T[] {
  return list.slice(0, n)
}

/** 实体 → 上下文文本块（withSnippet 时附带相关章节片段，正文来自按需加载的 Map） */
function entityBlock(
  k: KnowledgeSnapshot,
  id: string,
  chapterTexts: Map<number, string>,
  withSnippet = false
): string {
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
    // 相关章节片段：实体出现的前 2 章，在完整正文中定位实体名附近截取
    for (const cn of e.chapters.slice(0, 2)) {
      const snippet = findSnippet(chapterTexts.get(cn) ?? '', e.name)
      if (snippet) lines.push(`第${cn + 1}章片段：${snippet}`)
    }
  }
  return lines.join('\n')
}

/** 防剧透系统提示（所有任务共用）：私人小说管家人格 + 规则
 *  1. 不剧透（只基于已读章节） 2. 根据阅读进度回答 3. 优先引用已发生剧情
 *  4. 不确定时直接说不知道；存在旧版数据时提示重新分析 */
function systemPrompt(k: KnowledgeSnapshot): string {
  const stale = k.staleData
    ? '\n注意：部分关系/例句来自旧版分析（缺少按章数据），已被严格排除；建议用户重新分析知识库以获得更准确回答。'
    : ''
  const readScope = k.readUpTo >= 0 ? `第 1 至第 ${k.readUpTo + 1} 章` : '暂无完整已读章节'
  const progressText = k.readUpTo >= 0 ? `已完整读到第 ${k.readUpTo + 1} 章` : '尚未完整读完第 1 章'
  return (
    `你是小说《${k.bookTitle}》的私人小说管家，用户${progressText}。规则：\n` +
    `1. 不剧透：只基于已完整读过的章节（${readScope}）回答；涉及当前章未读完部分或后续未读内容时直接说明「该信息涉及未读章节」，绝不透露任何未读情节。\n` +
    `2. 根据我的阅读进度回答（已完整读过的章节优先）。\n` +
    `3. 优先引用已发生的剧情细节，让回答有依据。\n` +
    `4. 不确定时直接告诉我不知道，不要编造。\n` +
    `回答用简体中文，简洁准确（不超过 200 字）。${stale}`
  )
}

/** 按任务组装系统提示与用户消息（纯函数，可单测）
 *  chapterTexts：按需加载的章节正文（章节号 → 清洗后全文），由 runAITask 传入 */
export function buildTaskMessages(
  k: KnowledgeSnapshot,
  task: AITask,
  params: AITaskParams,
  chapterTexts: Map<number, string> = new Map()
): ChatMessage[] {
  const system = systemPrompt(k)
  const progress = `当前读到第 ${(params.chapterIndex ?? 0) + 1} 章。`
  const book = `全书共 ${k.chapterCount} 章。`

  switch (task) {
    case 'who': {
      const e = k.entities.find((x) => x.id === params.entityId)
      const block = e ? entityBlock(k, e.id, chapterTexts, true) : ''
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
      const current = k.indexes.find((x) => x.index === idx)
      const text = params.text ?? ''
      const chapter = chapterTexts.get(idx) ?? ''
      const ev = (current?.events ?? []).join('；')
      // 只在该章已纳入已读边界时定位正文片段；当前章未完整读完时，仅使用用户选中文字本身
      const snippet = text && current ? findSnippet(chapter, text) : ''
      const ask =
        text.length > 0
          ? `${progress}请解释这段剧情/这句话的含义与背景。只可基于选中文字和已完整读过的章节，不要补充未读内容。\n选中文字：「${text}」`
          : current
            ? `${progress}请解释本章剧情：发生了什么、有何要点与进展。`
            : `${progress}当前章尚未完整读完，不能解释当前章未读部分；请只根据已完整读过的章节做无剧透背景说明。`
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${ask}\n当前章节摘要：${current?.summary ?? '无'}${ev ? `\n本章事件：${ev}` : ''}${snippet ? `\n章节片段：${snippet}` : ''}`,
        },
      ]
    }
    case 'relation': {
      const e = k.entities.find((x) => x.id === params.entityId)
      const block = e ? entityBlock(k, e.id, chapterTexts, true) : ''
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
      const block = e ? entityBlock(k, e.id, chapterTexts) : ''
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
      const chapter = chapterTexts.get(idx) ?? ''
      const current = k.indexes.find((x) => x.index === idx)
      const ev = (current?.events ?? []).join('；')
      const body = current
        ? `${progress}请用 120 字以内概括本章情节（不含剧透总结未读章节）。\n第 ${idx + 1} 章${k.chapterTitles[idx] ? `（${k.chapterTitles[idx]}）` : ''}正文：\n${chapter.slice(0, 1500)}${ev ? `\n本章事件：${ev}` : ''}`
        : `${progress}当前章尚未完整读完，不能总结当前章未读内容。请提示用户读完本章后再生成章节摘要，或只做已完整读过章节的无剧透回顾。`
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: body,
        },
      ]
    }
    case 'daily': {
      // 每日阅读回顾：结构化输出（主要事件/新增人物/未解决伏笔）
      const today = params.todayChapters ?? []
      const items = today
        .map((ci) => {
          const idx = k.indexes.find((x) => x.index === ci)
          return idx
            ? `第${ci + 1}章${k.chapterTitles[ci] ? `（${k.chapterTitles[ci]}）` : ''}：${idx.summary}${(idx.events ?? []).length ? `｜${(idx.events ?? []).join('；')}` : ''}`
            : null
        })
        .filter((x): x is string => !!x)
        .slice(-20)
      // 今日首次登场的人物（实体首次出现章节 ∈ 今日）
      const newComers = take(
        k.entities
          .filter((e) => e.type === 'person' && e.chapters.length > 0 && today.includes(e.chapters[0]))
          .slice(0, 8),
        8
      )
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${progress}请生成今日阅读总结，严格按以下格式输出：\n主要事件：\n1. …\n2. …\n3. …\n新增人物：xxx、xxx（无则写「无」）\n未解决伏笔：xxx、xxx（无则写「无」）\n\n${book}\n今日读过章节：\n${items.join('\n') || '今日暂无已读章节记录'}\n今日首次登场人物：${newComers.map((e) => e.name).join('、') || '无'}`,
        },
      ]
    }
    case 'personTimeline': {
      // 人物经历时间线：出场章节的摘要/事件聚合，AI 梳理经历脉络
      const e = k.entities.find((x) => x.id === params.entityId)
      const block = e ? entityBlock(k, e.id, chapterTexts) : ''
      const chapters = (e?.chapters ?? [])
        .slice(0, 15)
        .map((ci) => {
          const idx = k.indexes.find((x) => x.index === ci)
          const ev = (idx?.events ?? []).filter((x) => e && x.includes(e.name)).join('；')
          return `第${ci + 1}章${k.chapterTitles[ci] ? `（${k.chapterTitles[ci]}）` : ''}：${idx?.summary ?? '无摘要'}${ev ? `｜${ev}` : ''}`
        })
        .join('\n')
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${progress}请按时间线梳理「${e?.name ?? '该人物'}」的经历：首次登场、关键转折、与他人的关系变化、当前状态。\n${book}\n出场章节（${e?.chapters.length ?? 0} 章）：\n${chapters || '暂无出场记录'}${block ? `\n\n${block}` : ''}`,
        },
      ]
    }
    case 'ask': {
      const idx = params.chapterIndex ?? 0
      const current = k.indexes.find((x) => x.index === idx)
      const q = params.text ?? ''
      const anchor = pickAnchor(q, k.entities)
      const unreadNote = current ? '' : '\n注意：当前章尚未完整读完，禁止推断或补充当前章未读部分。'
      return [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${progress}${q}\n\n已读章节中可用的当前章节摘要：${current?.summary ?? '无'}${(current?.events ?? []).length ? `｜${(current?.events ?? []).join('；')}` : ''}${anchor ? `\n问题命中已读实体：${anchor}` : ''}${unreadNote}`,
        },
      ]
    }
  }
}

/** 档位模型调用 + 失败回退主模型：档位模型（easy/summary，多为便宜模型）配置了但
 *  运行时失败（模型名错误 / 端点不接收该模型）时，自动用主模型重试；主模型本身失败则原样抛出 */
export async function callWithModelFallback(
  cfg: AIProviderConfig,
  effective: AIProviderConfig,
  messages: ChatMessage[]
): Promise<string> {
  try {
    return await chatCompletion(effective, messages)
  } catch (err) {
    if (effective.model !== cfg.model) {
      return chatCompletion(cfg, messages)
    }
    throw err
  }
}

function defaultReadUpTo(task: AITask, params: AITaskParams): number {
  if (params.readUpTo !== undefined) return params.readUpTo
  // daily 的 chapterIndex 是统计层传入的最后已读章节；阅读器内任务默认不把当前打开章当作完整已读
  if (task === 'daily') return params.chapterIndex ?? 0
  return (params.chapterIndex ?? 0) - 1
}

/** 执行 AI 任务：进度感知知识库上下文（防剧透）→ 按需加载相关章节正文 →
 *  按任务档位选择模型（多模型策略）→ chat 请求 */
export async function runAITask(
  cfg: AIProviderConfig,
  bookId: string,
  task: AITask,
  params: AITaskParams
): Promise<string> {
  const knowledge = await loadKnowledge(bookId, { upTo: defaultReadUpTo(task, params) })
  // 真正按需：只加载任务需要的那几章（不整本书拉进内存）
  const loads = planChapterLoads(knowledge, task, params)
  const chapterTexts = new Map<number, string>()
  await Promise.all(
    loads.map(async (ci) => {
      const chapter = await db.getChapter(bookId, ci)
      if (chapter) chapterTexts.set(ci, cleanText(chapter.text))
    })
  )
  const messages = buildTaskMessages(knowledge, task, params, chapterTexts)
  // 多模型策略：简单/摘要任务使用对应档位模型（未配置则回退主模型；配了但失败也回退主模型）
  const tier = taskTier(task)
  const tierModel = tier === 'summary' ? cfg.summaryModel : tier === 'easy' ? cfg.easyModel : undefined
  const effective = tierModel?.trim() ? { ...cfg, model: tierModel.trim() } : cfg
  return callWithModelFallback(cfg, effective, messages)
}
