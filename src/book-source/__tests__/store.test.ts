import { describe, expect, it, beforeEach } from 'vitest'
import { DEMO_SOURCE, importSources, loadSources, encodeSourcePayload, decodeSourcePayload, shareSourceUrl } from '../store'
import type { BookSource } from '../types'

describe('importSources 批量导入', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const makeSource = (id: string, name: string): BookSource => ({ id, name, baseUrl: '', enabled: true })

  it('导入单个对象与数组，新增计数正确', () => {
    const r = importSources(JSON.stringify(makeSource('a', 'A源')))
    expect(r).toEqual({ added: 1, updated: 0, skipped: 0 })
    expect(loadSources().some((s) => s.id === 'a')).toBe(true)
  })

  it('同 ID 默认跳过，overwrite 时覆盖更新', () => {
    importSources(JSON.stringify(makeSource('a', '旧名')))
    const skip = importSources(JSON.stringify(makeSource('a', '新名')))
    expect(skip).toEqual({ added: 0, updated: 0, skipped: 1 })
    expect(loadSources().find((s) => s.id === 'a')!.name).toBe('旧名')

    const over = importSources(JSON.stringify(makeSource('a', '新名')), { overwrite: true })
    expect(over).toEqual({ added: 0, updated: 1, skipped: 0 })
    expect(loadSources().find((s) => s.id === 'a')!.name).toBe('新名')
  })

  it('内置演示书源不可覆盖', () => {
    const r = importSources(JSON.stringify({ ...DEMO_SOURCE, name: '被篡改' }), { overwrite: true })
    expect(r).toEqual({ added: 0, updated: 0, skipped: 1 })
    expect(loadSources().find((s) => s.id === DEMO_SOURCE.id)!.name).toBe(DEMO_SOURCE.name)
  })

  it('格式无效条目跳过', () => {
    const r = importSources(JSON.stringify([{ id: 'x' }, { name: 'y' }, null]))
    expect(r).toEqual({ added: 0, updated: 0, skipped: 3 })
  })
})

describe('分享 payload 编解码', () => {
  it('编码 → 解码往返一致，且 payload 为 URL 安全字符', () => {
    const payload = encodeSourcePayload(DEMO_SOURCE)
    expect(payload).not.toContain('+')
    expect(payload).not.toContain('/')
    expect(payload).not.toContain('=')
    const decoded = decodeSourcePayload(payload)
    expect(decoded).toHaveLength(1)
    expect(decoded[0].id).toBe(DEMO_SOURCE.id)
    expect(decoded[0].name).toBe(DEMO_SOURCE.name)
  })

  it('解码非法内容抛错', () => {
    expect(() => decodeSourcePayload(encodeSourcePayload({} as BookSource))).toThrow(/有效/)
  })

  it('shareSourceUrl 生成可导入的分享链接', () => {
    const url = shareSourceUrl(DEMO_SOURCE)
    const marker = '#/source-import/'
    expect(url).toContain(marker)
    const payload = url.slice(url.indexOf(marker) + marker.length)
    expect(decodeSourcePayload(payload)[0].id).toBe(DEMO_SOURCE.id)
  })
})
