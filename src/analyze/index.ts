/** 全书知识库分析管线（无 AI，确定性算法）
 *  三遍扫描，每遍逐章从 IndexedDB 读取、用毕即弃 —— 全书正文不驻留内存，
 *  大文件（上百 MB）峰值内存 ≈ 单章文本 + 字频/二元组统计映射。
 *   1. 字频/二元组统计 → 2. PMI 链发现候选词 → 3. 上下文分类 + 事件提取 + 章节索引 + 共现关系
 *  产物写入 IndexedDB（entities / chapterIndex / relations，关系为整体替换，
 *  旧分析残留不会成为幽灵数据），可重复分析（用户锁定/忽略项保留，
 *  且重分析时已有实体的别名参与匹配，人工合并的知识得以延续）
 */
import * as db from '@/db'
import { genId } from '@/utils/id'
import type { AnalysisState, ChapterIndex, Entity, EntityType, Relation } from '@/types'
import { buildStrongSet, createStats, filterWindows, isCJK, scanChapterWindows, type WindowStat, type WordCandidate } from './segment'
import { decideType, SPEECH_VERBS, voteContext, type Votes } from './classify'

export interface AnalyzeCallbacks {
  onProgress(ratio: number, phase: string): void
}

/** 关系图参与阈值：全局出现次数与共现次数低于此值的实体不建边 */
const GRAPH_MIN_COUNT = 5
const GRAPH_MIN_WEIGHT = 3
const MAX_RELATIONS = 500
const SAMPLE_CAP = 5

/** 例句（含出处章节，供正文内定位） */
interface Sample {
  text: string
  chapter: number
}

interface Sentence {
  start: number
  end: number
  text: string
}

function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = []
  const re = /[^。！？…；\n]+[。！？…；\n]?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    sentences.push({ start: m.index, end: m.index + m[0].length, text: m[0].trim() })
  }
  return sentences
}

/** 段落边界（按换行切分） */
function splitParagraphs(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = []
  const re = /[^\n]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) ranges.push({ start: m.index, end: m.index + m[0].length })
  return ranges
}

interface WalkResult {
  /** 实体名 → 本章出现次数 */
  counts: Map<string, number>
  /** 段落级共现对 → 次数 */
  cooccur: Map<string, number>
  /** 候选词 → 本章次数（高频词用） */
  wordCounts: Map<string, number>
  /** 句子序号 → 命中的实体名集合 */
  sentenceHits: Map<number, Set<string>>
  /** 句子列表 */
  sentences: Sentence[]
  /** 事件句模板 → 本章出现次数 */
  events: Map<string, number>
}

/** 「A 对 B 说」事件的介词（两实体之间只能是这些字） */
const EVENT_PREP = new Set('对向跟和与同')

/** 从一句中提取事件句：「A 介词 B 动词」模式（处理同名多次出现）
 *  例：「林夜对苏晚说：…」→「林夜对苏晚说」 */
function extractEvent(sentence: Sentence, names: Set<string>): string | null {
  if (names.size < 2) return null
  const text = sentence.text
  const list = [...names]
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const nameA = list[i]
      const nameB = list[j]
      let idxA = text.indexOf(nameA)
      while (idxA >= 0) {
        let idxB = text.indexOf(nameB)
        while (idxB >= 0) {
          if (idxA !== idxB) {
            const first = idxA < idxB ? nameA : nameB
            const second = idxA < idxB ? nameB : nameA
            const mid = text.slice(Math.min(idxA, idxB) + first.length, Math.max(idxA, idxB)).trim()
            // 中间只能是 1-2 字纯介词，且第二个实体后紧跟说话动词
            if (mid.length >= 1 && mid.length <= 2 && [...mid].every((c) => EVENT_PREP.has(c))) {
              const verb = text[Math.max(idxA, idxB) + second.length]
              if (verb && SPEECH_VERBS.has(verb)) {
                return `${first}${mid}${second}${verb}`
              }
            }
          }
          idxB = text.indexOf(nameB, idxB + 1)
        }
        idxA = text.indexOf(nameA, idxA + 1)
      }
    }
  }
  return null
}

/** 扫描一章：最长优先匹配候选词（含已有实体别名），上下文投票，记录共现/例句/事件 */
function walkChapter(
  text: string,
  candidates: Map<string, WordCandidate>,
  extraNames: Set<string>,
  graphNames: Set<string>,
  globalVotes: Map<string, Votes>,
  samples: Map<string, Sample[]>,
  chapterIndex: number
): WalkResult {
  const counts = new Map<string, number>()
  const cooccur = new Map<string, number>()
  const wordCounts = new Map<string, number>()
  const sentenceHits = new Map<number, Set<string>>()
  const sentences = splitSentences(text)
  const paragraphs = splitParagraphs(text)

  let sentIdx = 0
  let paraIdx = 0
  let paraEntities = new Set<string>()
  const perNameSamples = new Map<string, number>()

  /** 结算当前段落内实体两两共现 */
  const flushParagraph = () => {
    const list = [...paraEntities]
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const key = list[a] < list[b] ? `${list[a]}|${list[b]}` : `${list[b]}|${list[a]}`
        cooccur.set(key, (cooccur.get(key) ?? 0) + 1)
      }
    }
    paraEntities = new Set()
  }

  const n = text.length
  let i = 0
  while (i < n) {
    while (sentIdx < sentences.length && sentences[sentIdx].end <= i) sentIdx++
    while (paraIdx < paragraphs.length && paragraphs[paraIdx].end <= i) {
      flushParagraph()
      paraIdx++
    }

    if (!isCJK(text[i])) {
      i++
      continue
    }
    // 最长优先匹配候选词（候选词与别名同一词典，候选词优先命中）
    let matched = ''
    for (let len = 6; len >= 2; len--) {
      const w = text.slice(i, i + len)
      if (candidates.has(w) || extraNames.has(w)) {
        matched = w
        break
      }
    }
    if (!matched) {
      i++
      continue
    }

    counts.set(matched, (counts.get(matched) ?? 0) + 1)
    wordCounts.set(matched, (wordCounts.get(matched) ?? 0) + 1)
    if (graphNames.has(matched) || extraNames.has(matched)) paraEntities.add(matched)

    // 上下文投票
    const prev2 = text.slice(Math.max(0, i - 2), i)
    const prev = text[i - 1] ?? ''
    const next = text[i + matched.length] ?? ''
    const next2 = text.slice(i + matched.length, i + matched.length + 2)
    const votes = globalVotes.get(matched) ?? {}
    voteContext(prev2, prev, next, next2, votes, matched)
    globalVotes.set(matched, votes)

    // 例句收集（每实体全书记录去重，截取含实体的短句，带出处章节）
    const sentence = sentences[sentIdx]
    if (sentence) {
      let set = sentenceHits.get(sentIdx)
      if (!set) {
        set = new Set()
        sentenceHits.set(sentIdx, set)
      }
      set.add(matched)
      if (sentence.text.length >= 8 && sentence.text.length <= 80) {
        const got = perNameSamples.get(matched) ?? 0
        if (got < 3) {
          const list = samples.get(matched) ?? []
          if (list.length < SAMPLE_CAP) {
            list.push({ text: sentence.text, chapter: chapterIndex })
            samples.set(matched, list)
          }
          perNameSamples.set(matched, got + 1)
        }
      }
    }
    i += matched.length
  }
  // 事件句提取：同句 ≥2 实体且符合「A 对 B 说」模式
  const events = new Map<string, number>()
  for (const [sid, names] of sentenceHits) {
    const evt = extractEvent(sentences[sid], names)
    if (evt) events.set(evt, (events.get(evt) ?? 0) + 1)
  }
  flushParagraph()
  return { counts, cooccur, wordCounts, sentenceHits, sentences, events }
}

/** 无 AI 章节摘要：登场人物 + 地点 + 事件（模板式） */
function buildSummary(
  counts: Map<string, number>,
  nameType: Map<string, EntityType>,
  topWords: string[],
  events: string[]
): string {
  const byType = (type: EntityType) =>
    [...counts.entries()]
      .filter(([name]) => nameType.get(name) === type)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)
  const persons = byType('person')
  const places = byType('place')
  const parts: string[] = []
  if (persons.length) parts.push(`登场：${persons.join('、')}`)
  if (places.length) parts.push(`地点：${places.join('、')}`)
  if (parts.length === 0 && topWords.length) parts.push(`高频：${topWords.slice(0, 4).join('、')}`)
  if (events.length) parts.push(`事件：${events[0]}`)
  return parts.join('｜') || '本章无显著实体'
}

/** 抽取式关键句：按句中实体命中数排序取前 3 */
function pickKeySentences(walk: WalkResult): string[] {
  const scored: { hits: number; text: string }[] = []
  for (const [sid, names] of walk.sentenceHits) {
    const sentence = walk.sentences[sid]
    if (!sentence || sentence.text.length < 8 || sentence.text.length > 80) continue
    scored.push({ hits: names.size, text: sentence.text })
  }
  return scored
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((s) => s.text)
}

/** 分析全书并落库（可重复调用；用户锁定/忽略的实体不被覆盖，不再出现的旧实体被清理） */
export async function analyzeBook(bookId: string, cb: AnalyzeCallbacks): Promise<void> {
  const meta = await db.getBookMeta(bookId)
  if (!meta) throw new Error('书籍不存在')
  if (meta.chapterCount === 0) throw new Error('没有章节可分析')

  const ignored = new Set(meta.analysis?.ignoredNames ?? [])
  const chapterCount = meta.chapterCount

  try {
    // ---- 第 1 遍：统计字频/二元组（逐章读入即弃，全书正文不驻留内存） ----
    cb.onProgress(0.02, '统计字词')
    const stats = createStats()
    let chapterCountReal = 0
    for (let i = 0; i < chapterCount; i++) {
      const chapter = await db.getChapter(bookId, i)
      if (chapter) {
        chapterCountReal++
        stats.addText(chapter.text)
      }
      cb.onProgress(0.02 + (i / chapterCount) * 0.3, '统计字词')
    }
    if (chapterCountReal === 0) throw new Error('没有可分析的正文内容')

    // ---- 第 2 遍：PMI 链发现候选词（流式扫描） ----
    cb.onProgress(0.35, '发现候选词')
    const strong = buildStrongSet(stats)
    const windows = new Map<string, WindowStat>()
    for (let i = 0; i < chapterCount; i++) {
      const chapter = await db.getChapter(bookId, i)
      if (chapter) scanChapterWindows(chapter.text, strong, windows, i)
    }
    const candidates = filterWindows(windows)
    const graphNames = new Set(
      [...candidates.values()]
        .filter((c) => c.count >= GRAPH_MIN_COUNT && !ignored.has(c.word))
        .map((c) => c.word)
    )
    windows.clear() // 释放窗口统计内存

    // 已有实体与其别名：别名（≥2 字）参与重分析匹配，人工合并/改名的知识得以保留
    const existing = await db.listEntities(bookId)
    const aliasToEntityId = new Map<string, string>()
    for (const e of existing) {
      for (const a of e.aliases) {
        if (a.length >= 2 && !candidates.has(a) && !ignored.has(a)) aliasToEntityId.set(a, e.id)
      }
    }
    const extraNames = new Set(aliasToEntityId.keys())

    // ---- 第 3 遍：分类 + 事件 + 章节索引 + 共现 + 例句（逐章读入即弃） ----
    const globalCounts = new Map<string, number>()
    const globalVotes = new Map<string, Votes>()
    const samples = new Map<string, Sample[]>()
    const chapterWalks: WalkResult[] = []
    for (let i = 0; i < chapterCount; i++) {
      const chapter = await db.getChapter(bookId, i)
      if (!chapter) continue
      const walk = walkChapter(chapter.text, candidates, extraNames, graphNames, globalVotes, samples, i)
      chapterWalks.push(walk)
      for (const [name, count] of walk.counts) {
        globalCounts.set(name, (globalCounts.get(name) ?? 0) + count)
      }
      cb.onProgress(0.4 + (i / chapterCount) * 0.5, '识别实体')
    }

    // ---- 实体落库（保留用户锁定/自定义项；别名命中归入现有实体） ----
    const byName = new Map(existing.map((e) => [e.name, e]))
    const byId = new Map(existing.map((e) => [e.id, e]))
    const nameType = new Map<string, EntityType>()
    const idByName = new Map<string, string>()
    const entitiesToSave: Entity[] = []
    const savedIds = new Set<string>()

    const sortedNames = [...globalCounts.entries()].sort((a, b) => b[1] - a[1])
    for (const [name] of sortedNames) {
      if (ignored.has(name)) continue
      const votes = globalVotes.get(name) ?? {}
      const type = decideType(votes)
      const chapters: number[] = []
      for (let i = 0; i < chapterWalks.length; i++) {
        if (chapterWalks[i].counts.has(name)) chapters.push(i)
      }
      const newSamples = samples.get(name) ?? []

      // 别名命中：计数/章节/例句并入现有实体（不新建实体）
      const aliasOwnerId = aliasToEntityId.get(name)
      if (aliasOwnerId) {
        const owner = byId.get(aliasOwnerId)
        idByName.set(name, aliasOwnerId)
        if (owner) {
          nameType.set(name, owner.type)
          if (!owner.locked) {
            owner.count += globalCounts.get(name) ?? 0
            owner.chapters = [...new Set([...owner.chapters, ...chapters])].sort((a, b) => a - b)
            owner.samples = [...owner.samples, ...newSamples.map((s) => s.text)].slice(0, SAMPLE_CAP)
            owner.sampleChapters = [...(owner.sampleChapters ?? []), ...newSamples.map((s) => s.chapter)].slice(0, SAMPLE_CAP)
            if (!savedIds.has(owner.id)) {
              savedIds.add(owner.id)
              entitiesToSave.push(owner)
            }
          }
        }
        continue
      }

      const existingEntity = byName.get(name)
      if (existingEntity) {
        if (existingEntity.locked) {
          // 用户锁定：保留原数据，仅保留引用（不重建、不覆盖）
          idByName.set(name, existingEntity.id)
          nameType.set(name, existingEntity.type)
          continue
        }
        existingEntity.type = type
        existingEntity.chapters = chapters
        existingEntity.count = globalCounts.get(name) ?? 0
        existingEntity.samples = [...existingEntity.samples, ...newSamples.map((s) => s.text)].slice(0, SAMPLE_CAP)
        existingEntity.sampleChapters = [...(existingEntity.sampleChapters ?? []), ...newSamples.map((s) => s.chapter)].slice(0, SAMPLE_CAP)
        if (!savedIds.has(existingEntity.id)) {
          savedIds.add(existingEntity.id)
          entitiesToSave.push(existingEntity)
        }
        idByName.set(name, existingEntity.id)
      } else {
        const entity: Entity = {
          id: genId(),
          bookId,
          name,
          type,
          aliases: [],
          chapters,
          count: globalCounts.get(name) ?? 0,
          samples: newSamples.map((s) => s.text),
          sampleChapters: newSamples.map((s) => s.chapter),
          note: '',
          custom: false,
          locked: false,
        }
        entitiesToSave.push(entity)
        idByName.set(name, entity.id)
      }
      nameType.set(name, type)
    }
    if (entitiesToSave.length) await db.putEntities(entitiesToSave)

    // 残留清理：本次未出现（名字与别名都未命中）且未被锁定/手动创建的旧实体删除。
    // 章节索引与关系在本轮整体重建，无需清理引用
    const hitIds = new Set(idByName.values())
    for (const e of existing) {
      if (!e.locked && !e.custom && !hitIds.has(e.id)) {
        await db.deleteEntity(e.id)
      }
    }

    // ---- 章节索引 ----
    const indexList: ChapterIndex[] = []
    for (let i = 0; i < chapterWalks.length; i++) {
      const walk = chapterWalks[i]
      const entityCounts: Record<string, number> = {}
      for (const [name, count] of walk.counts) {
        const id = idByName.get(name)
        if (id) entityCounts[id] = (entityCounts[id] ?? 0) + count
      }
      const topWords = [...walk.wordCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([w]) => w)
      const events = [...walk.events.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([e]) => e)
      indexList.push({
        id: `${bookId}:${i}`,
        bookId,
        index: i,
        entityCounts,
        topWords,
        summary: buildSummary(walk.counts, nameType, topWords, events),
        keySentences: pickKeySentences(walk),
        events,
      })
    }
    if (indexList.length) await db.saveChapterIndexes(indexList)

    // ---- 共现关系（仅人物/势力之间，按实体 id 去重合并——别名与原名可能指向同一实体） ----
    const relMapById = new Map<string, Relation>()
    for (const walk of chapterWalks) {
      for (const [key, weight] of walk.cooccur) {
        if (weight < GRAPH_MIN_WEIGHT) continue
        const [na, nb] = key.split('|')
        const ta = nameType.get(na)
        const tb = nameType.get(nb)
        if (!ta || !tb || !(ta === 'person' || ta === 'org') || !(tb === 'person' || tb === 'org')) continue
        const idA = idByName.get(na)
        const idB = idByName.get(nb)
        if (!idA || !idB || idA === idB) continue
        const pairKey = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
        const cur = relMapById.get(pairKey)
        if (cur) cur.weight += weight
        else relMapById.set(pairKey, { id: `${bookId}:${pairKey}`, bookId, a: idA, b: idB, weight })
      }
    }
    const relations = [...relMapById.values()].sort((x, y) => y.weight - x.weight)
    if (relations.length > MAX_RELATIONS) relations.length = MAX_RELATIONS
    // 整体替换：旧分析残留的关系（实体已删除/被忽略后不再生成）一并清除
    await db.replaceRelations(bookId, relations)

    // ---- 更新分析状态 ----
    const state: AnalysisState = {
      status: 'done',
      progress: 1,
      entityCount: entitiesToSave.length,
      ignoredNames: [...ignored],
      updatedAt: Date.now(),
    }
    await db.updateBookAnalysis(bookId, state)
    cb.onProgress(1, '完成')
  } catch (error) {
    const state: AnalysisState = {
      status: 'error',
      progress: 0,
      entityCount: 0,
      ignoredNames: [...ignored],
      error: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    }
    await db.updateBookAnalysis(bookId, state)
    throw error
  }
}
