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

/** 并发尝试全部公共代理候选：谁先成功立刻返回（首个 fulfilled），
 *  一个失效的代理不会拖慢整个兜底链。手动并发（不依赖 Promise.any，兼容旧 WebView）：
 *  - 不主动 abort 其他候选（避免 "signal is aborted without reason" 歧义/竞态）
 *  - 用 done 标志保证只取首个成功；其余候选在 runChannel 15s 超时内自然结束
 *  返回 { html, results }（results=各候选可用性诊断，供"测试"显示）。 */
async function fetchPublic(url: string): Promise<{ html: string; results: { name: string; ok: boolean; detail: string }[] }> {
  const infos: ({ name: string; ok: boolean; detail: string } | null)[] = new Array(PUBLIC_PROXIES.length).fill(null)
  let pending = PUBLIC_PROXIES.length
  let done = false
  return new Promise((resolve, reject) => {
    for (let i = 0; i < PUBLIC_PROXIES.length; i++) {
      const name = `公共代理#${i + 1}`
      runChannel(PUBLIC_PROXIES[i], url)
        .then((html) => {
          if (done) return
          done = true
          infos[i] = { name, ok: true, detail: '成功' }
          resolve({ html, results: snapshot() })
        })
        .catch((e) => {
          if (done) return
          infos[i] = { name, ok: false, detail: e instanceof Error ? e.message : String(e) }
          if (--pending === 0) {
            done = true
            reject(new Error(`公共代理全部失败：${snapshot().map((r) => `${r.name}:${r.detail}`).join('；')}`))
          }
        })
    }
    function snapshot() {
      return PUBLIC_PROXIES.map(
        (_, i) => infos[i] ?? { name: `公共代理#${i + 1}`, ok: done && false, detail: done ? '未使用（已被更快候选命中）' : '进行中' }
      )
    }
  })
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
  // 公共代理模式：并发尝试全部候选（首个成功返回，避免单代理失效拖垮兜底链）
  if (cfg.mode === 'public') {
    try {
      const { html } = await fetchPublic(url)
      return html
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e), { cause: e })
    }
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

/** 代理连通性测试：custom 测自备代理；public 测公共代理（并发尝试全部候选，并回报每个候选结果，
 *  让用户能看出「哪个公共代理当前可用/哪个失效」，便于定位与选择）。 */
export async function testProxy(cfg: ProxyConfig): Promise<string> {
  try {
    if (cfg.mode === 'public') {
      const probe = await fetchPublic('https://example.com/')
      const okList = probe.results.filter((r) => r.ok).map((r) => r.name)
      const failList = probe.results
        .filter((r) => !r.ok)
        .map((r) => `${r.name}(${r.detail})`)
      return `公共代理可用：${okList.join('、') || '无'}` + (failList.length ? `；不可用：${failList.join('、')}` : '')
    }
    const html = await fetchHtml('https://example.com/', cfg)
    return html.includes('Example Domain') ? '连接正常' : '连接成功（返回内容异常）'
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e), { cause: e })
  }
}
