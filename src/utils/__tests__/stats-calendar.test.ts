import { describe, expect, it } from 'vitest'
import { buildMonthGrid, intensityLevel, toDateKey } from '../stats-calendar'

describe('buildMonthGrid 月度日历网格', () => {
  it('2026-08 网格：42 格、首格周一、当月天数正确', () => {
    const byDate = { '2026-08-01': 3600, '2026-08-15': 1800, '2026-07-31': 900 }
    const days = buildMonthGrid(2026, 8, byDate, new Date(2026, 7, 15)) // 2026-08-15 为「今天」
    expect(days).toHaveLength(42)
    // 8 月 1 日是周六 → 周一为起点，首格为 7/27
    expect(days[0].date).toBe('2026-07-27')
    expect(days[0].inMonth).toBe(false)
    // 当月格子数 = 31
    expect(days.filter((d) => d.inMonth)).toHaveLength(31)
    // 分钟映射（秒 → 分钟取整）
    expect(days.find((d) => d.date === '2026-08-01')?.minutes).toBe(60)
    expect(days.find((d) => d.date === '2026-08-15')?.minutes).toBe(30)
    expect(days.find((d) => d.date === '2026-08-15')?.isToday).toBe(true)
    expect(days.find((d) => d.date === '2026-07-31')?.inMonth).toBe(false)
  })

  it('无记录日期 minutes 为 0，跨月边界正确', () => {
    const days = buildMonthGrid(2026, 8, {}, new Date(2026, 7, 1))
    expect(days.find((d) => d.date === '2026-09-01')?.inMonth).toBe(false) // 9/1 属于补齐格
    expect(days.every((d) => d.minutes === 0)).toBe(true)
  })

  it('toDateKey 本地时区补零', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('intensityLevel 热力分档', () => {
  it('边界分档：0/30/60/120 分钟', () => {
    expect(intensityLevel(0)).toBe(0)
    expect(intensityLevel(29)).toBe(1)
    expect(intensityLevel(30)).toBe(2)
    expect(intensityLevel(59)).toBe(2)
    expect(intensityLevel(60)).toBe(3)
    expect(intensityLevel(119)).toBe(3)
    expect(intensityLevel(120)).toBe(4)
    expect(intensityLevel(300)).toBe(4)
  })
})
