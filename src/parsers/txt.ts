import type { BookFont, ParagraphStyle, TextEncoding } from '@/types'

/** 解析结果：标题 + 作者 + 章节列表 */
export interface ParsedBook {
  title: string
  author: string
  chapters: { title: string; text: string; paragraphStyles?: (ParagraphStyle | null)[] }[]
  /** 各章节的内嵌图片（data URL，EPUB 特有；TXT 为 undefined） */
  chapterImages?: string[][]
  /** 内嵌字体（@font-face 提取，EPUB 特有；TXT 为 undefined） */
  bookFonts?: BookFont[]
}

/** 章节标题识别：行首的「第X章/回/节/卷/集/部/篇」或常见卷首语 */
const CHAPTER_HEADING_RE =
  /^(第[0-9零一二三四五六七八九十百千万两〇]{1,8}[章节回卷集部篇][^。！？]{0,40}|(?:序章|序言|楔子|引子|前言|绪论|尾声|后记|番外|外传|终章|正文)[^。！？]{0,20})$/

/** 有些 TXT 会在章节标题前混入站点/装饰/字体文本（如「正文 第一章」/「【VIP】第1章」/`<font>第一章</font>`）。
 *  宽松识别只在短行、无句末标点、且前缀像装饰/字体说明时启用，降低正文误切风险。 */
const CORE_CHAPTER_TITLE_RE = /第[0-9零一二三四五六七八九十百千万两〇]{1,8}[章节回卷集部篇][^。！？\n]{0,40}/
const HEADING_DECOR_RE = /^[\s:：|｜·・—_【】（）()《》<>/\\.,，、0-9A-Za-z-]+$/
const KNOWN_HEADING_PREFIX_RE = /(font|字体|字号|正文|vip|章节|目录|书源|阅读|www|https?)/i

function cleanHeadingLine(line: string): string {
  return line
    .replace(/<[^>]{1,120}>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/[\u00a0\u2000-\u200b\u3000]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanChapterTitle(title: string): string {
  return title.replace(/^[\s:：|｜·・—_-]+|[\s:：|｜·・—_-]+$/g, '').trim()
}

function isAcceptableHeadingPrefix(prefix: string): boolean {
  const p = prefix.trim()
  if (!p) return true
  return p.length <= 12 || HEADING_DECOR_RE.test(p) || KNOWN_HEADING_PREFIX_RE.test(p)
}

function extractChapterTitle(line: string): string | null {
  const cleaned = cleanHeadingLine(line)
  if (cleaned.length <= 96 && !/[。！？]/.test(cleaned)) {
    const match = cleaned.match(CORE_CHAPTER_TITLE_RE)
    if (match?.[0]) {
      const prefix = cleaned.slice(0, match.index ?? 0)
      if (isAcceptableHeadingPrefix(prefix)) return cleanChapterTitle(match[0])
    }
  }
  if (CHAPTER_HEADING_RE.test(cleaned)) return cleaned
  return null
}

/** 作者信息常见写法 */
const AUTHOR_RE = /作者[：:]\s*([^\s，,。]{1,20})/

function tryDecodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** 文本“合理性”评分：常用字符加分，控制符 / 替换符扣分（用于候选编码择优） */
function scoreText(text: string): number {
  let score = 0
  const n = Math.min(text.length, 20000)
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i)
    if (c === 0xfffd) {
      score -= 50 // 替换符（解码错位）
      continue
    }
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) {
      score -= 10 // 异常控制符
      continue
    }
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef)) {
      score += 2 // 中日韩汉字 / 中文标点 / 全角字符
      continue
    }
    if (c >= 32 && c <= 126) {
      score += 1 // ASCII 可打印
      continue
    }
    score -= 1
  }
  return score
}

/** 解码文本：显式指定 → 直接解码；自动 → BOM → UTF-8 → 文件头 4 编码评分择优（GB18030 / Big5 / UTF-16LE / UTF-16BE） */
export function decodeText(buffer: ArrayBuffer, encoding: TextEncoding = 'auto'): string {
  const bytes = new Uint8Array(buffer)
  if (encoding !== 'auto') {
    const label = encoding === 'utf-16' ? 'utf-16le' : encoding
    return new TextDecoder(label).decode(bytes)
  }
  // BOM 优先
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes)
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes)
  }
  // UTF-8（严格模式，任何非法序列都视为非 UTF-8）
  const utf8 = tryDecodeUtf8(bytes)
  if (utf8 !== null) return utf8
  // 其余编码用文件头（256KB）评分择优，避免对大文件重复全量解码；
  // 评分相同按常见度排序：GB18030 > Big5 > UTF-16LE > UTF-16BE
  const head = bytes.subarray(0, Math.min(bytes.length, 256 * 1024))
  const candidates: [string, string][] = [
    ['gb18030', new TextDecoder('gb18030').decode(head)],
    ['big5', new TextDecoder('big5').decode(head)],
    ['utf-16le', new TextDecoder('utf-16le').decode(head)],
    ['utf-16be', new TextDecoder('utf-16be').decode(head)],
  ]
  let best = candidates[0]
  for (const candidate of candidates) {
    if (scoreText(candidate[1]) > scoreText(best[1])) best = candidate
  }
  return new TextDecoder(best[0]).decode(bytes)
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
    const chapterTitle = trimmed ? extractChapterTitle(trimmed) : null
    if (chapterTitle) {
      // 首次遇到标题：决定标题前导语的去留
      if (chapters.length === 0 && !current) {
        const leadText = lead.join('\n').trim()
        if (leadText.length > 50) chapters.push({ title: '前言', text: leadText })
        lead = []
      }
      flush()
      current = { title: chapterTitle, text: [] }
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
