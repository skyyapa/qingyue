<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useBooksStore, type SortMode } from '@/stores/books'
import { useStatsStore } from '@/stores/stats'
import { formatDuration } from '@/utils/progress'
import BookCard from '@/components/BookCard.vue'
import ImportDialog from '@/components/ImportDialog.vue'
import AppDialog from '@/components/AppDialog.vue'
import BackupDialog from '@/components/BackupDialog.vue'
import type { BookMeta } from '@/types'

const books = useBooksStore()
const stats = useStatsStore()
const router = useRouter()

const showImport = ref(false)
const showBackup = ref(false)
const dragging = ref(false)

/** 应用内对话框（替代原生 confirm/prompt） */
interface DialogState {
  title: string
  message: string
  input?: boolean
  danger?: boolean
  confirmText?: string
  onConfirm: (value: string) => void
}
const dialog = ref<DialogState | null>(null)

/** 当前分组标签：null = 全部，'' = 默认分组，其他 = 分组名 */
const activeTab = ref<string | null>(null)
const searchQuery = ref('')

const sortOptions: { value: SortMode; label: string }[] = [
  { value: 'recent', label: '最近阅读' },
  { value: 'imported', label: '最近导入' },
  { value: 'title', label: '书名' },
  { value: 'manual', label: '手动排序' },
]

onMounted(() => {
  if (!books.loaded) books.refresh()
})

function openBook(id: string): void {
  router.push(`/reader/${id}`)
}

function onImported(id: string | null): void {
  showImport.value = false
  if (id) openBook(id)
}

// 拖拽导入
async function onDrop(e: DragEvent): Promise<void> {
  e.preventDefault()
  dragging.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const meta = await books.importFiles(files)
  if (meta) openBook(meta.id)
}

// ---------- 分组 ----------

function createGroup(): void {
  dialog.value = {
    title: '新建分组',
    message: '输入分组名称',
    input: true,
    confirmText: '创建',
    onConfirm: (name) => {
      if (books.createGroup(name)) activeTab.value = name
    },
  }
}

function deleteGroup(name: string): void {
  dialog.value = {
    title: '删除分组',
    message: `删除分组「${name}」？组内书籍将回到默认分组。`,
    danger: true,
    confirmText: '删除',
    onConfirm: () => {
      books.removeGroup(name)
      if (activeTab.value === name) activeTab.value = null
    },
  }
}

function confirmRemoveBook(book: BookMeta): void {
  dialog.value = {
    title: '删除书籍',
    message: `确定删除《${book.title}》吗？阅读进度将一并清除。`,
    danger: true,
    confirmText: '删除',
    onConfirm: () => books.removeBook(book.id),
  }
}

// ---------- 过滤与排序 ----------

const visibleBooks = computed<BookMeta[]>(() => {
  let list = books.books
  if (activeTab.value !== null) {
    list = list.filter((b) => b.group === activeTab.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
  }
  list = [...list]

  const mode = books.sortMode
  if (mode === 'manual') {
    // 分组内手动顺序优先；没有记录时退回最近导入
    const order = books.groupOrder[activeTab.value ?? ''] ?? []
    const pos = new Map(order.map((id, i) => [id, i]))
    list.sort((a, b) => {
      const pa = pos.get(a.id)
      const pb = pos.get(b.id)
      if (pa !== undefined && pb !== undefined) return pa - pb
      if (pa !== undefined) return -1
      if (pb !== undefined) return 1
      return b.createdAt - a.createdAt
    })
  } else if (mode === 'recent') {
    list.sort((a, b) => b.progress.updatedAt - a.progress.updatedAt)
  } else if (mode === 'imported') {
    list.sort((a, b) => b.createdAt - a.createdAt)
  } else if (mode === 'title') {
    list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
  }
  return list
})

// ---------- 拖拽手动排序 ----------

const draggingId = ref<string | null>(null)

function onDragStart(book: BookMeta): void {
  draggingId.value = book.id
  // 首次拖拽时进入手动排序，并以当前可见顺序初始化
  if (books.sortMode !== 'manual') {
    books.sortMode = 'manual'
    books.initGroupOrder(activeTab.value ?? '', visibleBooks.value.map((b) => b.id))
  }
}

function onDragOver(target: BookMeta): void {
  if (draggingId.value && draggingId.value !== target.id) {
    books.swapOrder(activeTab.value ?? '', draggingId.value, target.id)
  }
}

function onDragEnd(): void {
  draggingId.value = null
}

const emptyText = computed(() => {
  if (activeTab.value !== null && books.books.length > 0) {
    return { icon: '📚', title: '该分组还没有书籍', sub: '在书籍卡片上点击 ⋯，选择「移动到分组」即可归类' }
  }
  return { icon: '📖', title: '书架还是空的', sub: '点击右上角「导入书籍」，或直接把 TXT / EPUB 文件拖进页面' }
})
</script>

<template>
  <div class="shelf" :class="{ dragging }">
    <header class="shelf-top">
      <div class="brand">
        <span class="brand-logo">阅</span>
        <span class="brand-name">轻阅</span>
        <span class="brand-sub">QingYue</span>
      </div>
      <div class="shelf-stats" title="阅读统计（仅保存在本机）">
        <span class="stat-chip">今日 {{ formatDuration(stats.todaySeconds) }}</span>
        <span v-if="stats.streak > 0" class="stat-chip">连续 {{ stats.streak }} 天</span>
        <span class="stat-chip stat-total">累计 {{ formatDuration(stats.totalSeconds) }}</span>
      </div>
      <input v-model="searchQuery" class="search-input" type="search" placeholder="搜索书名 / 作者" />
      <button class="btn btn-ghost-icon" title="数据备份（导出/导入）" @click="showBackup = true">⇅</button>
      <button class="btn btn-primary" @click="showImport = true">＋ 导入书籍</button>
    </header>

    <nav class="group-bar">
      <div class="group-tabs">
        <button class="group-tab" :class="{ active: activeTab === null }" @click="activeTab = null">全部</button>
        <button class="group-tab" :class="{ active: activeTab === '' }" @click="activeTab = ''">默认</button>
        <span v-for="g in books.groups" :key="g" class="group-tab-wrap">
          <button class="group-tab" :class="{ active: activeTab === g }" @click="activeTab = g">{{ g }}</button>
          <button class="group-tab-del" title="删除分组" @click.stop="deleteGroup(g)">✕</button>
        </span>
        <button class="group-tab group-tab-new" title="新建分组" @click="createGroup">＋ 分组</button>
      </div>
      <select v-model="books.sortMode" class="sort-select" title="排序方式">
        <option v-for="o in sortOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </nav>

    <main class="shelf-main" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop="onDrop">
      <div v-if="!books.loaded" class="shelf-tip">加载中…</div>

      <div v-else-if="visibleBooks.length === 0" class="shelf-empty">
        <p class="shelf-empty-icon">{{ emptyText.icon }}</p>
        <p class="shelf-empty-title">{{ emptyText.title }}</p>
        <p class="shelf-empty-sub">{{ emptyText.sub }}</p>
      </div>

      <div v-else class="shelf-grid">
        <BookCard
          v-for="b in visibleBooks"
          :key="b.id"
          :book="b"
          :class="{ dragging: draggingId === b.id }"
          @open="openBook"
          @remove="confirmRemoveBook"
          @move="(g) => books.moveBook(b.id, g)"
          @dragstart="onDragStart"
          @dragover="onDragOver"
          @dragend="onDragEnd"
        />
      </div>
    </main>

    <div v-if="dragging" class="drop-overlay">松开鼠标导入书籍</div>

    <ImportDialog v-if="showImport" @close="showImport = false" @imported="onImported" />
    <BackupDialog v-if="showBackup" @close="showBackup = false" @imported="books.refresh" />
    <AppDialog
      v-if="dialog"
      :title="dialog.title"
      :message="dialog.message"
      :input="dialog.input"
      :danger="dialog.danger"
      :confirm-text="dialog.confirmText"
      @confirm="(v) => { dialog?.onConfirm(v); dialog = null }"
      @cancel="dialog = null"
    />
  </div>
</template>

<style scoped>
.shelf {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.shelf-top {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 24px;
  background: var(--topbar);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--panel-border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.brand-logo {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: linear-gradient(135deg, #4f7cff, #7b5cff);
  color: #fff;
  font-size: 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.brand-name {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 1px;
}
.brand-sub {
  font-size: 12px;
  color: var(--fg-weak);
  letter-spacing: 0.5px;
  padding-top: 3px;
}
.shelf-stats {
  display: flex;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}
.stat-chip {
  font-size: 12px;
  color: var(--accent);
  background: var(--accent-weak);
  padding: 4px 10px;
  border-radius: 20px;
  white-space: nowrap;
}
.stat-total {
  color: var(--fg-weak);
  background: transparent;
  border: 1px solid var(--panel-border);
}
.search-input {
  width: 170px;
  padding: 7px 12px;
  border-radius: 20px;
  border: 1px solid var(--panel-border);
  background: var(--panel);
  color: var(--fg);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.search-input:focus {
  border-color: var(--accent);
}
.btn-ghost-icon {
  padding: 7px 12px;
  flex-shrink: 0;
}
.group-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--panel-border);
}
.group-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  flex: 1;
  scrollbar-width: none;
}
.group-tabs::-webkit-scrollbar {
  display: none;
}
.group-tab-wrap {
  position: relative;
  display: inline-flex;
}
.group-tab {
  padding: 6px 14px;
  border-radius: 18px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-weak);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.group-tab:hover {
  color: var(--fg);
  background: var(--panel);
}
.group-tab.active {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}
.group-tab-new {
  border: 1px dashed var(--panel-border);
  color: var(--fg-weak);
}
.group-tab-new:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.group-tab-del {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: var(--danger);
  color: #fff;
  font-size: 9px;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.group-tab-wrap:hover .group-tab-del {
  display: inline-flex;
}
.sort-select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--panel);
  color: var(--fg);
  font-size: 13px;
  outline: none;
  flex-shrink: 0;
}
.shelf-main {
  flex: 1;
  padding: 28px 24px 48px;
}
.shelf-tip {
  text-align: center;
  color: var(--fg-weak);
  padding-top: 80px;
}
.shelf-empty {
  text-align: center;
  padding-top: 90px;
  color: var(--fg-weak);
}
.shelf-empty-icon {
  font-size: 56px;
  margin: 0 0 14px;
}
.shelf-empty-title {
  font-size: 18px;
  color: var(--fg);
  margin: 0 0 8px;
}
.shelf-empty-sub {
  font-size: 14px;
  margin: 0;
}
.shelf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px;
  max-width: 1100px;
  margin: 0 auto;
}
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-weak);
  color: var(--accent);
  font-size: 20px;
  font-weight: 600;
  pointer-events: none;
}
@media (max-width: 720px) {
  .shelf-top {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px;
  }
  .shelf-stats {
    margin-left: 0;
  }
  .search-input {
    flex: 1;
    min-width: 0;
  }
  .group-bar {
    padding: 8px 16px;
  }
  .shelf-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 16px;
  }
  .shelf-main {
    padding: 20px 16px 40px;
  }
}
</style>
