import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import * as db from '@/db'
import { importBook } from '@/parsers'
import { importBookBuffer } from '@/utils/export'
import { readFileWithProgress } from '@/utils/file'
import { fetchChapters } from '@/book-source/engine'
import type { BookSource } from '@/book-source/types'
import type { BookMeta, ReadProgress, TextEncoding } from '@/types'

/** 排序方式 */
export type SortMode = 'recent' | 'imported' | 'title' | 'manual'

const GROUPS_KEY = 'qingyue:groups'
const ORDER_KEY = 'qingyue:order'
const SORT_KEY = 'qingyue:sort'

function loadStringArray(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function loadOrderMap(key: string): Record<string, string[]> {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

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
  /** 导入进度：正在导入的文件名与读取进度 0-1 */
  const importFileName = ref('')
  const importProgress = ref(0)

  /** 自定义分组名列表（'' 为默认分组，不在列表内） */
  const groups = ref<string[]>(loadStringArray(GROUPS_KEY))
  /** 各分组内手动排序的书籍 ID 列表，key 为分组名（'' = 默认分组） */
  const groupOrder = ref<Record<string, string[]>>(loadOrderMap(ORDER_KEY))
  /** 全局排序方式 */
  const sortMode = ref<SortMode>((localStorage.getItem(SORT_KEY) as SortMode) || 'recent')

  watch(groups, (v) => localStorage.setItem(GROUPS_KEY, JSON.stringify(v)), { deep: true })
  watch(groupOrder, (v) => localStorage.setItem(ORDER_KEY, JSON.stringify(v)), { deep: true })
  watch(sortMode, (v) => localStorage.setItem(SORT_KEY, v))

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
        importFileName.value = file.name
        importProgress.value = 0
        const ext = (file.name.toLowerCase().split('.').pop() ?? '').toLowerCase()
        // 单书导出文件（.qingyue / .json）：直接恢复，不走 TXT/EPUB 解析
        if (ext === 'qingyue' || ext === 'json') {
          const buffer = await readFileWithProgress(file, (r) => {
            importProgress.value = r
          })
          const result = await importBookBuffer(buffer)
          if (result.imported === 1 && result.meta) last = result.meta
          continue
        }
        // 未知扩展名：嗅探文件头是否为单书 JSON（下载改名/传输丢扩展名兜底）
        if (ext !== 'txt' && ext !== 'epub') {
          const head = await file.slice(0, 4096).arrayBuffer()
          const headText = new TextDecoder('utf-8').decode(head)
          if (headText.includes('"app":"qingyue-book"')) {
            const buffer = await readFileWithProgress(file, (r) => {
              importProgress.value = r
            })
            const result = await importBookBuffer(buffer)
            if (result.imported === 1 && result.meta) last = result.meta
            continue
          }
        }
        const parsed = await importBook(file, encoding, (r) => {
          importProgress.value = r
        })
        importProgress.value = 1 // 读取完成，进入解析/入库阶段
        const id = genId()
        const chapterChars = parsed.chapters.map((c) => c.text.length)
        const meta: BookMeta = {
          id,
          title: parsed.title,
          author: parsed.author,
          source: file.name.toLowerCase().endsWith('.epub') ? 'epub' : 'txt',
          chapterCount: parsed.chapters.length,
          chapterTitles: parsed.chapters.map((c) => c.title),
          chapterChars,
          totalChars: chapterChars.reduce((a, b) => a + b, 0),
          group: '',
          createdAt: Date.now(),
          progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
        }
        await db.addBook(meta)
        await db.saveChapters(
          parsed.chapters.map((c, i) => ({
            id: `${id}:${i}`,
            bookId: id,
            index: i,
            title: c.title,
            text: c.text,
            images: parsed.chapterImages?.[i],
            paragraphStyles: c.paragraphStyles,
          }))
        )
        await db.saveBookFonts(id, parsed.bookFonts ?? [])
        last = meta
      }
      await refresh()
      return last
    } catch (error) {
      importError.value =
        error instanceof Error
          ? error.name === 'QuotaExceededError'
            ? '浏览器存储空间不足，无法保存该书，请清理书架后重试'
            : error.message
          : String(error)
      return null
    } finally {
      importing.value = false
      importFileName.value = ''
      importProgress.value = 0
    }
  }

  /** 重置阅读进度（回到第一章开头） */
  async function resetProgress(id: string): Promise<void> {
    const progress = { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() }
    await db.updateBookProgress(id, progress)
    const b = books.value.find((x) => x.id === id)
    if (b) b.progress = progress
  }

  /** 从书源搜索结果创建在线书：抓目录 → 建书（正文按需抓取缓存） */
  async function createWebBook(source: BookSource, bookUrl: string, title: string, author: string): Promise<BookMeta | null> {
    importing.value = true
    importError.value = ''
    importFileName.value = source.name
    try {
      const chapters = await fetchChapters(source, bookUrl)
      if (chapters.length === 0) throw new Error('目录解析失败：没有解析到章节')
      const id = genId()
      const meta: BookMeta = {
        id,
        title: title || chapters[0].title,
        author: author || '未知作者',
        source: 'web',
        webInfo: {
          sourceId: source.id,
          sourceName: source.name,
          bookUrl,
          chapterUrls: chapters.map((c) => c.url),
        },
        chapterCount: chapters.length,
        chapterTitles: chapters.map((c) => c.title),
        chapterChars: [],
        totalChars: 0,
        group: '',
        createdAt: Date.now(),
        progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
      }
      await db.addBook(meta)
      await refresh()
      return meta
    } catch (error) {
      importError.value = error instanceof Error ? error.message : String(error)
      return null
    } finally {
      importing.value = false
      importFileName.value = ''
    }
  }

  /** 删除书籍（连同全部章节与手动排序记录） */
  async function removeBook(id: string): Promise<void> {
    await db.deleteBook(id)
    for (const key of Object.keys(groupOrder.value)) {
      groupOrder.value[key] = groupOrder.value[key].filter((bid) => bid !== id)
    }
    await refresh()
  }

  /** 保存阅读进度 */
  async function saveProgress(id: string, progress: ReadProgress): Promise<void> {
    await db.updateBookProgress(id, progress)
    const meta = books.value.find((b) => b.id === id)
    if (meta) meta.progress = progress
  }

  // ---------- 分组管理 ----------

  /** 新建分组（重名忽略） */
  function createGroup(name: string): boolean {
    const n = name.trim()
    if (!n || groups.value.includes(n)) return false
    groups.value.push(n)
    return true
  }

  /** 删除分组：组内书籍回到默认分组 */
  async function removeGroup(name: string): Promise<void> {
    if (!groups.value.includes(name)) return
    groups.value = groups.value.filter((g) => g !== name)
    delete groupOrder.value[name]
    const moved = books.value.filter((b) => b.group === name)
    for (const meta of moved) {
      meta.group = ''
      await db.updateBookGroup(meta.id, '')
    }
  }

  /** 移动书籍到指定分组 */
  async function moveBook(id: string, group: string): Promise<void> {
    const meta = books.value.find((b) => b.id === id)
    if (!meta || meta.group === group) return
    meta.group = group
    await db.updateBookGroup(id, group)
  }

  // ---------- 手动排序 ----------

  /** 以当前可见顺序初始化某分组的手动排序 */
  function initGroupOrder(group: string, ids: string[]): void {
    groupOrder.value[group] = [...ids]
  }

  /** 交换分组内两本书的位置（拖拽实时预览） */
  function swapOrder(group: string, a: string, b: string): void {
    const list = [...(groupOrder.value[group] ?? [])]
    const ia = list.indexOf(a)
    const ib = list.indexOf(b)
    if (ia === -1 || ib === -1) return
    ;[list[ia], list[ib]] = [list[ib], list[ia]]
    groupOrder.value[group] = list
  }

  return {
    books,
    loaded,
    importing,
    importError,
    importFileName,
    importProgress,
    groups,
    groupOrder,
    sortMode,
    refresh,
    importFiles,
    createWebBook,
    removeBook,
    saveProgress,
    resetProgress,
    createGroup,
    removeGroup,
    moveBook,
    initGroupOrder,
    swapOrder,
  }
})
