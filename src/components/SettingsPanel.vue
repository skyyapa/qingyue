<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import type { FontName, ThemeName } from '@/types'

const emit = defineEmits<{ close: [] }>()
const settings = useSettingsStore()

const themes: { name: ThemeName; label: string; swatch: string }[] = [
  { name: 'default', label: '默认', swatch: '#f7f5f0' },
  { name: 'night', label: '夜间', swatch: '#17181c' },
  { name: 'eye', label: '护眼', swatch: '#cfe7cf' },
  { name: 'paper', label: '羊皮纸', swatch: '#f3ead6' },
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
          <div class="theme-row">
            <button
              v-for="t in themes"
              :key="t.name"
              class="theme-swatch"
              :class="{ active: settings.settings.theme === t.name }"
              :style="{ background: t.swatch }"
              :title="t.label"
              @click="settings.settings.theme = t.name"
            ></button>
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
        </section>
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
.theme-row {
  display: flex;
  gap: 14px;
}
.theme-swatch {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 2px solid var(--panel-border);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.theme-swatch.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-weak);
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
</style>
