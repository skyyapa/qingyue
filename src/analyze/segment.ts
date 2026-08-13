/** 中文新词发现（无监督）：字频统计 + 二元组 PMI（互信息）链
 *  原理：真实词语内部的相邻字共现概率显著高于随机（如「萧炎」），
 *  沿强二元组链行走即可拼出 2-6 字候选词（如 三|年|之|约 → 三年之约）
 */

/** 常见语气/虚字：不作为候选词首尾字（保守集合，词内用字如「之」不受影响） */
const FUNC_CHARS = new Set('的了啊呀哦嗯唉哈吧呢吗啦嘛哟噢呗诶咦呵唷嘶喂嘿喔')

/** 是否为可组词的中文字符（CJK 统一表意文字；标点/空白/ASCII 均为词边界） */
export function isCJK(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return code >= 0x4e00 && code <= 0x9fff
}

export interface TextStats {
  bigrams: Map<string, number>
  chars: Map<string, number>
  total: number
  /** 追加一章文本的统计 */
  addText(text: string): void
}

export function createStats(): TextStats {
  const bigrams = new Map<string, number>()
  const chars = new Map<string, number>()
  let total = 0
  return {
    bigrams,
    chars,
    get total() {
      return total
    },
    addText(text) {
      let prev = ''
      for (const ch of text) {
        if (!isCJK(ch)) {
          prev = ''
          continue
        }
        chars.set(ch, (chars.get(ch) ?? 0) + 1)
        total++
        if (prev) {
          const bg = prev + ch
          bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1)
        }
        prev = ch
      }
    },
  }
}

/** 二元组互信息 PMI = log(P(ab) / (P(a)·P(b)))，越高越像词内组合 */
export function bigramPMI(bg: string, stats: TextStats): number {
  const pAb = (stats.bigrams.get(bg) ?? 0) / stats.total
  const pA = (stats.chars.get(bg[0]) ?? 0) / stats.total
  const pB = (stats.chars.get(bg[1]) ?? 0) / stats.total
  if (pA === 0 || pB === 0) return 0
  return Math.log(pAb / (pA * pB))
}

export interface WordCandidate {
  word: string
  count: number
  /** 出现章节号 */
  chapters: number[]
  /** 左邻字符多样性（≥2 说明是词边界） */
  leftVariety: number
  /** 右邻字符多样性 */
  rightVariety: number
}

export interface DiscoverOptions {
  /** 强二元组最低频率 */
  minFreq?: number
  /** 强二元组最低 PMI */
  minPMI?: number
  /** 候选词最低总次数 */
  minCount?: number
  /** 候选词至少跨章节数 */
  minChapters?: number
  /** 候选词上限 */
  maxWords?: number
}

const DEFAULT_OPTIONS: Required<DiscoverOptions> = {
  minFreq: 4,
  minPMI: 2.5,
  minCount: 3,
  minChapters: 2,
  maxWords: 3000,
}

/** 邻字符多样性：记录出现位置前后的字符集合（上限 8，够判断"词边界"即可） */
class NeighborCounter {
  private set = new Set<string>()
  add(ch: string): void {
    if (this.set.size < 8) this.set.add(ch)
  }
  get size(): number {
    return this.set.size
  }
}

export interface WindowStat {
  count: number
  chapters: number[]
  left: NeighborCounter
  right: NeighborCounter
}

/** 候选词最大长度（过长说明链跨了词边界） */
const MAX_WORD_LEN = 4

/** 由统计构建强二元组集合（频率 + PMI 双门槛），可与扫描分离以支持流式处理大书 */
export function buildStrongSet(stats: TextStats, options: DiscoverOptions = {}): Set<string> {
  const opt = { ...DEFAULT_OPTIONS, ...options }
  const strong = new Set<string>()
  for (const [bg, count] of stats.bigrams) {
    if (count >= opt.minFreq && bigramPMI(bg, stats) >= opt.minPMI) {
      strong.add(bg)
      if (strong.size >= 50000) break
    }
  }
  return strong
}

/** 扫描一章文本：沿强二元组链统计 2-4 字窗口并累加进 windows（章节可逐个处理、用完即弃） */
export function scanChapterWindows(text: string, strong: Set<string>, windows: Map<string, WindowStat>, ci: number): void {
  const n = text.length
  let i = 0
  while (i < n) {
    if (!isCJK(text[i])) {
      i++
      continue
    }
    // 沿强二元组链延伸最大运行段
    let j = i + 1
    while (j < n && isCJK(text[j]) && strong.has(text.slice(j - 1, j + 1))) j++
    // 运行段内的每个 2-4 字窗口都作为候选统计
    for (let s = i; s < Math.min(j, i + 3); s++) {
      for (let len = 2; len <= MAX_WORD_LEN && s + len <= j; len++) {
        const w = text.slice(s, s + len)
        let ws = windows.get(w)
        if (!ws) {
          ws = { count: 0, chapters: [], left: new NeighborCounter(), right: new NeighborCounter() }
          windows.set(w, ws)
        }
        ws.count++
        if (ws.chapters[ws.chapters.length - 1] !== ci) ws.chapters.push(ci)
        ws.left.add(text[s - 1] ?? '')
        ws.right.add(text[s + len] ?? '')
      }
    }
    i++
  }
}

/** 过滤窗口统计：频率/跨章/首尾虚字/纯重复字 + 左右邻多样性 + 粘连词抑制 */
export function filterWindows(windows: Map<string, WindowStat>, options: DiscoverOptions = {}): Map<string, WordCandidate> {
  const opt = { ...DEFAULT_OPTIONS, ...options }

  // 过滤：频率/跨章/首尾虚字/纯重复字 + 左右邻多样性
  const result = new Map<string, WordCandidate>()
  for (const [word, ws] of windows) {
    if (ws.count < opt.minCount || ws.chapters.length < opt.minChapters) continue
    if (FUNC_CHARS.has(word[0]) || FUNC_CHARS.has(word[word.length - 1])) continue
    if (word.length >= 4 && new Set(word).size === 1) continue // 哈哈哈哈哈
    const leftVariety = ws.left.size
    const rightVariety = ws.right.size
    // 真词：两侧邻居都多变（如 林夜 前后接不同字）；
    // 单侧固定但高频的也保留（如「拿出星辉石」中 星辉石 左侧固定为 出）
    const isWord =
      (leftVariety >= 2 && rightVariety >= 2) ||
      (ws.count >= 10 && (leftVariety >= 2 || rightVariety >= 2))
    if (!isWord) continue
    result.set(word, {
      word,
      count: ws.count,
      chapters: ws.chapters,
      leftVariety,
      rightVariety,
    })
  }

  // 粘连词抑制：长候选若含有一个次数显著更高的 2-3 字真前缀/真后缀，
  // 说明它是被链粘连的短语（如「林夜对/林夜掏」内含高频的「林夜」），丢弃
  // 3 字词仅当多余字符为功能字时抑制（「黑衣人」的「人」是实义字，保留）；
  // 4 字词要求部分词频 ≥0.8×（「老师傅看」含「老师傅」）
  const FUNC_EXTRA = '对跟向被让和与同给随陪说道看着在到去来往从进出离走返站住坐躲藏躺的了着过是'
  const shortWords = [...result.entries()].filter(([w]) => w.length <= 3)
  for (const [word, c] of [...result]) {
    if (word.length === 2) continue
    const ratio = word.length === 3 ? 1.5 : 0.8
    for (const [w, sc] of shortWords) {
      if (sc.count < c.count * ratio) continue
      // 多余字符 = 长词去掉词根后剩下的那个字符
      let extra = ''
      if (word.startsWith(w)) extra = word[w.length]
      else if (word.endsWith(w)) extra = word[word.length - w.length - 1]
      if (!extra) continue
      if (word.length === 3 && !FUNC_EXTRA.includes(extra)) continue
      result.delete(word)
      break
    }
  }

  // 按跨章数 → 次数排序，截断到上限
  const sorted = [...result.values()].sort(
    (a, b) => b.chapters.length - a.chapters.length || b.count - a.count
  )
  const capped = new Map<string, WordCandidate>()
  for (const c of sorted.slice(0, opt.maxWords)) capped.set(c.word, c)
  return capped
}

/** 便捷入口：传入全部章节文本（小书 / 测试用）。大书请用 buildStrongSet + scanChapterWindows 流式处理 */
export function discoverCandidates(
  chapterTexts: string[],
  stats: TextStats,
  options: DiscoverOptions = {}
): Map<string, WordCandidate> {
  const strong = buildStrongSet(stats, options)
  const windows = new Map<string, WindowStat>()
  for (let ci = 0; ci < chapterTexts.length; ci++) {
    scanChapterWindows(chapterTexts[ci], strong, windows, ci)
  }
  return filterWindows(windows, options)
}
