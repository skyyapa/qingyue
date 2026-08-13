import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as db from '@/db'
import { getSource } from '@/book-source/store'
import { fetchContent } from '@/book-source/engine'
import type { BookMeta, Chapter } from '@/types'
import { useBooksStore } from './books'

export const useReaderStore = defineStore('reader', () => {
  const booksStore = useBooksStore()

  const book = ref<BookMeta | null>(null)
  const chapter = ref<Chapter | null>(null)
  const chapterIndex = ref(0)
  const loading = ref(false)
  const error = ref('')
  /** 在线书章节抓取错误（可重试） */
  const fetchError = ref('')

  const chapterTitles = computed(() => book.value?.chapterTitles ?? [])
  const chapterCount = computed(() => book.value?.chapterCount ?? 0)

  /** 打开书籍并跳转到上次阅读位置 */
  async function openBook(id: string): Promise<void> {
    error.value = ''
    const meta = await db.getBookMeta(id)
    if (!meta) {
      error.value = '书籍不存在或已被删除'
      book.value = null
      return
    }
    book.value = meta
    await loadChapter(Math.min(meta.progress.chapterIndex, Math.max(meta.chapterCount - 1, 0)))
  }

  /** 从书源抓取在线书章节正文并写入缓存 */
  async function fetchWebChapter(meta: BookMeta, index: number): Promise<Chapter | null> {
    const info = meta.webInfo
    if (!info || !info.chapterUrls[index]) return null
    const source = getSource(info.sourceId)
    if (!source) throw new Error('书源已不存在，请重新添加')
    const url = info.chapterUrls[index]
    const text = await fetchContent(source, url)
    const chap: Chapter = {
      id: `${meta.id}:${index}`,
      bookId: meta.id,
      index,
      title: meta.chapterTitles[index] ?? `第 ${index + 1} 章`,
      text,
    }
    await db.saveChapters([chap])
    return chap
  }

  /** 预取下一章（静默，失败忽略） */
  function prefetchNext(meta: BookMeta, index: number): void {
    if (index + 1 >= meta.chapterCount || !meta.webInfo) return
    db.getChapter(meta.id, index + 1).then((c) => {
      if (!c) {
        fetchWebChapter(meta, index + 1).catch(() => {
          /* 预取失败可忽略，阅读时再抓 */
        })
      }
    })
  }

  /** 加载指定章节（越界自动钳制）；在线书未缓存章节自动抓取 */
  async function loadChapter(index: number): Promise<void> {
    if (!book.value) return
    const meta = book.value
    const clamped = Math.max(0, Math.min(index, meta.chapterCount - 1))
    loading.value = true
    fetchError.value = ''
    try {
      let chap = (await db.getChapter(meta.id, clamped)) ?? null
      if (!chap && meta.source === 'web') {
        chap = await fetchWebChapter(meta, clamped)
      }
      chapter.value = chap
      chapterIndex.value = clamped
      if (chap) prefetchNext(meta, clamped)
    } catch (e) {
      fetchError.value = e instanceof Error ? e.message : String(e)
      chapter.value = null
    } finally {
      loading.value = false
    }
  }

  /** 保存进度（章内滚动比例由视图层计算传入） */
  async function saveProgress(scrollRatio: number): Promise<void> {
    if (!book.value) return
    const progress = {
      chapterIndex: chapterIndex.value,
      scrollRatio,
      updatedAt: Date.now(),
    }
    book.value.progress = progress // 同步内存中进度，供阅读器内「全书 %」实时计算
    await booksStore.saveProgress(book.value.id, progress)
  }

  return {
    book,
    chapter,
    chapterIndex,
    chapterTitles,
    chapterCount,
    loading,
    error,
    fetchError,
    openBook,
    loadChapter,
    saveProgress,
  }
})
