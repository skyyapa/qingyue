import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as db from '@/db'
import type { BookMeta, Chapter } from '@/types'
import { useBooksStore } from './books'

export const useReaderStore = defineStore('reader', () => {
  const booksStore = useBooksStore()

  const book = ref<BookMeta | null>(null)
  const chapter = ref<Chapter | null>(null)
  const chapterIndex = ref(0)
  const loading = ref(false)
  const error = ref('')

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

  /** 加载指定章节（越界自动钳制） */
  async function loadChapter(index: number): Promise<void> {
    if (!book.value) return
    const clamped = Math.max(0, Math.min(index, book.value.chapterCount - 1))
    loading.value = true
    try {
      chapter.value = (await db.getChapter(book.value.id, clamped)) ?? null
      chapterIndex.value = clamped
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

  return { book, chapter, chapterIndex, chapterTitles, chapterCount, loading, error, openBook, loadChapter, saveProgress }
})
