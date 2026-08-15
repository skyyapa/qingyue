/** 规则引擎：模板渲染 + CSS 选择器提取 + 管道后处理
 *  字段规则格式：`选择器@text|html|href|outerHTML|pipe1|pipe2`
 *  模板变量：{{keyword}} / {{bookUrl}} / {{chapterUrl}}（URL 场景自动编码）
 *  分页：ChaptersRule.next / ContentRule.next 声明「下一页」链接选择器，自动翻页
 */
import { fetchHtml } from './requester'
import { jsonPath } from './types'
import type { BookSource, ChapterItem, SearchResult } from './types'

// JSON 书源（format: 'json'）工具：JSONPath 提取列表/字段（供测试与引擎共用）
export { jsonPath } from './types'

/** 目录分页上限（防止死循环/恶意站点） */
export const MAX_TOC_PAGES = 100
/** 正文分页上限（一章最多拼接页数） */
export const MAX_CONTENT_PAGES = 20

/** 渲染模板（变量用于 URL，自动 encode；模板整体就是单个变量时原样使用） */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  const bare = tpl.trim().match(/^\{\{(\w+)\}\}$/)
  if (bare) return vars[bare[1]] ?? ''
  return tpl.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => encodeURIComponent(vars[name] ?? ''))
}

/** 拼接 URL：绝对地址原样返回；相对地址挂到 baseUrl（baseUrl 为空则保持相对，走同源直连） */
export function resolveUrl(href: string, baseUrl: string): string {
  const h = (href ?? '').trim()
  if (!h || h.startsWith('#')) return ''
  if (/^https?:/i.test(h) || h.startsWith('data:')) return h
  if (h.startsWith('//')) return 'https:' + h
  if (!baseUrl) return h
  return baseUrl.replace(/\/+$/, '') + '/' + h.replace(/^\/+/, '')
}

/** 转绝对地址（new URL 的 base 必须是绝对地址；相对页面 URL 挂到当前文档 baseURI——兼容 GitHub Pages 子目录/离线版） */
function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, document.baseURI).href
  } catch {
    return url
  }
}

/** 提取到的 href 解析：相对路径按 HTML 语义相对「被抓取页面」解析（导出供测试） */
export function resolveExtracted(href: string, pageUrl: string): string {
  const h = (href ?? '').trim()
  if (!h || h.startsWith('#')) return ''
  if (/^(https?:|data:)/i.test(h)) return h
  if (h.startsWith('//')) return 'https:' + h
  if (h.startsWith('/')) return h
  try {
    return new URL(h, toAbsoluteUrl(pageUrl)).href
  } catch {
    return h
  }
}

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

interface ParsedFieldRule {
  selector: string
  attr: string
  pipes: { from: string; to: string }[]
}

/** 解析字段规则：`选择器@attr|replace:from,to|...` */
function parseFieldRule(rule: string): ParsedFieldRule {
  const parts = rule.split('|')
  const [selectorAttr = '', ...pipeParts] = parts
  const at = selectorAttr.lastIndexOf('@')
  const selector = at >= 0 ? selectorAttr.slice(0, at).trim() : selectorAttr.trim()
  const attr = at >= 0 ? selectorAttr.slice(at + 1).trim() : 'text'
  const pipes = pipeParts
    .filter((p) => p.startsWith('replace:'))
    .map((p) => {
      const comma = p.indexOf(',')
      if (comma < 0) return { from: p.slice('replace:'.length), to: '' }
      return { from: p.slice('replace:'.length, comma), to: p.slice(comma + 1) }
    })
  return { selector, attr, pipes }
}

/** 按字段规则从元素提取文本：规则中的选择器是相对元素的子查询 */
export function extractField(el: Element | null, rule: string): string {
  if (!el) return ''
  const { selector, attr, pipes } = parseFieldRule(rule)
  const target = selector ? el.querySelector(selector) : el
  if (!target) return ''
  let value: string
  if (attr === 'text') value = target.textContent ?? ''
  else if (attr === 'html') value = target.innerHTML
  else if (attr === 'outerHTML') value = target.outerHTML
  else if (attr === 'href') value = target.getAttribute('href') ?? ''
  else value = target.getAttribute(attr) ?? ''
  for (const { from, to } of pipes) {
    value = value.split(from).join(to)
  }
  return value.trim()
}

/** JSON 列表项：从解析后的 JSON 根提取数组（用于 json 格式书源） */
export function jsonList(json: unknown, selector: string): unknown[] {
  const v = jsonPath(json, selector)
  return Array.isArray(v) ? v : []
}

/** JSON 字段提取：按 JSONPath 从列表项取值（item 为数组元素或整棵 JSON） */
export function jsonField(item: unknown, rule: string): string {
  const { selector, pipes } = parseFieldRule(rule)
  const v = jsonPath(item, selector)
  let value = v === undefined || v === null ? '' : String(v)
  for (const { from, to } of pipes) {
    value = value.split(from).join(to)
  }
  return value.trim()
}

/** JSON 模板渲染：支持 {{$.xxx}}（从 item 取 JSONPath）与 {{bookUrl}}/{{chapterUrl}}（外部变量） */
export function renderJsonTemplate(tpl: string, item: unknown, vars: Record<string, string>): string {
  return tpl
    .replace(/\{\{(\$[^}]+)\}\}/g, (_m, path: string) => {
      const v = jsonPath(item, path)
      return encodeURIComponent(v === undefined || v === null ? '' : String(v))
    })
    .replace(/\{\{(\w+)\}\}/g, (_m, name: string) => encodeURIComponent(vars[name] ?? ''))
}

/** 从 HTML 中按列表选择器提取元素 */
export function extractList(html: string, selector: string): Element[] {
  const doc = parseHtml(html)
  return [...doc.querySelectorAll(selector)]
}

/** HTML 转纯文本（保留段落结构，正文提取用） */
function htmlToText(root: Element): string {
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
    if (['P', 'DIV', 'SECTION', 'ARTICLE', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR'].includes(el.tagName)) {
      parts.push('\n')
    }
    for (const child of el.childNodes) walk(child)
    if (['P', 'DIV', 'SECTION', 'ARTICLE', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR'].includes(el.tagName)) {
      parts.push('\n')
    }
  }
  walk(root)
  return parts
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 清洗正文：段落归一、压缩空行、去除首尾空白 */
function cleanContent(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 搜索（自动按关键词过滤结果，兼容静态站点无服务端搜索） */
export async function searchSource(source: BookSource, keyword: string): Promise<SearchResult[]> {
  if (!source.search) return []
  const url = resolveUrl(renderTemplate(source.search.url, { keyword }), source.baseUrl)
  const text = await fetchHtml(url)
  if (source.format === 'json') {
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`书源「${source.name}」返回的不是 JSON`)
    }
    const kw = keyword.toLowerCase()
    return jsonList(json, source.search.list)
      .map((item) => ({
        sourceId: source.id,
        sourceName: source.name,
        title: jsonField(item, source.search!.title),
        author: source.search?.author ? jsonField(item, source.search.author) : '',
        bookUrl: jsonField(item, source.search!.bookUrl),
      }))
      .filter((r) => r.title && r.bookUrl && r.title.toLowerCase().includes(kw))
  }
  const html = text
  const items = extractList(html, source.search.list)
  const kw = keyword.toLowerCase()
  return items
    .map((el) => ({
      sourceId: source.id,
      sourceName: source.name,
      title: extractField(el, source.search!.title),
      author: source.search?.author ? extractField(el, source.search.author) : '',
      bookUrl: resolveExtracted(extractField(el, source.search!.bookUrl), url),
    }))
    .filter((r) => r.title && r.bookUrl && r.title.toLowerCase().includes(kw))
}

/** 解析「下一页」链接：按选择器取 href，相对页面 URL 解析；防循环（返回 null 停止翻页） */
function nextPageUrl(doc: Document, selector: string, pageUrl: string, seenPages: Set<string>): string | null {
  const el = doc.querySelector(selector)
  if (!el) return null
  const href = el.getAttribute('href') ?? el.getAttribute('data-href') ?? ''
  if (!href) return null
  const url = resolveExtracted(href, pageUrl)
  if (!url || url === pageUrl || seenPages.has(url)) return null
  seenPages.add(url)
  return url
}

/** 抓取目录（支持 next 分页：自动跟随「下一页」直到无链接或达上限；json 格式解析 JSON 数组） */
export async function fetchChapters(source: BookSource, bookUrl: string): Promise<ChapterItem[]> {
  if (!source.chapters) throw new Error(`书源「${source.name}」未配置目录规则`)
  const chapters: ChapterItem[] = []
  const seenUrls = new Set<string>()
  const seenPages = new Set<string>()
  let pageUrl: string | null = resolveUrl(renderTemplate(source.chapters.url, { bookUrl }), source.baseUrl)
  let pages = 0
  while (pageUrl && pages < MAX_TOC_PAGES) {
    pages++
    const text = await fetchHtml(pageUrl)
    if (source.format === 'json') {
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error(`书源「${source.name}」返回的不是 JSON`)
      }
      for (const item of jsonList(json, source.chapters.list)) {
        const title = jsonField(item, source.chapters!.title)
        const url = renderJsonTemplate(source.chapters!.itemUrl, item, { bookUrl })
        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url)
          chapters.push({ title, url })
        }
      }
      // JSON 接口目录通常单次返回全部，无分页
      return chapters
    }
    const doc = parseHtml(text)
    for (const el of extractList(text, source.chapters.list)) {
      const title = extractField(el, source.chapters!.title)
      const url = resolveExtracted(extractField(el, source.chapters!.itemUrl), pageUrl)
      if (title && url && !seenUrls.has(url)) {
        seenUrls.add(url)
        chapters.push({ title, url })
      }
    }
    pageUrl = source.chapters.next ? nextPageUrl(doc, source.chapters.next, pageUrl, seenPages) : null
  }
  return chapters
}

/** 抓取正文并清洗（json 格式书源：content 规则为 JSONPath，如 `$.data.content`） */
export async function fetchContent(source: BookSource, chapterUrl: string): Promise<string> {
  if (!source.content) throw new Error(`书源「${source.name}」未配置正文规则`)
  const parts: string[] = []
  const seenPages = new Set<string>()
  let pageUrl: string | null = resolveUrl(renderTemplate(source.content.url, { chapterUrl }), source.baseUrl)
  let pages = 0
  while (pageUrl && pages < MAX_CONTENT_PAGES) {
    pages++
    const text = await fetchHtml(pageUrl)
    if (source.format === 'json') {
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error(`书源「${source.name}」返回的不是 JSON`)
      }
      const body = jsonField(json, source.content.content)
      if (body) parts.push(body)
      // JSON 接口正文通常单页返回
      return cleanContent(parts.join('\n\n'))
    }
    const doc = parseHtml(text)
    const { selector, attr, pipes } = parseFieldRule(source.content.content)
    const el = doc.querySelector(selector)
    if (!el) {
      // 已有内容时，后续页缺正文视为分页结束（站点末页结构可能不同）
      if (parts.length > 0) break
      throw new Error('正文提取失败：未匹配到选择器')
    }
    // 直接对匹配元素取值（不再二次 querySelector，@text 规则也能命中元素自身）
    let body: string
    if (attr === 'html') body = htmlToText(el)
    else if (attr === 'text') body = el.textContent ?? ''
    else if (attr === 'outerHTML') body = el.outerHTML
    else if (attr === 'href') body = el.getAttribute('href') ?? ''
    else body = el.getAttribute(attr) ?? ''
    for (const { from, to } of pipes) body = body.split(from).join(to)
    parts.push(body)
    pageUrl = source.content.next ? nextPageUrl(doc, source.content.next, pageUrl, seenPages) : null
  }
  return cleanContent(parts.join('\n\n'))
}

/** 书源规则校验（返回错误信息，空表示合法） */
export function validateSource(source: BookSource): string {
  if (!source || typeof source !== 'object') return '书源不是有效对象'
  if (!source.id || !source.name) return '缺少 id 或 name'
  if (!source.search && !source.chapters) return '至少需要 search 或 chapters 规则'
  return ''
}

/** 生成书源 JSON 模板 */
export function sourceTemplate(): string {
  const tpl: BookSource = {
    id: 'my-source',
    name: '我的书源',
    baseUrl: 'https://example.com',
    enabled: true,
    search: {
      url: '/search?q={{keyword}}',
      list: '.result li',
      title: 'h3 a@text',
      author: '.author@text',
      bookUrl: 'h3 a@href',
    },
    chapters: { url: '{{bookUrl}}', list: '#toc a', title: '@text', itemUrl: '@href' },
    content: { url: '{{chapterUrl}}', content: '#content@html' },
  }
  return JSON.stringify(tpl, null, 2)
}
