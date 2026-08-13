import type { TextEncoding } from '@/types'
import { readFileWithProgress } from '@/utils/file'
import { parseTxt, type ParsedBook } from './txt'
import { parseEpub } from './epub'

export type { ParsedBook }

/** 单文件导入大小上限（200MB） */
const MAX_IMPORT_SIZE = 200 * 1024 * 1024

/** 文件名 → 书名（去掉扩展名） */
export function filenameToTitle(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim()
}

/** 统一导入入口：按文件扩展名分发到 TXT / EPUB 解析器；onProgress 报告读取进度 0-1 */
export async function importBook(
  file: File,
  encoding?: TextEncoding,
  onProgress?: (ratio: number) => void
): Promise<ParsedBook> {
  if (file.size > MAX_IMPORT_SIZE) {
    throw new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(0)} MB），超过 200 MB 上限，请拆分后导入`)
  }
  const buffer = await readFileWithProgress(file, onProgress)
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext === 'epub') {
    return parseEpub(buffer, filenameToTitle(file.name))
  }
  return parseTxt(buffer, { encoding, fallbackTitle: filenameToTitle(file.name) })
}
