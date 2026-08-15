/** 书源规则（legado 简化风格） */
export interface BookSource {
  id: string
  name: string
  /** 站点根地址；为空表示同源（相对路径直连，无需代理） */
  baseUrl: string
  enabled: boolean
  /** html=解析 HTML（CSS 选择器）；json=解析 JSON 接口（JSONPath，如 $.data 列表） */
  format?: 'html' | 'json'
  search?: SearchRule
  chapters?: ChaptersRule
  content?: ContentRule
}

/** JSONPath 提取：`$.data` 取字段，`$.data[0].name` 按下标/字段逐级取值 */
export function jsonPath(root: unknown, path: string): unknown {
  const p = path.trim()
  if (!p.startsWith('$')) return undefined
  const steps = p
    .slice(1)
    .replace(/\[['"]?(\w+)['"]?\]/g, '.$1')
    .split('.')
    .filter(Boolean)
  let cur: unknown = root
  for (const step of steps) {
    if (cur === null || cur === undefined) return undefined
    cur = (cur as Record<string, unknown>)[step]
  }
  return cur
}

export interface SearchRule {
  /** 搜索 URL，支持 {{keyword}} */
  url: string
  /** 结果列表 CSS 选择器 */
  list: string
  /** 书名字段规则 */
  title: string
  /** 作者字段规则（可选） */
  author?: string
  /** 书籍详情页 URL 字段规则 */
  bookUrl: string
}

export interface ChaptersRule {
  /** 目录页 URL，支持 {{bookUrl}} */
  url: string
  /** 章节列表 CSS 选择器 */
  list: string
  /** 章节标题字段规则 */
  title: string
  /** 章节页 URL 字段规则 */
  itemUrl: string
  /** 目录「下一页」链接 CSS 选择器（可选，分页目录自动翻页） */
  next?: string
}

export interface ContentRule {
  /** 正文页 URL，支持 {{chapterUrl}} */
  url: string
  /** 正文字段规则：`选择器@text|html` + 管道 */
  content: string
  /** 正文「下一页」链接 CSS 选择器（可选，正文分页自动拼接） */
  next?: string
}

/** 搜索结果 */
export interface SearchResult {
  sourceId: string
  sourceName: string
  title: string
  author: string
  bookUrl: string
}

/** 章节列表项 */
export interface ChapterItem {
  title: string
  url: string
}

/** 代理配置 */
export interface ProxyConfig {
  /** direct=直连（目标站支持 CORS 时）；custom=自备代理；public=公共代理兜底 */
  mode: 'direct' | 'custom' | 'public'
  /** 自备代理地址（mode=custom 时使用，格式如 https://xxx.workers.dev/） */
  customUrl: string
}
