/** 每日阅读提醒 —— 纯函数帮助（提醒文案/调度描述），桥接层在 capacitor.ts */
import type { ReadingReminder } from '@/types'

/** 提醒通知固定 id（Android 每日重复调度需唯一） */
export const REMINDER_NOTIFICATION_ID = 1

/** 今日已读秒数 → 提醒正文：根据当天阅读情况生成更有温度的文案 */
export function buildReminderBody(todaySeconds: number): string {
  const minutes = Math.floor(todaySeconds / 60)
  if (minutes > 0) {
    return `今天已读 ${minutes} 分钟，继续享受故事吧`
  }
  return '今天还没有阅读，翻开一本喜欢的书吧'
}

/** 阅读提醒 → 每日重复的本地通知调度描述（时刻 + 每天重复） */
export function toDailySchedule(reminder: ReadingReminder): {
  on: { hour: number; minute: number }
  repeats: true
} {
  return { on: { hour: reminder.hour, minute: reminder.minute }, repeats: true }
}
