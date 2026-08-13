import JSZip from 'jszip'
import type { ParsedBook } from './txt'

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'BLOCKQUOTE', 'PRE', 'TR',
])

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

/** 解析 EPUB：解压 → container.xml 定位 OPF → manifest/spine 按序提取正文 */
export async function parseEpub(buffer: ArrayBuffer, fallbackTitle: string): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(buffer)

  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) throw new Error('不是有效的 EPUB 文件：缺少 META-INF/container.xml')
  const containerDoc = new DOMParser().parseFromString(await containerFile.async('string'), 'application/xml')
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new Error('不是有效的 EPUB 文件：无法定位 OPF 描述文件')

  const opfFile = zip.file(opfPath)
  if (!opfFile) throw new Error(`EPUB 中找不到 OPF 文件：${opfPath}`)
  const opfDoc = new DOMParser().parseFromString(await opfFile.async('string'), 'application/xml')

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const metadata = opfDoc.querySelector('metadata')
  const title = metadata?.querySelector('title')?.textContent?.trim() || fallbackTitle
  const author = metadata?.querySelector('creator')?.textContent?.trim() || '佚名'

  // manifest: id → href
  const manifest = new Map<string, string>()
  for (const item of opfDoc.querySelectorAll('manifest > item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest.set(id, href)
  }

  // spine: 按阅读顺序排列的 idref
  const spineIds: string[] = []
  for (const item of opfDoc.querySelectorAll('spine > itemref')) {
    const idref = item.getAttribute('idref')
    if (idref) spineIds.push(idref)
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
  for (const idref of spineIds) {
    const href = manifest.get(idref)
    if (!href) continue
    const path = resolvePath(href)
    const file = zip.file(path) ?? zip.file(decodeURIComponent(path))
    if (!file) continue
    const html = await file.async('string')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    // 提取章节标题；标题会由阅读器单独渲染，从正文中移除避免重复
    const heading = doc.body.querySelector('h1, h2, h3')
    const chapterTitle = heading?.textContent?.trim() || ''
    if (heading) heading.remove()
    const text = htmlToText(doc.body)
    if (!text) continue

    const name = path.split('/').pop() ?? ''
    chapters.push({
      title: chapterTitle || name.replace(/\.[^.]+$/, '').trim() || `第 ${chapters.length + 1} 章`,
      text,
    })
  }

  if (chapters.length === 0) throw new Error('EPUB 中没有可读取的正文内容')
  return { title, author, chapters }
}
