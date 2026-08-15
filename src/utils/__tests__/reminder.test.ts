import { describe, expect, it } from 'vitest'
import { buildReminderBody, REMINDER_NOTIFICATION_ID, toDailySchedule } from '@/utils/reminder'
import type { ReadingReminder } from '@/types'

describe('reading reminder 工具', () => {
  it('buildReminderBody：无阅读时鼓励开卷，已读时显示分钟数', () => {
    expect(buildReminderBody(0)).toContain('还没有阅读')
    expect(buildReminderBody(30)).toContain('翻开一本')
    expect(buildReminderBody(120)).toContain('已读 2 分钟')
    expect(buildReminderBody(3 * 3600 + 5 * 60)).toContain('已读 185 分钟')
  })

  it('toDailySchedule：时刻 + 每日重复（reminder 固定 id 复用）', () => {
    const r: ReadingReminder = { enabled: true, hour: 21, minute: 30 }
    expect(toDailySchedule(r)).toEqual({ on: { hour: 21, minute: 30 }, repeats: true })
    expect(REMINDER_NOTIFICATION_ID).toBe(1)
  })

  it('toDailySchedule：凌晨时刻正确传递', () => {
    const r: ReadingReminder = { enabled: true, hour: 0, minute: 5 }
    expect(toDailySchedule(r)).toEqual({ on: { hour: 0, minute: 5 }, repeats: true })
  })
})
