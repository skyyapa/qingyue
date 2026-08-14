import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  AI_PRESET_IDS,
  defaultProviderConfig,
  isProviderReady,
  type AIProviderConfig,
  type AIProviderPreset,
} from '@/ai/presets'

const STORAGE_KEY = 'qingyue:aiProviders'

/** 载入配置（损坏数据回退默认；缺项补默认，保证预设齐全） */
function loadProviders(): AIProviderConfig[] {
  let saved: Partial<Record<AIProviderPreset, Partial<AIProviderConfig>>> = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) saved = JSON.parse(raw)
  } catch {
    /* 损坏则使用默认 */
  }
  return AI_PRESET_IDS.map((id) => {
    const cfg = defaultProviderConfig(id)
    const item = saved[id]
    if (item && typeof item === 'object') {
      if (typeof item.baseUrl === 'string') cfg.baseUrl = item.baseUrl
      if (typeof item.apiKey === 'string') cfg.apiKey = item.apiKey
      if (typeof item.model === 'string' && item.model.trim()) cfg.model = item.model
      if (typeof item.enabled === 'boolean') cfg.enabled = item.enabled
    }
    return cfg
  })
}

/** AI Provider 配置：Base URL / API Key / Model / 启用（仅保存在本机） */
export const useAIStore = defineStore('ai', () => {
  const providers = ref<AIProviderConfig[]>(loadProviders())

  watch(
    providers,
    (list) => {
      const save: Record<string, Omit<AIProviderConfig, 'id' | 'label'>> = {}
      for (const cfg of list) save[cfg.id] = { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, enabled: cfg.enabled }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
    },
    { deep: true }
  )

  /** 当前启用的 Provider（同一时刻只有一个 enabled；无可用配置返回 undefined） */
  const activeProvider = computed<AIProviderConfig | undefined>(() =>
    providers.value.find((p) => p.enabled && isProviderReady(p))
  )

  const hasReadyProvider = computed(() => providers.value.some((p) => isProviderReady(p)))

  /** 设置某个 Provider 为启用（其余关闭） */
  function enable(id: AIProviderPreset): void {
    for (const cfg of providers.value) cfg.enabled = cfg.id === id
  }

  /** 更新某个 Provider 配置 */
  function updateConfig(cfg: AIProviderConfig): void {
    const target = providers.value.find((p) => p.id === cfg.id)
    if (target) {
      target.baseUrl = cfg.baseUrl
      target.apiKey = cfg.apiKey
      target.model = cfg.model
      target.label = cfg.label
      target.enabled = cfg.enabled
    }
  }

  return { providers, activeProvider, hasReadyProvider, enable, updateConfig }
})
