import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AI_PRESETS, defaultProviderConfig, isProviderReady, normalizeBaseUrl } from '@/ai/presets'
import { chatCompletion, testProvider } from '@/ai/client'
import { useAIStore } from '@/stores/ai'

const KEY = 'qingyue:aiProviders'

describe('AI Provider 预设与配置', () => {
  it('预设齐全：七类 Provider（OpenAI 官方/兼容中转/DeepSeek/Gemini/Ollama/LM Studio/vLLM）', () => {
    expect(Object.keys(AI_PRESETS)).toHaveLength(7)
    expect(AI_PRESETS.openai.defaultBaseUrl).toContain('api.openai.com')
    expect(AI_PRESETS.deepseek.defaultBaseUrl).toContain('deepseek.com')
    expect(AI_PRESETS.deepseek.apiKeyRequired).toBe(true)
    expect(AI_PRESETS.ollama.apiKeyRequired).toBe(false)
    expect(AI_PRESETS.vllm.apiKeyRequired).toBe(false)
    expect(AI_PRESETS.gemini.defaultBaseUrl).toContain('generativelanguage')
    expect(AI_PRESETS.compatible.defaultBaseUrl).toBe('') // 中转站自填
  })

  it('isProviderReady：远程需 Key，本地无需 Key', () => {
    const deepseek = defaultProviderConfig('deepseek')
    expect(isProviderReady(deepseek)).toBe(false) // 缺 Key
    deepseek.apiKey = 'sk-test'
    expect(isProviderReady(deepseek)).toBe(true)
    const ollama = defaultProviderConfig('ollama')
    expect(isProviderReady(ollama)).toBe(true) // 本地无需 Key
    ollama.model = ''
    expect(isProviderReady(ollama)).toBe(false)
  })

  it('normalizeBaseUrl 去尾斜杠', () => {
    expect(normalizeBaseUrl('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1')
  })
})

describe('ai store 配置存储', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('默认载入全部预设，启用/更新与持久化往返', async () => {
    const ai = useAIStore()
    expect(ai.providers).toHaveLength(7)
    expect(ai.activeProvider).toBeUndefined()
    // 配置 DeepSeek 并启用
    const ds = ai.providers.find((p) => p.id === 'deepseek')!
    ds.apiKey = 'sk-test'
    ds.model = 'deepseek-chat'
    ai.enable('deepseek')
    expect(ai.activeProvider?.id).toBe('deepseek')
    expect(ai.providers.filter((p) => p.enabled)).toHaveLength(1)
    // deep watch 持久化
    await new Promise((r) => setTimeout(r, 0))
    const saved = JSON.parse(localStorage.getItem(KEY)!)
    expect(saved.deepseek.apiKey).toBe('sk-test')
    expect(saved.deepseek.enabled).toBe(true)
    // 重新创建 store 恢复
    setActivePinia(createPinia())
    const ai2 = useAIStore()
    expect(ai2.providers.find((p) => p.id === 'deepseek')?.apiKey).toBe('sk-test')
    expect(ai2.activeProvider?.id).toBe('deepseek')
  })

  it('旧版 openai（自定义兼容）配置迁移到 compatible', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ openai: { baseUrl: 'https://my-gateway.example/v1', apiKey: 'sk-old', model: 'gpt-3.5', enabled: true } })
    )
    const ai = useAIStore()
    const migrated = ai.providers.find((p) => p.id === 'compatible')!
    expect(migrated.baseUrl).toBe('https://my-gateway.example/v1')
    expect(migrated.apiKey).toBe('sk-old')
    expect(migrated.enabled).toBe(true)
  })

  it('损坏 localStorage 回退默认', () => {
    localStorage.setItem(KEY, '{bad json')
    const ai = useAIStore()
    expect(ai.providers).toHaveLength(7)
    expect(ai.activeProvider).toBeUndefined()
  })
})

describe('OpenAI 兼容客户端', () => {
  it('chatCompletion 成功解析回复', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '  你好，轻阅  ' } }] }),
    }))
    const reply = await chatCompletion(defaultProviderConfig('deepseek'), [{ role: 'user', content: 'hi' }])
    expect(reply).toBe('你好，轻阅')
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.deepseek.com/v1/chat/completions')
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' })
    vi.unstubAllGlobals()
  })

  it('HTTP 错误 / 空返回 / 网络失败均报友好错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    await expect(chatCompletion(defaultProviderConfig('deepseek'), [])).rejects.toThrow(/401/)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) }))
    await expect(chatCompletion(defaultProviderConfig('deepseek'), [])).rejects.toThrow(/为空/)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    await expect(chatCompletion(defaultProviderConfig('deepseek'), [])).rejects.toThrow(/无法连接/)
    vi.unstubAllGlobals()
  })

  it('未配置 Base URL / Model 直接报错', async () => {
    const cfg = defaultProviderConfig('compatible') // 自定义/中转站预设，默认 Base URL 为空
    await expect(chatCompletion(cfg, [])).rejects.toThrow(/Base URL/)
  })

  it('testProvider 返回服务端文本', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
    }))
    await expect(testProvider(defaultProviderConfig('ollama'))).resolves.toBe('pong')
    vi.unstubAllGlobals()
  })
})
