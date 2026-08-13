import JSZip from 'jszip'
import type { ParsedBook } from './txt'

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'BLOCKQUOTE', 'PRE', 'TR',
])

/** 可作正文的 media-type 前缀（跳过图片/样式/脚本/字体等资源条目） */
const TEXT_MEDIA_TYPES = ['application/xhtml+xml', 'text/html', 'application/xml', 'text/xml']

/** XHTML 转纯文本，保留段落结构 */
function htmlToText(body: HTMLElement): string {
  const parts: string[] = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NAV') return
    if (el.tagName === 'BR') {
      parts.push('\n')
      return
    }
    if (BLOCK_TAGS.has(el.tagName)) parts.push('\n')
    for (const child of el.childNodes) walk(child)
    if (BLOCK_TAGS.has(el.tagName)) parts.push('\n')
  }
  walk(body)
  return parts
    .join('')
    .replace(/[ \t]+\n/g, '\n') // 行尾空白
    .replace(/[ \t]{2,}/g, ' ') // XHTML 排版缩进的连续空格
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

/** 解析 EPUB：解压 → container.xml 定位 OPF → manifest/spine 按序提取正文（对损坏文件容错） */
export async function parseEpub(buffer: ArrayBuffer, fallbackTitle: string): Promise<ParsedBook> {
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

  const opfFile = zip.file(opfPath)
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

  /** 相对 OPF 目录解析 zip 内路径 */
  const resolvePath = (rel: string) => {
    const parts = [...opfDir.split('/').filter(Boolean), ...rel.replace(/\\/g, '/').split('/')]
    const out: string[] = []
    for (const part of parts) {
      if (part === '.' || part === '') continue
      if (part === '..') out.pop()
      else out.push(part)
    }
    return out.join('/')
  }

  const chapters: { title: string; text: string }[] = []
  const skipped: string[] = []
  for (const idref of spineIds) {
    const entry = manifest.get(idref)
    if (!entry) {
      skipped.push(idref)
      continue
    }
    const { href, mediaType } = entry
    // 跳过非正文资源（图片/样式/脚本等）与外部链接
    if (mediaType && !TEXT_MEDIA_TYPES.some((t) => mediaType.includes(t))) {
      skipped.push(idref)
      continue
    }
    if (isExternalHref(href)) {
      skipped.push(idref)
      continue
    }
    const path = resolvePath(href.split('#')[0])
    const file = zip.file(path) ?? zip.file(decodeURIComponent(path))
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
    // 提取章节标题；标题会由阅读器单独渲染，从正文中移除避免重复
    const heading = doc.body.querySelector('h1, h2, h3')
    const chapterTitle = heading?.textContent?.trim() || ''
    if (heading) heading.remove()
    const text = htmlToText(doc.body)
    if (!text) {
      skipped.push(idref)
      continue
    }

    const name = path.split('/').pop() ?? ''
    chapters.push({
      title: chapterTitle || name.replace(/\.[^.]+$/, '').trim() || `第 ${chapters.length + 1} 章`,
      text,
    })
  }

  if (chapters.length === 0) {
    if (skipped.length > 0) {
      throw new Error('EPUB 中没有可读取的正文内容（可能是扫描版或图片型电子书）')
    }
    throw new Error('EPUB 中没有可读取的正文内容')
  }
  return { title, author, chapters }
}
