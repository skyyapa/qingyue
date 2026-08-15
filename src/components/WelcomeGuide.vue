<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

/**
 * 实时引导：欢迎卡 → 书架页逐个高亮关键入口（导入/搜索/书源/AI），
 * 气泡提示 + 下一步推进；全部完成或跳过则记忆不再显示。
 */

const DISMISS_KEY = 'qingyue:welcome-dismissed'

interface GuideStep {
  /** 目标元素 CSS 选择器（仅书架页存在） */
  selector: string
  title: string
  text: string
  /** 气泡相对目标的方位 */
  placement: 'top' | 'bottom' | 'right'
}

const STEPS: GuideStep[] = [
  { selector: '.shelf-top .btn-primary', title: '导入书籍', text: '支持 TXT / EPUB，可拖拽或选择文件，导入即读。', placement: 'bottom' },
  { selector: '.search-input', title: '在线搜索', text: '输入书名可搜索在线书源，一键加入书架。', placement: 'bottom' },
  { selector: 'button[title="书源管理"]', title: '书源管理', text: '管理代理与书源，配置代理后可搜真实小说站。', placement: 'bottom' },
  { selector: 'button[title^="AI"]', title: 'AI 阅读助手', text: '可选接入 AI（支持本地模型），防剧透问答与摘要。', placement: 'bottom' },
]

const route = useRoute()
const show = ref(false)
const phase = ref<'card' | 'guide' | 'done'>('card')
const stepIndex = ref(0)

// 目标元素位置（spotlight 高亮框 + 气泡锚点）
const targetRect = ref<DOMRect | null>(null)
const targetEl = ref<HTMLElement | null>(null)
const viewportWidth = ref(window.innerWidth)

const currentStep = computed(() => STEPS[stepIndex.value])

/** 是否在书架页（引导步骤只在书架页有意义） */
const onShelf = computed(() => route.path === '/')

function resetScroll(): void {
  window.scrollTo({ top: 0 })
}

/** 定位当前步骤目标：切到书架页后等 DOM 就绪再测量 */
async function locateTarget(): Promise<void> {
  await nextTick()
  const el = document.querySelector<HTMLElement>(currentStep.value.selector)
  targetEl.value = el ?? null
  targetRect.value = el ? el.getBoundingClientRect() : null
}

watch(
  () => [onShelf.value, stepIndex.value],
  async () => {
    if (phase.value !== 'guide' || !onShelf.value) {
      targetEl.value = null
      targetRect.value = null
      return
    }
    await locateTarget()
  }
)

function onResize(): void {
  viewportWidth.value = window.innerWidth
  if (phase.value === 'guide' && onShelf.value) void locateTarget()
}

onMounted(() => {
  // 已选择「不再显示」则不打扰
  show.value = localStorage.getItem(DISMISS_KEY) !== '1'
  window.addEventListener('resize', onResize)
  if (route.path !== '/') {
    // 非书架页（如分享导入直达）：先展示欢迎卡，仍可手动开始
    phase.value = 'card'
  }
})

onBeforeUnmount(() => window.removeEventListener('resize', onResize))

/** 开始实时引导（回到书架 + 第 0 步） */
async function startGuide(): Promise<void> {
  phase.value = 'guide'
  stepIndex.value = 0
  resetScroll()
  await locateTarget()
}

function finish(): void {
  localStorage.setItem(DISMISS_KEY, '1')
  phase.value = 'done'
  show.value = false
}

/** 跳过引导（不再记忆，下次还会提示） */
function skip(): void {
  phase.value = 'done'
  show.value = false
}

async function next(): Promise<void> {
  if (stepIndex.value < STEPS.length - 1) {
    stepIndex.value++
    resetScroll()
    await locateTarget()
  } else {
    finish()
  }
}
</script>

<template>
  <!-- 欢迎卡（首次打开，轻量居中，不遮内容） -->
  <Teleport to="body">
    <div v-if="show && phase === 'card'" class="welcome-mask">
      <div class="welcome-card">
        <header class="welcome-head">
          <span class="welcome-logo">阅</span>
          <div>
            <h1 class="welcome-title">欢迎使用轻阅</h1>
            <p class="welcome-sub">纯本地 · 开源 · 无广告的小说阅读器</p>
          </div>
        </header>
        <p class="welcome-brief">导入 TXT / EPUB 即开即读，数据只存本机；可选接入 AI 助手与在线书源。</p>
        <div class="welcome-actions">
          <button class="btn btn-primary" @click="startGuide">开始引导</button>
          <button class="btn btn-ghost" @click="skip">直接使用</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 实时引导：spotlight 高亮 + 气泡 -->
  <Teleport to="body">
    <div v-if="show && phase === 'guide' && onShelf && targetRect" class="guide-layer">
      <!-- 遮罩挖洞（spotlight） -->
      <div
        class="guide-spot"
        :style="{
          left: `${targetRect.left - 6}px`,
          top: `${targetRect.top - 6}px`,
          width: `${targetRect.width + 12}px`,
          height: `${targetRect.height + 12}px`,
        }"
      ></div>
      <!-- 气泡 -->
      <div
        class="guide-bubble"
        :style="{
          left: `${Math.min(viewportWidth - 320, Math.max(16, targetRect.left))}px`,
          top: `${targetRect.bottom + 14}px`,
        }"
      >
        <div class="guide-num">{{ stepIndex + 1 }} / {{ STEPS.length }}</div>
        <p class="guide-title">{{ currentStep.title }}</p>
        <p class="guide-text">{{ currentStep.text }}</p>
        <div class="guide-actions">
          <button class="btn btn-ghost guide-skip" @click="skip">跳过</button>
          <button class="btn btn-primary" @click="next">{{ stepIndex < STEPS.length - 1 ? '下一步' : '完成' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.welcome-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
}
.welcome-card {
  width: min(88vw, 360px);
  padding: 22px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 16px;
  box-shadow: var(--shadow);
  animation: guide-in 0.25s ease;
}
@keyframes guide-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.welcome-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.welcome-logo {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background: linear-gradient(135deg, #4f7cff, #7b5cff);
  color: #fff;
  font-size: 21px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.welcome-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}
.welcome-sub {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--fg-weak);
}
.welcome-brief {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--fg);
  line-height: 1.7;
}
.welcome-actions {
  display: flex;
  gap: 10px;
}
.welcome-actions .btn {
  flex: 1;
}

.guide-layer {
  position: fixed;
  inset: 0;
  z-index: 90;
  pointer-events: none;
}
.guide-spot {
  position: absolute;
  border-radius: 12px;
  background: transparent;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  pointer-events: none;
  transition: all 0.25s ease;
}
.guide-bubble {
  position: absolute;
  width: min(72vw, 300px);
  padding: 14px 16px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  pointer-events: auto;
  animation: guide-in 0.2s ease;
}
.guide-num {
  font-size: 11px;
  color: var(--fg-weak);
  margin-bottom: 4px;
}
.guide-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
}
.guide-text {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--fg);
  line-height: 1.6;
}
.guide-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.guide-skip {
  font-size: 12px;
}
</style>
