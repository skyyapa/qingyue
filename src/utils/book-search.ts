import type { Chapter } from '@/types'

export interface BookSearchResult {
  chapterIndex: number
  chapterTitle: string
  /** 包含关键词的上下文摘要 */
  excerpt: string
  /** 该章匹配数量 */
  count: number
}

const MAX_RESULTS = 80
const CONTEXT = 32

// 行内样式 / 图片占位符正则提到模块顶层，避免每次调用重复创建
const INLINE_MARKUP = /\[\/?[biu]\]/g
const IMG_PLACEHOLDER = /\[img:\d+\]/g

function cleanText(text: string): string {
  return text.replace(INLINE_MARKUP, '').replace(IMG_PLACEHOLDER, '[插图]').replace(/\s+/g, ' ').trim()
}

/** 扫描单章，返回聚合结果（无命中返回 null） */
export function searchChapterText(text: string, rawTerm: string): Pick<BookSearchResult, 'excerpt' | 'count'> | null {
  const term = rawTerm.trim()
  if (!term) return null
  const needle = term.toLocaleLowerCase()
  const cleaned = cleanText(text)
  const lower = cleaned.toLocaleLowerCase()
  let pos = 0
  let first = -1
  let count = 0
  while (true) {
    const found = lower.indexOf(needle, pos)
    if (found < 0) break
    if (first < 0) first = found
    count++
    pos = found + term.length
  }
  if (first < 0) return null
  const start = Math.max(0, first - CONTEXT)
  const end = Math.min(cleaned.length, first + term.length + CONTEXT)
  const excerpt = `${start > 0 ? '…' : ''}${cleaned.slice(start, end)}${end < cleaned.length ? '…' : ''}`
  return { excerpt, count }
}

/** 搜索已提供章节，按章节聚合结果；大小写不敏感适用于英文字词，中文不受影响 */
export function searchBookChapters(chapters: Chapter[], rawTerm: string): BookSearchResult[] {
  const term = rawTerm.trim()
  if (!term) return []
  const results: BookSearchResult[] = []
  for (const chapter of [...chapters].sort((a, b) => a.index - b.index)) {
    const hit = searchChapterText(chapter.text, term)
    if (!hit) continue
    results.push({ chapterIndex: chapter.index, chapterTitle: chapter.title, ...hit })
    if (results.length >= MAX_RESULTS) break
  }
  return results
}

/** 分批异步搜索：对大书（几百章 × 上万字）在主线程分片扫描，每片让出事件循环，
 *  保持 UI 响应不卡死。每处理一个批次回调 onBatch（返回是否继续，false 则停止）。
 *  返回一个 cancel 函数，可中断正在进行的搜索。 */
export function searchBookChaptersBatched(
  chapters: Chapter[],
  rawTerm: string,
  onBatch: (results: BookSearchResult[], done: boolean) => void,
  batchSize = 40
): () => void {
  const term = rawTerm.trim()
  const results: BookSearchResult[] = []
  let cancelled = false
  let cursor = 0
  const sorted = [...chapters].sort((a, b) => a.index - b.index)

  function processNext(): void {
    if (cancelled) return
    const end = Math.min(sorted.length, cursor + batchSize)
    for (; cursor < end; cursor++) {
      const hit = searchChapterText(sorted[cursor].text, term)
      if (!hit) continue
      results.push({
        chapterIndex: sorted[cursor].index,
        chapterTitle: sorted[cursor].title,
        ...hit,
      })
      if (results.length >= MAX_RESULTS) { cursor = end; break }
    }
    const done = cursor >= sorted.length || results.length >= MAX_RESULTS
    onBatch([...results], done)
    if (!done && !cancelled) {
      // 让出主线程，下一片在宏任务里继续，避免长时间阻塞渲染
      setTimeout(processNext, 0)
    }
  }

  if (term && sorted.length > 0) {
    // 首次调度放到宏任务：确保调用方先把返回的 cancel 保存好，再执行首片，
    // 避免「onBatch 同步触发更新状态时 cancel 尚未赋值」的时序问题
    setTimeout(processNext, 0)
  } else {
    onBatch([], true)
  }

  return () => { cancelled = true }
}
