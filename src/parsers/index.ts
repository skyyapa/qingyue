import type { TextEncoding } from '@/types'
import { parseTxt, type ParsedBook } from './txt'
import { parseEpub } from './epub'

export type { ParsedBook }

/** 文件名 → 书名（去掉扩展名） */
export function filenameToTitle(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim()
}

/** 统一导入入口：按文件扩展名分发到 TXT / EPUB 解析器 */
export async function importBook(file: File, encoding?: TextEncoding): Promise<ParsedBook> {
  const buffer = await file.arrayBuffer()
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext === 'epub') {
    return parseEpub(buffer, filenameToTitle(file.name))
  }
  return parseTxt(buffer, { encoding, fallbackTitle: filenameToTitle(file.name) })
}
