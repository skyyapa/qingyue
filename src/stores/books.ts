import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as db from '@/db'
import { importBook } from '@/parsers'
import type { BookMeta, ReadProgress, TextEncoding } from '@/types'

/** 生成书籍 ID（非安全上下文下回退到时间戳+随机数） */
function genId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const useBooksStore = defineStore('books', () => {
  /** 书架书籍列表（新书在前） */
  const books = ref<BookMeta[]>([])
  const loaded = ref(false)
  const importing = ref(false)
  const importError = ref('')

  async function refresh(): Promise<void> {
    books.value = await db.listBookMetas()
    loaded.value = true
  }

  /** 导入一个或多个文件；成功返回最后一本导入的书 */
  async function importFiles(files: FileList | File[], encoding?: TextEncoding): Promise<BookMeta | null> {
    importing.value = true
    importError.value = ''
    let last: BookMeta | null = null
    try {
      for (const file of Array.from(files)) {
        const parsed = await importBook(file, encoding)
        const id = genId()
        const meta: BookMeta = {
          id,
          title: parsed.title,
          author: parsed.author,
          source: file.name.toLowerCase().endsWith('.epub') ? 'epub' : 'txt',
          chapterCount: parsed.chapters.length,
          chapterTitles: parsed.chapters.map((c) => c.title),
          createdAt: Date.now(),
          progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
        }
        await db.addBook(meta)
        await db.saveChapters(
          parsed.chapters.map((c, i) => ({ id: `${id}:${i}`, bookId: id, index: i, title: c.title, text: c.text }))
        )
        last = meta
      }
      await refresh()
      return last
    } catch (error) {
      importError.value = error instanceof Error ? error.message : String(error)
      return null
    } finally {
      importing.value = false
    }
  }

  /** 删除书籍（连同全部章节） */
  async function removeBook(id: string): Promise<void> {
    await db.deleteBook(id)
    await refresh()
  }

  /** 保存阅读进度 */
  async function saveProgress(id: string, progress: ReadProgress): Promise<void> {
    await db.updateBookProgress(id, progress)
    const meta = books.value.find((b) => b.id === id)
    if (meta) meta.progress = progress
  }

  return { books, loaded, importing, importError, refresh, importFiles, removeBook, saveProgress }
})
