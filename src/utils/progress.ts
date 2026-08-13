import type { BookMeta } from '@/types'

/** 全书阅读百分比（0-100）：
 *  按字数加权（已读章节字数 + 当前章节字数 × 滚动比例）；
 *  旧数据没有字数统计时退化为按章节数估算 */
export function bookReadPercent(meta: BookMeta): number {
  const { chapterIndex, scrollRatio } = meta.progress
  const chars = meta.chapterChars
  if (meta.totalChars > 0 && chars && chars.length === meta.chapterCount) {
    let before = 0
    for (let i = 0; i < chapterIndex && i < chars.length; i++) before += chars[i]
    const current = chars[chapterIndex] ?? 0
    const ratio = Math.min(1, Math.max(0, scrollRatio))
    return Math.min(100, ((before + current * ratio) / meta.totalChars) * 100)
  }
  if (meta.chapterCount <= 0) return 0
  return ((chapterIndex + 1) / meta.chapterCount) * 100
}

/** 格式化百分比：大数取整，小数保留一位 */
export function formatPercent(p: number): string {
  if (p >= 99.95) return '100%'
  if (p >= 10) return `${Math.round(p)}%`
  return `${p.toFixed(1)}%`
}

/** 秒数 → 人类可读时长 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins} 分钟`
  const hours = Math.floor(mins / 60)
  return `${hours} 小时 ${mins % 60} 分`
}
