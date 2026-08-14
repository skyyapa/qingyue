import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_SETTINGS, useSettingsStore } from '@/stores/settings'

const KEY = 'qingyue:settings'

describe('settings store 载入校验', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('损坏 JSON / 非法结构回退默认值', () => {
    localStorage.setItem(KEY, '{bad json')
    expect(useSettingsStore().settings).toEqual(DEFAULT_SETTINGS)

    localStorage.setItem(KEY, JSON.stringify([1, 2, 3])) // 数组不是对象
    expect(useSettingsStore().settings).toEqual(DEFAULT_SETTINGS)
  })

  it('越界数值 / 未知枚举 / 错误类型回退，合法字段保留', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        fontSize: 99,
        lineHeight: 'abc',
        pageMode: 'flip',
        theme: 'hotdog',
        font: 'comic',
        showNextHint: 'yes',
        bookPage: false, // 合法布尔值应保留
      })
    )
    const s = useSettingsStore().settings
    expect(s.fontSize).toBe(DEFAULT_SETTINGS.fontSize)
    expect(s.lineHeight).toBe(DEFAULT_SETTINGS.lineHeight)
    expect(s.pageMode).toBe('scroll')
    expect(s.theme).toBe('default')
    expect(s.font).toBe('system')
    expect(s.showNextHint).toBe(true)
    expect(s.bookPage).toBe(false)
  })

  it('合法设置全部保留', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        fontSize: 22,
        lineHeight: 2,
        pageMode: 'paged',
        theme: 'night',
        font: 'song',
        showNextHint: false,
        bookPage: true,
      })
    )
    const s = useSettingsStore().settings
    expect(s.fontSize).toBe(22)
    expect(s.lineHeight).toBe(2)
    expect(s.pageMode).toBe('paged')
    expect(s.theme).toBe('night')
    expect(s.font).toBe('song')
    expect(s.showNextHint).toBe(false)
    expect(s.bookPage).toBe(true)
  })

  it('resetSettings 恢复默认并持久化', async () => {
    const store = useSettingsStore()
    store.settings.fontSize = 26
    store.settings.theme = 'night'
    store.resetSettings()
    expect(store.settings).toEqual(DEFAULT_SETTINGS)
    // deep watch 异步写回 localStorage，等一拍再断言
    await new Promise((r) => setTimeout(r, 0))
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(DEFAULT_SETTINGS)
  })
})
