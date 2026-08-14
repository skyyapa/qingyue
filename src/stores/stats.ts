import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ReadingStats } from '@/types'

/** 阅读统计：阅读器打开期间每 10 秒累加一次（页面可见时），存 localStorage */

const STATS_KEY = 'qingyue:stats'
const TICK_SECONDS = 10

function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function loadStats(): ReadingStats {
  try {
    const v = JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null')
    if (v && typeof v === 'object' && !Array.isArray(v)) return { byDate: v.byDate ?? {} }
  } catch {
    /* ignore */
  }
  return { byDate: {} }
}

/** 连续阅读天数：从今天（今天没读则从昨天）起往前数 */
function countStreak(byDate: Record<string, number>): number {
  const d = new Date()
  if (!(byDate[todayKey(d)] ?? 0)) d.setDate(d.getDate() - 1)
  let streak = 0
  while ((byDate[todayKey(d)] ?? 0) > 0) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export const useStatsStore = defineStore('stats', () => {
  const stats = ref<ReadingStats>(loadStats())

  const todaySeconds = computed(() => stats.value.byDate[todayKey()] ?? 0)
  const totalSeconds = computed(() => Object.values(stats.value.byDate).reduce((a, b) => a + b, 0))
  const streak = computed(() => countStreak(stats.value.byDate))

  function persist(): void {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats.value))
  }

  // 活跃检测：超过 ACTIVE_WINDOW 无任何交互（挂机）不计时
  const ACTIVE_WINDOW_MS = 60_000
  let lastActiveAt = 0
  let timer: number | undefined

  function onActivity(): void {
    lastActiveAt = Date.now()
  }

  /** 开始阅读计时（阅读器挂载时调用） */
  function startTracking(): void {
    if (timer !== undefined) return
    lastActiveAt = Date.now()
    window.addEventListener('keydown', onActivity)
    window.addEventListener('mousedown', onActivity)
    window.addEventListener('touchstart', onActivity)
    window.addEventListener('wheel', onActivity)
    timer = window.setInterval(() => {
      if (document.hidden || Date.now() - lastActiveAt >= ACTIVE_WINDOW_MS) return
      const key = todayKey()
      stats.value.byDate[key] = (stats.value.byDate[key] ?? 0) + TICK_SECONDS
      persist()
    }, TICK_SECONDS * 1000)
  }
  /** 停止阅读计时（阅读器卸载时调用） */
  function stopTracking(): void {
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
    window.removeEventListener('keydown', onActivity)
    window.removeEventListener('mousedown', onActivity)
    window.removeEventListener('touchstart', onActivity)
    window.removeEventListener('wheel', onActivity)
  }

  return { stats, todaySeconds, totalSeconds, streak, startTracking, stopTracking }
})
