import { describe, expect, it } from 'vitest'
import { createStats, discoverCandidates } from '../segment'
import { decideType, voteContext } from '../classify'

/** 构造类「星穹之下」的迷你样书：含明确人名/地名/技能/物品（12 章保证频率满足阈值） */
function buildSample(chapterCount = 12): string[] {
  const chapters: string[] = []
  const names = ['林夜', '苏晚', '老师傅', '黑衣人', '城主']
  const places = ['星落城', '落星谷', '青云阁', '铁匠铺']
  const skills = ['星辰诀', '御风术', '裂空斩']
  const items = ['星辉石', '玄铁剑', '储物袋']
  for (let i = 0; i < chapterCount; i++) {
    const paras = [
      `${names[0]}对${names[1]}说：「这次一定要找到${places[i % 4]}的入口。」${names[1]}点了点头。`,
      `${names[2]}看着${names[0]}，缓缓说道：「你的${skills[i % 3]}还不够火候，先练熟${skills[(i + 1) % 3]}再说。」${names[2]}点了点头，转身离开。`,
      `${names[0]}掏出储物袋，拿出${items[i % 3]}，使出${skills[i % 3]}，掌心泛起淡淡的光。`,
      `${names[3]}道：「${names[0]}，你逃不掉的。」${names[4]}说道：「${names[0]}，你果然来了。」${names[0]}握紧了${items[(i + 2) % 3]}。`,
      `${names[4]}站在${places[i % 4]}城头，望着远处的${names[3]}，低声说道：「该来的总会来。」`,
    ]
    chapters.push(`第${i + 1}章 风起\n\n${paras.join('\n\n')}`)
  }
  return chapters
}

describe('discoverCandidates 新词发现', () => {
  const texts = buildSample()
  const stats = createStats()
  for (const t of texts) stats.addText(t)
  const candidates = discoverCandidates(texts, stats)
  const words = new Set(candidates.keys())

  it('识别全部人名', () => {
    for (const name of ['林夜', '苏晚', '老师傅', '黑衣人', '城主']) {
      expect(words.has(name), `应识别出 ${name}`).toBe(true)
    }
  })

  it('识别地点/技能/物品', () => {
    for (const w of ['星落城', '落星谷', '青云阁', '铁匠铺', '星辰诀', '御风术', '裂空斩', '星辉石', '玄铁剑', '储物袋']) {
      expect(words.has(w), `应识别出 ${w}`).toBe(true)
    }
  })

  it('过滤粘连噪声（固定搭配片段）', () => {
    // 夜对/对苏 永远夹在 林夜/苏晚 之间；老师傅看 右侧固定跟「着」
    for (const noise of ['夜对', '对苏', '老师傅看', '晚说']) {
      expect(words.has(noise), `不应识别 ${noise}`).toBe(false)
    }
  })

  it('词频与跨章统计正确', () => {
    const linYe = candidates.get('林夜')
    expect(linYe).toBeDefined()
    expect(linYe!.chapters.length).toBeGreaterThanOrEqual(3)
    expect(linYe!.count).toBeGreaterThanOrEqual(linYe!.chapters.length)
  })
})

describe('voteContext 上下文投票', () => {
  it('X说 / 对X说 投人物', () => {
    const votes: Record<string, number> = {}
    voteContext('', '', '说', '', votes)
    expect((votes.person ?? 0)).toBeGreaterThanOrEqual(2)

    const votes2: Record<string, number> = {}
    voteContext('', '对', '说', '', votes2)
    expect((votes2.person ?? 0)).toBeGreaterThanOrEqual(4)
  })

  it('在X / X城 投地点', () => {
    const votes: Record<string, number> = {}
    voteContext('', '在', '城', '', votes)
    expect(votes.place).toBeGreaterThanOrEqual(4)
  })

  it('使出X / 拿出X 分别投技能与物品', () => {
    const skill: Record<string, number> = {}
    voteContext('使出', '', '', '', skill)
    expect(skill.skill).toBeGreaterThanOrEqual(3)

    const item: Record<string, number> = {}
    voteContext('拿出', '', '', '', item)
    expect(item.item).toBeGreaterThanOrEqual(2)
  })

  it('动宾结构里的「出」不投地点（拿出星辉石）', () => {
    const votes: Record<string, number> = {}
    voteContext('拿出', '出', '', '', votes)
    expect(votes.place ?? 0).toBe(0)
    expect(votes.item).toBeGreaterThanOrEqual(2)
  })

  it('「看着林夜」的林不触发地点后缀', () => {
    const votes: Record<string, number> = {}
    voteContext('', '着', '林', '夜', votes)
    expect(votes.place ?? 0).toBe(0)
  })

  it('境界识别：突破X / X境 / 词表点名', () => {
    // 突破金丹：前缀动词 +3
    const v1: Record<string, number> = {}
    voteContext('突破', '破', '金', '丹', v1, '金丹')
    expect(v1.realm).toBeGreaterThanOrEqual(3)
    // 金丹境：词表 +2、后缀境 +2
    const v2: Record<string, number> = {}
    voteContext('', '', '境', '', v2, '金丹')
    expect(v2.realm).toBeGreaterThanOrEqual(4)
    // 踏入筑基期
    const v3: Record<string, number> = {}
    voteContext('踏入', '入', '期', '', v3, '筑基')
    expect(v3.realm).toBeGreaterThanOrEqual(5)
  })

  it('「拿出金丹」判物品而非境界（动宾优先，键序先到先得）', () => {
    const votes: Record<string, number> = {}
    voteContext('拿出', '出', '', '', votes, '金丹')
    expect(votes.item).toBeGreaterThanOrEqual(2)
    expect(decideType(votes)).toBe('item')
  })

  it('「和X一起/给X自己」等连接短语不误判为人名', () => {
    // 旧逻辑：个体词前是连接介词且后面不是「是」就 +2 人名票，导致「和大人/给自己」这类常被当成人物
    const v1: Record<string, number> = {}
    voteContext('', '和', '一', '起', v1, '一起')
    expect(v1.person ?? 0).toBe(0)
    expect(decideType(v1)).not.toBe('person')

    const v2: Record<string, number> = {}
    voteContext('', '给', '自', '己', v2, '自己')
    expect(v2.person ?? 0).toBe(0)
  })

  it('「对X说」仍投人物（个体词后接说话动词）', () => {
    const votes: Record<string, number> = {}
    voteContext('', '对', '说', '', votes, '林夜')
    expect(votes.person).toBeGreaterThanOrEqual(4)
  })
})

describe('decideType 类型决策', () => {
  it('票数不足归为 unknown', () => {
    expect(decideType({})).toBe('unknown')
    expect(decideType({ person: 1 })).toBe('unknown')
  })
  it('票数达标取最高', () => {
    expect(decideType({ person: 2, place: 1 })).toBe('person')
    expect(decideType({ skill: 3, item: 2 })).toBe('skill')
  })
  it('人名与具体类型平票时判具体类型而非人物（防「词被当成人物」）', () => {
    expect(decideType({ place: 2, person: 2 })).toBe('place')
    expect(decideType({ item: 2, person: 2 })).toBe('item')
    expect(decideType({ realm: 3, person: 3 })).toBe('realm')
  })
})
