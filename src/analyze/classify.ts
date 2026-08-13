/** 实体上下文分类：按出现位置的前后字模式投票（人名/地名/技能/物品/组织）
 *  规则识别不完美，识别结果可在 UI 中人工修正（改名/删除/合并/锁定）
 */
import type { EntityType } from '@/types'

/** 说话动词：X说 / X道 / X问 / X看着 …… */
const SPEECH_VERBS = new Set('说道问问答喊笑叫骂叹怒吼斥责答解释求恳谢看望盯瞪瞧瞅')
/** 介词：对X说 / 跟X / 被X ……；也覆盖「X对Y说」的主语位 */
const PERSON_PREP = new Set('对跟向被让和与同给随陪')
/** 处所介词：在X / 来到X / 回到X …… */
const PLACE_PREP = new Set('在到去回来往从进出离走返赶奔飞落站住坐躲藏躺')
/** 技能动词（2 字）：使出X / 施展X …… */
const SKILL_PREV = new Set(['使出', '施展', '释放', '修炼', '习得', '学会', '发动', '催动', '运转', '领悟', '掌握', '习练', '演练', '突破', '练熟', '修习', '参悟'])
/** 物品动词（2 字）：拿出X / 握着X …… */
const ITEM_PREV = new Set(['拿出', '掏出', '握着', '手持', '捡起', '收起', '带着', '捧着', '举起', '拖着', '扛着', '腰间', '袖中', '手上', '握紧', '握了', '掂量'])
/** 技能后缀：X功法 / X武技 …… */
const SKILL_SUFFIX = new Set(['功法', '武技', '之术', '秘法', '神通', '斗技', '剑法', '刀法', '心法', '拳法', '掌法', '身法', '斗气'])
/** 物品后缀：X丹药 / X法宝 …… */
const ITEM_SUFFIX = new Set(['丹药', '法宝', '宝剑', '戒指', '斗篷', '古剑', '神兵', '玉简', '灵药', '储物'])
/** 组织后缀（单字）：X宗 / X派 / X族 …… */
const ORG_SUFFIX = new Set('宗门派族')
/** 地点后缀（单字）：X城 / X山 / X镇 ……（不含「林」，避免误伤「看着林夜」这类场景） */
const PLACE_SUFFIX = new Set('城山镇村宫殿府阁塔寺湖河江桥路街坊县国岛洞窟崖峰岭原洲域')

export type Votes = Partial<Record<EntityType, number>>

/** 对候选词的一次出现做上下文投票 */
export function voteContext(prev2: string, prev: string, next: string, next2: string, votes: Votes): void {
  // 人名：X说 / X道 / X看着 / 对X说 / 跟X / X对Y说
  if (next && SPEECH_VERBS.has(next)) votes.person = (votes.person ?? 0) + 2
  if (next && PERSON_PREP.has(next)) votes.person = (votes.person ?? 0) + 2
  if (prev && PERSON_PREP.has(prev) && next && next !== '是') votes.person = (votes.person ?? 0) + 2
  // 地点：在X / 来到X / X城 / X山
  // 注意「拿出/使出/掏出」等动宾结构里的「出」不应触发地点投票
  if (prev && PLACE_PREP.has(prev) && !(prev2 && (SKILL_PREV.has(prev2) || ITEM_PREV.has(prev2)))) {
    votes.place = (votes.place ?? 0) + 2
  }
  if (next && PLACE_SUFFIX.has(next)) votes.place = (votes.place ?? 0) + 2
  // 技能：使出X / X功法
  if (prev2 && SKILL_PREV.has(prev2)) votes.skill = (votes.skill ?? 0) + 3
  if (next2 && SKILL_SUFFIX.has(next2)) votes.skill = (votes.skill ?? 0) + 2
  // 物品：拿出X / X丹药
  if (prev2 && ITEM_PREV.has(prev2)) votes.item = (votes.item ?? 0) + 2
  if (next2 && ITEM_SUFFIX.has(next2)) votes.item = (votes.item ?? 0) + 2
  // 势力：X宗 / X派
  if (next && ORG_SUFFIX.has(next)) votes.org = (votes.org ?? 0) + 2
}

/** 依据投票决定实体类型（票数不足视为 unknown，可在 UI 手动修正） */
export function decideType(votes: Votes): EntityType {
  let best: EntityType = 'unknown'
  let bestVotes = 0
  for (const [type, v] of Object.entries(votes) as [EntityType, number][]) {
    if (v > bestVotes) {
      best = type
      bestVotes = v
    }
  }
  return bestVotes >= 2 ? best : 'unknown'
}

/** 类型中文名 */
export const TYPE_LABELS: Record<EntityType, string> = {
  person: '人物',
  place: '地点',
  skill: '技能',
  item: '物品',
  org: '势力',
  unknown: '其他',
}
