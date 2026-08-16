import { describe, expect, it } from 'vitest'
import { searchBookChapters, searchBookChaptersBatched, searchChapterText, type BookSearchResult } from '../book-search'
import type { Chapter } from '@/types'

function chapter(index: number, text: string): Chapter {
  return { id: `b:${index}`, bookId: 'b', index, title: `第${index + 1}章`, text }
}

describe('searchBookChapters 全书搜索', () => {
  it('按章节聚合、大小写不敏感并生成上下文摘要', () => {
    const results = searchBookChapters(
      [chapter(2, '最后一章提到 Night。'), chapter(0, '林夜出现。林夜再次出现。'), chapter(1, '苏晚看见林夜。')],
      '林夜'
    )
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.chapterIndex)).toEqual([0, 1])
    expect(results[0].count).toBe(2)
    expect(results[1].excerpt).toContain('林夜')
    expect(searchBookChapters([chapter(0, 'A NIGHT sky')], 'night')[0].count).toBe(1)
  })

  it('清理行内样式与图片占位符，摘要可读', () => {
    const results = searchBookChapters([chapter(0, '这里有[b]林夜[/b]和[img:0]，还有[i]林夜[/i]。')], '林夜')
    expect(results).toHaveLength(1)
    expect(results[0].count).toBe(2)
    expect(results[0].excerpt).not.toContain('[b]')
    expect(results[0].excerpt).toContain('[插图]')
  })

  it('空关键词无结果，结果限制为 80 章', () => {
    expect(searchBookChapters([chapter(0, '正文')], '   ')).toEqual([])
    const chapters = Array.from({ length: 100 }, (_, i) => chapter(i, '关键词'))
    const results = searchBookChapters(chapters, '关键词')
    expect(results).toHaveLength(80)
    expect(results.at(-1)?.chapterIndex).toBe(79)
  })

  it('searchChapterText 单章扫描：命中返回摘要与计数，无命中为 null', () => {
    expect(searchChapterText('林夜出现。林夜再次出现。', '林夜')).toEqual({ excerpt: expect.stringContaining('林夜'), count: 2 })
    expect(searchChapterText('[b]林夜[/b]和[img:0]', '林夜')).not.toBeNull()
    expect(searchChapterText('与关键词无关。', '林夜')).toBeNull()
    expect(searchChapterText('任意文本', '   ')).toBeNull()
  })
})

describe('searchBookChaptersBatched 分批异步搜索', () => {
  /** 把 onBatch 回调包装成 Promise，等待 done=true */
  function runBatched(chapters: Chapter[], term: string, batchSize?: number): Promise<BookSearchResult[]> {
    return new Promise((resolve) => {
      const cancel = searchBookChaptersBatched(chapters, term, (results, done) => {
        if (done) resolve(results)
      }, batchSize)
      void cancel
    })
  }

  it('跨越多个批次仍能聚合完整结果并升序排章', async () => {
    const chapters = Array.from({ length: 10 }, (_, i) => chapter(i * 2, '林夜'))
    chapters.push(chapter(1, '林夜'))
    const all = await runBatched(chapters, '林夜', 3)
    // index 来自 i*2（0..18，步进 2）+ 额外 index 1 → 排序升序
    expect(all.map((r) => r.chapterIndex)).toEqual([0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18])
    expect(all.every((r) => r.excerpt.includes('林夜'))).toBe(true)
  })

  it('空关键词立即结束并返回空数组', async () => {
    const all = await runBatched([chapter(0, '正文')], '   ')
    expect(all).toEqual([])
  })
})
