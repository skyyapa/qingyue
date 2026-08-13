<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'
import { bookReadPercent, formatPercent } from '@/utils/progress'
import TocPanel from '@/components/TocPanel.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import type { FontName } from '@/types'

const route = useRoute()
const router = useRouter()
const reader = useReaderStore()
const settings = useSettingsStore()
const stats = useStatsStore()

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

// 位置显示（滚动模式百分比 / 翻页模式页数）
const posPercent = ref('0%')
const pagePos = ref({ current: 1, total: 1 })

// 翻页模式列参数
const COL_GAP = 48
const pagedColWidth = computed(() => Math.min(600, Math.max(320, window.innerWidth - 96)))

const paragraphs = computed(() => {
  const text = reader.chapter?.text ?? ''
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
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

async function goChapter(index: number): Promise<void> {
  if (index === reader.chapterIndex) return
  const goingNext = index > reader.chapterIndex
  await reader.loadChapter(index)
  await restoreRatio(goingNext ? 0 : 1) // 下一章从顶部开始，上一章回到底部
  flushSave()
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
  const target =
    direction === 1
      ? Math.min(max, Math.ceil((el.scrollLeft + 1) / pageWidth) * pageWidth)
      : Math.max(0, Math.floor((el.scrollLeft - 1) / pageWidth) * pageWidth)
  el.scrollTo({ left: target, behavior: 'smooth' })
}

// ---------- 事件 ----------

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    showToc.value = false
    showSettings.value = false
    return
  }
  if (showToc.value || showSettings.value) return
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    if (pageMode.value === 'paged') scrollPaged(1)
    else goChapter(reader.chapterIndex + 1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (pageMode.value === 'paged') scrollPaged(-1)
    else goChapter(reader.chapterIndex - 1)
  }
}

function onVisibilityChange(): void {
  if (document.hidden) flushSave()
}

function onResize(): void {
  restoreRatio(readRatio())
}

// 章节变化后更新位置显示
watch(
  () => reader.chapter,
  async () => {
    posPercent.value = '0%'
    await nextTick()
    if (pageMode.value === 'paged') updatePagePos()
  }
)

// 设置（字号/行距/字体/翻页方式）变化后重排并尽量保持阅读位置
watch(
  () => [settings.settings.fontSize, settings.settings.lineHeight, settings.settings.font, settings.settings.pageMode],
  async () => {
    await nextTick()
    await restoreRatio(readRatio())
    if (pageMode.value === 'paged') updatePagePos()
  }
)

onMounted(async () => {
  await reader.openBook(bookId.value)
  await restoreRatio(reader.book?.progress.scrollRatio ?? 0)
  stats.startTracking() // 阅读计时
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  flushSave()
  stats.stopTracking()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div class="reader" :class="`reader-${pageMode}`">
    <header class="reader-top">
      <button class="icon-btn" title="返回书架" @click="router.push('/')">←</button>
      <div class="reader-title">
        <span class="title-book">{{ reader.book?.title }}</span>
        <span class="title-chapter">{{ reader.chapter?.title }}</span>
      </div>
      <button class="icon-btn" title="目录" @click="showToc = true">☰</button>
      <button class="icon-btn" title="阅读设置" @click="showSettings = true">⚙</button>
    </header>

    <main v-if="reader.loading" class="reader-body reader-tip">加载中…</main>
    <main v-else-if="reader.error" class="reader-body reader-tip">
      <p>{{ reader.error }}</p>
      <button class="btn" @click="router.push('/')">返回书架</button>
    </main>

    <!-- 连续滚动模式 -->
    <main v-else-if="pageMode === 'scroll'" ref="scrollArea" class="reader-body scroll-area" @scroll="scheduleSave">
      <div
        class="scroll-inner"
        :style="{ fontSize: settings.settings.fontSize + 'px', lineHeight: settings.settings.lineHeight, fontFamily: FONT_FAMILIES[settings.settings.font] }"
      >
        <h1 class="chapter-heading">{{ reader.chapter?.title }}</h1>
        <p v-for="(p, i) in paragraphs" :key="i" class="para">{{ p }}</p>
        <button v-if="hasNext && settings.settings.showNextHint" class="next-hint" @click="goChapter(reader.chapterIndex + 1)">
          下一章：{{ nextTitle }} →
        </button>
        <p v-if="!hasNext" class="end-mark">—— 全书完 ——</p>
      </div>
    </main>

    <!-- 翻页模式（CSS 多列，横向滚动） -->
    <main v-else ref="pagedArea" class="reader-body paged-area" @scroll="scheduleSave">
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
        <p v-for="(p, i) in paragraphs" :key="i" class="para">{{ p }}</p>
      </div>
    </main>

    <footer class="reader-bottom">
      <button class="btn-nav" :disabled="reader.chapterIndex <= 0" @click="goChapter(reader.chapterIndex - 1)">上一章</button>
      <span class="reader-pos">
        <span v-if="pageMode === 'scroll'" class="pos-main">{{ posPercent }}</span>
        <span v-else class="pos-main">{{ pagePos.current }} / {{ pagePos.total }} 页</span>
        <span class="pos-chapter">{{ reader.chapterIndex + 1 }} / {{ reader.chapterCount }} 章</span>
        <span class="pos-book" title="全书阅读占比">全书 {{ bookPercent }}</span>
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
  background: var(--topbar);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--panel-border);
  z-index: 10;
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
.reader-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--fg-weak);
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
.paged-content .chapter-heading {
  break-inside: avoid;
}
.chapter-heading {
  text-align: center;
  font-size: 1.15em;
  font-weight: 600;
  margin: 0 0 1.8em;
}
.para {
  margin: 0 0 1.2em;
  white-space: pre-wrap;
  overflow-wrap: break-word;
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
@media (max-width: 560px) {
  .scroll-inner {
    padding: 20px 16px 48px;
  }
}
</style>
