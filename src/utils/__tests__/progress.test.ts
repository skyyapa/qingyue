import { describe, expect, it } from 'vitest'
import { bookReadPercent, formatDuration, formatPercent } from '../progress'
import type { BookMeta } from '@/types'

function makeMeta(partial: Partial<BookMeta>): BookMeta {
  return {
    id: 'b1',
    title: '测试书',
    author: '作者',
    source: 'txt',
    chapterCount: 3,
    chapterTitles: ['一', '二', '三'],
    chapterChars: [100, 200, 300],
    totalChars: 600,
    group: '',
    createdAt: 0,
    progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: 0 },
    ...partial,
  }
}

describe('bookReadPercent 全书阅读占比', () => {
  it('按字数加权：读完第一章 100/600 ≈ 16.7%', () => {
    const meta = makeMeta({ progress: { chapterIndex: 0, scrollRatio: 1, updatedAt: 0 } })
    expect(bookReadPercent(meta)).toBeCloseTo(100 / 600 * 100, 1)
  })

  it('章节中部按滚动比例折算', () => {
    const meta = makeMeta({ progress: { chapterIndex: 0, scrollRatio: 0.5, updatedAt: 0 } })
    expect(bookReadPercent(meta)).toBeCloseTo(50 / 600 * 100, 1)
  })

  it('读完第三章接近 100%', () => {
    const meta = makeMeta({ progress: { chapterIndex: 2, scrollRatio: 1, updatedAt: 0 } })
    expect(bookReadPercent(meta)).toBe(100)
  })

  it('旧数据（无字数）退化为章节估算', () => {
    const meta = makeMeta({ chapterChars: [], totalChars: 0, progress: { chapterIndex: 1, scrollRatio: 0, updatedAt: 0 } })
    expect(bookReadPercent(meta)).toBeCloseTo(2 / 3 * 100, 1)
  })
})

describe('formatPercent / formatDuration 格式化', () => {
  it('百分比：≥10 取整，<10 保留一位', () => {
    expect(formatPercent(16.67)).toBe('17%')
    expect(formatPercent(99.99)).toBe('100%')
    expect(formatPercent(5.3)).toBe('5.3%')
  })
  it('时长：秒/分钟/小时', () => {
    expect(formatDuration(45)).toBe('45 秒')
    expect(formatDuration(600)).toBe('10 分钟')
    expect(formatDuration(3700)).toBe('1 小时 1 分')
  })
})
