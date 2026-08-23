import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as db from '@/db'
import { useBooksStore } from '@/stores/books'
import type { BookMeta } from '@/types'

function makeMeta(id: string): BookMeta {
  const titles = ['第1章', '第2章']
  return {
    id,
    title: `书${id}`,
    author: '作者',
    source: 'txt',
    chapterCount: titles.length,
    chapterTitles: titles,
    chapterChars: [10, 20],
    totalChars: 30,
    group: '',
    createdAt: Date.now(),
    progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
  }
}

/** 构造一个 .json 的 File */
function jsonFile(name: string, data: unknown): File {
  return new File([JSON.stringify(data)], name, { type: 'application/json' })
}

function txtFile(name: string, text: string): File {
  return new File([text], name, { type: 'text/plain' })
}

describe('books store 导入路由（.json 单书 vs 全量备份）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('全量备份 .json 走备份恢复导入，不抛「不是有效的单书文件」', async () => {
    const backup = {
      app: 'qingyue',
      version: 1,
      exportedAt: new Date().toISOString(),
      groups: [],
      books: [makeMeta('bk1')],
      chapters: [],
      stats: { byDate: {} },
      sources: [],
    }
    const books = useBooksStore()
    const last = await books.importFiles([jsonFile('我的书单.json', backup)] as unknown as FileList)
    // 备份无单书 meta，last 保持 null；但书籍已恢复、且没有抛错
    expect(last).toBeNull()
    const metas = await db.listBookMetas()
    expect(metas.some((m) => m.id === 'bk1')).toBe(true)
    expect(books.importError).toBe('')
  })

  it('非法 .json（非轻阅导出）报错但不中断，且不会抛未捕获异常', async () => {
    const books = useBooksStore()
    const last = await books.importFiles([jsonFile('随便.json', { hello: 'world' })] as unknown as FileList)
    expect(last).toBeNull()
    expect(books.importError).toContain('不是轻阅导出的单书/备份格式')
  })

  it('批量导入：一个坏文件不中断后续文件', async () => {
    const books = useBooksStore()
    const fileList = [jsonFile('坏文件.json', { hello: 'world' })] as unknown as FileList
    const last = await books.importFiles(fileList)
    expect(last).toBeNull()
    expect(books.importError).toContain('坏文件.json')
    expect(books.importError).toContain('不是轻阅导出的单书/备份格式')
  })

  it('批量 TXT 可按文件名自然排序合并为一本书（每个文件作为一章）', async () => {
    const books = useBooksStore()
    const last = await books.importFiles(
      [txtFile('第10章 终局.txt', '十章正文'), txtFile('第2章 相遇.txt', '二章正文'), txtFile('第1章 开始.txt', '一章正文')],
      'utf-8',
      { mergeTxtChapters: true, mergedTitle: '章节合订本' }
    )
    expect(last?.title).toBe('章节合订本')
    expect(last?.chapterCount).toBe(3)
    expect(last?.chapterTitles).toEqual(['第1章 开始', '第2章 相遇', '第10章 终局'])
    const chapters = await db.listChapters(last!.id)
    expect(chapters.map((c) => c.text)).toEqual(['一章正文', '二章正文', '十章正文'])
    expect(books.importError).toBe('')
  })
})
