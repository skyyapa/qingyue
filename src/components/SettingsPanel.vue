<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { FontName, ThemeName } from '@/types'

const emit = defineEmits<{ close: [] }>()
const settings = useSettingsStore()

/** 提醒时间 <input type="time"> 的 HH:MM 双向绑定（小时/分钟分开存） */
const reminderTime = computed<string>({
  get: () => {
    const r = settings.settings.readingReminder
    return `${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}`
  },
  set: (v) => {
    const m = /^(\d{2}):(\d{2})$/.exec(v)
    if (!m) return
    const hour = Number(m[1])
    const minute = Number(m[2])
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      settings.settings.readingReminder.hour = hour
      settings.settings.readingReminder.minute = minute
    }
  },
})

const themes: { name: ThemeName; label: string; swatch: string; accent: string }[] = [
  { name: 'default', label: '默认', swatch: '#f7f5f0', accent: '#4f7cff' },
  { name: 'pure', label: '极简白', swatch: '#ffffff', accent: '#2f6fed' },
  { name: 'paper', label: '羊皮纸', swatch: '#f3ead6', accent: '#a0703c' },
  { name: 'celadon', label: '青瓷', swatch: '#e6f0ec', accent: '#2f8f78' },
  { name: 'eye', label: '护眼', swatch: '#cfe7cf', accent: '#3d8b3d' },
  { name: 'pink', label: '樱花粉', swatch: '#fdeef1', accent: '#d75f84' },
  { name: 'night', label: '夜间', swatch: '#17181c', accent: '#6d95ff' },
  { name: 'ocean', label: '深蓝', swatch: '#1b2334', accent: '#7aa0ff' },
  { name: 'pine', label: '墨绿', swatch: '#1e2a23', accent: '#7fbfa2' },
  { name: 'graphite', label: '石墨', swatch: '#26282c', accent: '#9aa5b1' },
]

const fonts: { name: FontName; label: string }[] = [
  { name: 'system', label: '系统字体' },
  { name: 'song', label: '宋体' },
  { name: 'hei', label: '黑体' },
  { name: 'kai', label: '楷体' },
  { name: 'serif', label: '衬线体' },
]
</script>

<template>
  <div class="mask mask-right" @click.self="emit('close')">
    <aside class="drawer settings">
      <header class="settings-head">
        <span>阅读设置</span>
        <button class="btn-ghost" title="关闭" @click="emit('close')">✕</button>
      </header>

      <div class="settings-body">
        <section class="setting-group">
          <label class="setting-row">
            <span>字号</span>
            <input v-model.number="settings.settings.fontSize" type="range" min="14" max="28" step="1" />
            <b class="setting-value">{{ settings.settings.fontSize }}px</b>
          </label>
          <label class="setting-row">
            <span>行距</span>
            <input v-model.number="settings.settings.lineHeight" type="range" min="1.4" max="2.4" step="0.1" />
            <b class="setting-value">{{ settings.settings.lineHeight.toFixed(1) }}</b>
          </label>
        </section>

        <section class="setting-group">
          <p class="group-title">主题</p>
          <div class="theme-grid">
            <button
              v-for="t in themes"
              :key="t.name"
              class="theme-card"
              :class="{ active: settings.settings.theme === t.name }"
              @click="settings.settings.theme = t.name"
            >
              <span class="theme-preview" :style="{ background: t.swatch }">
                <i class="theme-dot" :style="{ background: t.accent }"></i>
              </span>
              <span class="theme-label">{{ t.label }}</span>
            </button>
          </div>
        </section>

        <section class="setting-group">
          <p class="group-title">书页效果</p>
          <div class="chip-row">
            <button
              class="chip"
              :class="{ active: settings.settings.bookPage }"
              @click="settings.settings.bookPage = true"
            >
              拟真书页
            </button>
            <button
              class="chip"
              :class="{ active: !settings.settings.bookPage }"
              @click="settings.settings.bookPage = false"
            >
              简洁
            </button>
          </div>
        </section>

        <section class="setting-group">
          <p class="group-title">字体</p>
          <div class="chip-row">
            <button
              v-for="f in fonts"
              :key="f.name"
              class="chip"
              :class="{ active: settings.settings.font === f.name }"
              @click="settings.settings.font = f.name"
            >
              {{ f.label }}
            </button>
          </div>
        </section>

        <section class="setting-group">
          <p class="group-title">翻页方式</p>
          <div class="chip-row">
            <button
              class="chip"
              :class="{ active: settings.settings.pageMode === 'scroll' }"
              @click="settings.settings.pageMode = 'scroll'"
            >
              连续滚动
            </button>
            <button
              class="chip"
              :class="{ active: settings.settings.pageMode === 'paged' }"
              @click="settings.settings.pageMode = 'paged'"
            >
              翻页
            </button>
          </div>
        </section>

        <section class="setting-group">
          <label class="setting-row">
            <span>章末「下一章」入口</span>
            <input v-model="settings.settings.showNextHint" type="checkbox" />
          </label>
          <label class="setting-row">
            <span>自动章节摘要（AI）</span>
            <input v-model="settings.settings.aiChapterSummary" type="checkbox" />
          </label>
        </section>

        <section class="setting-group">
          <p class="group-title">每日阅读提醒（Android）</p>
          <label class="setting-row">
            <span>开启每日提醒</span>
            <input v-model="settings.settings.readingReminder.enabled" type="checkbox" />
          </label>
          <label v-if="settings.settings.readingReminder.enabled" class="setting-row">
            <span>提醒时间</span>
            <input
              v-model="reminderTime"
              type="time"
              class="reminder-time"
              min="00:00"
              max="23:59"
            />
          </label>
          <p class="group-hint">每天到点提醒阅读；仅在 Android App 中生效（Web 端忽略）</p>
        </section>

        <button class="btn reset-btn" @click="settings.resetSettings()">恢复默认设置</button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid var(--panel-border);
  flex-shrink: 0;
}
.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 18px 28px;
}
.setting-group {
  padding: 14px 0;
  border-bottom: 1px solid var(--panel-border);
}
.setting-group:last-child {
  border-bottom: none;
}
.group-title {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--fg-weak);
}
.setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  margin-bottom: 12px;
}
.setting-row:last-child {
  margin-bottom: 0;
}
.setting-row input[type='range'] {
  flex: 1;
  accent-color: var(--accent);
}
.setting-row input[type='checkbox'] {
  accent-color: var(--accent);
  width: 17px;
  height: 17px;
}
.setting-value {
  min-width: 44px;
  text-align: right;
  font-weight: 600;
  font-size: 13px;
  color: var(--accent);
}
.reminder-time {
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--fg);
  font-size: 13px;
  padding: 5px 8px;
  outline: none;
}
.reminder-time:focus {
  border-color: var(--accent);
}
.group-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--fg-weak);
  line-height: 1.6;
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.theme-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
  padding: 6px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
}
.theme-card:hover {
  border-color: var(--accent);
}
.theme-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-weak);
}
.theme-preview {
  position: relative;
  height: 40px;
  border-radius: 7px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.theme-dot {
  position: absolute;
  right: 7px;
  bottom: 7px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
}
.theme-label {
  font-size: 12px;
  color: var(--fg);
  text-align: center;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.chip {
  padding: 7px 14px;
  border-radius: 20px;
  border: 1px solid var(--panel-border);
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.reset-btn {
  width: 100%;
  margin-top: 14px;
}
@media (max-width: 560px) {
  /* 16px 起：iOS 聚焦输入框时不自动放大页面 */
  .reminder-time {
    font-size: 16px;
  }
}
</style>
