import { describe, expect, it } from 'vitest'
import { searchBookChapters } from '../book-search'
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
})
