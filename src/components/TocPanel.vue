<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  titles: string[]
  currentIndex: number
}>()
const emit = defineEmits<{ close: []; select: [index: number] }>()

const listEl = ref<HTMLElement>()

// 当前章变化时，将高亮项滚动到可见区域
watch(
  () => props.currentIndex,
  () => {
    listEl.value?.querySelector('.toc-item.current')?.scrollIntoView({ block: 'center' })
  },
  { flush: 'post' }
)
</script>

<template>
  <div class="mask mask-left" @click.self="emit('close')">
    <aside class="drawer toc">
      <header class="toc-head">
        <span>目录 · 共 {{ titles.length }} 章</span>
        <button class="btn-ghost" title="关闭" @click="emit('close')">✕</button>
      </header>
      <div ref="listEl" class="toc-list">
        <button
          v-for="(t, i) in titles"
          :key="i"
          class="toc-item"
          :class="{ current: i === currentIndex }"
          :title="t"
          @click="emit('select', i)"
        >
          <span class="toc-index">{{ i + 1 }}</span>
          <span class="toc-title">{{ t }}</span>
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.toc {
  width: min(86vw, 340px);
}
.toc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid var(--panel-border);
  flex-shrink: 0;
}
.toc-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px 24px;
}
.toc-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.toc-item:hover {
  background: var(--accent-weak);
}
.toc-item.current {
  background: var(--accent-weak);
  color: var(--accent);
  font-weight: 600;
}
.toc-index {
  font-size: 11px;
  color: var(--fg-weak);
  flex-shrink: 0;
}
.toc-item.current .toc-index {
  color: var(--accent);
}
.toc-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
