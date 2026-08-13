<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import * as db from '@/db'
import { useBooksStore } from '@/stores/books'
import { useAnalysisStore } from '@/stores/analysis'
import { TYPE_LABELS } from '@/analyze/classify'
import RelationGraph from '@/components/RelationGraph.vue'
import EntityCard from '@/components/EntityCard.vue'
import type { ChapterIndex, Entity, EntityType, Relation } from '@/types'

const props = defineProps<{
  bookId: string
  /** 当前章节号（前情回顾用） */
  currentChapter: number
}>()
const emit = defineEmits<{ close: []; jump: [index: number] }>()

const books = useBooksStore()
const analysis = useAnalysisStore()

const book = computed(() => books.books.find((b) => b.id === props.bookId))
const analysisState = computed(() => book.value?.analysis)

type TabKey = 'person' | 'world' | 'graph' | 'chapters' | 'recap'
const tabs: { key: TabKey; label: string }[] = [
  { key: 'person', label: '人物' },
  { key: 'world', label: '设定' },
  { key: 'graph', label: '关系' },
  { key: 'chapters', label: '章节' },
  { key: 'recap', label: '回顾' },
]
const activeTab = ref<TabKey>('person')

// 数据
const entities = ref<Entity[]>([])
const relations = ref<Relation[]>([])
const chapterIndexes = ref<ChapterIndex[]>([])
const loading = ref(false)

// 实体详情视图
const detailId = ref<string | null>(null)

const detailEntity = computed(() => entities.value.find((e) => e.id === detailId.value) ?? null)

/** 设定 tab 的类型子筛选 */
const worldTypes: EntityType[] = ['place', 'skill', 'item', 'org', 'unknown']
const worldType = ref<EntityType>('place')

const persons = computed(() =>
  entities.value.filter((e) => e.type === 'person').sort((a, b) => b.count - a.count)
)
const worldEntities = computed(() =>
  entities.value.filter((e) => e.type === worldType.value).sort((a, b) => b.count - a.count)
)

/** 前情回顾：已读章节的摘要与实体时间线 */
const recapChapters = computed(() =>
  chapterIndexes.value.filter((c) => c.index <= props.currentChapter)
)
const recapEntities = computed(() => {
  const counts = new Map<string, number>()
  for (const ci of recapChapters.value) {
    for (const [id, count] of Object.entries(ci.entityCounts)) {
      const entity = entities.value.find((e) => e.id === id)
      if (entity && entity.type === 'person') counts.set(entity.name, (counts.get(entity.name) ?? 0) + count)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const [ents, rels, idxs] = await Promise.all([
      db.listEntities(props.bookId),
      db.listRelations(props.bookId),
      db.listChapterIndexes(props.bookId),
    ])
    entities.value = ents.sort((a, b) => b.count - a.count)
    relations.value = rels
    chapterIndexes.value = idxs.sort((a, b) => a.index - b.index)
  } finally {
    loading.value = false
  }
}

/** 分析完成后刷新数据 */
watch(
  () => analysisState.value?.status,
  (status) => {
    if (status === 'done') load()
  }
)

/** 打开指定实体详情（选中文字查询入口） */
function openEntity(entityId: string): void {
  detailId.value = entityId
  activeTab.value = 'person'
}

onMounted(load)

defineExpose({ openEntity })
</script>

<template>
  <div class="mask mask-right" @click.self="emit('close')">
    <aside class="drawer assistant">
      <header class="assistant-head">
        <div class="assistant-title">
          <span class="assistant-name">阅读助手</span>
          <span v-if="analysisState?.status === 'done'" class="assistant-status">
            已分析 {{ analysisState.entityCount }} 个实体
          </span>
          <span v-else-if="analysisState?.status === 'running'" class="assistant-status running">
            分析中 {{ Math.round((analysisState?.progress ?? 0) * 100) }}%
          </span>
          <span v-else class="assistant-status">AI 能力：待接入</span>
        </div>
        <button class="btn-ghost" title="关闭" @click="emit('close')">✕</button>
      </header>

      <!-- 未分析：引导分析 -->
      <div v-if="analysisState?.status !== 'done'" class="assistant-empty">
        <p class="empty-icon">🔍</p>
        <p class="empty-title">
          {{ analysisState?.status === 'running' ? `正在分析「${book?.title}」…` : '还没有知识库' }}
        </p>
        <p class="empty-sub">
          分析全书可以自动识别人物、地点、技能与物品，建立章节索引和人物关系图。
          <template v-if="analysisState?.status === 'running'">分析无需网络，数据只保存在本机。</template>
          <template v-else>首次分析无需网络，数据只保存在本机。</template>
        </p>
        <button
          v-if="analysisState?.status !== 'running'"
          class="btn btn-primary"
          :disabled="analysis.isRunning(bookId)"
          @click="analysis.analyze(bookId)"
        >
          开始分析
        </button>
        <div v-if="analysisState?.status === 'running'" class="analyze-bar">
          <i :style="{ width: Math.max(2, (analysisState?.progress ?? 0) * 100) + '%' }" />
        </div>
        <p v-if="analysisState?.status === 'error'" class="empty-error">
          {{ analysisState.error }}
        </p>
      </div>

      <template v-else>
        <!-- 实体详情视图 -->
        <EntityCard
          v-if="detailEntity"
          :entity="detailEntity"
          :all-entities="entities"
          :relations="relations"
          :chapter-titles="book?.chapterTitles ?? []"
          @back="detailId = null"
          @jump="(i) => emit('jump', i)"
          @select="openEntity"
        />

        <!-- 列表视图 -->
        <template v-else>
          <nav class="assistant-tabs">
            <button
              v-for="t in tabs"
              :key="t.key"
              class="assistant-tab"
              :class="{ active: activeTab === t.key }"
              @click="activeTab = t.key"
            >
              {{ t.label }}
            </button>
          </nav>

          <div class="assistant-body">
            <!-- 人物 -->
            <div v-if="activeTab === 'person'" class="entity-list">
              <p v-if="persons.length === 0" class="list-empty">未识别到人物，可选中正文文字「加入知识库」手动添加</p>
              <button v-for="e in persons" :key="e.id" class="entity-item" @click="openEntity(e.id)">
                <span class="entity-avatar">{{ e.name[0] }}</span>
                <span class="entity-item-name">{{ e.name }}</span>
                <span class="entity-item-meta">{{ e.chapters.length }} 章 / {{ e.count }} 次</span>
              </button>
            </div>

            <!-- 设定 -->
            <div v-else-if="activeTab === 'world'" class="world-view">
              <div class="world-types">
                <button
                  v-for="t in worldTypes"
                  :key="t"
                  class="chip-type"
                  :class="{ active: worldType === t }"
                  @click="worldType = t"
                >
                  {{ TYPE_LABELS[t] }}
                </button>
              </div>
              <div class="entity-list">
                <p v-if="worldEntities.length === 0" class="list-empty">该分类暂无实体</p>
                <button v-for="e in worldEntities" :key="e.id" class="entity-item" @click="openEntity(e.id)">
                  <span class="entity-avatar">{{ e.name[0] }}</span>
                  <span class="entity-item-name">{{ e.name }}</span>
                  <span class="entity-item-meta">{{ e.chapters.length }} 章</span>
                </button>
              </div>
            </div>

            <!-- 关系图 -->
            <div v-else-if="activeTab === 'graph'" class="graph-view">
              <p v-if="relations.length === 0" class="list-empty">
                暂无共现关系（同段出现的人物少于 2 个）。分析基于段落级共现，可选中文字手动添加实体后重新分析。
              </p>
              <template v-else>
                <RelationGraph :entities="entities" :relations="relations" @select="openEntity" />
                <p class="graph-tip">连线粗细 = 同段共现次数；点击节点查看详情</p>
              </template>
            </div>

            <!-- 章节索引 -->
            <div v-else-if="activeTab === 'chapters'" class="chapter-list">
              <button v-for="ci in chapterIndexes" :key="ci.id" class="chapter-item" @click="emit('jump', ci.index)">
                <span class="chapter-idx">{{ ci.index + 1 }}</span>
                <span class="chapter-info">
                  <span class="chapter-summary">{{ ci.summary }}</span>
                  <span class="chapter-words">{{ ci.topWords.slice(0, 6).join('、') }}</span>
                </span>
              </button>
            </div>

            <!-- 前情回顾 -->
            <div v-else class="recap-view">
              <div class="recap-top">
                <p class="recap-title">已读至第 {{ props.currentChapter + 1 }} 章 · 主要人物</p>
                <div class="recap-chips">
                  <button
                    v-for="[name] in recapEntities"
                    :key="name"
                    class="chip"
                    @click="openEntity(entities.find((e) => e.name === name)?.id ?? '')"
                  >
                    {{ name }}
                  </button>
                </div>
              </div>
              <div class="recap-timeline">
                <div v-for="ci in recapChapters" :key="ci.id" class="recap-item">
                  <span class="recap-idx">{{ ci.index + 1 }}</span>
                  <div class="recap-body">
                    <p class="recap-summary">{{ ci.summary }}</p>
                    <p v-if="ci.keySentences.length" class="recap-sentence">「{{ ci.keySentences[0] }}」</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.assistant {
  width: min(92vw, 420px);
}
.assistant-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--panel-border);
  flex-shrink: 0;
}
.assistant-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.assistant-name {
  font-size: 16px;
  font-weight: 700;
}
.assistant-status {
  font-size: 11px;
  color: var(--fg-weak);
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--panel-border);
  white-space: nowrap;
}
.assistant-status.running {
  color: var(--accent);
  background: var(--accent-weak);
}
.assistant-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}
.empty-icon {
  font-size: 42px;
  margin: 0;
}
.empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.empty-sub {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--fg-weak);
}
.empty-error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
.analyze-bar {
  width: 70%;
  height: 5px;
  border-radius: 3px;
  background: var(--panel-border);
  overflow: hidden;
}
.analyze-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.2s ease;
}
.assistant-tabs {
  display: flex;
  padding: 10px 14px 0;
  gap: 6px;
  border-bottom: 1px solid var(--panel-border);
  flex-shrink: 0;
}
.assistant-tab {
  padding: 7px 12px;
  border: none;
  background: transparent;
  color: var(--fg-weak);
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.assistant-tab.active {
  color: var(--accent);
  font-weight: 600;
  border-bottom-color: var(--accent);
}
.assistant-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px 24px;
}
.entity-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.entity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: none;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  color: var(--fg);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s;
}
.entity-item:hover {
  border-color: var(--accent);
}
.entity-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--accent-weak);
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.entity-item-name {
  flex: 1;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.entity-item-meta {
  font-size: 11px;
  color: var(--fg-weak);
  flex-shrink: 0;
}
.list-empty {
  font-size: 13px;
  color: var(--fg-weak);
  line-height: 1.8;
  text-align: center;
  padding: 24px 8px;
}
.world-types {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.chip-type {
  padding: 5px 12px;
  border-radius: 16px;
  border: 1px solid var(--panel-border);
  background: transparent;
  color: var(--fg-weak);
  font-size: 12px;
  cursor: pointer;
}
.chip-type.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.graph-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.graph-tip {
  font-size: 11px;
  color: var(--fg-weak);
  margin: 0;
}
.chapter-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chapter-item {
  display: flex;
  gap: 10px;
  padding: 9px 10px;
  border: none;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  color: var(--fg);
  cursor: pointer;
  text-align: left;
}
.chapter-item:hover {
  border-color: var(--accent);
}
.chapter-idx {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
  flex-shrink: 0;
  padding-top: 2px;
}
.chapter-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.chapter-summary {
  font-size: 13px;
}
.chapter-words {
  font-size: 11px;
  color: var(--fg-weak);
}
.recap-top {
  padding: 4px 0 12px;
}
.recap-title {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--fg-weak);
}
.recap-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  background: var(--accent-weak);
  color: var(--accent);
  border: none;
  cursor: pointer;
}
.recap-timeline {
  display: flex;
  flex-direction: column;
}
.recap-item {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--panel-border);
}
.recap-idx {
  font-size: 12px;
  color: var(--fg-weak);
  flex-shrink: 0;
  padding-top: 2px;
}
.recap-body {
  min-width: 0;
}
.recap-summary {
  margin: 0 0 4px;
  font-size: 13px;
}
.recap-sentence {
  margin: 0;
  font-size: 12px;
  color: var(--fg-weak);
  line-height: 1.7;
}
</style>
