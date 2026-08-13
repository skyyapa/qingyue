import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ReaderSettings } from '@/types'

const STORAGE_KEY = 'qingyue:settings'

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.8,
  pageMode: 'scroll',
  theme: 'default',
  font: 'system',
  showNextHint: true,
}

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
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
  return { settings }
})
