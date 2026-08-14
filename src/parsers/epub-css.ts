/** EPUB 内嵌 CSS 子集解析：段落级排版规则（无 AI、无依赖）
 *  支持属性：text-indent / text-align / line-height / font-size / color /
 *  font-weight / font-style / margin-top / margin-bottom
 *  支持选择器：tag、.class、tag.class（含逗号分组）；body 规则作为全局继承；
 *  忽略 @media/@import/@font-face 与复杂选择器（后代/伪类/ID）
 */
import type { ParagraphStyle } from '@/types'

/** CSS 声明白名单：属性 → 是否参与单位归一化 */
const STYLE_KEYS = new Set([
  'text-indent',
  'text-align',
  'line-height',
  'font-size',
  'color',
  'font-weight',
  'font-style',
  'margin-top',
  'margin-bottom',
])

/** 归一化长度：px/pt/% 统一为 em（基于浏览器默认 16px） */
function normalizeLength(value: string): string | null {
  const m = value.trim().match(/^([\d.]+)(px|pt|%|em|rem)?$/i)
  if (!m) return null
  const num = Number(m[1])
  if (!Number.isFinite(num) || num <= 0) return null
  const unit = (m[2] ?? '').toLowerCase()
  let em: number
  if (unit === 'px') em = num / 16
  else if (unit === 'pt') em = (num * 4) / 3 / 16
  else if (unit === '%') em = num / 100
  else em = num // em/rem/无单位
  return `${Math.round(em * 100) / 100}em`
}

/** 归一化声明值并写入样式对象；返回是否被识别 */
function applyDeclaration(style: ParagraphStyle, key: string, rawValue: string): void {
  const value = rawValue.trim()
  if (!value) return
  switch (key) {
    case 'text-indent': {
      const em = normalizeLength(value)
      if (em) style.textIndent = em
      break
    }
    case 'text-align':
      if (['left', 'center', 'right', 'justify'].includes(value.toLowerCase())) {
        style.textAlign = value.toLowerCase()
      }
      break
    case 'line-height': {
      // 行距接受数字/em/px（不归一化，浏览器原生支持）
      if (/^([\d.]+)(em|rem|px|%)?$/i.test(value)) style.lineHeight = value
      break
    }
    case 'font-size': {
      const em = normalizeLength(value)
      if (em) style.fontSize = em
      break
    }
    case 'color':
      if (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|[a-z]+)$/i.test(value)) style.color = value
      break
    case 'font-weight':
      if (['bold', 'bolder'].includes(value.toLowerCase()) || /^[6-9]00$/.test(value)) {
        style.fontWeight = 'bold'
      } else if (/^[1-5]00$|^normal$/.test(value.toLowerCase())) {
        style.fontWeight = 'normal'
      }
      break
    case 'font-style':
      if (value.toLowerCase() === 'italic') style.fontStyle = 'italic'
      break
    case 'margin-top':
    case 'margin-bottom': {
      const em = normalizeLength(value)
      if (em) {
        if (key === 'margin-top') style.marginTop = em
        else style.marginBottom = em
      }
      break
    }
  }
}

/** 一条 CSS 规则（选择器已简化为 tag + class 组合） */
export interface CssRule {
  /** 匹配标签（null = 任意） */
  tag: string | null
  /** 匹配 class（null = 任意） */
  className: string | null
  /** 特异性：class 匹配 +1、tag 匹配 +1（仅用于相对排序） */
  specificity: number
  declarations: Record<string, string>
}

/** 解析 CSS 文本为规则列表（容错：注释/损坏块忽略） */
export function parseCssRules(css: string): CssRule[] {
  const rules: CssRule[] = []
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[^{;]+;/g, '') // 去注释与 @import 等
  // 按 } 切块（块内可能含 } 的字符串极少见，容错处理）
  for (const block of cleaned.split('}')) {
    const brace = block.lastIndexOf('{')
    if (brace < 0) continue
    const selectorPart = block.slice(0, brace).trim()
    const declPart = block.slice(brace + 1)
    if (!selectorPart || selectorPart.startsWith('@')) continue
    const declarations: Record<string, string> = {}
    for (const decl of declPart.split(';')) {
      const colon = decl.indexOf(':')
      if (colon < 0) continue
      const key = decl.slice(0, colon).trim().toLowerCase()
      if (STYLE_KEYS.has(key)) declarations[key] = decl.slice(colon + 1).trim()
    }
    if (Object.keys(declarations).length === 0) continue
    // 选择器拆分（逗号分组）
    for (const rawSel of selectorPart.split(',')) {
      const sel = rawSel.trim()
      const m = sel.match(/^([a-zA-Z][\w-]*)?(?:\.([\w-]+))?$/)
      if (!m) continue // 复杂选择器（后代/伪类/#id 等）不支持
      const tag = m[1] ? m[1].toLowerCase() : null
      const className = m[2] ?? null
      // 只处理标签选择器或 class 选择器（.cls 也兼容 tag.class）
      if (tag === null && className === null) continue
      rules.push({
        tag,
        className,
        specificity: (tag ? 1 : 0) + (className ? 1 : 0),
        declarations,
      })
    }
  }
  return rules
}

/** 计算元素排版样式：body 规则作为继承基线，再按特异性升序应用匹配规则 */
export function computeParagraphStyle(
  rules: CssRule[],
  tag: string,
  className: string | null
): ParagraphStyle {
  const style: ParagraphStyle = {}
  const apply = (declarations: Record<string, string>) => {
    for (const [key, value] of Object.entries(declarations)) applyDeclaration(style, key, value)
  }
  // body 规则 → 全局继承
  for (const rule of rules) {
    if (rule.tag === 'body' && rule.className === null) apply(rule.declarations)
  }
  // 匹配当前元素的选择器（class 与 tag 都匹配才命中 tag.class）
  const matched = rules
    .filter(
      (r) =>
        r.tag !== 'body' &&
        (r.tag === null || r.tag === tag) &&
        (r.className === null || r.className === className)
    )
    .sort((a, b) => a.specificity - b.specificity)
  for (const rule of matched) apply(rule.declarations)
  return style
}
