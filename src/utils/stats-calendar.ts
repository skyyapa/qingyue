/** 阅读统计日历：月度网格计算与时长分档（纯函数，可单测） */

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string
  /** 日号（1-31） */
  day: number
  /** 当日阅读分钟数（向下取整） */
  minutes: number
  /** 是否当月（前后补齐的格子为 false，置灰） */
  inMonth: boolean
  isToday: boolean
}

/** 本地日期 → YYYY-MM-DD */
export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 构建某月日历网格（周一为每周第一天，前后补齐到整 6 周 = 42 格） */
export function buildMonthGrid(
  year: number,
  month: number, // 1-12
  byDate: Record<string, number>,
  today: Date = new Date()
): CalendarDay[] {
  const days: CalendarDay[] = []
  const first = new Date(year, month - 1, 1)
  const lead = (first.getDay() + 6) % 7 // 周一为一周开始
  const start = new Date(year, month - 1, 1 - lead)
  const todayKey = toDateKey(today)
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = toDateKey(d)
    days.push({
      date: key,
      day: d.getDate(),
      minutes: Math.floor((byDate[key] ?? 0) / 60),
      inMonth: d.getMonth() === month - 1,
      isToday: key === todayKey,
    })
  }
  return days
}

/** 分钟数 → 热力分档（0-4；0 = 无记录） */
export function intensityLevel(minutes: number): number {
  if (minutes <= 0) return 0
  if (minutes < 30) return 1
  if (minutes < 60) return 2
  if (minutes < 120) return 3
  return 4
}
