/** 书源管理：localStorage 持久化 + 内置演示书源 */
import type { BookSource } from './types'

const SOURCES_KEY = 'qingyue:sources'

/** 内置演示书源：抓取自托管的演示内容（同源直连，开箱即用，无版权风险） */
export const DEMO_SOURCE: BookSource = {
  id: 'demo',
  name: '轻阅演示',
  baseUrl: '',
  enabled: true,
  search: {
    url: 'demo-source/index.html',
    list: '.result li',
    title: 'h3 a@text',
    author: '.author@text',
    bookUrl: 'h3 a@href',
  },
  chapters: {
    url: '{{bookUrl}}',
    list: '#toc a',
    title: '@text',
    itemUrl: '@href',
    // 分页目录：「下一页」链接选择器（无匹配则单页）
    next: '.toc-next',
  },
  content: {
    url: '{{chapterUrl}}',
    content: '#content@html',
    // 正文分页：「下一页」链接选择器（无匹配则单页）
    next: '.content-next',
  },
}

/**
 * 内置公共书源：酷我小说官方 API（正版，返回 JSON，无需代理/验证）。
 * 搜索返回 book_id 作 bookUrl；目录/正文按 id 拼 API URL。
 */
export const KUWO_SOURCE: BookSource = {
  id: 'kuwo',
  name: '酷我小说',
  baseUrl: 'http://appi.kuwo.cn',
  enabled: true,
  format: 'json',
  search: {
    url: '/novels/api/book/search?keyword={{keyword}}&pi=1&ps=30',
    list: '$.data',
    title: '$.title',
    author: '$.author_name',
    bookUrl: '$.book_id',
  },
  chapters: {
    url: '/novels/api/book/{{bookUrl}}/chapters?paging=0',
    list: '$.data',
    title: '$.chapter_title',
    itemUrl: '/novels/api/book/{{bookUrl}}/chapters/{{$.chapter_id}}',
  },
  content: {
    url: '{{chapterUrl}}',
    content: '$.data.content',
  },
}

/** 内置书源：加载时保证存在且用当前定义覆盖（旧数据可能残留过时规则），不可删除 */
export const BUILTIN_SOURCES: BookSource[] = [DEMO_SOURCE, KUWO_SOURCE]

export function loadSources(): BookSource[] {
  try {
    const raw = localStorage.getItem(SOURCES_KEY)
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) {
        // 内置书源：规则字段用当前定义覆盖（防旧数据残留过时规则），但保留用户的启用开关
        let merged = list
        for (const builtin of BUILTIN_SOURCES) {
          const idx = merged.findIndex((s) => s?.id === builtin.id)
          if (idx >= 0) {
            const existing = merged[idx]
            merged = merged.map((s, i) =>
              i === idx ? { ...builtin, enabled: existing?.enabled ?? builtin.enabled } : s
            )
          } else {
            merged = [builtin, ...merged]
          }
        }
        return merged
      }
    }
  } catch {
    /* ignore */
  }
  return BUILTIN_SOURCES.map((s) => ({ ...s }))
}

export function saveSources(sources: BookSource[]): void {
  localStorage.setItem(SOURCES_KEY, JSON.stringify(sources))
}

export function getEnabledSources(): BookSource[] {
  return loadSources().filter((s) => s.enabled)
}

export function getSource(id: string): BookSource | undefined {
  return loadSources().find((s) => s.id === id)
}

export function addSource(source: BookSource): void {
  const list = loadSources()
  if (list.some((s) => s.id === source.id)) throw new Error('书源 ID 已存在')
  list.push(source)
  saveSources(list)
}

export function updateSource(source: BookSource): void {
  const list = loadSources()
  const index = list.findIndex((s) => s.id === source.id)
  if (index < 0) throw new Error('书源不存在')
  list[index] = source
  saveSources(list)
}

export function removeSource(id: string): void {
  if (BUILTIN_SOURCES.some((s) => s.id === id)) throw new Error('内置书源不可删除')
  saveSources(loadSources().filter((s) => s.id !== id))
}

/** 导入书源结果明细 */
export interface ImportResult {
  /** 新增数量 */
  added: number
  /** 覆盖更新的数量 */
  updated: number
  /** 跳过数量（ID 已存在且未覆盖 / 格式无效 / 内置书源） */
  skipped: number
}

/** 导入书源列表（JSON 字符串或对象数组），返回结果明细
 *  opts.overwrite=true 时同 ID 书源覆盖更新；内置书源始终不可覆盖
 */
export function importSources(json: string, opts?: { overwrite?: boolean }): ImportResult {
  const parsed = JSON.parse(json)
  const list = Array.isArray(parsed) ? parsed : [parsed]
  const byId = new Map(loadSources().map((s) => [s.id, s]))
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 }
  for (const item of list) {
    if (!item?.id || !item?.name || BUILTIN_SOURCES.some((s) => s.id === item.id)) {
      result.skipped++
      continue
    }
    if (byId.has(item.id)) {
      if (opts?.overwrite) {
        byId.set(item.id, item)
        result.updated++
      } else {
        result.skipped++
      }
    } else {
      byId.set(item.id, item)
      result.added++
    }
  }
  saveSources([...byId.values()])
  return result
}

/** 导出全部书源（JSON 文本） */
export function exportSources(): string {
  return JSON.stringify(loadSources(), null, 2)
}

/** 书源 → base64url payload（分享链接用；URL 安全字符，无需 encodeURIComponent） */
export function encodeSourcePayload(source: BookSource): string {
  const json = JSON.stringify([source])
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url payload → 书源数组（解码或解析失败抛错） */
export function decodeSourcePayload(payload: string): BookSource[] {
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const json = new TextDecoder().decode(bytes)
  const parsed = JSON.parse(json)
  const list = Array.isArray(parsed) ? parsed : [parsed]
  for (const item of list) {
    if (!item?.id || !item?.name) throw new Error('分享内容不是有效的书源')
  }
  return list
}

/** 生成书源分享链接（打开后自动进入导入页） */
export function shareSourceUrl(source: BookSource): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#/source-import/${encodeSourcePayload(source)}`
}
