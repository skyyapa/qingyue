import type { BookMeta, Chapter, ReadProgress } from '@/types'

/** IndexedDB 封装。两个 object store：
 *  - books：书籍元数据（书架、目录、进度）
 *  - chapters：章节正文，key = `${bookId}:${index}`
 */
const DB_NAME = 'qingyue'
const DB_VERSION = 1
const BOOKS_STORE = 'books'
const CHAPTERS_STORE = 'chapters'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(BOOKS_STORE)) {
          db.createObjectStore(BOOKS_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
          const store = db.createObjectStore(CHAPTERS_STORE, { keyPath: 'id' })
          store.createIndex('bookId', 'bookId', { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return dbPromise
}

/** 单 store 请求封装 */
function req<T>(storeName: string, mode: IDBTransactionMode, build: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const request = build(tx.objectStore(storeName))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
  )
}

// ---------- 书籍元数据 ----------

export function addBook(meta: BookMeta): Promise<void> {
  return req(BOOKS_STORE, 'readwrite', (s) => s.add(meta)).then(() => undefined)
}

export function getBookMeta(id: string): Promise<BookMeta | undefined> {
  return req(BOOKS_STORE, 'readonly', (s) => s.get(id))
}

export function listBookMetas(): Promise<BookMeta[]> {
  return req(BOOKS_STORE, 'readonly', (s) => s.getAll()).then((list) =>
    [...list].sort((a, b) => b.createdAt - a.createdAt)
  )
}

export function updateBookProgress(id: string, progress: ReadProgress): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(BOOKS_STORE, 'readwrite')
        const store = tx.objectStore(BOOKS_STORE)
        const get = store.get(id)
        get.onsuccess = () => {
          const meta = get.result as BookMeta | undefined
          if (meta) {
            meta.progress = progress
            store.put(meta)
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

/** 删除书籍及其全部章节 */
export function deleteBook(id: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([BOOKS_STORE, CHAPTERS_STORE], 'readwrite')
        tx.objectStore(BOOKS_STORE).delete(id)
        const chapterStore = tx.objectStore(CHAPTERS_STORE)
        const cursor = chapterStore.index('bookId').openKeyCursor(IDBKeyRange.only(id))
        cursor.onsuccess = () => {
          const current = cursor.result
          if (current) {
            chapterStore.delete(current.primaryKey as IDBValidKey)
            current.continue()
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

// ---------- 章节 ----------

export function saveChapters(chapters: Chapter[]): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CHAPTERS_STORE, 'readwrite')
        const store = tx.objectStore(CHAPTERS_STORE)
        for (const chapter of chapters) store.put(chapter)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

export function getChapter(bookId: string, index: number): Promise<Chapter | undefined> {
  return req(CHAPTERS_STORE, 'readonly', (s) => s.get(`${bookId}:${index}`))
}
