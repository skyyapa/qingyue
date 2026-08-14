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

function cleanText(text: string): string {
  return text.replace(/\[\/?[biu]\]/g, '').replace(/\[img:\d+\]/g, '[插图]').replace(/\s+/g, ' ').trim()
}

/** 搜索已提供章节，按章节聚合结果；大小写不敏感适用于英文字词，中文不受影响 */
export function searchBookChapters(chapters: Chapter[], rawTerm: string): BookSearchResult[] {
  const term = rawTerm.trim()
  if (!term) return []
  const needle = term.toLocaleLowerCase()
  const results: BookSearchResult[] = []
  for (const chapter of [...chapters].sort((a, b) => a.index - b.index)) {
    const text = cleanText(chapter.text)
    const lower = text.toLocaleLowerCase()
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
    if (first < 0) continue
    const start = Math.max(0, first - CONTEXT)
    const end = Math.min(text.length, first + term.length + CONTEXT)
    const excerpt = `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
    results.push({ chapterIndex: chapter.index, chapterTitle: chapter.title, excerpt, count })
    if (results.length >= MAX_RESULTS) break
  }
  return results
}
