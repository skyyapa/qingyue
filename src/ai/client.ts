/** OpenAI 兼容 chat/completions 客户端（零依赖 fetch） */
import { normalizeBaseUrl, type AIProviderConfig } from './presets'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const REQUEST_TIMEOUT_MS = 60_000

/** 调用 chat/completions，返回助手文本 */
export async function chatCompletion(cfg: AIProviderConfig, messages: ChatMessage[]): Promise<string> {
  const base = normalizeBaseUrl(cfg.baseUrl)
  if (!base || !cfg.model.trim()) {
    throw new Error('请先配置 Base URL 与 Model')
  }
  let res: Response
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey.trim() ? { Authorization: `Bearer ${cfg.apiKey.trim()}` } : {}),
      },
      body: JSON.stringify({ model: cfg.model.trim(), messages }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('AI 请求超时（60 秒）', { cause: err })
    }
    throw new Error('无法连接 AI 服务，请检查 Base URL 与网络', { cause: err })
  }
  if (!res.ok) {
    throw new Error(`AI 服务返回错误（HTTP ${res.status}）`)
  }
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error('AI 服务返回了无法解析的内容')
  }
  const text = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('AI 返回内容为空')
  }
  return text.trim()
}

/** 连通性测试：发送最小请求验证 Base URL / Key / Model */
export async function testProvider(cfg: AIProviderConfig): Promise<string> {
  return chatCompletion(cfg, [{ role: 'user', content: 'ping' }])
}
