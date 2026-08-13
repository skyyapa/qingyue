/** 书籍来源类型 */
export type BookSource = 'txt' | 'epub'

/** 书籍元数据 —— 书架与目录展示用（IndexedDB books store） */
export interface BookMeta {
  id: string
  title: string
  author: string
  source: BookSource
  /** 章节总数 */
  chapterCount: number
  /** 全部章节标题（目录面板直接读元数据，秒开） */
  chapterTitles: string[]
  /** 每章字数（全书阅读占比计算用；旧数据可能缺失） */
  chapterChars: number[]
  /** 全书总字数 */
  totalChars: number
  /** 所属分组（'' = 默认分组） */
  group: string
  createdAt: number
  progress: ReadProgress
}

/** 单章内容（IndexedDB chapters store，key = `${bookId}:${index}`） */
export interface Chapter {
  id: string
  bookId: string
  index: number
  title: string
  text: string
}

/** 阅读进度：章序号 + 章内阅读位置（滚动模式 scrollTop / 翻页模式 scrollLeft，均按可滚范围归一化为 0-1） */
export interface ReadProgress {
  chapterIndex: number
  /** 0-1，章节内阅读位置 */
  scrollRatio: number
  updatedAt: number
}

/** 翻页方式 */
export type PageMode = 'scroll' | 'paged'

/** 主题 */
export type ThemeName = 'default' | 'night' | 'eye' | 'paper'

/** 正文字体 */
export type FontName = 'system' | 'serif' | 'song' | 'hei' | 'kai'

/** 阅读设置（localStorage 持久化） */
export interface ReaderSettings {
  /** 字号 px，14 - 28 */
  fontSize: number
  /** 行距，1.4 - 2.4 */
  lineHeight: number
  pageMode: PageMode
  theme: ThemeName
  font: FontName
  /** 章节末尾显示「下一章」入口 */
  showNextHint: boolean
}

/** TXT 解码编码选项 */
export type TextEncoding = 'auto' | 'utf-8' | 'gb18030' | 'big5' | 'utf-16'

/** 阅读统计（localStorage 持久化） */
export interface ReadingStats {
  /** 按日期累计的阅读秒数，key = YYYY-MM-DD（本地时区） */
  byDate: Record<string, number>
}
