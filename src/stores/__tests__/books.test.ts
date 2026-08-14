import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as db from '@/db'
import { useBooksStore } from '@/stores/books'
import type { BookMeta } from '@/types'

function makeMeta(id: string): BookMeta {
  return {
    id,
    title: `书${id}`,
    author: '作者',
    source: 'txt',
    chapterCount: 10,
    chapterTitles: Array.from({ length: 10 }, (_, i) => `第${i + 1}章`),
    chapterChars: Array.from({ length: 10 }, () => 100),
    totalChars: 1000,
    group: '',
    createdAt: Date.now(),
    progress: { chapterIndex: 5, scrollRatio: 0.6, updatedAt: Date.now() },
  }
}

describe('books store 阅读进度', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('resetProgress 回到第一章开头并同步 IndexedDB', async () => {
    const meta = makeMeta('rp1')
    await db.addBook(meta)
    const books = useBooksStore()
    books.books = [meta]

    await books.resetProgress('rp1')

    const saved = await db.getBookMeta('rp1')
    expect(saved?.progress.chapterIndex).toBe(0)
    expect(saved?.progress.scrollRatio).toBe(0)
    expect(books.books[0].progress.chapterIndex).toBe(0) // 内存同步
  })
})
