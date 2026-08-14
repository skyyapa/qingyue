import { describe, expect, it } from 'vitest'
import { classifyTapZone } from '../tap-zones'

describe('classifyTapZone 点按区域分类', () => {
  it('左 30% 归左区', () => {
    expect(classifyTapZone(0, 390)).toBe('left')
    expect(classifyTapZone(100, 390)).toBe('left')
  })

  it('右 30% 归右区', () => {
    expect(classifyTapZone(390, 390)).toBe('right')
    expect(classifyTapZone(290, 390)).toBe('right')
  })

  it('中央 40% 归中区', () => {
    expect(classifyTapZone(195, 390)).toBe('center')
    expect(classifyTapZone(120, 390)).toBe('center')
    expect(classifyTapZone(270, 390)).toBe('center')
  })

  it('异常宽度兜底为中区', () => {
    expect(classifyTapZone(10, 0)).toBe('center')
    expect(classifyTapZone(10, -1)).toBe('center')
  })
})
