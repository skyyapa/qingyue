import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchHtml, testProxy } from '../requester'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 按 URL 分发响应的 fetch mock：allorigins /get 返回 JSON contents，其余返回 HTML */
function stubFetchMap(map: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const raw = String(input)
      const isAllorigins = raw.includes('api.allorigins.win/get')
      const q = raw.indexOf('?url=')
      const target = q >= 0 ? decodeURIComponent(raw.slice(q + 5)) : raw
      const html = map[target]
      if (html === undefined) return new Response('not found', { status: 404 })
      const body = isAllorigins ? JSON.stringify({ contents: html }) : html
      return new Response(body, {
        status: 200,
        headers: { 'content-type': isAllorigins ? 'application/json' : 'text/html; charset=utf-8' },
      })
    })
  )
}

describe('公共代理通道（allorigins /get）', () => {
  it('跨源 URL 走 allorigins /get 并解析 JSON contents', async () => {
    stubFetchMap({
      'https://target.site/index.html': '<html><body><h1>Example Domain</h1></body></html>',
    })
    const html = await fetchHtml('https://target.site/index.html', { mode: 'public', customUrl: '' })
    expect(html).toContain('Example Domain')
  })

  it('公共代理失败时按通道数报告', async () => {
    stubFetchMap({})
    await expect(fetchHtml('https://target.site/index.html', { mode: 'public', customUrl: '' })).rejects.toThrow(
      /请求失败（已尝试 1 个通道）/
    )
  })

  it('direct 模式直连目标 URL（不走公共代理）', async () => {
    stubFetchMap({
      'https://target.site/index.html': '<html><body>direct ok</body></html>',
    })
    const html = await fetchHtml('https://target.site/index.html', { mode: 'direct', customUrl: '' })
    expect(html).toContain('direct ok')
  })
})

describe('testProxy 连通性测试', () => {
  it('public 模式测公共代理通道（不再误用空 customUrl）', async () => {
    stubFetchMap({
      'https://example.com/': '<html><body><h1>Example Domain</h1></body></html>',
    })
    const result = await testProxy({ mode: 'public', customUrl: '' })
    expect(result).toBe('连接正常')
  })

  it('custom 模式测自备代理地址', async () => {
    stubFetchMap({
      'https://example.com/': '<html><body><h1>Example Domain</h1></body></html>',
    })
    const result = await testProxy({ mode: 'custom', customUrl: 'https://my-proxy.example' })
    expect(result).toBe('连接正常')
  })
})
