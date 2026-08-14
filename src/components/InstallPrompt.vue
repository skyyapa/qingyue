<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** PWA 安装引导条：捕获 beforeinstallprompt，一键安装；iOS 显示添加到主屏幕指引 */

const DISMISS_KEY = 'qingyue:install-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const show = ref(false)
const isIos = ref(false)
let deferred: BeforeInstallPromptEvent | null = null

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

onMounted(() => {
  if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return

  const onPrompt = (e: Event) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    show.value = true
  }
  const onInstalled = () => {
    show.value = false
  }
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)

  // iOS Safari 不支持 beforeinstallprompt，给出手动引导
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua) && !/CriOS|FxiOS|OPiOS/i.test(ua)) {
    isIos.value = true
    show.value = true
  }

  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  })
})

async function install(): Promise<void> {
  if (!deferred) return
  await deferred.prompt()
  show.value = false
}

function dismiss(): void {
  show.value = false
  localStorage.setItem(DISMISS_KEY, '1')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="install-bar">
      <div class="install-info">
        <span class="install-icon">📖</span>
        <div class="install-text">
          <p class="install-title">把「轻阅」装到桌面</p>
          <p class="install-sub">
            <template v-if="isIos">在 Safari 中点击「分享」→「添加到主屏幕」，像普通 App 一样使用</template>
            <template v-else>离线也能读，打开就像普通软件</template>
          </p>
        </div>
      </div>
      <div class="install-actions">
        <button v-if="!isIos" class="btn btn-primary install-btn" @click="install">安装</button>
        <button class="btn-ghost" title="不再提醒" @click="dismiss">✕</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.install-bar {
  position: fixed;
  left: 50%;
  bottom: calc(18px + var(--safe-bottom));
  transform: translateX(-50%);
  z-index: 70;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px 10px 12px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  animation: slide-up 0.25s ease;
  max-width: min(92vw, 460px);
}
@keyframes slide-up {
  from {
    opacity: 0;
    transform: translate(-50%, 12px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}
.install-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.install-icon {
  font-size: 22px;
}
.install-text {
  min-width: 0;
}
.install-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.install-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--fg-weak);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.install-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.install-btn {
  white-space: nowrap;
}
</style>
