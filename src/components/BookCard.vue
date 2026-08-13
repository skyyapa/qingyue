<script setup lang="ts">
import { computed } from 'vue'
import { useBooksStore } from '@/stores/books'
import type { BookMeta } from '@/types'

const props = defineProps<{ book: BookMeta }>()
const emit = defineEmits<{ open: [id: string] }>()

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

const progressText = computed(() => `${props.book.progress.chapterIndex + 1} / ${props.book.chapterCount} 章`)
const progressPct = computed(() =>
  props.book.chapterCount > 0 ? Math.round(((props.book.progress.chapterIndex + 1) / props.book.chapterCount) * 100) : 0
)

function onRemove(): void {
  if (confirm(`确定删除《${props.book.title}》吗？阅读进度将一并清除。`)) {
    books.removeBook(props.book.id)
  }
}
</script>

<template>
  <article class="book-card" @click="emit('open', book.id)">
    <div class="cover" :style="coverStyle">
      <span class="cover-char">{{ firstChar }}</span>
      <button class="cover-del" title="删除书籍" @click.stop="onRemove">✕</button>
    </div>
    <div class="book-info">
      <h3 class="book-title" :title="book.title">{{ book.title }}</h3>
      <p class="book-author">{{ book.author }}</p>
      <div class="book-progress">
        <span class="progress-text">{{ progressText }}</span>
        <div class="progress-bar"><i :style="{ width: progressPct + '%' }" /></div>
      </div>
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
.cover {
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  user-select: none;
}
.cover-char {
  font-size: 52px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.cover-del {
  position: absolute;
  top: 6px;
  right: 6px;
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
.cover-del:hover {
  background: var(--danger);
}
.book-card:hover .cover-del {
  display: inline-flex;
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
  align-items: center;
  gap: 8px;
}
.progress-text {
  font-size: 11px;
  color: var(--fg-weak);
  flex-shrink: 0;
}
.progress-bar {
  flex: 1;
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
}
</style>
