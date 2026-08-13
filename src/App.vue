<script setup lang="ts">
import { watchEffect } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()

// 主题挂到 <html data-theme>，全局 CSS 变量随之切换
watchEffect(() => {
  document.documentElement.dataset.theme = settings.settings.theme
})
</script>

<template>
  <router-view />
</template>
