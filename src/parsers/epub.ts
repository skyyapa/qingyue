import JSZip from 'jszip'
import type { ParagraphStyle } from '@/types'
import { computeParagraphStyle, parseCssRules } from './epub-css'
import type { ParsedBook } from './txt'

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'LI', 'BLOCKQUOTE', 'PRE', 'TR',
])

/** 章节内小标题标记（行首 `# `，阅读器渲染为加粗居中；h1 章节标题由调用方单独处理） */
const HEADING_PREFIX = '# '

/** 目录条目（NCX / EPUB3 nav） */
interface TocEntry {
  title: string
  /** 指向章节文档的路径（相对 OPF 目录） */
  src: string
}

/** 行内样式标记（粗体/斜体/下划线 → [b]/[i]/[u]，ReaderView 渲染为受控 HTML） */
function inlineMarks(el: Element): { open: string; close: string } {
  const style = el.getAttribute('style') ?? ''
  let open = ''
  if (el.tagName === 'B' || el.tagName === 'STRONG' || /font-weight\s*:\s*(bold|[6-9]00)\b/i.test(style)) open += '[b]'
  if (el.tagName === 'I' || el.tagName === 'EM' || /font-style\s*:\s*italic\b/i.test(style)) open += '[i]'
  if (el.tagName === 'U' || /text-decoration\s*:\s*underline\b/i.test(style)) open += '[u]'
  const marks = [...open.matchAll(/\[([a-z])\]/g)].map((m) => m[1])
  const close = marks
    .reverse()
    .map((c) => `[/${c}]`)
    .join('')
  return { open, close }
}

interface HtmlToTextResult {
  text: string
  /** 与 text 的 \n\n 段落一一对应（无样式段落为 null） */
  styles: (ParagraphStyle | null)[]
}

/** XHTML 转纯文本：保留段落与行内粗斜体标记、标记小标题、提取图片 src
 *  onImage(src) 返回占位符字符串（如 [img:0]），调用方负责收集 src 列表 */
function htmlToText(
  body: HTMLElement,
  onImage: (src: string) => string,
  getStyle: (el: Element) => ParagraphStyle | null
): HtmlToTextResult {
  const paras: string[] = []
  const styles: (ParagraphStyle | null)[] = []
  let current = ''
  let currentStyle: ParagraphStyle | null = null

  const flush = () => {
    const t = current.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim()
    if (t) {
      paras.push(t)
      styles.push(currentStyle)
    }
    current = ''
    currentStyle = null
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NAV') return
    if (tag === 'BR') {
      current += '\n'
      return
    }
    if (tag === 'IMG') {
      const src = el.getAttribute('src') ?? ''
      if (src) {
        current += onImage(src)
      } else if (el.getAttribute('alt')) {
        current += el.getAttribute('alt') ?? ''
      }
      return
    }
    const isHeading = /^H[1-6]$/.test(tag)
    const isBlock = BLOCK_TAGS.has(tag)
    // 块级元素/标题：段落边界（标题加 # 标记），并计算段落样式
    if (isBlock || isHeading) flush()
    if (isHeading) current += HEADING_PREFIX
    const savedStyle = currentStyle
    if (isBlock || isHeading) currentStyle = getStyle(el)
    // span 带 class 时其样式并入当前段落（近似处理行内样式）
    if (tag === 'SPAN' && el.getAttribute('class')) {
      const spanStyle = getStyle(el)
      if (spanStyle) currentStyle = { ...currentStyle, ...spanStyle }
    }
    const marks = inlineMarks(el)
    current += marks.open
    for (const child of el.childNodes) walk(child)
    current += marks.close
    if (isBlock || isHeading) flush()
    currentStyle = savedStyle
  }
  walk(body)
  flush()
  return { text: paras.join('\n\n'), styles }
}

/** 解析 XML/HTML，检测解析错误（DOMParser 不抛异常，错误时产生 <parsererror>） */
function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('EPUB 内部文件损坏（XML 解析失败）')
  }
  return doc
}

/** 判断 href 是否指向外部资源（应跳过） */
function isExternalHref(href: string): boolean {
  return /^(https?:|data:|mailto:|#)/i.test(href.trim()) || href.trim().startsWith('//')
}

/** 在 zip 中按路径取文件（含 decodeURIComponent 兜底） */
function findZipFile(zip: JSZip, path: string): JSZip.JSZipObject | null {
  return zip.file(path) ?? zip.file(decodeURIComponent(path))
}

/** 图片 mime 推断 */
function imageMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
  }
  return map[ext] ?? 'image/png'
}

/** 解析 EPUB3 的 nav 文档（<nav epub:type="toc"> 下的链接列表，支持嵌套 ol/li） */
function parseNavToc(doc: Document): TocEntry[] {
  const entries: TocEntry[] = []
  const nav = doc.querySelector('nav[epub\\:type="toc" i]')
  const root = nav ?? doc.body
  const walk = (container: Element) => {
    for (const ol of container.querySelectorAll(':scope > ol')) {
      for (const li of ol.children) {
        if (li.tagName !== 'LI') continue
        const a = li.querySelector(':scope > a')
        if (a) {
          const href = a.getAttribute('href') ?? ''
          const title = a.textContent?.trim()
          if (title && href) entries.push({ title, src: href.split('#')[0] })
        }
        walk(li) // 嵌套 ol
      }
    }
  }
  walk(root)
  return entries
}

/** 解析 EPUB2 的 NCX（navMap 递归收集 navPoint） */
function parseNcxToc(doc: Document): TocEntry[] {
  const entries: TocEntry[] = []
  const collect = (navPoints: NodeListOf<Element>) => {
    for (const point of navPoints) {
      const label = point.querySelector(':scope > navLabel > text')?.textContent?.trim()
      const src = point.querySelector(':scope > content')?.getAttribute('src')?.split('#')[0]
      if (label && src) entries.push({ title: label, src })
      const nested = point.querySelectorAll(':scope > navPoint')
      if (nested.length) collect(nested)
    }
  }
  collect(doc.querySelectorAll('navMap > navPoint'))
  return entries
}

/** 解析 EPUB（解压 → container.xml 定位 OPF → manifest/spine 按序提取正文，对损坏文件容错）
 *  章节标题优先级：目录（EPUB3 nav / EPUB2 NCX）对齐 > 正文首个 h1-h3 > 文件名；
 *  正文内嵌图片提取为 data URL（Chapter.images，文本中 [img:N] 占位） */
export async function parseEpub(buffer: ArrayBuffer, fallbackTitle: string): Promise<ParsedBook & { chapterImages: string[][] }> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('不是有效的 EPUB 文件（无法解压，请确认扩展名与文件完整性）')
  }

  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) throw new Error('不是有效的 EPUB 文件：缺少 META-INF/container.xml')
  const containerDoc = parseXml(await containerFile.async('string'))
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new Error('不是有效的 EPUB 文件：container.xml 中未声明 OPF 文件')

  const opfFile = findZipFile(zip, opfPath)
  if (!opfFile) throw new Error(`EPUB 中找不到 OPF 描述文件：${opfPath}`)
  const opfDoc = parseXml(await opfFile.async('string'))

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const metadata = opfDoc.querySelector('metadata')
  const title = metadata?.querySelector('title')?.textContent?.trim() || fallbackTitle
  const author = metadata?.querySelector('creator')?.textContent?.trim() || '佚名'

  // manifest: id → { href, mediaType }
  const manifest = new Map<string, { href: string; mediaType: string }>()
  for (const item of opfDoc.querySelectorAll('manifest > item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) {
      manifest.set(id, { href, mediaType: item.getAttribute('media-type') ?? '' })
    }
  }

  // spine: 按阅读顺序排列的 idref
  const spineIds: string[] = []
  for (const item of opfDoc.querySelectorAll('spine > itemref')) {
    const idref = item.getAttribute('idref')
    if (idref) spineIds.push(idref)
  }
  if (spineIds.length === 0) {
    throw new Error('EPUB 的目录（spine）为空，没有可阅读的内容')
  }

  /** 相对基础路径解析 zip 内路径 */
  const resolvePath = (rel: string, baseDir: string) => {
    const parts = [...baseDir.split('/').filter(Boolean), ...rel.replace(/\\/g, '/').split('/')]
    const out: string[] = []
    for (const part of parts) {
      if (part === '.' || part === '') continue
      if (part === '..') out.pop()
      else out.push(part)
    }
    return out.join('/')
  }

  // ---------- 目录解析（EPUB3 nav 优先，其次 EPUB2 NCX） ----------
  let tocEntries: TocEntry[] = []
  try {
    // EPUB3：manifest 中 properties="nav" 或文件名以 nav/toc 开头的文档
    const navItem = [...manifest.entries()].find(([, v]) => {
      const href = v.href.toLowerCase()
      return v.mediaType.includes('xhtml') && (/(^|\/)nav[^/]*\.x?html?$/i.test(href) || /(^|\/)toc[^/]*\.x?html?$/i.test(href))
    })
    const navFile = navItem ? findZipFile(zip, resolvePath(navItem[1].href, opfDir)) : null
    if (navFile) {
      const navDoc = new DOMParser().parseFromString(await navFile.async('string'), 'text/html')
      tocEntries = parseNavToc(navDoc)
    }
  } catch {
    tocEntries = []
  }
  if (tocEntries.length === 0) {
    try {
      const ncxItem = [...manifest.entries()].find(([, v]) => v.mediaType.includes('dtbncx'))
      const ncxFile = ncxItem ? findZipFile(zip, resolvePath(ncxItem[1].href, opfDir)) : null
      if (ncxFile) {
        const ncxDoc = parseXml(await ncxFile.async('string'))
        tocEntries = parseNcxToc(ncxDoc)
      }
    } catch {
      tocEntries = []
    }
  }

  /** spine item 的 zip 路径 → 目录标题（取第一个指向它的条目） */
  const tocTitleByPath = new Map<string, string>()
  if (tocEntries.length) {
    for (const entry of tocEntries) {
      const path = resolvePath(entry.src, opfDir)
      if (!tocTitleByPath.has(path)) tocTitleByPath.set(path, entry.title)
    }
  }

  // ---------- 收集内嵌 CSS（mediaType text/css 或 .css 后缀；损坏文件忽略） ----------
  const cssTexts: string[] = []
  for (const [, item] of manifest) {
    if (item.mediaType.includes('css') || /\.css$/i.test(item.href)) {
      const cssFile = findZipFile(zip, resolvePath(item.href.split('#')[0], opfDir))
      if (cssFile) {
        try {
          cssTexts.push(await cssFile.async('string'))
        } catch {
          /* 样式文件损坏则忽略 */
        }
      }
    }
  }
  const cssRules = parseCssRules(cssTexts.join('\n'))

  /** 元素 → 段落样式（空样式返回 null） */
  const styleFor = (el: Element): ParagraphStyle | null => {
    const style = computeParagraphStyle(cssRules, el.tagName.toLowerCase(), el.getAttribute('class') ?? null)
    return Object.keys(style).length ? style : null
  }

  // ---------- 按 spine 提取章节 ----------
  const chapters: { title: string; text: string; paragraphStyles: (ParagraphStyle | null)[] }[] = []
  const chapterImages: string[][] = []
  const skipped: string[] = []
  for (const idref of spineIds) {
    const entry = manifest.get(idref)
    if (!entry) {
      skipped.push(idref)
      continue
    }
    const { href, mediaType } = entry
    // 跳过非正文资源（图片/样式/脚本等）与外部链接
    if (mediaType && !['xhtml', 'html', 'xml'].some((t) => mediaType.includes(t))) {
      skipped.push(idref)
      continue
    }
    if (isExternalHref(href)) {
      skipped.push(idref)
      continue
    }
    const path = resolvePath(href.split('#')[0], opfDir)
    const file = findZipFile(zip, path)
    if (!file) {
      skipped.push(idref)
      continue
    }
    let doc: Document
    try {
      doc = new DOMParser().parseFromString(await file.async('string'), 'text/html')
    } catch {
      skipped.push(idref)
      continue
    }
    // 提取章节标题（目录标题优先）；标题会由阅读器单独渲染，从正文中移除避免重复
    const heading = doc.body.querySelector('h1, h2, h3')
    const headingText = heading?.textContent?.trim() || ''
    if (heading) heading.remove()
    const dirPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
    const tocTitle = tocTitleByPath.get(path)

    // 收集正文中的图片 src（onImage 直接输出带下标的占位符）
    const placeholderSrcs: string[] = []
    const { text, styles } = htmlToText(
      doc.body,
      (src) => {
        const idx = placeholderSrcs.length
        placeholderSrcs.push(src)
        return `[img:${idx}]`
      },
      styleFor
    )
    if (!text.trim()) {
      skipped.push(idref)
      continue
    }

    // 异步解出图片 data URL（data: 直接使用；相对路径相对当前章节文档解析）
    const images = await Promise.all(
      placeholderSrcs.map(async (src) => {
        if (/^data:/i.test(src)) return src
        const imgPath = resolvePath(src.split('#')[0], dirPath)
        const imgFile = findZipFile(zip, imgPath)
        if (!imgFile) return null
        try {
          const base64 = await imgFile.async('base64')
          return `data:${imageMime(imgFile.name)};base64,${base64}`
        } catch {
          return null
        }
      })
    )
    const validImages = images.filter((v): v is string => !!v)

    const name = path.split('/').pop() ?? ''
    chapters.push({
      title: tocTitle || headingText || name.replace(/\.[^.]+$/, '').trim() || `第 ${chapters.length + 1} 章`,
      text,
      paragraphStyles: styles,
    })
    chapterImages.push(validImages)
  }

  if (chapters.length === 0) {
    if (skipped.length > 0) {
      throw new Error('EPUB 中没有可读取的正文内容（可能是扫描版或图片型电子书）')
    }
    throw new Error('EPUB 中没有可读取的正文内容')
  }
  return { title, author, chapters, chapterImages }
}
