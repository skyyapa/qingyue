/** AI Provider 预设与配置模型
 *  统一为 OpenAI 兼容 chat/completions 协议：
 *  OpenAI 官方 / DeepSeek / Gemini（兼容端点）/ 本地 Ollama / LM Studio / vLLM /
 *  自定义兼容（各种中转站）均直接可用
 */

export type AIProviderPreset = 'openai' | 'compatible' | 'deepseek' | 'gemini' | 'ollama' | 'lmstudio' | 'vllm'

export interface AIProviderConfig {
  /** 预设 id */
  id: AIProviderPreset
  /** 展示名（可自定义） */
  label: string
  /** API 端点根地址（如 https://api.deepseek.com/v1，末尾不带 /chat/completions） */
  baseUrl: string
  /** API Key（本地服务可留空） */
  apiKey: string
  /** 主模型名（复杂剧情任务用） */
  model: string
  /** 简单任务模型（who/recap/伏笔/自由提问；留空用主模型）——多模型策略降成本 */
  easyModel?: string
  /** 摘要任务模型（章节摘要/今日回顾；留空用主模型）——用便宜模型降成本 */
  summaryModel?: string
  /** 是否启用（列表中选择当前使用的 Provider） */
  enabled: boolean
}

export interface AIProviderPresetInfo {
  label: string
  defaultBaseUrl: string
  defaultModel: string
  /** 是否需要 API Key（本地服务为 false） */
  apiKeyRequired: boolean
  /** 预设提示 */
  hint: string
}

export const AI_PRESETS: Record<AIProviderPreset, AIProviderPresetInfo> = {
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    apiKeyRequired: true,
    hint: 'OpenAI 官方 API，gpt-4o-mini 性价比高',
  },
  compatible: {
    label: 'OpenAI 兼容（自定义/中转站）',
    defaultBaseUrl: '',
    defaultModel: 'gpt-4o-mini',
    apiKeyRequired: true,
    hint: '任意 OpenAI 兼容中转站或自建服务：填入 Base URL 与 Key 即可',
  },
  deepseek: {
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    apiKeyRequired: true,
    hint: '国内直连，deepseek-chat 性价比高',
  },
  gemini: {
    label: 'Gemini（Gateway）',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    apiKeyRequired: true,
    hint: 'Gemini 官方 OpenAI 兼容端点；也可换成任意 Gemini 中转 Gateway 地址',
  },
  ollama: {
    label: '本地 Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    apiKeyRequired: false,
    hint: '本地运行，无需 Key；需先 ollama serve 并拉取模型',
  },
  lmstudio: {
    label: '本地 LM Studio',
    defaultBaseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    apiKeyRequired: false,
    hint: 'LM Studio 内置 OpenAI 兼容服务，加载模型后即可用',
  },
  vllm: {
    label: '本地 vLLM',
    defaultBaseUrl: 'http://localhost:8000/v1',
    defaultModel: 'qwen2.5-7b-instruct',
    apiKeyRequired: false,
    hint: 'vLLM 服务默认 OpenAI 兼容端点，无需 Key',
  },
}

export const AI_PRESET_IDS = Object.keys(AI_PRESETS) as AIProviderPreset[]

/** 生成预设的默认配置 */
export function defaultProviderConfig(id: AIProviderPreset): AIProviderConfig {
  const preset = AI_PRESETS[id]
  return {
    id,
    label: preset.label,
    baseUrl: preset.defaultBaseUrl,
    apiKey: '',
    model: preset.defaultModel,
    easyModel: '',
    summaryModel: '',
    enabled: false,
  }
}

/** 配置是否可用（本地服务无需 Key；远程服务必须 Base URL + Key + Model） */
export function isProviderReady(cfg: AIProviderConfig): boolean {
  const preset = AI_PRESETS[cfg.id]
  if (!cfg.baseUrl.trim() || !cfg.model.trim()) return false
  if (preset.apiKeyRequired && !cfg.apiKey.trim()) return false
  return true
}

/** 规范化 Base URL（去尾斜杠，保证拼 /chat/completions 正确） */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}
