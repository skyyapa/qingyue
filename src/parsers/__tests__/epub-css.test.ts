import { describe, expect, it } from 'vitest'
import { computeParagraphStyle, parseCssRules } from '../epub-css'

describe('parseCssRules CSS 子集解析', () => {
  it('解析标签/class/组合选择器与声明，忽略复杂选择器', () => {
    const rules = parseCssRules(`
      /* 注释 */
      p { text-indent: 2em; text-align: justify; }
      h2 { text-align: center; }
      .poem { text-align: center; font-style: italic; }
      p.poem { color: #333; }
      div p { text-indent: 4em; }
      #main p { color: red; }
      a:hover { color: blue; }
      @font-face { font-family: X; }
    `)
    expect(rules).toHaveLength(4) // p / h2 / .poem / p.poem（复杂选择器与 @font-face 被忽略）
    const p = rules.find((r) => r.tag === 'p' && r.className === null)
    expect(p?.declarations['text-indent']).toBe('2em')
    const poem = rules.find((r) => r.className === 'poem' && r.tag === null)
    expect(poem?.declarations['font-style']).toBe('italic')
    const pPoem = rules.find((r) => r.tag === 'p' && r.className === 'poem')
    expect(pPoem?.specificity).toBe(2)
  })

  it('损坏 CSS 容错：残缺块/非法声明忽略', () => {
    const rules = parseCssRules('p { text-indent: 2em; broken; } .x { font-size: 110% } yyy')
    expect(rules.length).toBeGreaterThanOrEqual(1)
  })

  it('单位归一化：px/pt/% → em', () => {
    const rules = parseCssRules('p { font-size: 20px; } .a { font-size: 110%; } .b { font-size: 12pt; }')
    const s = computeParagraphStyle(rules, 'p', null)
    expect(s.fontSize).toBe('1.25em')
    expect(computeParagraphStyle(rules, 'p', 'a').fontSize).toBe('1.1em')
    expect(computeParagraphStyle(rules, 'p', 'b').fontSize).toBe('1em')
  })
})

describe('computeParagraphStyle 样式计算', () => {
  const css = `
    body { line-height: 1.6; color: #333; }
    p { text-indent: 2em; }
    p.center { text-align: center; }
    p.center { color: red; }
    .big { font-size: 1.2em; font-weight: bold; }
  `

  it('body 规则作为全局继承基线', () => {
    const rules = parseCssRules(css)
    const s = computeParagraphStyle(rules, 'p', null)
    expect(s.lineHeight).toBe('1.6')
    expect(s.color).toBe('#333')
    expect(s.textIndent).toBe('2em')
  })

  it('class 规则覆盖标签规则（高特异性优先）', () => {
    const rules = parseCssRules(css)
    const s = computeParagraphStyle(rules, 'p', 'center')
    expect(s.textAlign).toBe('center')
    expect(s.textIndent).toBe('2em') // p 规则仍生效
    expect(s.color).toBe('red') // 后定义的 .p.center 覆盖
    const big = computeParagraphStyle(rules, 'p', 'big')
    expect(big.fontSize).toBe('1.2em')
    expect(big.fontWeight).toBe('bold')
  })

  it('不匹配的规则不影响其他元素', () => {
    const rules = parseCssRules(css)
    const h2 = computeParagraphStyle(rules, 'h2', null)
    expect(h2.textIndent).toBeUndefined()
    expect(h2.lineHeight).toBe('1.6') // body 继承仍有效
  })
})
