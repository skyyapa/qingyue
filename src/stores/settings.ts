import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { FontName, PageMode, ReaderSettings, ThemeName } from '@/types'

const STORAGE_KEY = 'qingyue:settings'

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.8,
  pageMode: 'scroll',
  theme: 'default',
  font: 'system',
  showNextHint: true,
  bookPage: true,
}

const THEMES: ThemeName[] = ['default', 'pure', 'paper', 'celadon', 'eye', 'pink', 'night', 'ocean', 'pine', 'graphite']
const FONTS: FontName[] = ['system', 'song', 'hei', 'kai', 'serif']
const PAGE_MODES: PageMode[] = ['scroll', 'paged']

/** 逐字段校验（类型/范围/枚举），损坏或越界的数据回退默认值 */
function sanitize(raw: unknown): ReaderSettings {
  const s: ReaderSettings = { ...DEFAULT_SETTINGS }
  if (typeof raw !== 'object' || raw === null) return s
  const r = raw as Record<string, unknown>
  if (typeof r.fontSize === 'number' && r.fontSize >= 14 && r.fontSize <= 28) s.fontSize = r.fontSize
  if (typeof r.lineHeight === 'number' && r.lineHeight >= 1.4 && r.lineHeight <= 2.4) s.lineHeight = r.lineHeight
  if (PAGE_MODES.includes(r.pageMode as PageMode)) s.pageMode = r.pageMode as PageMode
  if (THEMES.includes(r.theme as ThemeName)) s.theme = r.theme as ThemeName
  if (FONTS.includes(r.font as FontName)) s.font = r.font as FontName
  if (typeof r.showNextHint === 'boolean') s.showNextHint = r.showNextHint
  if (typeof r.bookPage === 'boolean') s.bookPage = r.bookPage
  return s
}

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return sanitize(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** 阅读设置：localStorage 持久化，任意修改自动保存 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<ReaderSettings>(loadSettings())
  watch(
    settings,
    (s) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    },
    { deep: true }
  )

  /** 恢复默认设置 */
  function resetSettings(): void {
    settings.value = { ...DEFAULT_SETTINGS }
  }

  return { settings, resetSettings }
})
