<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

/** 欢迎引导（全屏）：每次打开应用弹出，用户可勾选「以后不再显示」记忆选择 */

const DISMISS_KEY = 'qingyue:welcome-dismissed'

const show = ref(false)
const neverAgain = ref(false)

onMounted(() => {
  // 未选择「不再显示」时每次打开都弹出
  show.value = localStorage.getItem(DISMISS_KEY) !== '1'
})

const router = useRouter()

function close(): void {
  if (neverAgain.value) localStorage.setItem(DISMISS_KEY, '1')
  show.value = false
}

function goImport(): void {
  close()
  router.push('/')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="welcome-mask">
      <div class="welcome-card">
        <header class="welcome-head">
          <span class="welcome-logo">阅</span>
          <div class="welcome-brand">
            <h1 class="welcome-title">欢迎使用轻阅</h1>
            <p class="welcome-sub">纯本地 · 开源 · 无广告的小说阅读器</p>
          </div>
        </header>

        <div class="welcome-features">
          <div class="feature">
            <span class="feature-icon">📖</span>
            <div class="feature-text">
              <b>导入即读</b>
              <span>拖入 TXT / EPUB 立刻开读，书籍与进度只存本机</span>
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon">🔍</span>
            <div class="feature-text">
              <b>在线书源</b>
              <span>内置演示与酷我书源；自备代理后可直接搜书（免费 Worker）</span>
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon">✨</span>
            <div class="feature-text">
              <b>AI 阅读助手</b>
              <span>防剧透问答、自动摘要、人物时间线（可选接入，支持本地模型）</span>
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon">📱</span>
            <div class="feature-text">
              <b>随身阅读</b>
              <span>安装到桌面 / Android App Beta 即将发布</span>
            </div>
          </div>
        </div>

        <label class="welcome-never">
          <input v-model="neverAgain" type="checkbox" />
          <span>以后打开不再显示引导</span>
        </label>

        <button class="btn btn-primary welcome-start" @click="goImport">开始使用</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.welcome-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
}
.welcome-card {
  width: min(92vw, 420px);
  max-height: 86vh;
  overflow-y: auto;
  padding: 24px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  box-shadow: var(--shadow);
  animation: welcome-in 0.25s ease;
}
@keyframes welcome-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.welcome-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}
.welcome-logo {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #4f7cff, #7b5cff);
  color: #fff;
  font-size: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.welcome-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.welcome-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--fg-weak);
}
.welcome-features {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}
.feature {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg);
  border: 1px solid var(--panel-border);
}
.feature-icon {
  font-size: 20px;
  line-height: 1.2;
}
.feature-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.feature-text b {
  font-size: 14px;
}
.feature-text span {
  color: var(--fg-weak);
  font-size: 12px;
  line-height: 1.5;
}
.welcome-never {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg-weak);
  margin: 0 0 14px;
  cursor: pointer;
}
.welcome-never input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}
.welcome-start {
  width: 100%;
}
</style>
