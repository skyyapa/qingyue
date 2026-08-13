import * as db from '@/db'
import type { BookMeta, Chapter, ReadingStats } from '@/types'

/** 数据备份：导出全部书籍/章节/分组/阅读统计为一个 JSON（大文件自动 gzip），支持合并式恢复 */

export interface BackupData {
  app: 'qingyue'
  version: 1
  exportedAt: string
  groups: string[]
  books: BookMeta[]
  chapters: Chapter[]
  stats: ReadingStats
}

const GROUPS_KEY = 'qingyue:groups'
const STATS_KEY = 'qingyue:stats'

function loadGroups(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? 'null')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function loadStats(): ReadingStats {
  try {
    const v = JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null')
    if (v && typeof v === 'object' && !Array.isArray(v)) return { byDate: v.byDate ?? {} }
  } catch {
    /* ignore */
  }
  return { byDate: {} }
}

/** 构建备份数据 */
export async function buildBackup(): Promise<BackupData> {
  const [books, chapters, groups, stats] = await Promise.all([
    db.listBookMetas(),
    db.listAllChapters(),
    Promise.resolve(loadGroups()),
    Promise.resolve(loadStats()),
  ])
  return {
    app: 'qingyue',
    version: 1,
    exportedAt: new Date().toISOString(),
    groups,
    books,
    chapters,
    stats,
  }
}

/** 大备份自动 gzip 压缩 */
async function maybeGzip(text: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; gzipped: boolean }> {
  if (typeof CompressionStream === 'undefined' || text.length < 512 * 1024) {
    return { bytes: new TextEncoder().encode(text), gzipped: false }
  }
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return { bytes: new Uint8Array(buf), gzipped: true }
}

/** 生成导出文件（供下载） */
export async function exportBackupFile(): Promise<{ blob: Blob; filename: string }> {
  const data = await buildBackup()
  const { bytes, gzipped } = await maybeGzip(JSON.stringify(data))
  const date = new Date().toISOString().slice(0, 10)
  return {
    blob: new Blob([bytes], { type: gzipped ? 'application/gzip' : 'application/json' }),
    filename: `qingyue-backup-${date}.${gzipped ? 'json.gz' : 'json'}`,
  }
}

function validateBackup(data: unknown): asserts data is BackupData {
  if (!data || typeof data !== 'object') throw new Error('不是有效的备份文件')
  const d = data as Partial<BackupData>
  if (d.app !== 'qingyue' || !Array.isArray(d.books)) throw new Error('不是有效的备份文件（缺少书籍数据）')
  if (!Array.isArray(d.chapters)) throw new Error('备份文件缺少章节数据')
  if (!d.stats || typeof d.stats.byDate !== 'object') throw new Error('备份文件缺少阅读统计数据')
}

/** 从备份内容恢复（合并模式：同 ID 书籍跳过，分组与统计合并） */
export async function importBackupBuffer(buffer: ArrayBuffer): Promise<{ imported: number; skipped: number }> {
  const bytes = new Uint8Array(buffer)
  let data: unknown
  if (bytes.length >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08) {
    // gzip 魔数 → 解压
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
    data = JSON.parse(await new Response(stream).text())
  } else {
    data = JSON.parse(new TextDecoder('utf-8').decode(bytes))
  }
  validateBackup(data)
  const backup = data

  // 合并分组
  const groups = new Set([...loadGroups(), ...backup.groups])
  localStorage.setItem(GROUPS_KEY, JSON.stringify([...groups]))

  // 合并阅读统计
  const stats = loadStats()
  for (const [key, seconds] of Object.entries(backup.stats.byDate)) {
    stats.byDate[key] = (stats.byDate[key] ?? 0) + seconds
  }
  localStorage.setItem(STATS_KEY, JSON.stringify(stats))

  // 合并书籍（同 ID 跳过）
  const existing = new Set((await db.listBookMetas()).map((b) => b.id))
  let imported = 0
  let skipped = 0
  for (const meta of backup.books) {
    if (existing.has(meta.id)) {
      skipped++
      continue
    }
    const chapters = backup.chapters.filter((c) => c.bookId === meta.id)
    await db.addBook(meta)
    await db.saveChapters(chapters)
    imported++
  }
  return { imported, skipped }
}
