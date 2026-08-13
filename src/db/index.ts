import type { BookMeta, Chapter, ChapterIndex, Entity, ReadProgress, Relation } from '@/types'

/** IndexedDB 封装。object store：
 *  - books：书籍元数据（书架、目录、进度、分析状态）
 *  - chapters：章节正文，key = `${bookId}:${index}`
 *  - entities：知识库实体（人物/地点/技能/物品）
 *  - chapterIndex：章节索引（每章实体词频/高频词/摘要）
 *  - relations：实体共现关系（关系图边）
 */
const DB_NAME = 'qingyue'
const DB_VERSION = 2
const BOOKS_STORE = 'books'
const CHAPTERS_STORE = 'chapters'
const ENTITIES_STORE = 'entities'
const CHAPTER_INDEX_STORE = 'chapterIndex'
const RELATIONS_STORE = 'relations'

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
        if (!db.objectStoreNames.contains(ENTITIES_STORE)) {
          const store = db.createObjectStore(ENTITIES_STORE, { keyPath: 'id' })
          store.createIndex('bookId', 'bookId', { unique: false })
        }
        if (!db.objectStoreNames.contains(CHAPTER_INDEX_STORE)) {
          const store = db.createObjectStore(CHAPTER_INDEX_STORE, { keyPath: 'id' })
          store.createIndex('bookId', 'bookId', { unique: false })
        }
        if (!db.objectStoreNames.contains(RELATIONS_STORE)) {
          const store = db.createObjectStore(RELATIONS_STORE, { keyPath: 'id' })
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

/** 按 bookId 读取某 store 的全部记录 */
function listByBook<T>(storeName: string, bookId: string): Promise<T[]> {
  return openDB().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly')
        const index = tx.objectStore(storeName).index('bookId')
        const request = index.getAll(IDBKeyRange.only(bookId))
        request.onsuccess = () => resolve(request.result as T[])
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
        tx.onabort = () => reject(tx.error ?? new Error('事务被中止'))
      })
  )
}

/** 更新书籍所属分组 */
export function updateBookGroup(id: string, group: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(BOOKS_STORE, 'readwrite')
        const store = tx.objectStore(BOOKS_STORE)
        const get = store.get(id)
        get.onsuccess = () => {
          const meta = get.result as BookMeta | undefined
          if (meta) {
            meta.group = group
            store.put(meta)
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('事务被中止'))
      })
  )
}

/** 更新书籍分析状态（analysis 可能来自 Pinia 响应式状态，需先重建为普通对象再入库） */
export function updateBookAnalysis(id: string, analysis: BookMeta['analysis']): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(BOOKS_STORE, 'readwrite')
        const store = tx.objectStore(BOOKS_STORE)
        const get = store.get(id)
        get.onsuccess = () => {
          const meta = get.result as BookMeta | undefined
          if (meta) {
            meta.analysis = analysis
              ? { ...analysis, ignoredNames: [...(analysis.ignoredNames ?? [])] }
              : undefined
            store.put(meta)
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('事务被中止'))
        tx.onabort = () => reject(tx.error ?? new Error('事务被中止'))
      })
  )
}

/** 删除书籍及其全部关联数据（章节/实体/索引/关系） */
export function deleteBook(id: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(
          [BOOKS_STORE, CHAPTERS_STORE, ENTITIES_STORE, CHAPTER_INDEX_STORE, RELATIONS_STORE],
          'readwrite'
        )
        tx.objectStore(BOOKS_STORE).delete(id)
        for (const storeName of [CHAPTERS_STORE, ENTITIES_STORE, CHAPTER_INDEX_STORE, RELATIONS_STORE]) {
          const store = tx.objectStore(storeName)
          const cursor = store.index('bookId').openKeyCursor(IDBKeyRange.only(id))
          cursor.onsuccess = () => {
            const current = cursor.result
            if (current) {
              store.delete(current.primaryKey as IDBValidKey)
              current.continue()
            }
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('事务被中止'))
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
        tx.onabort = () => reject(tx.error ?? new Error('事务被中止'))
      })
  )
}

export function getChapter(bookId: string, index: number): Promise<Chapter | undefined> {
  return req(CHAPTERS_STORE, 'readonly', (s) => s.get(`${bookId}:${index}`))
}

/** 读取全部章节（数据备份用） */
export function listAllChapters(): Promise<Chapter[]> {
  return req(CHAPTERS_STORE, 'readonly', (s) => s.getAll())
}

// ---------- 知识库实体 ----------

export function putEntity(entity: Entity): Promise<void> {
  return req(ENTITIES_STORE, 'readwrite', (s) => s.put(entity)).then(() => undefined)
}

export function putEntities(entities: Entity[]): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(ENTITIES_STORE, 'readwrite')
        const store = tx.objectStore(ENTITIES_STORE)
        for (const entity of entities) store.put(entity)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('事务被中止'))
      })
  )
}

export function listEntities(bookId: string): Promise<Entity[]> {
  return listByBook<Entity>(ENTITIES_STORE, bookId)
}

export function getEntity(id: string): Promise<Entity | undefined> {
  return req(ENTITIES_STORE, 'readonly', (s) => s.get(id))
}

export function deleteEntity(id: string): Promise<void> {
  return req(ENTITIES_STORE, 'readwrite', (s) => s.delete(id)).then(() => undefined)
}

// ---------- 章节索引 ----------

export function saveChapterIndexes(list: ChapterIndex[]): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CHAPTER_INDEX_STORE, 'readwrite')
        const store = tx.objectStore(CHAPTER_INDEX_STORE)
        for (const item of list) store.put(item)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('事务被中止'))
      })
  )
}

export function listChapterIndexes(bookId: string): Promise<ChapterIndex[]> {
  return listByBook<ChapterIndex>(CHAPTER_INDEX_STORE, bookId)
}

// ---------- 关系 ----------

export function saveRelations(list: Relation[]): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(RELATIONS_STORE, 'readwrite')
        const store = tx.objectStore(RELATIONS_STORE)
        for (const rel of list) store.put(rel)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('事务被中止'))
      })
  )
}

export function listRelations(bookId: string): Promise<Relation[]> {
  return listByBook<Relation>(RELATIONS_STORE, bookId)
}

/** 整体替换某本书的关系：同一事务内删除旧关系再写入新关系
 *  （避免只用 put 追加时，已不在新列表中的旧关系残留成"幽灵关系"）
 *  注意：put 必须在游标遍历结束后再入队，否则删除请求排在 put 之后，
 *  会把刚写入的新关系一并删掉 */
export function replaceRelations(bookId: string, relations: Relation[]): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(RELATIONS_STORE, 'readwrite')
        const store = tx.objectStore(RELATIONS_STORE)
        const cursor = store.index('bookId').openKeyCursor(IDBKeyRange.only(bookId))
        cursor.onsuccess = () => {
          const current = cursor.result
          if (current) {
            store.delete(current.primaryKey as IDBValidKey)
            current.continue()
          } else {
            // 游标耗尽：旧关系已全部删除，此时再写入新关系
            for (const rel of relations) store.put(rel)
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('事务被中止'))
      })
  )
}
