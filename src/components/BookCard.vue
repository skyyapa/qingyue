<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBooksStore } from '@/stores/books'
import { bookReadPercent, formatPercent } from '@/utils/progress'
import type { BookMeta } from '@/types'

const props = defineProps<{ book: BookMeta }>()
const emit = defineEmits<{
  open: [id: string]
  remove: [book: BookMeta]
  move: [group: string]
  analyze: []
  resetProgress: []
  dragstart: [book: BookMeta]
  dragover: [book: BookMeta]
  dragend: []
}>()

const books = useBooksStore()

/** 由书名生成稳定的渐变色封面（无图片资源依赖） */
const coverStyle = computed(() => {
  let hash = 0
  for (const ch of props.book.title) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  const hue = hash % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue} 42% 44%), hsl(${(hue + 55) % 360} 48% 30%))`,
  }
})

const firstChar = computed(() => [...props.book.title][0] ?? '书')

const readPercent = computed(() => bookReadPercent(props.book))
const progressText = computed(
  () => `第 ${props.book.progress.chapterIndex + 1}/${props.book.chapterCount} 章 · ${formatPercent(readPercent.value)}`
)

// 移动到分组的小菜单
const menuOpen = ref(false)

function onMove(group: string): void {
  menuOpen.value = false
  emit('move', group)
}
</script>

<template>
  <article
    class="book-card"
    draggable="true"
    @click="emit('open', book.id)"
    @dragstart="emit('dragstart', book)"
    @dragover.prevent="emit('dragover', book)"
    @dragend="emit('dragend')"
  >
    <div class="cover" :style="coverStyle">
      <span class="cover-char">{{ firstChar }}</span>
      <div class="cover-actions" @click.stop>
        <button
          class="cover-btn"
          :title="book.source === 'web' ? '分析知识库（基于已缓存的章节）' : '分析知识库（人物/设定/关系图）'"
          @click="emit('analyze')"
        >析</button>
        <button class="cover-btn" title="移动到分组" @click="menuOpen = !menuOpen">⋯</button>
        <button class="cover-btn danger" title="删除书籍" @click="emit('remove', book)">✕</button>
        <div v-if="menuOpen" class="move-menu" @click.stop>
          <p class="move-menu-title">移动到分组</p>
          <button class="move-item" :class="{ active: book.group === '' }" @click="onMove('')">默认</button>
          <button
            v-for="g in books.groups"
            :key="g"
            class="move-item"
            :class="{ active: book.group === g }"
            @click="onMove(g)"
          >
            {{ g }}
          </button>
          <hr class="menu-divider" />
          <button class="move-item danger" title="回到第一章重新阅读" @click="menuOpen = false; emit('resetProgress')">
            重置阅读进度
          </button>
        </div>
      </div>
    </div>
    <div class="book-info">
      <h3 class="book-title" :title="book.title">{{ book.title }}</h3>
      <p class="book-author">{{ book.author }}</p>
      <div class="book-progress">
        <span class="progress-text">{{ progressText }}</span>
        <div class="progress-bar"><i :style="{ width: Math.min(100, readPercent) + '%' }" /></div>
      </div>
      <div v-if="book.analysis?.status === 'running'" class="analysis-mini">
        <i :style="{ width: Math.max(2, (book.analysis.progress ?? 0) * 100) + '%' }" />
      </div>
      <p v-else-if="book.analysis?.status === 'done'" class="analysis-done">
        已分析 {{ book.analysis.entityCount }} 实体
      </p>
      <p v-else-if="book.analysis?.status === 'error'" class="analysis-error">分析失败 · 点击重试</p>
    </div>
  </article>
</template>

<style scoped>
.book-card {
  cursor: pointer;
  transition: transform 0.15s ease;
}
.book-card:hover {
  transform: translateY(-3px);
}
.book-card.dragging {
  opacity: 0.4;
}
.cover {
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  overflow: visible;
  user-select: none;
}
.cover-char {
  font-size: 52px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.cover-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  z-index: 2;
}
.cover-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
}
.cover-btn:hover {
  background: rgba(0, 0, 0, 0.55);
}
.cover-btn:disabled {
  display: none;
}
.cover-btn.danger:hover {
  background: var(--danger);
}
.book-card:hover .cover-btn {
  display: inline-flex;
}
.move-menu {
  position: absolute;
  top: 30px;
  right: 0;
  min-width: 132px;
  padding: 8px;
  border-radius: 10px;
  background: var(--panel);
  color: var(--fg);
  box-shadow: var(--shadow);
  border: 1px solid var(--panel-border);
  z-index: 5;
}
.move-menu-title {
  margin: 0 6px 6px;
  font-size: 11px;
  color: var(--fg-weak);
}
.move-item {
  display: block;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.move-item:hover {
  background: var(--accent-weak);
}
.move-item.active {
  color: var(--accent);
  font-weight: 600;
}
.menu-divider {
  border: none;
  border-top: 1px solid var(--panel-border);
  margin: 5px 2px;
}
.move-item.danger {
  color: var(--danger);
}
.move-item.danger:hover {
  background: var(--danger);
  color: #fff;
}
.book-info {
  padding: 10px 4px 0;
}
.book-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-author {
  margin: 3px 0 8px;
  font-size: 12px;
  color: var(--fg-weak);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-progress {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.progress-text {
  font-size: 11px;
  color: var(--fg-weak);
}
.progress-bar {
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: var(--panel-border);
  overflow: hidden;
}
.progress-bar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 0.3s ease;
}
.analysis-mini {
  margin-top: 6px;
  height: 3px;
  border-radius: 2px;
  background: var(--panel-border);
  overflow: hidden;
}
.analysis-mini i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 0.2s ease;
}
.analysis-done {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--accent);
}
.analysis-error {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--danger);
}
</style>
