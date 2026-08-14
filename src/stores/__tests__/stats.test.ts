import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStatsStore } from '@/stores/stats'

describe('stats store 阅读计时', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    localStorage.clear()
    vi.setSystemTime(new Date('2026-08-14T12:00:00'))
  })

  afterEach(() => {
    useStatsStore().stopTracking()
    vi.useRealTimers()
  })

  it('页面可见且有交互时每 10 秒累计一次', () => {
    const store = useStatsStore()
    store.startTracking()
    vi.advanceTimersByTime(10_000)
    expect(store.todaySeconds).toBe(10)
    vi.advanceTimersByTime(20_000)
    expect(store.todaySeconds).toBe(30)
  })

  it('页面隐藏时不累计', () => {
    const store = useStatsStore()
    store.startTracking()
    vi.advanceTimersByTime(10_000)
    expect(store.todaySeconds).toBe(10)
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    vi.advanceTimersByTime(30_000)
    expect(store.todaySeconds).toBe(10)
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    vi.advanceTimersByTime(10_000)
    expect(store.todaySeconds).toBe(20)
  })

  it('挂机超过 60 秒不计时，交互后恢复', () => {
    const store = useStatsStore()
    store.startTracking() // t=0，视为活跃
    vi.advanceTimersByTime(10_000)
    expect(store.todaySeconds).toBe(10)
    // 挂机至 t=80s：满 60 秒起（t=60s）的 tick 不再累计
    vi.advanceTimersByTime(70_000)
    expect(store.todaySeconds).toBe(50)
    // 继续挂机仍不累计
    vi.advanceTimersByTime(20_000)
    expect(store.todaySeconds).toBe(50)
    // 任意交互事件刷新活跃时间，恢复计时
    window.dispatchEvent(new Event('mousedown'))
    vi.advanceTimersByTime(10_000)
    expect(store.todaySeconds).toBe(60)
  })
})
