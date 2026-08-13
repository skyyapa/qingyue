<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as db from '@/db'
import { useAnalysisStore } from '@/stores/analysis'
import type { Entity } from '@/types'

/** 选中正文文字后的悬浮工具条：查实体 / 加入知识库 */
const props = defineProps<{
  bookId: string
}>()
const emit = defineEmits<{ open: [entity: Entity] }>()

const analysis = useAnalysisStore()

const visible = ref(false)
const selectedText = ref('')
const match = ref<Entity | null>(null)
const pos = ref({ x: 0, y: 0 })
const loading = ref(false)

/** 在知识库中查找选中文字命中的实体（最长名匹配） */
async function lookup(text: string): Promise<Entity | null> {
  const entities = await db.listEntities(props.bookId)
  let best: Entity | null = null
  for (const e of entities) {
    if (e.name && text.includes(e.name)) {
      if (!best || e.name.length > best.name.length) best = e
    }
  }
  return best
}

function onMouseUp(e: MouseEvent): void {
  // 忽略面板/工具条内部的选择
  const target = e.target as HTMLElement
  if (target.closest('.mask, .selection-bar')) return
  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ''
  if (!text || text.length < 2 || text.length > 30) {
    visible.value = false
    return
  }
  const range = selection?.getRangeAt(0)
  const rect = range?.getBoundingClientRect()
  if (!rect) return
  selectedText.value = text
  pos.value = {
    x: Math.min(window.innerWidth - 200, Math.max(8, rect.left + rect.width / 2 - 100)),
    y: Math.max(8, rect.top - 44),
  }
  visible.value = true
  match.value = null
  loading.value = true
  lookup(text).then((m) => {
    match.value = m
    loading.value = false
  })
}

function onMouseDown(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest('.selection-bar')) {
    visible.value = false
  }
}

async function createEntity(): Promise<void> {
  const name = selectedText.value.replace(/\s+/g, '').slice(0, 12)
  if (!name) return
  const entity = await analysis.addCustomEntity(props.bookId, name, 'unknown')
  visible.value = false
  emit('open', entity)
}

function openMatch(): void {
  if (!match.value) return
  visible.value = false
  emit('open', match.value)
}

onMounted(() => {
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('mousedown', onMouseDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('mousedown', onMouseDown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="selection-bar" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
      <button v-if="loading" class="bar-btn" disabled>查找中…</button>
      <button v-else-if="match" class="bar-btn primary" @click="openMatch">
        查看「{{ match.name }}」
      </button>
      <template v-else>
        <button class="bar-btn primary" @click="createEntity">加入知识库</button>
        <span class="bar-tip">未匹配到现有实体</span>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.selection-bar {
  position: fixed;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  animation: pop-in 0.15s ease;
}
.bar-btn {
  padding: 5px 12px;
  border: none;
  border-radius: 7px;
  background: var(--accent-weak);
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.bar-btn:hover {
  background: var(--accent);
  color: #fff;
}
.bar-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.bar-tip {
  font-size: 11px;
  color: var(--fg-weak);
  white-space: nowrap;
}
</style>
