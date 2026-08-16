/** 请求器：统一出口，处理代理通道（直连 / 自备代理 / 公共代理自动切换） */
import { decodeText } from '@/parsers/txt'
import type { ProxyConfig } from './types'

const PROXY_KEY = 'qingyue:proxy'
const REQUEST_TIMEOUT = 15000

/**
 * 公共 CORS 代理（兜底通道，按顺序尝试）。
 * 每个返回完整 HTML 文本；注意：
 * - allorigins 的 /raw 端点常 520/断连，稳定的是 /get（JSON 包 contents 字段）→ 需解析
 * - corsproxy.io 自 2023 起要求 API key，匿名 403 → 不再内置
 */
const PUBLIC_PROXIES: ((url: string, signal: AbortSignal) => Promise<string>)[] = [
  // allorigins：/get 端返回 JSON 包（contents 字段），需解析；/raw 常 520
  async (u, signal) => {
    const resp = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, { signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const json = (await resp.json()) as { contents?: string }
    return json.contents ?? ''
  },
  // codetabs：免费匿名 CORS 代理，直接返回目标 HTML；作为 allorigins 失败时的第二公共通道
  async (u, signal) => {
    const resp = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, { signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.text()
  },
]

export function loadProxyConfig(): ProxyConfig {
  try {
    const raw = localStorage.getItem(PROXY_KEY)
    if (raw) {
      const cfg = JSON.parse(raw)
      return { mode: cfg.mode ?? 'public', customUrl: cfg.customUrl ?? '' }
    }
  } catch {
    /* ignore */
  }
  return { mode: 'public', customUrl: '' }
}

export function saveProxyConfig(cfg: ProxyConfig): void {
  localStorage.setItem(PROXY_KEY, JSON.stringify(cfg))
}

function isSameOrigin(url: string): boolean {
  // 相对路径（含 / 开头）与当前 origin 开头 → 同源直连
  return !/^https?:/i.test(url) && !url.startsWith('//') && !url.startsWith('data:') || url.startsWith(location.origin)
}

/** 带超时的文本请求（自动检测编码） */
async function fetchText(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buffer = await resp.arrayBuffer()
    return decodeText(buffer)
  } finally {
    clearTimeout(timer)
  }
}

/** 统一按目标地址执行单个抓取通道（带超时）；把超时 controller 的 signal 传给通道，
 *  否则（如公共代理由通道内部直接 fetch）挂起请求不会被中断 */
async function runChannel(channel: (url: string, signal: AbortSignal) => Promise<string>, url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    return await channel(url, controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

/** 按代理配置抓取 HTML；失败依次尝试备用通道 */
export async function fetchHtml(url: string, proxy?: ProxyConfig): Promise<string> {
  const cfg = proxy ?? loadProxyConfig()
  if (isSameOrigin(url)) {
    return fetchText(url)
  }
  const attempts: ((u: string, signal: AbortSignal) => Promise<string>)[] = []
  if (cfg.mode === 'direct') attempts.push(async (u) => fetchText(u))
  if (cfg.mode === 'custom' && cfg.customUrl) {
    attempts.push(async (u) => fetchText(`${cfg.customUrl.replace(/\/+$/, '')}/?url=${encodeURIComponent(u)}`))
  }
  if (cfg.mode === 'public') {
    for (const build of PUBLIC_PROXIES) attempts.push(build)
  }
  if (attempts.length === 0) {
    throw new Error('未配置任何可用通道：请在「书源管理 → 代理设置」中选择代理模式')
  }
  let lastError = ''
  for (const channel of attempts) {
    try {
      return await runChannel(channel, url)
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`请求失败（已尝试 ${attempts.length} 个通道）: ${lastError}`)
}

/** 代理连通性测试：custom 测自备代理，public 测公共代理通道（空 customUrl 时不再误测） */
export async function testProxy(cfg: ProxyConfig): Promise<string> {
  try {
    const html = await fetchHtml('https://example.com/', cfg)
    return html.includes('Example Domain') ? '连接正常' : '连接成功（返回内容异常）'
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e), { cause: e })
  }
}
