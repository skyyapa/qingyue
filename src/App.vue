<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'
import { emitOpenFiles, setupNativeBridge, syncReadingReminder, syncStatusBarTheme } from '@/capacitor'
import WelcomeGuide from '@/components/WelcomeGuide.vue'
import { App } from '@capacitor/app'

const settings = useSettingsStore()
const stats = useStatsStore()
const router = useRouter()

// 主题挂到 <html data-theme>，全局 CSS 变量随之切换；原生端同步状态栏
watch(
  () => settings.settings.theme,
  (theme) => {
    document.documentElement.dataset.theme = theme
    syncStatusBarTheme(theme)
  },
  { immediate: true }
)

// 每日阅读提醒（仅原生生效）：配置变化（开关/时间）时重调度本地通知
watch(
  () => settings.settings.readingReminder,
  (r) => void syncReadingReminder(r, stats.todaySeconds),
  { deep: true, immediate: true }
)

// 原生桥接（Web 端为空操作）：
// - 文件管理器「用轻阅打开」→ 回书架并交给导入对话框
// - 系统返回键 → 关面板（遮罩/抽屉/搜索条/AI 浮层）→ 后退 → 退出
setupNativeBridge({
  onOpenFile: async (file) => {
    if (router.currentRoute.value.path !== '/') await router.push('/')
    emitOpenFiles([file])
  },
  onBack: () => {
    const mask = document.querySelector('.mask') as HTMLElement | null
    if (mask) {
      mask.click()
      return
    }
    if (
      document.querySelector('.drawer') ||
      document.querySelector('.reader-search') ||
      document.querySelector('.ai-fab-panel')
    ) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      return
    }
    if (document.querySelector('.fab-menu')) {
      ;(document.querySelector('.fab-btn') as HTMLElement | null)?.click()
      return
    }
    if (router.currentRoute.value.path === '/') void App.exitApp()
    else void router.back()
  },
})
</script>

<template>
  <router-view />
  <WelcomeGuide />
</template>
