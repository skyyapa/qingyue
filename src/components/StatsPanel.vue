<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStatsStore } from '@/stores/stats'
import { buildMonthGrid, intensityLevel, toDateKey } from '@/utils/stats-calendar'
import { formatDuration } from '@/utils/progress'

/** 阅读统计面板：月度阅读日历热力图 + 汇总（数据仅来自本机） */
const emit = defineEmits<{ close: [] }>()
const stats = useStatsStore()

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth() + 1)

const isCurrentMonth = computed(
  () => viewYear.value === now.getFullYear() && viewMonth.value === now.getMonth() + 1
)
const monthLabel = computed(() => `${viewYear.value} 年 ${viewMonth.value} 月`)
const days = computed(() => buildMonthGrid(viewYear.value, viewMonth.value, stats.stats.byDate, now))
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
</style>
