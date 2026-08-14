/** 书籍来源类型 */
export type BookKind = 'txt' | 'epub' | 'web'

/** 在线书（书源抓取）信息 */
export interface WebBookInfo {
  sourceId: string
  sourceName: string
  bookUrl: string
  /** 章节 URL 列表（与 chapterTitles 一一对应） */
  chapterUrls: string[]
}

/** 书籍元数据 —— 书架与目录展示用（IndexedDB books store） */
export interface BookMeta {
  id: string
  title: string
  author: string
  source: BookKind
  /** 在线书（web）的书源信息 */
  webInfo?: WebBookInfo
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
  /** 知识库分析状态（可能缺失） */
  analysis?: AnalysisState
}

/** 单章内容（IndexedDB chapters store，key = `${bookId}:${index}`） */
export interface Chapter {
  id: string
  bookId: string
  index: number
  title: string
  text: string
  /** 正文内嵌图片（data URL，EPUB 特有；文本中以 [img:N] 占位） */
  images?: string[]
  /** 段落排版样式（与正文段落一一对应；EPUB CSS 子集提取，旧数据缺失） */
  paragraphStyles?: (ParagraphStyle | null)[]
}

/** 段落排版样式（EPUB 内嵌 CSS 子集，键与 CSS 属性对应；值为已归一化的 CSS 字符串） */
export interface ParagraphStyle {
  /** 首行缩进（em） */
  textIndent?: string
  textAlign?: string
  lineHeight?: string
  /** 相对字号（em，基于 16px 基准） */
  fontSize?: string
  fontFamily?: string
  color?: string
  fontWeight?: 'bold' | 'normal'
  fontStyle?: 'italic'
  marginTop?: string
  marginBottom?: string
}

/** EPUB 内嵌字体（@font-face 提取，data URL；超限字体被跳过） */
export interface BookFont {
  /** 字体家族名（CSS 中 font-family 引用） */
  family: string
  dataUrl: string
  style?: 'italic' | 'normal'
  weight?: string
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

/** 主题（阅读界面皮肤） */
export type ThemeName =
  | 'default'
  | 'pure'
  | 'paper'
  | 'celadon'
  | 'eye'
  | 'pink'
  | 'night'
  | 'ocean'
  | 'pine'
  | 'graphite'

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
  /** 拟真书页效果：正文渲染为带纸张质感与阴影的书页 */
  bookPage: boolean
}

/** TXT 解码编码选项 */
export type TextEncoding = 'auto' | 'utf-8' | 'gb18030' | 'big5' | 'utf-16'

/** 阅读统计（localStorage 持久化） */
export interface ReadingStats {
  /** 按日期累计的阅读秒数，key = YYYY-MM-DD（本地时区） */
  byDate: Record<string, number>
}

/** 知识库实体类型 */
export type EntityType = 'person' | 'place' | 'skill' | 'item' | 'org' | 'realm' | 'unknown'

/** 小说知识库实体（人物/地点/技能/物品等，无 AI 规则识别 + 用户可修正） */
export interface Entity {
  id: string
  bookId: string
  name: string
  type: EntityType
  /** 别名（合并实体时并入） */
  aliases: string[]
  /** 出现章节号列表 */
  chapters: number[]
  /** 总出现次数 */
  count: number
  /** 代表性句子 */
  samples: string[]
  /** 例句对应章节（与 samples 一一对应；旧数据可能缺失，缺失时例句不可定位正文） */
  sampleChapters?: number[]
  /** 用户备注 */
  note: string
  /** 用户手动创建的实体 */
  custom: boolean
  /** 人工修正锁定：锁定后自动分析不再覆盖 */
  locked: boolean
}

/** 章节索引（每章实体词频 + 高频词 + 摘要） */
export interface ChapterIndex {
  id: string
  bookId: string
  index: number
  /** 实体 id → 本章出现次数 */
  entityCounts: Record<string, number>
  /** 本章高频词 */
  topWords: string[]
  /** 章节摘要（v1 为模板式：登场人物/地点；AI 接入后为语义摘要） */
  summary: string
  /** 代表性句子（无 AI 抽取式） */
  keySentences: string[]
  /** 本章事件句（「A 对 B 说」规则提取，v1 无 AI；旧数据可能缺失） */
  events?: string[]
}

/** 实体共现关系（段落级，关系图边） */
export interface Relation {
  id: string
  bookId: string
  a: string
  b: string
  weight: number
  /** 每章共现权重（数组下标 = 章节号；旧数据缺失——防剧透时按已读实体次数上界截断） */
  chapterWeights?: number[]
}

/** 全书知识库分析状态（存于 BookMeta.analysis） */
export interface AnalysisState {
  status: 'none' | 'running' | 'done' | 'error'
  /** 0-1 分析进度 */
  progress: number
  /** 识别出的实体数 */
  entityCount: number
  /** 用户忽略的名字（删除/改名/合并后，自动分析不再重建） */
  ignoredNames: string[]
  error?: string
  updatedAt: number
}
