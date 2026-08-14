import { beforeEach, describe, expect, it } from 'vitest'
import { getTodayChapters, recordTodayChapter } from '../reading-days'

describe('reading-days 今日阅读记录', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('记录去重并按章节序排列', () => {
    recordTodayChapter('b1', 5)
    recordTodayChapter('b1', 0)
    recordTodayChapter('b1', 5) // 去重
    const today = getTodayChapters()
    expect(today['b1']).toEqual([0, 5])
  })

  it('多本书隔离记录', () => {
    recordTodayChapter('b1', 1)
    recordTodayChapter('b2', 3)
    const today = getTodayChapters()
    expect(today['b1']).toEqual([1])
    expect(today['b2']).toEqual([3])
  })
})
