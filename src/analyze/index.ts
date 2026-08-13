/** 全书知识库分析管线（无 AI，确定性算法）
 *  三遍扫描（内存友好，逐章读入即可）：
 *   1. 字频/二元组统计 → 2. PMI 链发现候选词 → 3. 上下文分类 + 章节索引 + 共现关系
 *  产物写入 IndexedDB（entities / chapterIndex / relations），可重复分析（用户锁定/忽略项保留）
 */
import * as db from '@/db'
import { genId } from '@/utils/id'
import type { AnalysisState, ChapterIndex, Entity, EntityType, Relation } from '@/types'
import { createStats, discoverCandidates, isCJK, type WordCandidate } from './segment'
import { decideType, voteContext, type Votes } from './classify'

export interface AnalyzeCallbacks {
  onProgress(ratio: number, phase: string): void
}

/** 关系图参与阈值：全局出现次数与共现次数低于此值的实体不建边 */
const GRAPH_MIN_COUNT = 5
const GRAPH_MIN_WEIGHT = 3
const MAX_RELATIONS = 500
const SAMPLE_CAP = 5

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
}

/** 扫描一章：最长优先匹配候选词，上下文投票，记录共现与例句 */
function walkChapter(
  text: string,
  candidates: Map<string, WordCandidate>,
  graphNames: Set<string>,
  globalVotes: Map<string, Votes>,
  samples: Map<string, string[]>
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
    // 最长优先匹配候选词
    let matched = ''
    for (let len = 6; len >= 2; len--) {
      const w = text.slice(i, i + len)
      if (candidates.has(w)) {
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
    if (graphNames.has(matched)) paraEntities.add(matched)

    // 上下文投票
    const prev2 = text.slice(Math.max(0, i - 2), i)
    const prev = text[i - 1] ?? ''
    const next = text[i + matched.length] ?? ''
    const next2 = text.slice(i + matched.length, i + matched.length + 2)
    const votes = globalVotes.get(matched) ?? {}
    voteContext(prev2, prev, next, next2, votes)
    globalVotes.set(matched, votes)

    // 例句收集（每个实体全书记录去重，截取含实体的短句）
    const sentence = sentences[sentIdx]
    if (sentence && sentence.text.length >= 8 && sentence.text.length <= 80) {
      let set = sentenceHits.get(sentIdx)
      if (!set) {
        set = new Set()
        sentenceHits.set(sentIdx, set)
      }
      set.add(matched)
      const got = perNameSamples.get(matched) ?? 0
      if (got < 3) {
        const list = samples.get(matched) ?? []
        if (list.length < SAMPLE_CAP) {
          list.push(sentence.text)
          samples.set(matched, list)
        }
        perNameSamples.set(matched, got + 1)
      }
    }
    i += matched.length
  }
  flushParagraph()
  return { counts, cooccur, wordCounts, sentenceHits, sentences }
}

/** 无 AI 章节摘要：登场人物 + 地点（模板式） */
function buildSummary(
  counts: Map<string, number>,
  nameType: Map<string, EntityType>,
  topWords: string[]
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

/** 分析全书并落库（可重复调用；用户锁定/忽略的实体不被覆盖） */
export async function analyzeBook(bookId: string, cb: AnalyzeCallbacks): Promise<void> {
  const meta = await db.getBookMeta(bookId)
  if (!meta) throw new Error('书籍不存在')
  if (meta.chapterCount === 0) throw new Error('没有章节可分析')

  const ignored = new Set(meta.analysis?.ignoredNames ?? [])
  const chapterCount = meta.chapterCount

  try {
    // ---- 第 1 遍：统计字频/二元组（同时收集章节文本） ----
    cb.onProgress(0.02, '统计字词')
    const stats = createStats()
    const texts: string[] = []
    for (let i = 0; i < chapterCount; i++) {
      const chapter = await db.getChapter(bookId, i)
      if (chapter) {
        texts.push(chapter.text)
        stats.addText(chapter.text)
      }
      cb.onProgress(0.02 + (i / chapterCount) * 0.3, '统计字词')
    }
    if (texts.length === 0) throw new Error('没有可分析的正文内容')

    // ---- 第 2 遍：PMI 链发现候选词 ----
    cb.onProgress(0.35, '发现候选词')
    const candidates = discoverCandidates(texts, stats)
    const graphNames = new Set(
      [...candidates.values()]
        .filter((c) => c.count >= GRAPH_MIN_COUNT && !ignored.has(c.word))
        .map((c) => c.word)
    )

    // ---- 第 3 遍：分类 + 章节索引 + 共现 + 例句 ----
    const globalCounts = new Map<string, number>()
    const globalVotes = new Map<string, Votes>()
    const samples = new Map<string, string[]>()
    const chapterWalks: WalkResult[] = []
    for (let i = 0; i < texts.length; i++) {
      const walk = walkChapter(texts[i], candidates, graphNames, globalVotes, samples)
      chapterWalks.push(walk)
      for (const [name, count] of walk.counts) {
        globalCounts.set(name, (globalCounts.get(name) ?? 0) + count)
      }
      cb.onProgress(0.4 + (i / texts.length) * 0.5, '识别实体')
    }

    // ---- 实体落库（保留用户锁定/自定义项） ----
    const existing = await db.listEntities(bookId)
    const byName = new Map(existing.map((e) => [e.name, e]))
    const nameType = new Map<string, EntityType>()
    const idByName = new Map<string, string>()
    const entitiesToSave: Entity[] = []

    const sortedNames = [...globalCounts.entries()].sort((a, b) => b[1] - a[1])
    for (const [name] of sortedNames) {
      if (ignored.has(name)) continue
      const votes = globalVotes.get(name) ?? {}
      const type = decideType(votes)
      const chapters: number[] = []
      for (let i = 0; i < chapterWalks.length; i++) {
        if (chapterWalks[i].counts.has(name)) chapters.push(i)
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
        existingEntity.samples = [...existingEntity.samples, ...(samples.get(name) ?? [])].slice(0, SAMPLE_CAP)
        entitiesToSave.push(existingEntity)
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
          samples: samples.get(name) ?? [],
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

    // ---- 章节索引 ----
    const indexList: ChapterIndex[] = []
    for (let i = 0; i < chapterWalks.length; i++) {
      const walk = chapterWalks[i]
      const entityCounts: Record<string, number> = {}
      for (const [name, count] of walk.counts) {
        const id = idByName.get(name)
        if (id) entityCounts[id] = count
      }
      const topWords = [...walk.wordCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([w]) => w)
      indexList.push({
        id: `${bookId}:${i}`,
        bookId,
        index: i,
        entityCounts,
        topWords,
        summary: buildSummary(walk.counts, nameType, topWords),
        keySentences: pickKeySentences(walk),
      })
    }
    if (indexList.length) await db.saveChapterIndexes(indexList)

    // ---- 共现关系（仅人物/势力之间） ----
    const relMap = new Map<string, number>()
    for (const walk of chapterWalks) {
      for (const [key, weight] of walk.cooccur) {
        relMap.set(key, (relMap.get(key) ?? 0) + weight)
      }
    }
    const relations: Relation[] = []
    for (const [key, weight] of relMap) {
      if (weight < GRAPH_MIN_WEIGHT) continue
      const [a, b] = key.split('|')
      const ta = nameType.get(a)
      const tb = nameType.get(b)
      if (!ta || !tb || !(ta === 'person' || ta === 'org') || !(tb === 'person' || tb === 'org')) continue
      const idA = idByName.get(a)
      const idB = idByName.get(b)
      if (!idA || !idB || idA === idB) continue
      relations.push({ id: `${bookId}:${idA}:${idB}`, bookId, a: idA, b: idB, weight })
    }
    relations.sort((x, y) => y.weight - x.weight)
    if (relations.length > MAX_RELATIONS) relations.length = MAX_RELATIONS
    if (relations.length) await db.saveRelations(relations)

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
