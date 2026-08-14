/** 单书导出/导入：一本书（正文 + 进度 + 知识库）为单个 JSON 文件，可迁移或分享
 *  与全量备份（utils/backup.ts）互不干扰：app 字段区分（qingyue-book vs qingyue）
 *  不含内嵌字体（与备份策略一致，恢复后排版回退系统字体）
 */
import * as db from '@/db'
import type { BookMeta, Chapter, ChapterIndex, Entity, Relation } from '@/types'

export interface BookExport {
  app: 'qingyue-book'
  version: 1
  exportedAt: string
  meta: BookMeta
  chapters: Chapter[]
  entities: Entity[]
  chapterIndexes: ChapterIndex[]
  relations: Relation[]
}

/** 构建单书导出数据（书籍不存在返回 null） */
export async function buildBookExport(bookId: string): Promise<BookExport | null> {
  const meta = await db.getBookMeta(bookId)
  if (!meta) return null
  const [chapters, entities, chapterIndexes, relations] = await Promise.all([
    db.listChapters(bookId),
    db.listEntities(bookId),
    db.listChapterIndexes(bookId),
    db.listRelations(bookId),
  ])
  return {
    app: 'qingyue-book',
    version: 1,
    exportedAt: new Date().toISOString(),
    meta,
    chapters,
    entities,
    chapterIndexes,
    relations,
  }
}

/** 生成单书导出文件（供下载） */
export async function exportBookFile(bookId: string): Promise<{ blob: Blob; filename: string } | null> {
  const data = await buildBookExport(bookId)
  if (!data) return null
  return {
    blob: new Blob([JSON.stringify(data)], { type: 'application/json' }),
    filename: `${data.meta.title}.qingyue.json`,
  }
}

/** 是否为单书导出格式 */
export function isBookExport(data: unknown): data is BookExport {
  if (!data || typeof data !== 'object') return false
  const d = data as Partial<BookExport>
  return (
    d.app === 'qingyue-book' &&
    !!d.meta &&
    typeof d.meta.id === 'string' &&
    Array.isArray(d.chapters)
  )
}

/** 从单书文件恢复（合并模式：同 ID 书籍跳过）；导入成功返回 meta 供跳转 */
export async function importBookBuffer(
  buffer: ArrayBuffer
): Promise<{ imported: number; skipped: number; meta?: BookMeta }> {
  let data: unknown
  try {
    data = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(buffer)))
  } catch {
    throw new Error('不是有效的单书文件（JSON 解析失败）')
  }
  if (!isBookExport(data)) {
    throw new Error('不是有效的单书文件（缺少书籍数据）')
  }
  const existing = new Set((await db.listBookMetas()).map((b) => b.id))
  if (existing.has(data.meta.id)) return { imported: 0, skipped: 1 }
  await db.addBook(data.meta)
  await db.saveChapters(data.chapters)
  await db.putEntities(data.entities)
  await db.saveChapterIndexes(data.chapterIndexes)
  await db.saveRelations(data.relations)
  return { imported: 1, skipped: 0, meta: data.meta }
}
