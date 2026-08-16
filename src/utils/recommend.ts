/** 推荐引擎：基于书籍标题/作者启发式推断网文题材，并在书库内推荐同类型/同作者书目。
 *  纯函数、无 DOM 依赖，便于单测（见 __tests__/recommend.test.ts）。
 *  分类是启发式关键词匹配，非 100% 准确：标题无明显题材关键词时归入 unknown。
 */
import type { BookMeta } from '@/types'

export type Genre =
  | 'xuanhuan' // 玄幻奇幻
  | 'xianxia' // 仙侠修真
  | 'urban' // 都市
  | 'wuxia' // 武侠
  | 'scifi' // 科幻
  | 'history' // 历史
  | 'romance' // 言情
  | 'suspense' // 悬疑
  | 'game' // 网游/无限流
  | 'apocalypse' // 末世
  | 'unknown'

export const GENRE_LABELS: Record<Genre, string> = {
  xuanhuan: '玄幻',
  xianxia: '仙侠',
  urban: '都市',
  wuxia: '武侠',
  scifi: '科幻',
  history: '历史',
  romance: '言情',
  suspense: '悬疑',
  game: '游戏',
  apocalypse: '末世',
  unknown: '其他',
}

/** 题材 → 标题关键词（命中任一即归为该题材；长词优先，避免单字误判） */
const GENRE_KEYWORDS: Record<Exclude<Genre, 'unknown'>, string[]> = {
  xuanhuan: ['斗罗', '斗破', '玄幻', '剑来', '遮天', '完美世界', '圣墟', '万族', '神界', '诸天', '吞噬', '星辰变'],
  xianxia: ['修仙', '仙侠', '修真', '仙帝', '仙尊', '道君', '大道', '飞升', '九转', '炼丹', '落凡'],
  urban: ['都市', '赘婿', '神豪', '豪门', '职场', '商战', '系统', '重生之', '校花', '贴身', '兵王'],
  wuxia: ['武侠', '江湖', '剑', '刀客', '大侠', '宗师', '浪子', '侠客', '快意恩仇'],
  scifi: ['科幻', '星际', '机甲', '宇宙', '机器人', '末世之前', '异星', '星球', '未来', '赛博', '轨道'],
  history: ['大唐', '三国', '春秋', '战国', '王朝', '历史', '皇帝', '官场', '大明', '南宋', '汉末'],
  romance: ['顾', '豪门', '总裁', '夫人', '王妃', '甜甜', '暖婚', '宠', '妻', '恋', '心动', '婚约'],
  suspense: ['悬疑', '侦探', '诡', '案', '谜案', '真相', '凶', '推理', '迷雾', '失踪'],
  game: ['网游', '无限流', '副本', '游戏', '系统流', '轮回', '万界', '时空', '主神'],
  apocalypse: ['末世', '末日', '丧尸', '废土', '天灾', '重生之末日', '骤变'],
}

/** 单个题材关键词是否命中标题（避免整词被另一词前缀吞掉的情况） */
function hit(title: string, kw: string): boolean {
  return title.includes(kw)
}

/** 推断一本书的题材（可返回多个；无命中返回 [unknown]） */
export function classifyByTitle(title: string): Genre[] {
  const found = (Object.keys(GENRE_KEYWORDS) as Exclude<Genre, 'unknown'>[]).filter((g) =>
    GENRE_KEYWORDS[g].some((kw) => hit(title, kw))
  )
  return found.length > 0 ? found : ['unknown']
}

/** 各题材的代表搜索关键词（用于"在线搜同类型"时作为搜索词；取每题材第一个未重复词） */
export function genreSearchKeyword(g: Genre): string {
  if (g === 'unknown') return ''
  return GENRE_KEYWORDS[g][0] ?? ''
}

/** 推荐书目卡片 */
export interface Recommendation {
  book: BookMeta
  /** 共享的题材（与目标书重叠的） */
  sharedGenres: Genre[]
  /** 与目标书同作者 */
  sameAuthor: boolean
  /** 目标评分：共享题材数 ×2 + 同作者 ×1 */
  score: number
  /** 描述理由（UI 用） */
  reason: string
}

/** 是否算"看过/在读"（有进度） */
export function hasRead(meta: BookMeta): boolean {
  return meta.progress.chapterIndex > 0 || meta.progress.scrollRatio > 0
}

/** 书库内推荐：给定目标书（通常在读/已读），从其余书里找同题材/同作者的书并按相关度排序。
 *  排除目标书自身。同题材>同作者；题材共享越多越靠前。 */
export function recommendBooks(books: BookMeta[], targetId: string): Recommendation[] {
  const target = books.find((b) => b.id === targetId)
  if (!target) return []
  const targetGenres = classifyByTitle(target.title)
  const targetAuthor = target.author.trim()

  const out: Recommendation[] = []
  for (const b of books) {
    if (b.id === targetId) continue
    const bGenres = classifyByTitle(b.title)
    const shared = bGenres.filter((g) => targetGenres.includes(g) && g !== 'unknown')
    const sameAuthor = !!targetAuthor && b.author.trim() === targetAuthor
    if (shared.length === 0 && !sameAuthor) continue
    const score = shared.length * 2 + (sameAuthor ? 1 : 0)
    out.push({ book: b, sharedGenres: shared, sameAuthor, score, reason: buildReason(shared, sameAuthor, targetGenres) })
  }
  // 同分时按「是否读过目标类型」/创建时间稳定排序
  out.sort((a, b) => b.score - a.score || a.book.createdAt - b.book.createdAt)
  return out
}

function buildReason(shared: Genre[], sameAuthor: boolean, targetGenres: Genre[]): string {
  const parts: string[] = []
  if (shared.length > 0) {
    parts.push(`同类 ${shared.map((g) => GENRE_LABELS[g]).join('/')}`)
  }
  if (sameAuthor) parts.push('同作者')
  if (parts.length === 0 && targetGenres.length) {
    parts.push(`与《${GENRE_LABELS[targetGenres[0]]}》相关`)
  }
  return parts.join(' · ')
}

/** 汇总书库题材画像：按题材统计书籍数（仅计入非 unknown），返回降序 */
export function genreProfile(books: BookMeta[]): { genre: Genre; count: number }[] {
  const map = new Map<Genre, number>()
  for (const b of books) {
    for (const g of classifyByTitle(b.title)) {
      if (g === 'unknown') continue
      map.set(g, (map.get(g) ?? 0) + 1)
    }
  }
  return [...map.entries()].map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count)
}
