/** 请求器：统一出口，处理代理通道（直连 / 自备代理 / 公共代理自动切换） */
import { decodeText } from '@/parsers/txt'
import type { ProxyConfig } from './types'

const PROXY_KEY = 'qingyue:proxy'
const REQUEST_TIMEOUT = 15000

/** 公共 CORS 代理（兜底通道，按顺序尝试） */
const PUBLIC_PROXIES: ((url: string) => string)[] = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
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

/** 按代理配置抓取 HTML；失败依次尝试备用通道 */
export async function fetchHtml(url: string, proxy?: ProxyConfig): Promise<string> {
  const cfg = proxy ?? loadProxyConfig()
  if (isSameOrigin(url)) {
    return fetchText(url)
  }
  const attempts: string[] = []
  if (cfg.mode === 'direct') attempts.push(url)
  if (cfg.mode === 'custom' && cfg.customUrl) {
    attempts.push(`${cfg.customUrl.replace(/\/+$/, '')}/?url=${encodeURIComponent(url)}`)
  }
  if (cfg.mode === 'public') {
    for (const build of PUBLIC_PROXIES) attempts.push(build(url))
  }
  if (attempts.length === 0) {
    throw new Error('未配置任何可用通道：请在「书源管理 → 代理设置」中选择代理模式')
  }
  let lastError = ''
  for (const target of attempts) {
    try {
      return await fetchText(target)
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`请求失败（已尝试 ${attempts.length} 个通道）: ${lastError}`)
}

/** 代理连通性测试 */
export async function testProxy(url: string): Promise<string> {
  try {
    const html = await fetchHtml('https://example.com/', { mode: 'custom', customUrl: url })
    return html.includes('Example Domain') ? '连接正常' : '连接成功（返回内容异常）'
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e), { cause: e })
  }
}
