import type { TextEncoding } from '@/types'

/** 解析结果：标题 + 作者 + 章节列表 */
export interface ParsedBook {
  title: string
  author: string
  chapters: { title: string; text: string }[]
}

/** 章节标题识别：行首的「第X章/回/节/卷/集/部/篇」或常见卷首语 */
const CHAPTER_HEADING_RE =
  /^(第[0-9零一二三四五六七八九十百千万两〇]{1,8}[章节回卷集部篇][^。！？]{0,40}|(?:序章|序言|楔子|引子|前言|绪论|尾声|后记|番外|外传|终章|正文)[^。！？]{0,20})$/

/** 作者信息常见写法 */
const AUTHOR_RE = /作者[：:]\s*([^\s，,。]{1,20})/

function tryDecodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** 解码文本：BOM 优先 → UTF-8 → GB18030 回退；也可手动指定编码 */
export function decodeText(buffer: ArrayBuffer, encoding: TextEncoding = 'auto'): string {
  const bytes = new Uint8Array(buffer)
  if (encoding !== 'auto') {
    const label = encoding === 'utf-16' ? 'utf-16le' : encoding
    return new TextDecoder(label).decode(bytes)
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes) // UTF-8 BOM
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes)
  }
  const utf8 = tryDecodeUtf8(bytes)
  if (utf8 !== null) return utf8
  // 常见中文编码回退（gb18030 是 GBK 的超集，可覆盖绝大多数情况）
  return new TextDecoder('gb18030').decode(bytes)
}

/** 归一化文本：统一换行、去掉行尾空白、合并连续空行 */
function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/** 按章节标题切分；整本无标题时作为一个章节。
 *  首个标题前的内容：长度 <=50 视为书名/作者等元信息直接丢弃，较长则作为「前言」章 */
export function splitChapters(text: string): { title: string; text: string }[] {
  const lines = normalizeText(text).split('\n')
  const chapters: { title: string; text: string }[] = []
  /** 首个章节标题之前的内容 */
  let lead: string[] = []
  let current: { title: string; text: string[] } | null = null

  const flush = () => {
    if (current) {
      chapters.push({ title: current.title, text: current.text.join('\n').trim() })
      current = null
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && CHAPTER_HEADING_RE.test(trimmed)) {
      // 首次遇到标题：决定标题前导语的去留
      if (chapters.length === 0 && !current) {
        const leadText = lead.join('\n').trim()
        if (leadText.length > 50) chapters.push({ title: '前言', text: leadText })
        lead = []
      }
      flush()
      current = { title: trimmed, text: [] }
      continue
    }
    if (!current) lead.push(line)
    else current.text.push(line)
  }
  flush()

  if (chapters.length === 0) {
    chapters.push({ title: '正文', text: normalizeText(text).trim() })
  }
  return chapters
}

export interface ParseTxtOptions {
  /** 手动指定解码编码（默认自动检测） */
  encoding?: TextEncoding
  /** 书名兜底（通常传文件名） */
  fallbackTitle?: string
}

export function parseTxt(buffer: ArrayBuffer, options: ParseTxtOptions = {}): ParsedBook {
  const text = decodeText(buffer, options.encoding)
  const chapters = splitChapters(text)

  // 从开头提取书名与作者
  const head = text.slice(0, 2000)
  const authorMatch = head.match(AUTHOR_RE)
  const titleMatch = head.match(/《([^《》]{1,40})》/)
  const title = (titleMatch?.[1] ?? options.fallbackTitle ?? chapters[0].title).trim()

  return {
    title,
    author: authorMatch?.[1]?.trim() || '佚名',
    chapters,
  }
}
