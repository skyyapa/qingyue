<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useBooksStore } from '@/stores/books'
import { classifyByTitle, genreProfile, hasRead, recommendBooks, GENRE_LABELS, type Genre, type Recommendation } from '@/utils/recommend'
import { bookReadPercent, formatPercent } from '@/utils/progress'
import type { BookMeta } from '@/types'

const router = useRouter()
const books = useBooksStore()

// 参考书：以它为基准推荐同类型；默认取最近读/最近打开的书
const selectedId = ref<string>('')

const list = computed<BookMeta[]>(() => books.books)
const readBooks = computed(() => list.value.filter(hasRead))

/** 画像标签云（只统计非 unknown 题材） */
const profile = computed(() => genreProfile(list.value))

/** 参考书候选：读过优先，否则全部书架 */
const referenceCandidates = computed(() => {
  const read = readBooks.value
  if (read.length > 0) return read
  return list.value
})

const selectedBook = computed(() => list.value.find((b) => b.id === selectedId.value))

/** 该题材在书库中的书名集合（在线搜同类可用关键词） */
function genreKeyword(refBook: BookMeta): string {
  const g = classifyByTitle(refBook.title).find((x) => x !== 'unknown')
  return g ? GENRE_LABELS[g] : ''
}

/** 针对参考书的本地推荐 */
const recommendations = computed<Recommendation[]>(() => {
  if (!selectedBook.value) return []
  return recommendBooks(list.value, selectedBook.value.id)
})

/** 点一个题材标签：找到书库里这本书类，若书库无则提示 */
const activeFilter = ref<Genre | ''>('')

const filteredBooks = computed(() => {
  if (!activeFilter.value) return []
  return list.value.filter((b) => classifyByTitle(b.title).includes(activeFilter.value as Genre))
})

/** 打开一本书 */
function openBook(id: string): void {
  router.push(`/reader/${id}`)
}

// 默认参考书：第一个已读，否则书架第一本
onMounted(async () => {
  if (!books.loaded) await books.refresh()
  const cands = referenceCandidates.value
  if (cands.length > 0) selectedId.value = cands[0].id
})
</script>

<template>
  <div class="recommend">
    <header class="rec-top">
      <button class="icon-btn" title="返回书架" aria-label="返回书架" @click="router.push('/')">←</button>
      <span class="rec-title">猜你喜欢 · 同类型推荐</span>
    </header>

    <main class="rec-body">
      <!-- 空书架 -->
      <div v-if="list.length === 0" class="rec-empty">
        <p>书架还是空的</p>
        <p class="rec-empty-sub">导入书籍后可在这里看到基于阅读偏好的同类型推荐</p>
        <button class="btn btn-primary" @click="router.push('/')">去书架导入</button>
      </div>

      <template v-else>
        <!-- 阅读画像：书库题材分布 -->
        <section v-if="profile.length" class="rec-section">
          <h2 class="rec-section-title">📊 你的阅读类型画像</h2>
          <div class="genre-cloud">
            <button
              v-for="p in profile"
              :key="p.genre"
              class="genre-chip"
              :class="{ active: activeFilter === p.genre }"
              @click="activeFilter = activeFilter === p.genre ? '' : p.genre"
            >
              {{ GENRE_LABELS[p.genre] }} <i>{{ p.count }}</i>
            </button>
          </div>
        </section>

        <!-- 按题材过滤的书库速览 -->
        <section v-if="activeFilter" class="rec-section">
          <h2 class="rec-section-title">{{ GENRE_LABELS[activeFilter] }} · 书库内 {{ filteredBooks.length }} 本</h2>
          <div class="rec-grid">
            <button v-for="b in filteredBooks" :key="b.id" class="rec-card" @click="openBook(b.id)">
              <span class="rec-cover">{{ [...b.title][0] ?? '书' }}</span>
              <span class="rec-info">
                <span class="rec-name">{{ b.title }}</span>
                <span class="rec-author">{{ b.author }} · {{ formatPercent(bookReadPercent(b)) }}</span>
              </span>
            </button>
          </div>
          <button class="btn rec-close-filter" @click="activeFilter = ''">清除筛选</button>
        </section>

        <!-- 参考书选择 -->
        <section class="rec-section">
          <h2 class="rec-section-title">🎯 选择参考书（已读优先）</h2>
          <select v-model="selectedId" class="rec-select" @change="activeFilter = ''">
            <option v-for="b in referenceCandidates" :key="b.id" :value="b.id">
              {{ hasRead(b) ? '📖' : '📚' }} {{ b.title }}（{{ b.author }}）
            </option>
          </select>
        </section>

        <!-- 本地推荐结果 -->
        <section class="rec-section">
          <h2 class="rec-section-title">
            {{ selectedBook ? `推荐 · 与《${selectedBook.title}》同类` : '推荐' }}
          </h2>
          <div v-if="recommendations.length" class="rec-grid">
            <button
              v-for="r in recommendations"
              :key="r.book.id"
              class="rec-card"
              @click="openBook(r.book.id)"
            >
              <span class="rec-cover">{{ [...r.book.title][0] ?? '书' }}</span>
              <span class="rec-info">
                <span class="rec-name">{{ r.book.title }}</span>
                <span class="rec-author">{{ r.book.author }} · {{ formatPercent(bookReadPercent(r.book)) }}</span>
                <span class="rec-reason">{{ r.reason }}</span>
              </span>
            </button>
          </div>
          <p v-else-if="selectedBook" class="rec-hint">
            书库里暂时找不到与《{{ selectedBook.title }}》同题材的书（可尝试{{ genreKeyword(selectedBook) || '其他题材' }}类，或先导入更多书）。
          </p>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.recommend {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.rec-top {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  padding-top: calc(12px + var(--safe-top));
  background: var(--topbar);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--panel-border);
  z-index: 10;
}
.rec-title {
  font-size: 16px;
  font-weight: 600;
}
.rec-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
.rec-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 0;
  color: var(--fg-weak);
  text-align: center;
}
.rec-empty-sub {
  font-size: 12px;
  color: var(--fg-weak);
}
.rec-section {
  margin-bottom: 24px;
}
.rec-section-title {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--fg);
  display: flex;
  align-items: center;
  gap: 6px;
  word-break: break-all;
}
.genre-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.genre-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: transparent;
  color: var(--fg);
  font-size: 12px;
  cursor: pointer;
}
.genre-chip i {
  font-style: normal;
  font-size: 11px;
  color: var(--accent);
}
.genre-chip.active {
  border-color: var(--accent);
  background: var(--accent-weak);
  color: var(--accent);
}
.rec-select {
  width: 100%;
  max-width: 480px;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--bg);
  color: var(--fg);
  font-size: 14px;
  outline: none;
}
.rec-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.rec-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel);
  color: var(--fg);
  text-align: left;
  cursor: pointer;
}
.rec-card:hover {
  border-color: var(--accent);
}
.rec-cover {
  flex-shrink: 0;
  width: 42px;
  height: 56px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
  background: linear-gradient(135deg, var(--accent) 0%, #2f6fed 100%);
}
.rec-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.rec-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rec-author {
  font-size: 11px;
  color: var(--fg-weak);
}
.rec-reason {
  font-size: 11px;
  color: var(--accent);
}
.rec-hint {
  font-size: 12px;
  color: var(--fg-weak);
  line-height: 1.8;
}
.rec-close-filter {
  margin-top: 10px;
  font-size: 12px;
}
</style>
