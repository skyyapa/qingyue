<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as db from '@/db'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'
import { useAIStore } from '@/stores/ai'
import { runAITask } from '@/ai/assistant'
import { bookReadPercent, formatPercent } from '@/utils/progress'
import { searchBookChaptersBatched, type BookSearchResult } from '@/utils/book-search'
import { recordTodayChapter } from '@/utils/reading-days'
import { classifyTapZone } from '@/utils/tap-zones'
import type { AITask, AITaskParams } from '@/ai/assistant'
import TocPanel from '@/components/TocPanel.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import AssistantPanel from '@/components/AssistantPanel.vue'
import TextSelectionBar from '@/components/TextSelectionBar.vue'
import type { Entity, FontName } from '@/types'

const route = useRoute()
const router = useRouter()
const reader = useReaderStore()
const settings = useSettingsStore()
const stats = useStatsStore()
const ai = useAIStore()

const bookId = computed(() => String(route.params.id))

// 正文字体族映射
const FONT_FAMILIES: Record<FontName, string> = {
  system: `system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`,
  song: `'SimSun', 'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif SC', serif`,
  hei: `'SimHei', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif`,
  kai: `'KaiTi', 'STKaiti', 'Kaiti SC', 'Kai', serif`,
  serif: `Georgia, 'Times New Roman', 'Songti SC', serif`,
}

// DOM 引用
const scrollArea = ref<HTMLElement>()
const pagedArea = ref<HTMLElement>()

// 面板
const showToc = ref(false)
const showSettings = ref(false)
const showAssistant = ref(false)
const assistantRef = ref<InstanceType<typeof AssistantPanel>>()

// 工具栏显隐（触屏中央点按切换；打开面板/搜索时强制呼出）
const toolbarVisible = ref(true)
watch([showToc, showSettings, showAssistant], () => {
  if (showToc.value || showSettings.value || showAssistant.value) toolbarVisible.value = true
})

// ---------- 章节内搜索 ----------
const searchVisible = ref(false)
const searchMode = ref<'chapter' | 'book'>('chapter')
const searchTerm = ref('')
const searchIndex = ref(-1)
const searchTotal = ref(0)
const bookResults = ref<BookSearchResult[]>([])
const searchedChapterCount = ref(0)
const searchInput = ref<HTMLInputElement>()
let bookSearchTimer: number | undefined

/** 当前正文滚动/翻页容器 */
const contentEl = computed(() =>
  pageMode.value === 'scroll' ? scrollArea.value : pagedArea.value
)

function getMarks(): HTMLElement[] {
  return [...(contentEl.value?.querySelectorAll('mark.search-hit') ?? [])] as HTMLElement[]
}

/** 清除全部搜索高亮（把 mark 还原为文本节点） */
function clearHighlights(): void {
  for (const mark of contentEl.value?.querySelectorAll('mark.search-hit') ?? []) {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ''))
  }
}

/** 在渲染后的文本节点上包裹搜索词（v-html 渲染后 DOM 操作，天然跳过 [b]/[i] 等标记） */
function applyHighlights(term: string): number {
  clearHighlights()
  const container = contentEl.value
  if (!term || !container) return 0
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.textContent?.includes(term) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  })
  const targets: Text[] = []
  while (walker.nextNode()) targets.push(walker.currentNode as Text)
  let count = 0
  for (const node of targets) {
    const parent = node.parentNode
    if (!parent) continue
    const text = node.textContent ?? ''
    const frag = document.createDocumentFragment()
    let pos = 0
    let idx = text.indexOf(term)
    while (idx >= 0) {
      if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)))
      const mark = document.createElement('mark')
      mark.className = 'search-hit'
      mark.textContent = term
      frag.appendChild(mark)
      count++
      pos = idx + term.length
      idx = text.indexOf(term, pos)
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)))
    parent.replaceChild(frag, node)
  }
  return count
}

/** 滚动到目标元素（滚动模式居中；翻页模式按视口差值换算列位置） */
function scrollToElement(el: HTMLElement): void {
  if (pageMode.value === 'scroll') {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  } else {
    const container = pagedArea.value
    if (!container) return
    const rect = el.getBoundingClientRect()
    const cRect = container.getBoundingClientRect()
    container.scrollTo({ left: container.scrollLeft + (rect.left - cRect.left), behavior: 'smooth' })
  }
}

function openSearch(): void {
  searchVisible.value = true
  toolbarVisible.value = true // 搜索条挂在顶栏下方，工具栏隐藏时先呼出
  nextTick(() => searchInput.value?.focus())
}

function closeSearch(): void {
  window.clearTimeout(bookSearchTimer)
  searchVisible.value = false
  searchTerm.value = ''
  searchIndex.value = -1
  searchTotal.value = 0
  bookResults.value = []
  searchedChapterCount.value = 0
  clearHighlights()
}

/** 切换搜索范围（章节 / 本书已缓存章节） */
function setSearchMode(mode: 'chapter' | 'book'): void {
  if (searchMode.value === mode) return
  searchMode.value = mode
  searchIndex.value = -1
  searchTotal.value = 0
  bookResults.value = []
  clearHighlights()
  runSearch(searchTerm.value)
}

// 全书搜索分片 token：递增使旧批次结果作废，避免竞态（输入变化/切章后旧结果覆盖新结果）
let bookSearchToken = 0
let cancelBookSearch: (() => void) | undefined

/** 扫描全书（在线书仅扫描已缓存章节）；防抖让输入保持流畅；
 *  分批异步扫描（见 searchBookChaptersBatched），大书不阻塞主线程 */
function runBookSearch(term: string): void {
  window.clearTimeout(bookSearchTimer)
  cancelBookSearch?.()
  const q = term.trim()
  if (!q) {
    bookResults.value = []
    searchedChapterCount.value = 0
    return
  }
  bookSearchTimer = window.setTimeout(async () => {
    const chapters = await db.listChapters(bookId.value)
    // 异步加载期间输入已变化或离开本书搜索，丢弃
    if (searchMode.value !== 'book' || searchTerm.value.trim() !== q) return
    const token = ++bookSearchToken
    searchedChapterCount.value = chapters.length
    cancelBookSearch = searchBookChaptersBatched(chapters, q, (results, done) => {
      if (bookSearchToken !== token) return
      bookResults.value = results
      if (done) cancelBookSearch = undefined
    })
  }, 180)
}

function runSearch(term: string): void {
  if (searchMode.value === 'chapter') {
    afterApply(applyHighlights(term.trim()))
  } else {
    clearHighlights()
    runBookSearch(term)
  }
}

/** 选择全书结果：切章并复用锚点定位/章节高亮 */
async function openBookResult(result: BookSearchResult): Promise<void> {
  const term = searchTerm.value.trim()
  if (!term) return
  await goChapter(result.chapterIndex, term)
  searchMode.value = 'chapter'
  await nextTick()
  afterApply(applyHighlights(term))
}

const bookSearchStatus = computed(() => {
  if (reader.book?.source === 'web') return `已搜索 ${searchedChapterCount.value}/${reader.chapterCount} 章缓存内容`
  return `已搜索 ${searchedChapterCount.value}/${reader.chapterCount} 章`
})

/** 高亮应用后的回调：更新计数并定位第一个命中 */
function afterApply(total: number): void {
  searchTotal.value = total
  searchIndex.value = total > 0 ? 0 : -1
  const marks = getMarks()
  marks.forEach((m, i) => m.classList.toggle('current', i === searchIndex.value))
  if (marks[0]) scrollToElement(marks[0])
}

/** 上一处 / 下一处 */
function nextHit(back: boolean): void {
  const marks = getMarks()
  if (marks.length === 0) return
  searchIndex.value = back
    ? (searchIndex.value - 1 + marks.length) % marks.length
    : (searchIndex.value + 1) % marks.length
  marks.forEach((m, i) => m.classList.toggle('current', i === searchIndex.value))
  scrollToElement(marks[searchIndex.value])
}

watch(searchTerm, (term) => runSearch(term))

/** 章节/重排后 DOM 重建，重新应用高亮（保持阅读位置，不跳转） */
function reapplySearch(): void {
  if (searchVisible.value && searchTerm.value.trim()) {
    searchTotal.value = applyHighlights(searchTerm.value.trim())
    searchIndex.value = searchTotal.value > 0 ? 0 : -1
    getMarks().forEach((m, i) => m.classList.toggle('current', i === searchIndex.value))
  }
}

/** 选中文字命中实体 → 打开助手并定位详情 */
async function onOpenEntity(entity: Entity): Promise<void> {
  showAssistant.value = true
  // 等抽屉挂载完成再定位（nextTick 替代 setTimeout，避免时序竞态）
  await nextTick()
  assistantRef.value?.openEntity(entity.id)
}

/** 选中文字 → 打开助手 AI tab 并预填（问 AI） */
async function onAskAI(text: string): Promise<void> {
  showAssistant.value = true
  await nextTick()
  assistantRef.value?.openAI(text)
}

/** 顶栏 AI 按钮：直接打开助手 AI tab */
async function openAssistantAI(): Promise<void> {
  showAssistant.value = true
  await nextTick()
  assistantRef.value?.openAI('')
}

// ---------- 自动章节摘要（AI 配置后翻章自动生成，会话内缓存） ----------

const chapterSummary = ref('')
const chapterSummaryLoading = ref(false)
const chapterSummaryShown = ref(false)
const summaryCache = new Map<number, string>()

async function generateChapterSummary(index: number): Promise<void> {
  const provider = ai.activeProvider
  if (!provider) return
  chapterSummaryLoading.value = true
  chapterSummary.value = ''
  try {
    const cached = summaryCache.get(index)
    chapterSummary.value = cached ?? (await runAITask(provider, bookId.value, 'summarize', { chapterIndex: index }))
    if (!cached) summaryCache.set(index, chapterSummary.value)
    chapterSummaryShown.value = true
  } catch {
    chapterSummaryShown.value = false // 失败静默（不打扰阅读）
  } finally {
    chapterSummaryLoading.value = false
  }
}

// ---------- AI 阅读浮层（快速操作：解释/总结/询问人物/查看伏笔） ----------

const aiFabOpen = ref(false)
const aiFabPersonMode = ref(false)
const aiFabAnswer = ref('')
const aiFabLoading = ref(false)
const aiFabError = ref('')
const aiFabPersons = ref<{ id: string; name: string }[]>([])

/** 执行浮层任务，回答显示在底部面板 */
async function runFloatTask(task: AITask, params: AITaskParams = {}): Promise<void> {
  const provider = ai.activeProvider
  if (!provider) return
  aiFabOpen.value = false
  aiFabPersonMode.value = false
  aiFabAnswer.value = ''
  aiFabError.value = ''
  aiFabLoading.value = true
  try {
    aiFabAnswer.value = await runAITask(provider, bookId.value, task, {
      chapterIndex: reader.chapterIndex,
      ...params,
    })
  } catch (err) {
    aiFabError.value = err instanceof Error ? err.message : String(err)
  } finally {
    aiFabLoading.value = false
  }
}

/** 加载当前章人物（浮层「询问人物」） */
async function loadFloatPersons(): Promise<void> {
  aiFabPersonMode.value = true
  aiFabPersons.value = []
  try {
    const [indexes, entities] = await Promise.all([
      db.listChapterIndexes(bookId.value),
      db.listEntities(bookId.value),
    ])
    const idx = indexes.find((x) => x.index === reader.chapterIndex)
    const counts = idx?.entityCounts ?? {}
    aiFabPersons.value = entities
      .filter((e) => e.type === 'person' && e.id in counts)
      .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
      .slice(0, 8)
      .map((e) => ({ id: e.id, name: e.name }))
  } catch {
    // 读取失败静默：浮层为空，不打扰阅读
  }
}

// 位置显示（滚动模式百分比 / 翻页模式页数）
const posPercent = ref('0%')
const pagePos = ref({ current: 1, total: 1 })

// 翻页模式列参数（视口宽度需为响应式：resize/旋转后列宽与分页位置同步更新）
const COL_GAP = 48
const viewportWidth = ref(window.innerWidth)
const pagedColWidth = computed(() => Math.min(600, Math.max(320, viewportWidth.value - 96)))

/** 正文段落：文本 / 内嵌图片 / 小标题 */
interface Paragraph {
  kind: 'text' | 'image' | 'heading'
  text?: string
  src?: string
  /** EPUB 排版样式（CSS 子集，段级） */
  style?: Record<string, string> | null
}

/** 段落文本 → 受控 HTML（先转义再替换 [b]/[i]/[u] 行内标记；EPUB 解析时已剥离原始标签） */
function toHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/\[b\]/g, '<b>')
    .replace(/\[\/b\]/g, '</b>')
    .replace(/\[i\]/g, '<em>')
    .replace(/\[\/i\]/g, '</em>')
    .replace(/\[u\]/g, '<u>')
    .replace(/\[\/u\]/g, '</u>')
}

/** AI 回答受控渲染：先转义再替换轻量标记（**粗体**、标题、换行） */
function renderAI(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/\n/g, '<br>')
}

const paragraphs = computed<Paragraph[]>(() => {
  const chapter = reader.chapter
  if (!chapter) return []
  const images = chapter.images ?? []
  const styles = chapter.paragraphStyles ?? []
  const out: Paragraph[] = []
  let styleIdx = 0
  for (const raw of chapter.text.split(/\n{2,}/)) {
    const p = raw.trim()
    if (!p) continue
    // 段落样式与文本段落一一对应（EPUB 解析时按同规则切分）
    const style = (styles[styleIdx] as Record<string, string> | undefined) ?? null
    styleIdx++
    if (p.startsWith('# ')) {
      out.push({ kind: 'heading', text: p.slice(2).trim(), style })
      continue
    }
    // 拆出 [img:N] 占位符（可能出现在段落中间）
    let pos = 0
    while (pos < p.length) {
      const next = p.indexOf('[img:', pos)
      if (next < 0) {
        const rest = p.slice(pos).trim()
        if (rest) out.push({ kind: 'text', text: rest, style })
        break
      }
      const before = p.slice(pos, next).trim()
      if (before) out.push({ kind: 'text', text: before, style })
      const m = p.slice(next).match(/^\[img:(\d+)\]/)
      const src = m ? images[Number(m[1])] : undefined
      if (m && src) out.push({ kind: 'image', src })
      pos = next + (m?.[0].length ?? 0)
    }
  }
  return out
})

const hasNext = computed(() => reader.chapterIndex < reader.chapterCount - 1)
const nextTitle = computed(() => reader.chapterTitles[reader.chapterIndex + 1] ?? '')

/** 全书阅读占比 */
const bookPercent = computed(() => (reader.book ? formatPercent(bookReadPercent(reader.book)) : '—'))

const pageMode = computed(() => settings.settings.pageMode)

// ---------- 滚动位置换算 ----------

/** 读取当前章内阅读位置（0-1），滚动/翻页模式统一口径 */
function readRatio(): number {
  if (pageMode.value === 'scroll') {
    const el = scrollArea.value
    if (!el) return 0
    const max = el.scrollHeight - el.clientHeight
    return max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0
  }
  const el = pagedArea.value
  if (!el) return 0
  const max = el.scrollWidth - el.clientWidth
  return max > 0 ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0
}

/** 恢复到指定位置（章节切换、设置变更、窗口缩放后调用） */
async function restoreRatio(ratio: number): Promise<void> {
  await nextTick()
  const el = pageMode.value === 'scroll' ? scrollArea.value : pagedArea.value
  if (!el) return
  const max = pageMode.value === 'scroll' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
  if (max <= 0) return
  const target = Math.min(max, Math.max(0, ratio * max))
  if (pageMode.value === 'scroll') el.scrollTop = target
  else el.scrollLeft = target
}

// ---------- 进度保存（防抖 + 离开时兜底） ----------

let saveTimer: number | undefined

function scheduleSave(): void {
  posPercent.value = `${Math.round(readRatio() * 100)}%`
  if (pageMode.value === 'paged') updatePagePos()
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => reader.saveProgress(readRatio()), 500)
}

function flushSave(): void {
  window.clearTimeout(saveTimer)
  reader.saveProgress(readRatio())
}

// ---------- 章节切换 ----------

/** 会话内各章阅读位置记忆：切走时记录，切回时恢复（不落库，刷新后随进度走） */
const positionMemory = new Map<number, number>()

/** 字号快捷调节（±1px，钳制 14-28；重排与位置保持由设置 watch 处理） */
function adjustFontSize(delta: number): void {
  const next = Math.min(28, Math.max(14, settings.settings.fontSize + delta))
  settings.settings.fontSize = next
}

/** 跳到指定章节；带 anchor 时在章内定位到含该文本的段落（找不到则按记忆/章节开头处理） */
async function goChapter(index: number, anchor?: string): Promise<void> {
  if (index === reader.chapterIndex && !anchor) return
  // 切走前记住当前章位置
  positionMemory.set(reader.chapterIndex, readRatio())
  const goingNext = index > reader.chapterIndex
  if (index !== reader.chapterIndex) {
    await reader.loadChapter(index)
    await nextTick()
  }
  let restored = false
  if (anchor) restored = scrollToAnchor(anchor)
  if (!restored) {
    // 优先恢复该章会话内记忆的位置；无记忆时下一章从顶部、上一章回底部
    const remembered = positionMemory.get(index)
    await restoreRatio(remembered !== undefined ? remembered : goingNext ? 0 : 1)
  }
  flushSave()
}

/** 在正文段落中定位锚点文本（滚动模式按段落滚动；翻页模式按视口差值换算列位置） */
function scrollToAnchor(anchor: string): boolean {
  const container = contentEl.value
  if (!container) return false
  const norm = anchor.replace(/\s+/g, '')
  const paras = container.querySelectorAll('p.para')
  for (const p of paras) {
    if ((p.textContent ?? '').replace(/\s+/g, '').includes(norm)) {
      scrollToElement(p as HTMLElement)
      flashAnchor(p as HTMLElement)
      return true
    }
  }
  return false
}

/** 锚点段落短暂高亮 */
function flashAnchor(p: HTMLElement): void {
  p.classList.add('anchor-flash')
  window.setTimeout(() => p.classList.remove('anchor-flash'), 2400)
}

// ---------- 翻页模式分页 ----------

function updatePagePos(): void {
  const el = pagedArea.value
  if (!el) return
  const pageWidth = pagedColWidth.value + COL_GAP
  const total = Math.max(1, Math.round(el.scrollWidth / pageWidth))
  const current = Math.min(total, Math.max(1, Math.round(el.scrollLeft / pageWidth) + 1))
  pagePos.value = { current, total }
}

function scrollPaged(direction: 1 | -1): void {
  const el = pagedArea.value
  if (!el) return
  const pageWidth = pagedColWidth.value + COL_GAP
  const max = el.scrollWidth - el.clientWidth
  // 按当前页 round 定位目标页，smooth 动画中断后可回正（避免 ceil/floor 越界跨两页）
  const currentPage = Math.round(el.scrollLeft / pageWidth)
  const targetPage = direction === 1 ? currentPage + 1 : currentPage - 1
  const target = Math.min(max, Math.max(0, targetPage * pageWidth))
  el.scrollTo({ left: target, behavior: 'smooth' })
}

/** 翻页模式是否已处于首/末页（键盘在页边界翻章） */
function pagedAtBoundary(direction: 1 | -1): boolean {
  const el = pagedArea.value
  if (!el) return true
  const pageWidth = pagedColWidth.value + COL_GAP
  const max = el.scrollWidth - el.clientWidth
  return direction === 1 ? el.scrollLeft + pageWidth - 4 >= max : el.scrollLeft <= 4
}

// ---------- 触屏点按（中央切换工具栏 / 左右翻页）与滑动翻页 ----------

let touchStartX = 0
let touchStartY = 0
let touchStartTime = 0
let touchActive = false
let lastTapTime = 0
let tapTimer: number | undefined

function onTouchStart(e: TouchEvent): void {
  const t = e.touches[0]
  touchStartX = t.clientX
  touchStartY = t.clientY
  touchStartTime = e.timeStamp
  touchActive = true
}

function onTouchEnd(e: TouchEvent): void {
  if (!touchActive) return
  touchActive = false
  const t = e.changedTouches[0]
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY
  const dt = e.timeStamp - touchStartTime
  // 滑动翻页（翻页模式）：水平位移足够大且明显大于垂直位移才视为翻页手势
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (pageMode.value === 'paged') scrollPaged(dx < 0 ? 1 : -1)
    return
  }
  // 轻点：位移小、时长短（长按选词后的松开不触发）、非交互元素、无选中文本、面板未打开
  if (dt > 400 || Math.abs(dx) > 12 || Math.abs(dy) > 12) return
  if (searchVisible.value || showToc.value || showSettings.value || showAssistant.value) return
  const target = e.target as HTMLElement
  if (target.closest('button, a, input, textarea, select, mark, .next-hint, .ai-summary')) return
  if (!window.getSelection()?.isCollapsed) return
  scheduleTap(t.clientX, t.clientY)
}

/** 中央区延迟执行 + 双击抑制（防双点选词把工具栏翻来翻去）；左右区立即翻页（连点 = 连续翻页） */
function scheduleTap(x: number, _y: number): void {
  if (classifyTapZone(x, window.innerWidth) !== 'center') {
    applyTapZone(x)
    return
  }
  const now = performance.now()
  if (now - lastTapTime < 350) {
    if (tapTimer !== undefined) {
      clearTimeout(tapTimer)
      tapTimer = undefined
    }
    lastTapTime = 0
    return
  }
  lastTapTime = now
  if (tapTimer !== undefined) clearTimeout(tapTimer)
  tapTimer = window.setTimeout(() => {
    tapTimer = undefined
    applyTapZone(x)
  }, 260)
}

function applyTapZone(x: number): void {
  const zone = classifyTapZone(x, window.innerWidth)
  if (zone === 'center') {
    toolbarVisible.value = !toolbarVisible.value
    return
  }
  // 左/右：翻页模式页内翻页（页边界翻章），滚动模式按一屏滚动
  if (pageMode.value === 'paged') {
    const next = zone === 'right'
    if (!pagedAtBoundary(next ? 1 : -1)) scrollPaged(next ? 1 : -1)
    else goChapter(reader.chapterIndex + (next ? 1 : -1))
  } else {
    const el = scrollArea.value
    if (!el) return
    el.scrollBy({
      top: (zone === 'right' ? 1 : -1) * Math.round(el.clientHeight * 0.85),
      behavior: 'smooth',
    })
  }
}

// ---------- 事件 ----------

function onKeydown(e: KeyboardEvent): void {
  // 搜索框内输入不触发翻页/翻章（方向键留给光标移动）
  const inInput = (e.target as HTMLElement).closest('input, textarea, select')
  if (e.key === 'Escape') {
    showToc.value = false
    showSettings.value = false
    showAssistant.value = false
    closeSearch()
    return
  }
  // Ctrl/Cmd + F 唤起章节内搜索
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    if (!inInput) openSearch()
    return
  }
  // 面板或输入框聚焦时方向键不翻章，避免误触
  if (showToc.value || showSettings.value || showAssistant.value || inInput) return
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    // 翻页模式：页内翻页，已到末页则翻下一章（与滚动模式一致）
    if (pageMode.value === 'paged' && !pagedAtBoundary(1)) scrollPaged(1)
    else goChapter(reader.chapterIndex + 1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (pageMode.value === 'paged' && !pagedAtBoundary(-1)) scrollPaged(-1)
    else goChapter(reader.chapterIndex - 1)
  }
}

function onVisibilityChange(): void {
  if (document.hidden) flushSave()
}

// resize 用 rAF 节流：拖拽窗口/旋转/分屏会高频触发，逐帧同步布局与 scrollLeft 校准
// 成本高；合并到下一帧只执行最后一次，避免抖动与重复的强制同步布局。
let resizeTimer: number | undefined

function onResize(): void {
  if (resizeTimer !== undefined) return
  resizeTimer = window.requestAnimationFrame(() => {
    resizeTimer = undefined
    viewportWidth.value = window.innerWidth // 翻页列宽响应式更新（旋转/分屏等）
    restoreRatio(readRatio())
  })
}

function clearResizeTimer(): void {
  if (resizeTimer !== undefined) {
    window.cancelAnimationFrame(resizeTimer)
    resizeTimer = undefined
  }
}

/** 页面被强杀/跳转前兜底保存（visibilitychange 可能来不及触发） */
function onPageHide(): void {
  flushSave()
}

// ---------- EPUB 内嵌字体注入（书级 @font-face，卸载时移除） ----------

const fontStyleEl = ref<HTMLStyleElement | null>(null)

async function applyBookFonts(bookId: string): Promise<void> {
  removeBookFonts()
  const fonts = await db.getBookFonts(bookId)
  if (!fonts || fonts.length === 0) return
  const css = fonts
    .map(
      (f) =>
        `@font-face { font-family: "${f.family}"; src: url("${f.dataUrl}");` +
        (f.style ? ` font-style: ${f.style};` : '') +
        (f.weight ? ` font-weight: ${f.weight};` : '') +
        ' }'
    )
    .join('\n')
  const style = document.createElement('style')
  style.dataset.bookFonts = 'qingyue'
  style.textContent = css
  document.head.appendChild(style)
  fontStyleEl.value = style
}

function removeBookFonts(): void {
  if (fontStyleEl.value) {
    fontStyleEl.value.remove()
    fontStyleEl.value = null
  }
}

// 章节变化后更新位置显示；搜索高亮随 DOM 重建重新应用；记录今日阅读；自动生成章节摘要
watch(
  () => reader.chapter,
  async () => {
    posPercent.value = '0%'
    chapterSummary.value = ''
    chapterSummaryLoading.value = false
    chapterSummaryShown.value = false
    recordTodayChapter(bookId.value, reader.chapterIndex) // 每日阅读回顾数据
    await nextTick()
    if (pageMode.value === 'paged') updatePagePos()
    reapplySearch()
    if (settings.settings.aiChapterSummary && ai.activeProvider) {
      generateChapterSummary(reader.chapterIndex)
    }
  }
)

// 设置（字号/行距/字体/翻页方式/书页效果）变化后重排并尽量保持阅读位置
watch(
  () => [settings.settings.fontSize, settings.settings.lineHeight, settings.settings.font, settings.settings.pageMode, settings.settings.bookPage],
  async () => {
    await nextTick()
    await restoreRatio(readRatio())
    if (pageMode.value === 'paged') updatePagePos()
    reapplySearch()
  }
)

onMounted(async () => {
  positionMemory.clear() // 新会话，位置记忆从零开始
  // 事件监听先注册（同步），避免异步加载期间按键丢失
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibilityChange)
  await applyBookFonts(bookId.value) // EPUB 内嵌字体（书级 @font-face）
  await reader.openBook(bookId.value)
  await restoreRatio(reader.book?.progress.scrollRatio ?? 0)
  stats.startTracking() // 阅读计时
})

onBeforeUnmount(() => {
  flushSave()
  window.clearTimeout(bookSearchTimer)
  window.clearTimeout(tapTimer)
  stats.stopTracking()
  removeBookFonts()
  clearResizeTimer()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pagehide', onPageHide)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div class="reader" :class="[`reader-${pageMode}`, { bookpage: settings.settings.bookPage, 'bars-hidden': !toolbarVisible }]">
    <header class="reader-top">
      <button class="icon-btn" title="返回书架" @click="router.push('/')">←</button>
      <div class="reader-title">
        <span class="title-book">{{ reader.book?.title }}</span>
        <span class="title-chapter">{{ reader.chapter?.title }}</span>
      </div>
      <button class="icon-btn" title="搜索（Ctrl+F）" @click="openSearch">🔍</button>
      <button class="icon-btn" title="AI 助手" @click="openAssistantAI">✨</button>
      <button class="icon-btn" title="目录" @click="showToc = true">☰</button>
      <button class="icon-btn" title="阅读助手" @click="showAssistant = true">助</button>
      <button class="icon-btn" title="阅读设置" @click="showSettings = true">⚙</button>
    </header>

    <!-- 正文搜索条（当前章节 / 全书已缓存章节） -->
    <div v-if="searchVisible" class="reader-search">
      <div class="search-modes">
        <button class="search-mode" :class="{ active: searchMode === 'chapter' }" @click="setSearchMode('chapter')">本章</button>
        <button class="search-mode" :class="{ active: searchMode === 'book' }" @click="setSearchMode('book')">本书</button>
      </div>
      <div class="search-line">
        <input
          ref="searchInput"
          v-model="searchTerm"
          type="search"
          :placeholder="searchMode === 'chapter' ? '在当前章节中搜索…' : '在全书已缓存章节中搜索…'"
          @keydown.enter.prevent="searchMode === 'chapter' ? nextHit(false) : undefined"
          @keydown.shift.exact.enter.prevent="searchMode === 'chapter' ? nextHit(true) : undefined"
        />
        <template v-if="searchMode === 'chapter'">
          <span class="search-count">{{ searchTotal ? `${searchIndex + 1}/${searchTotal}` : '0/0' }}</span>
          <button class="search-btn" title="上一处" @click="nextHit(true)">↑</button>
          <button class="search-btn" title="下一处" @click="nextHit(false)">↓</button>
        </template>
        <button class="search-btn" title="关闭搜索" @click="closeSearch">✕</button>
      </div>
      <template v-if="searchMode === 'book' && searchTerm.trim()">
        <p class="book-search-status">{{ bookSearchStatus }}</p>
        <div class="book-search-results">
          <button v-for="r in bookResults" :key="r.chapterIndex" class="book-search-result" @click="openBookResult(r)">
            <span class="book-result-title">第 {{ r.chapterIndex + 1 }} 章 · {{ r.chapterTitle }} <i>{{ r.count }} 处</i></span>
            <span class="book-result-excerpt">{{ r.excerpt }}</span>
          </button>
          <p v-if="searchedChapterCount > 0 && bookResults.length === 0" class="book-search-empty">未找到匹配内容</p>
        </div>
      </template>
    </div>

    <main v-if="reader.loading" class="reader-body reader-tip">加载中…</main>
    <main v-else-if="reader.error" class="reader-body reader-tip">
      <p>{{ reader.error }}</p>
      <button class="btn" @click="router.push('/')">返回书架</button>
    </main>
    <main v-else-if="reader.fetchError" class="reader-body reader-tip">
      <p>章节加载失败：{{ reader.fetchError }}</p>
      <div class="tip-actions">
        <button class="btn" @click="reader.loadChapter(reader.chapterIndex)">重试</button>
        <button class="btn" @click="router.push('/')">返回书架</button>
      </div>
    </main>

    <!-- 连续滚动模式 -->
    <main
      v-else-if="pageMode === 'scroll'"
      ref="scrollArea"
      class="reader-body scroll-area"
      @scroll="scheduleSave"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
    >
      <div
        class="scroll-inner"
        :style="{ fontSize: settings.settings.fontSize + 'px', lineHeight: settings.settings.lineHeight, fontFamily: FONT_FAMILIES[settings.settings.font] }"
      >
        <h1 class="chapter-heading">{{ reader.chapter?.title }}</h1>
        <!-- 自动章节摘要（AI 配置后翻章生成，可关闭） -->
        <div v-if="chapterSummaryShown" class="ai-summary">
          <p class="ai-summary-title">📝 本章摘要</p>
          <!-- eslint-disable-next-line vue/no-v-html -- renderAI 先转义、内容受控 -->
          <p class="ai-summary-body" v-html="renderAI(chapterSummary)"></p>
          <button class="ai-summary-close" title="关闭摘要" @click="chapterSummaryShown = false">✕</button>
        </div>
        <p v-else-if="chapterSummaryLoading" class="ai-summary-loading">✨ 正在生成章节摘要…</p>
        <template v-for="(p, i) in paragraphs" :key="i">
          <img v-if="p.kind === 'image'" class="para-img" :src="p.src" alt="" loading="lazy" />
          <!-- eslint-disable-next-line vue/no-v-html -- toHtml 先转义、内容受控（EPUB 已剥离原始标签） -->
          <h2 v-else-if="p.kind === 'heading'" class="para-heading" :style="p.style" v-html="toHtml(p.text ?? '')"></h2>
          <!-- eslint-disable-next-line vue/no-v-html -- toHtml 先转义、内容受控（EPUB 已剥离原始标签） -->
          <p v-else class="para" :style="p.style" v-html="toHtml(p.text ?? '')"></p>
        </template>
        <button v-if="hasNext && settings.settings.showNextHint" class="next-hint" @click="goChapter(reader.chapterIndex + 1)">
          下一章：{{ nextTitle }} →
        </button>
        <p v-if="!hasNext" class="end-mark">—— 全书完 ——</p>
      </div>
    </main>

    <!-- 翻页模式（CSS 多列，横向滚动） -->
    <main
      v-else
      ref="pagedArea"
      class="reader-body paged-area"
      @scroll="scheduleSave"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
    >
      <div
        class="paged-content"
        :style="{
          fontSize: settings.settings.fontSize + 'px',
          lineHeight: settings.settings.lineHeight,
          fontFamily: FONT_FAMILIES[settings.settings.font],
          columnWidth: pagedColWidth + 'px',
          columnGap: COL_GAP + 'px',
        }"
      >
        <h1 class="chapter-heading">{{ reader.chapter?.title }}</h1>
        <!-- 自动章节摘要（AI 配置后翻章生成，可关闭） -->
        <div v-if="chapterSummaryShown" class="ai-summary">
          <p class="ai-summary-title">📝 本章摘要</p>
          <!-- eslint-disable-next-line vue/no-v-html -- renderAI 先转义、内容受控 -->
          <p class="ai-summary-body" v-html="renderAI(chapterSummary)"></p>
          <button class="ai-summary-close" title="关闭摘要" @click="chapterSummaryShown = false">✕</button>
        </div>
        <p v-else-if="chapterSummaryLoading" class="ai-summary-loading">✨ 正在生成章节摘要…</p>
        <template v-for="(p, i) in paragraphs" :key="i">
          <img v-if="p.kind === 'image'" class="para-img" :src="p.src" alt="" loading="lazy" />
          <!-- eslint-disable-next-line vue/no-v-html -- toHtml 先转义、内容受控（EPUB 已剥离原始标签） -->
          <h2 v-else-if="p.kind === 'heading'" class="para-heading" :style="p.style" v-html="toHtml(p.text ?? '')"></h2>
          <!-- eslint-disable-next-line vue/no-v-html -- toHtml 先转义、内容受控（EPUB 已剥离原始标签） -->
          <p v-else class="para" :style="p.style" v-html="toHtml(p.text ?? '')"></p>
        </template>
        <button v-if="hasNext && settings.settings.showNextHint" class="next-hint" @click="goChapter(reader.chapterIndex + 1)">
          下一章：{{ nextTitle }} →
        </button>
        <p v-if="!hasNext" class="end-mark">—— 全书完 ——</p>
      </div>
    </main>

    <footer class="reader-bottom">
      <button class="btn-nav" :disabled="reader.chapterIndex <= 0" @click="goChapter(reader.chapterIndex - 1)">上一章</button>
      <span class="reader-pos">
        <button class="font-btn" title="减小字号" @click="adjustFontSize(-1)">A−</button>
        <span v-if="pageMode === 'scroll'" class="pos-main">{{ posPercent }}</span>
        <span v-else class="pos-main">{{ pagePos.current }} / {{ pagePos.total }} 页</span>
        <span class="pos-chapter">{{ reader.chapterIndex + 1 }} / {{ reader.chapterCount }} 章</span>
        <span class="pos-book" title="全书阅读占比">全书 {{ bookPercent }}</span>
        <button class="font-btn" title="增大字号" @click="adjustFontSize(1)">A+</button>
      </span>
      <button class="btn-nav" :disabled="!hasNext" @click="goChapter(reader.chapterIndex + 1)">下一章</button>
    </footer>

    <TocPanel
      v-if="showToc"
      :titles="reader.chapterTitles"
      :current-index="reader.chapterIndex"
      @close="showToc = false"
      @select="(i) => { goChapter(i); showToc = false }"
    />
    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
    <AssistantPanel
      v-if="showAssistant"
      ref="assistantRef"
      :book-id="bookId"
      :current-chapter="reader.chapterIndex"
      @close="showAssistant = false"
      @jump="(i, anchor) => goChapter(i, anchor)"
    />
    <TextSelectionBar :book-id="bookId" @open="onOpenEntity" @ai="onAskAI" />

    <!-- AI 阅读浮层（快速操作；面板打开时隐藏避免遮挡） -->
    <div v-if="ai.activeProvider && !showAssistant && !showToc && !showSettings" class="ai-fab">
      <button class="fab-btn" title="AI 快速操作" @click="aiFabOpen = !aiFabOpen; aiFabPersonMode = false">⚡</button>
      <div v-if="aiFabOpen" class="fab-menu">
        <button class="fab-item" @click="runFloatTask('explain')">📖 解释本章</button>
        <button class="fab-item" @click="runFloatTask('summarize')">📝 总结本章</button>
        <button class="fab-item" @click="loadFloatPersons()">🧑 询问人物</button>
        <button class="fab-item" @click="runFloatTask('foreshadow')">🔍 查看伏笔</button>
        <div v-if="aiFabPersonMode" class="fab-persons">
          <button v-for="p in aiFabPersons" :key="p.id" class="fab-person" @click="runFloatTask('who', { entityId: p.id, text: p.name })">
            {{ p.name }}
          </button>
          <p v-if="aiFabPersons.length === 0" class="fab-empty">当前章未识别到人物</p>
        </div>
      </div>
    </div>

    <!-- AI 回答面板（浮层结果就地显示） -->
    <div v-if="aiFabLoading || aiFabAnswer || aiFabError" class="ai-fab-panel">
      <p v-if="aiFabLoading" class="fab-loading">✨ AI 思考中…</p>
      <template v-else>
        <!-- eslint-disable-next-line vue/no-v-html -- renderAI 先转义、内容受控 -->
        <p class="fab-answer" v-html="renderAI(aiFabAnswer)"></p>
        <p v-if="aiFabError" class="fab-error">{{ aiFabError }}</p>
        <div class="fab-panel-actions">
          <button class="fab-panel-btn" @click="aiFabAnswer = ''; aiFabError = ''">关闭</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.reader {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.reader-top {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  padding-top: calc(8px + var(--safe-top));
  padding-left: calc(14px + var(--safe-left));
  padding-right: calc(14px + var(--safe-right));
  background: var(--topbar);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--panel-border);
  z-index: 10;
}
/* 正文搜索条（本章 / 本书） */
.reader-search {
  position: fixed;
  top: calc(56px + var(--safe-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  padding: 8px 10px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  width: min(92vw, 480px);
}
.search-modes,
.search-line {
  display: flex;
  align-items: center;
  gap: 6px;
}
.search-modes {
  margin-bottom: 7px;
}
.search-mode {
  padding: 3px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: transparent;
  color: var(--fg-weak);
  font-size: 12px;
  cursor: pointer;
}
.search-mode.active {
  background: var(--accent-weak);
  border-color: var(--accent);
  color: var(--accent);
}
.reader-search input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg);
  font-size: 13px;
  outline: none;
}
.reader-search input:focus {
  border-color: var(--accent);
}
.book-search-status {
  margin: 8px 2px 5px;
  font-size: 11px;
  color: var(--fg-weak);
}
.book-search-results {
  max-height: min(42vh, 300px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.book-search-result {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 9px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
  text-align: left;
  cursor: pointer;
}
.book-search-result:hover {
  border-color: var(--accent);
  background: var(--accent-weak);
}
.book-result-title {
  font-size: 12px;
  color: var(--accent);
}
.book-result-title i {
  font-style: normal;
  color: var(--fg-weak);
  margin-left: 4px;
}
.book-result-excerpt {
  font-size: 12px;
  line-height: 1.6;
  color: var(--fg-weak);
}
.book-search-empty {
  margin: 12px 0 4px;
  font-size: 12px;
  color: var(--fg-weak);
  text-align: center;
}
.search-count {
  font-size: 12px;
  color: var(--fg-weak);
  min-width: 34px;
  text-align: center;
  white-space: nowrap;
}
.search-btn {
  padding: 4px 9px;
  border: 1px solid var(--panel-border);
  border-radius: 7px;
  background: transparent;
  color: var(--fg);
  font-size: 12px;
  cursor: pointer;
}
.search-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
/* 搜索高亮（DOM 动态包裹，需 :deep 命中） */
:deep(mark.search-hit) {
  background: var(--accent-weak);
  color: var(--accent);
  border-radius: 2px;
  padding: 0 1px;
}
:deep(mark.search-hit.current) {
  background: var(--accent);
  color: #fff;
}
.reader-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 8px;
}
.title-book {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.title-chapter {
  font-size: 12px;
  color: var(--fg-weak);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reader-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
/* 阅读区禁用双击缩放（双击留给选词，点按翻页由触屏逻辑处理） */
.reader-body.scroll-area {
  touch-action: manipulation;
}
.reader-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--fg-weak);
}
.tip-actions {
  display: flex;
  gap: 10px;
}
/* 滚动模式正文 */
.scroll-inner {
  max-width: 720px;
  margin: 0 auto;
  padding: 28px 22px 60px;
}
/* 翻页模式正文：CSS 多列横向排版 */
.paged-area {
  overflow-x: auto;
  overflow-y: hidden;
}
.paged-content {
  height: 100%;
  column-fill: auto;
  padding: 28px 0 40px;
}
.paged-content .para,
.paged-content .chapter-heading,
.paged-content .para-img,
.paged-content .next-hint,
.paged-content .end-mark {
  break-inside: avoid;
}
/* 拟真书页：正文渲染为带纸张质感与阴影的书页 */
.reader.bookpage .scroll-inner {
  background-color: var(--panel);
  background-image: var(--paper-grain);
  border-radius: 14px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.08),
    inset 0 0 0 1px var(--panel-border);
  padding: 40px 36px 56px;
  margin: 28px auto 48px;
}
.reader.bookpage .paged-area {
  background-color: var(--panel);
  background-image: var(--paper-grain);
}
.chapter-heading {
  text-align: center;
  font-size: 1.15em;
  font-weight: 600;
  margin: 0 0 1.8em;
}
/* 自动章节摘要卡 */
.ai-summary {
  position: relative;
  margin: 0 0 1.8em;
  padding: 12px 14px;
  border: 1px solid var(--accent);
  border-radius: 12px;
  background: var(--accent-weak);
  opacity: 0.9;
}
.ai-summary-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}
.ai-summary-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.9;
  color: var(--fg);
}
.ai-summary-body b {
  color: var(--accent);
}
.ai-summary-close {
  position: absolute;
  top: 6px;
  right: 8px;
  border: none;
  background: transparent;
  color: var(--fg-weak);
  font-size: 12px;
  cursor: pointer;
}
.ai-summary-loading {
  margin: 0 0 1.8em;
  text-align: center;
  font-size: 12px;
  color: var(--fg-weak);
}
/* AI 阅读浮层 */
.ai-fab {
  position: fixed;
  right: 18px;
  bottom: calc(68px + var(--safe-bottom));
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.fab-btn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  background: var(--panel);
  color: var(--accent);
  font-size: 20px;
  cursor: pointer;
  box-shadow: var(--shadow);
}
.fab-btn:hover {
  background: var(--accent);
  color: #fff;
}
.fab-menu {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  min-width: 150px;
}
.fab-item {
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.fab-item:hover {
  background: var(--accent-weak);
  color: var(--accent);
}
.fab-persons {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 5px 3px 3px;
  border-top: 1px dashed var(--panel-border);
}
.fab-person {
  padding: 3px 9px;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: transparent;
  color: var(--fg);
  font-size: 12px;
  cursor: pointer;
}
.fab-person:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.fab-empty {
  margin: 2px 6px;
  font-size: 11px;
  color: var(--fg-weak);
}
/* AI 回答面板 */
.ai-fab-panel {
  position: fixed;
  left: 50%;
  bottom: calc(20px + var(--safe-bottom));
  transform: translateX(-50%);
  z-index: 45;
  width: min(92vw, 560px);
  max-height: 42vh;
  overflow-y: auto;
  padding: 12px 14px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  box-shadow: var(--shadow);
}
.fab-loading {
  margin: 0;
  font-size: 13px;
  color: var(--fg-weak);
}
.fab-answer {
  margin: 0;
  font-size: 13px;
  line-height: 1.9;
  color: var(--fg);
  overflow-wrap: break-word;
}
.fab-answer b {
  color: var(--accent);
}
.fab-error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
.fab-panel-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.fab-panel-btn {
  padding: 4px 12px;
  border: 1px solid var(--panel-border);
  border-radius: 7px;
  background: transparent;
  color: var(--fg-weak);
  font-size: 12px;
  cursor: pointer;
}
.fab-panel-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.para-heading {
  text-align: center;
  font-size: 1em;
  font-weight: 700;
  margin: 1.6em 0 1.2em;
}
.para-img {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 1.2em auto;
  object-fit: contain;
  border-radius: 6px;
}
.para {
  margin: 0 0 1.2em;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
/* 助手跳转定位的锚点段落短暂高亮（JS 动态添加的 class，需 :deep 才能命中） */
:deep(.anchor-flash) {
  animation: anchor-flash 2.4s ease;
}
@keyframes anchor-flash {
  0%,
  60% {
    background: var(--accent-weak);
  }
  100% {
    background: transparent;
  }
}
.next-hint {
  display: block;
  margin: 2.2em auto 0;
  padding: 10px 22px;
  border: 1px solid var(--accent);
  border-radius: 22px;
  background: transparent;
  color: var(--accent);
  font-size: 0.85em;
  cursor: pointer;
}
.next-hint:hover {
  background: var(--accent-weak);
}
.end-mark {
  text-align: center;
  color: var(--fg-weak);
  margin-top: 3em;
  font-size: 0.9em;
  letter-spacing: 2px;
}
.reader-bottom {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 16px;
  padding-bottom: calc(8px + var(--safe-bottom));
  padding-left: calc(16px + var(--safe-left));
  padding-right: calc(16px + var(--safe-right));
  background: var(--topbar);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--panel-border);
}
.btn-nav {
  padding: 7px 14px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  cursor: pointer;
}
.btn-nav:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.btn-nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.reader-pos {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--fg-weak);
}
.pos-main {
  font-size: 13px;
  color: var(--fg);
  min-width: 64px;
  text-align: center;
}
.pos-chapter {
  font-size: 11px;
}
.pos-book {
  font-size: 11px;
  color: var(--accent);
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--accent-weak);
}
/* 字号快捷调节 */
.font-btn {
  padding: 3px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 7px;
  background: transparent;
  color: var(--fg-weak);
  font-size: 13px;
  line-height: 1.2;
  cursor: pointer;
  flex-shrink: 0;
}
.font-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
/* 触屏设备：中央点按切换工具栏显隐（桌面指针设备无此交互，工具栏常驻） */
@media (pointer: coarse) {
  .reader-top,
  .reader-bottom,
  .ai-fab {
    transition: transform 0.25s ease, opacity 0.25s ease;
  }
  .reader.bars-hidden .reader-top {
    transform: translateY(-100%);
    opacity: 0;
    pointer-events: none;
  }
  .reader.bars-hidden .reader-bottom {
    transform: translateY(100%);
    opacity: 0;
    pointer-events: none;
  }
  .reader.bars-hidden .ai-fab {
    opacity: 0;
    pointer-events: none;
  }
}
@media (max-width: 560px) {
  .scroll-inner {
    padding: 20px 16px 48px;
  }
  .reader.bookpage .scroll-inner {
    padding: 28px 20px 48px;
    margin: 16px 12px 32px;
  }
  /* 窄屏收缩：隐藏次要信息，防顶栏/底栏挤压溢出 */
  .title-chapter {
    display: none;
  }
  .reader-top {
    padding: 8px 10px;
    padding-top: calc(8px + var(--safe-top));
    padding-left: calc(10px + var(--safe-left));
    padding-right: calc(10px + var(--safe-right));
    gap: 4px;
  }
  .reader-bottom {
    padding: 6px 8px;
    padding-bottom: calc(6px + var(--safe-bottom));
    padding-left: calc(8px + var(--safe-left));
    padding-right: calc(8px + var(--safe-right));
    gap: 6px;
  }
  .pos-book {
    display: none;
  }
  .reader-pos {
    gap: 6px;
  }
  .reader-search input {
    width: 130px;
    /* 16px 起：iOS 聚焦输入框时不自动放大页面 */
    font-size: 16px;
  }
}
</style>
