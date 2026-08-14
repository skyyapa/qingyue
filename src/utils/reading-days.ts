/** 每日阅读章节记录（localStorage：日期 → 书 → 章节号列表），供「每日阅读回顾」使用 */
import { toDateKey } from './stats-calendar'

const STORAGE_KEY = 'qingyue:reading-days'

type ReadingDays = Record<string, Record<string, number[]>>

function load(): ReadingDays {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** 记录某章今日被阅读过（去重，保持章节序） */
export function recordTodayChapter(bookId: string, chapterIndex: number): void {
  const data = load()
  const today = toDateKey(new Date())
  const day = data[today] ?? {}
  const list = day[bookId] ?? []
  if (!list.includes(chapterIndex)) {
    day[bookId] = [...list, chapterIndex].sort((a, b) => a - b)
    data[today] = day
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* 容量异常忽略 */
    }
  }
}

/** 今日读过的章节（bookId → 章节号列表） */
export function getTodayChapters(): Record<string, number[]> {
  const data = load()
  return data[toDateKey(new Date())] ?? {}
}
