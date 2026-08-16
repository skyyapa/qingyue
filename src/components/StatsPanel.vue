<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStatsStore } from '@/stores/stats'
import { useBooksStore } from '@/stores/books'
import { useAIStore } from '@/stores/ai'
import { buildMonthGrid, intensityLevel, toDateKey } from '@/utils/stats-calendar'
import { formatDuration } from '@/utils/progress'
import { getTodayChapters } from '@/utils/reading-days'
import { runAITask } from '@/ai/assistant'

/** 阅读统计面板：月度阅读日历热力图 + 汇总 + 今日回顾（AI 可选） */
const emit = defineEmits<{ close: [] }>()
const stats = useStatsStore()
const books = useBooksStore()
const ai = useAIStore()

// 「今日」随时间变化：面板长开跨零点时需刷新 now 与今日章节，
// 否则「是否当前月/今日阅读/连续天数」会显示过期值。
const now = ref(new Date())
const viewYear = ref(now.value.getFullYear())
const viewMonth = ref(now.value.getMonth() + 1)

const isCurrentMonth = computed(
  () => viewYear.value === now.value.getFullYear() && viewMonth.value === now.value.getMonth() + 1
)
const monthLabel = computed(() => `${viewYear.value} 年 ${viewMonth.value} 月`)
const days = computed(() => buildMonthGrid(viewYear.value, viewMonth.value, stats.stats.byDate, now.value))

/** 跨日刷新：页面重新可见或定时（每分钟）时更新 now 与今日章节 */
function refreshClock(): void {
  const next = new Date()
  const changedDay = next.toDateString() !== now.value.toDateString()
  now.value = next
  if (changedDay) todayChapters.value = getTodayChapters() // 今日章节按新日期重读
}
let clockTimer: number | undefined
const CLOCK_INTERVAL = 60_000
function onClockVisibility(): void {
  if (document.visibilityState === 'visible') refreshClock()
}
onMounted(() => {
  document.addEventListener('visibilitychange', onClockVisibility)
  refreshClock()
  clockTimer = window.setInterval(refreshClock, CLOCK_INTERVAL)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onClockVisibility)
  if (clockTimer !== undefined) window.clearInterval(clockTimer)
  clockTimer = undefined
})
const monthTotal = computed(() => {
  const prefix = toDateKey(new Date(viewYear.value, viewMonth.value - 1, 1)).slice(0, 7)
  let sec = 0
  for (const [k, v] of Object.entries(stats.stats.byDate)) {
    if (k.startsWith(prefix)) sec += v
  }
  return sec
})

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function prevMonth(): void {
  if (viewMonth.value === 1) {
    viewMonth.value = 12
    viewYear.value--
  } else {
    viewMonth.value--
  }
}

function nextMonth(): void {
  if (isCurrentMonth.value) return
  if (viewMonth.value === 12) {
    viewMonth.value = 1
    viewYear.value++
  } else {
    viewMonth.value++
  }
}

// ---------- 今日回顾（记录今日读过章节，可选 AI 生成总结） ----------

const todayChapters = ref<Record<string, number[]>>(getTodayChapters())
const dailyBusy = ref(false)
const dailyAnswer = ref('')
const dailyError = ref('')

const todayChapterCount = computed(() =>
  Object.values(todayChapters.value).reduce((a, list) => a + list.length, 0)
)

/** 最近在读的书（今日读过章节数最多者） */
const topBook = computed(() => {
  let best: { id: string; count: number } | null = null
  for (const [id, list] of Object.entries(todayChapters.value)) {
    if (!best || list.length > best.count) best = { id, count: list.length }
  }
  return best
})

/** AI 生成今日阅读回顾 */
async function generateDailyRecap(): Promise<void> {
  const provider = ai.activeProvider
  if (!provider || !topBook.value) return
  dailyBusy.value = true
  dailyError.value = ''
  dailyAnswer.value = ''
  try {
    const bookId = topBook.value.id
    const chapters = todayChapters.value[bookId] ?? []
    const last = chapters[chapters.length - 1] ?? 0
    dailyAnswer.value = await runAITask(provider, bookId, 'daily', {
      chapterIndex: last,
      todayChapters: chapters,
    })
  } catch (err) {
    dailyError.value = err instanceof Error ? err.message : String(err)
  } finally {
    dailyBusy.value = false
  }
}

/** AI 回答受控渲染（**粗体**、换行） */
function renderDaily(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal stats-modal">
      <header class="stats-head">
        <span>阅读统计</span>
        <button class="btn-ghost" title="关闭" @click="emit('close')">✕</button>
      </header>

      <div class="cal-nav">
        <button class="cal-nav-btn" aria-label="上个月" title="上个月" @click="prevMonth">◀</button>
        <b class="cal-month">{{ monthLabel }}</b>
        <button class="cal-nav-btn" aria-label="下个月" title="下个月" :disabled="isCurrentMonth" @click="nextMonth">▶</button>
      </div>

      <div class="cal-grid">
        <span v-for="w in WEEK_LABELS" :key="w" class="cal-week">{{ w }}</span>
        <span
          v-for="d in days"
          :key="d.date"
          class="cal-day"
          :class="[`lv-${intensityLevel(d.minutes)}`, { dim: !d.inMonth, today: d.isToday }]"
          :title="`${d.date} · ${d.minutes} 分钟`"
        >
          {{ d.day }}
        </span>
      </div>
      <p class="cal-legend">颜色越深 = 当天读得越久（分钟）</p>

      <div class="cal-summary">
        <span class="sum-item">本月 <b>{{ formatDuration(monthTotal) }}</b></span>
        <span class="sum-item">今日 <b>{{ formatDuration(stats.todaySeconds) }}</b></span>
        <span class="sum-item">连续 <b>{{ stats.streak }} 天</b></span>
        <span class="sum-item">累计 <b>{{ formatDuration(stats.totalSeconds) }}</b></span>
      </div>

      <!-- 今日回顾 -->
      <div class="daily-view">
        <p class="daily-title">📖 今日读过 {{ todayChapterCount }} 章</p>
        <div v-if="todayChapterCount > 0" class="daily-books">
          <p v-for="[bookId, list] in Object.entries(todayChapters)" :key="bookId" class="daily-book">
            <b>{{ books.books.find((b) => b.id === bookId)?.title ?? '未知书籍' }}</b>
            <span>第 {{ list[0] + 1 }}–{{ list[list.length - 1] + 1 }} 章（{{ list.length }} 章）</span>
          </p>
        </div>
        <template v-if="ai.activeProvider && topBook">
          <button class="btn daily-btn" :disabled="dailyBusy" @click="generateDailyRecap">
            {{ dailyBusy ? '✨ 回顾生成中…' : '✨ 生成今日阅读回顾（AI）' }}
          </button>
          <!-- eslint-disable-next-line vue/no-v-html -- renderDaily 先转义、内容受控 -->
          <p v-if="dailyAnswer" class="daily-answer" v-html="renderDaily(dailyAnswer)"></p>
          <p v-else-if="dailyError" class="daily-error">{{ dailyError }}</p>
        </template>
        <p v-else-if="todayChapterCount > 0 && !ai.activeProvider" class="daily-tip">
          在书架顶栏「AI」配置 Provider 后可生成今日阅读回顾
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-modal {
  width: min(92vw, 380px);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
}
.cal-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
.cal-month {
  min-width: 110px;
  text-align: center;
  font-size: 14px;
}
.cal-nav-btn {
  padding: 4px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 7px;
  background: transparent;
  color: var(--fg);
  cursor: pointer;
  font-size: 12px;
}
.cal-nav-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.cal-nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
}
.cal-week {
  font-size: 11px;
  color: var(--fg-weak);
  text-align: center;
  padding: 3px 0;
}
.cal-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
}
.cal-day.dim {
  color: var(--fg-weak);
  opacity: 0.35;
}
.cal-day.today {
  box-shadow: inset 0 0 0 2px var(--accent);
}
.cal-day.lv-1 {
  background: var(--accent-weak);
  opacity: 0.5;
}
.cal-day.lv-2 {
  background: var(--accent-weak);
}
.cal-day.lv-3 {
  background: var(--accent);
  color: #fff;
}
.cal-day.lv-4 {
  background: var(--accent);
  color: #fff;
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.15);
}
.cal-legend {
  margin: -4px 0 0;
  font-size: 11px;
  color: var(--fg-weak);
  text-align: center;
}
.cal-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--panel-border);
}
.sum-item {
  font-size: 12px;
  color: var(--fg-weak);
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 10px;
  text-align: center;
}
.sum-item b {
  color: var(--accent);
}
/* 今日回顾 */
.daily-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--panel-border);
}
.daily-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}
.daily-books {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.daily-book {
  margin: 0;
  font-size: 12px;
  color: var(--fg-weak);
}
.daily-book b {
  color: var(--fg);
  margin-right: 6px;
}
.daily-btn {
  align-self: flex-start;
  font-size: 12px;
}
.daily-answer {
  margin: 0;
  font-size: 13px;
  line-height: 1.9;
  color: var(--fg);
  background: var(--accent-weak);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 10px 12px;
}
.daily-answer b {
  color: var(--accent);
}
.daily-error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
.daily-tip {
  margin: 0;
  font-size: 11px;
  color: var(--fg-weak);
}
</style>
