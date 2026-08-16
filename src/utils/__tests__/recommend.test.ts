import { describe, expect, it } from 'vitest'
import {
  classifyByTitle,
  genreProfile,
  hasRead,
  recommendBooks,
  type Recommendation,
} from '../recommend'
import type { BookMeta } from '@/types'

function makeBook(id: string, title: string, author = '佚名', partial: Partial<BookMeta> = {}): BookMeta {
  return {
    id,
    title,
    author,
    source: 'txt',
    chapterCount: 10,
    chapterTitles: [],
    chapterChars: [],
    totalChars: 0,
    group: '',
    createdAt: 0,
    progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: 0 },
    ...partial,
  }
}

describe('classifyByTitle 题材分类', () => {
  it('按标题关键词识别题材', () => {
    expect(classifyByTitle('斗破苍穹')).toContain('xuanhuan')
    expect(classifyByTitle('凡人修仙传')).toContain('xianxia')
    expect(classifyByTitle('都市之最强赘婿')).toContain('urban')
    expect(classifyByTitle('江湖风云录')).toContain('wuxia')
    expect(classifyByTitle('三体星际旅行')).toContain('scifi')
    expect(classifyByTitle('大唐明月')).toContain('history')
    expect(classifyByTitle('总裁夫人我不嫁')).toContain('romance')
    expect(classifyByTitle('迷雾侦探社')).toContain('suspense')
    expect(classifyByTitle('无限流之副本世界')).toContain('game')
    expect(classifyByTitle('末世废土求生')).toContain('apocalypse')
  })

  it('无明显关键词归为 unknown（不误报）', () => {
    expect(classifyByTitle('平凡的世界')).toEqual(['unknown'])
    expect(classifyByTitle('一件小事')).toEqual(['unknown'])
  })

  it('可能命中多个题材', () => {
    // 「大明」历史 + 「官场」历史同题材；不同类型不得混
    expect(classifyByTitle('大唐星际战争')).toContain('history')
  })
})

describe('hasRead 已读判断', () => {
  it('章节或滚动有进度即算已读', () => {
    expect(hasRead(makeBook('a', '甲'))).toBe(false)
    expect(hasRead(makeBook('a', '甲', '佚名', { progress: { chapterIndex: 2, scrollRatio: 0, updatedAt: 0 } }))).toBe(true)
    expect(hasRead(makeBook('a', '甲', '佚名', { progress: { chapterIndex: 0, scrollRatio: 0.5, updatedAt: 0 } }))).toBe(true)
  })
})

describe('recommendBooks 书库内同类型推荐', () => {
  const books = [
    makeBook('t', '斗破苍穹', '作家A'), // 玄幻
    makeBook('x', '斗罗大陆之神界', '作家A'), // 玄幻，同作者
    makeBook('y', '万族之劫', '作家B'), // 玄幻，仅同题材
    makeBook('z', '凡人修仙传', '作家C'), // 仙侠，无关
    makeBook('u', '未知小书', '作家D'), // unknown
  ]

  it('推荐含同题材书，且同题材同作者排在仅同题材前', () => {
    const recs: Recommendation[] = recommendBooks(books, 't')
    const ids = recs.map((r) => r.book.id)
    expect(ids).toContain('x')
    expect(ids).toContain('y')
    expect(ids.indexOf('x')).toBeLessThan(ids.indexOf('y')) // x(玄幻+同作者) > y(玄幻)
  })

  it('同题材且同作者优先（分更高）', () => {
    const recs = recommendBooks(books, 't')
    const x = recs.find((r) => r.book.id === 'x')!
    const y = recs.find((r) => r.book.id === 'y')!
    expect(x.sharedGenres).toContain('xuanhuan')
    expect(x.sameAuthor).toBe(true)
    expect(y.sameAuthor).toBe(false)
    expect(x.score).toBeGreaterThan(y.score)
  })

  it('排除目标书自身与无关（不同题材不同作者 / unknown）书', () => {
    const recs = recommendBooks(books, 't')
    expect(recs.find((r) => r.book.id === 't')).toBeUndefined()
    expect(recs.find((r) => r.book.id === 'z')).toBeUndefined() // 仙侠不同作者
    expect(recs.find((r) => r.book.id === 'u')).toBeUndefined() // unknown
  })

  it('目标书不在书库时返回空', () => {
    expect(recommendBooks(books, 'nope')).toEqual([])
  })
})

describe('genreProfile 书库题材画像', () => {
  it('统计各题材书籍数并降序，忽略 unknown', () => {
    const books = [
      makeBook('a', '斗破苍穹'),
      makeBook('b', '凡人修仙传'),
      makeBook('c', '都市赘婿'),
      makeBook('d', '平凡的事'),
    ]
    const profile = genreProfile(books)
    expect(profile.map((p) => p.genre)).not.toContain('unknown')
    expect(profile[0].count).toBeGreaterThanOrEqual(1)
  })
})
