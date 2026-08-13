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
    url: '/demo-source/index.html',
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
  },
  content: {
    url: '{{chapterUrl}}',
    content: '#content@html',
  },
}

export function loadSources(): BookSource[] {
  try {
    const raw = localStorage.getItem(SOURCES_KEY)
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) {
        // 确保内置演示书源存在且不被删除
        const hasDemo = list.some((s) => s?.id === DEMO_SOURCE.id)
        return hasDemo ? list : [DEMO_SOURCE, ...list]
      }
    }
  } catch {
    /* ignore */
  }
  return [{ ...DEMO_SOURCE }]
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
  if (id === DEMO_SOURCE.id) throw new Error('内置演示书源不可删除')
  saveSources(loadSources().filter((s) => s.id !== id))
}

/** 导入书源列表（JSON 字符串或对象数组），返回成功导入数 */
export function importSources(json: string): number {
  const parsed = JSON.parse(json)
  const list = Array.isArray(parsed) ? parsed : [parsed]
  const current = loadSources()
  const existingIds = new Set(current.map((s) => s.id))
  let added = 0
  for (const item of list) {
    if (item?.id && item?.name && !existingIds.has(item.id)) {
      current.push(item)
      existingIds.add(item.id)
      added++
    }
  }
  saveSources(current)
  return added
}

/** 导出全部书源（JSON 文本） */
export function exportSources(): string {
  return JSON.stringify(loadSources(), null, 2)
}
