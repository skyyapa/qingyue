<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useBooksStore } from '@/stores/books'
import BookCard from '@/components/BookCard.vue'
import ImportDialog from '@/components/ImportDialog.vue'

const books = useBooksStore()
const router = useRouter()

const showImport = ref(false)
const dragging = ref(false)

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
</script>

<template>
  <div class="shelf" :class="{ dragging }">
    <header class="shelf-top">
      <div class="brand">
        <span class="brand-logo">阅</span>
        <span class="brand-name">轻阅</span>
        <span class="brand-sub">QingYue</span>
      </div>
      <button class="btn btn-primary" @click="showImport = true">＋ 导入书籍</button>
    </header>

    <main
      class="shelf-main"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop="onDrop"
    >
      <div v-if="!books.loaded" class="shelf-tip">加载中…</div>

      <div v-else-if="books.books.length === 0" class="shelf-empty">
        <p class="shelf-empty-icon">📖</p>
        <p class="shelf-empty-title">书架还是空的</p>
        <p class="shelf-empty-sub">点击右上角「导入书籍」，或直接把 TXT / EPUB 文件拖进页面</p>
      </div>

      <div v-else class="shelf-grid">
        <BookCard v-for="b in books.books" :key="b.id" :book="b" @open="openBook" />
      </div>
    </main>

    <div v-if="dragging" class="drop-overlay">松开鼠标导入书籍</div>

    <ImportDialog v-if="showImport" @close="showImport = false" @imported="onImported" />
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
  justify-content: space-between;
  padding: 14px 24px;
  background: var(--topbar);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--panel-border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
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
@media (max-width: 560px) {
  .shelf-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 16px;
  }
  .shelf-top {
    padding: 12px 16px;
  }
  .shelf-main {
    padding: 20px 16px 40px;
  }
}
</style>
