<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import * as db from '@/db'
import { useBooksStore } from '@/stores/books'
import { useAnalysisStore } from '@/stores/analysis'
import { useAIStore } from '@/stores/ai'
import { AI_TASK_LABELS, runAITask, type AITask, type AITaskParams } from '@/ai/assistant'
import { TYPE_LABELS } from '@/analyze/classify'
import RelationGraph from '@/components/RelationGraph.vue'
import EntityCard from '@/components/EntityCard.vue'
import type { ChapterIndex, Entity, EntityType, Relation } from '@/types'

const props = defineProps<{
  bookId: string
  /** 当前章节号（前情回顾用） */
  currentChapter: number
}>()
const emit = defineEmits<{ close: []; jump: [index: number, anchor?: string] }>()

const books = useBooksStore()
const analysis = useAnalysisStore()
const ai = useAIStore()

const book = computed(() => books.books.find((b) => b.id === props.bookId))
const analysisState = computed(() => book.value?.analysis)

type TabKey = 'person' | 'world' | 'graph' | 'chapters' | 'recap' | 'timeline' | 'ai'
const tabs: { key: TabKey; label: string }[] = [
  { key: 'person', label: '人物' },
  { key: 'world', label: '设定' },
  { key: 'graph', label: '关系' },
  { key: 'chapters', label: '章节' },
  { key: 'recap', label: '回顾' },
  { key: 'timeline', label: '时间线' },
  { key: 'ai', label: 'AI' },
]
const activeTab = ref<TabKey>('person')

// 数据
const entities = ref<Entity[]>([])
const relations = ref<Relation[]>([])
const chapterIndexes = ref<ChapterIndex[]>([])
const loading = ref(false)
const loadError = ref('')

// 列表搜索（名称/别名/摘要/高频词）
const searchText = ref('')
watch(activeTab, () => (searchText.value = ''))

// 实体详情视图
const detailId = ref<string | null>(null)

const detailEntity = computed(() => entities.value.find((e) => e.id === detailId.value) ?? null)

/** 设定 tab 的类型子筛选 */
const worldTypes: EntityType[] = ['place', 'skill', 'item', 'org', 'realm', 'unknown']
const worldType = ref<EntityType>('place')

function filterByName(list: Entity[]): Entity[] {
  const q = searchText.value.trim()
  if (!q) return list
  return list.filter((e) => e.name.includes(q) || e.aliases.some((a) => a.includes(q)))
}

const persons = computed(() =>
  filterByName(entities.value.filter((e) => e.type === 'person').sort((a, b) => b.count - a.count))
)
const worldEntities = computed(() =>
  filterByName(entities.value.filter((e) => e.type === worldType.value).sort((a, b) => b.count - a.count))
)
const filteredChapters = computed(() => {
  const q = searchText.value.trim()
  if (!q) return chapterIndexes.value
  return chapterIndexes.value.filter(
    (ci) =>
      ci.summary.includes(q) ||
      ci.topWords.some((w) => w.includes(q)) ||
      (ci.events ?? []).some((e) => e.includes(q))
  )
})

/** 前情回顾：已读章节的摘要与实体时间线 */
const recapChapters = computed(() =>
  chapterIndexes.value.filter((c) => c.index <= props.currentChapter)
)
const entityById = computed(() => new Map(entities.value.map((e) => [e.id, e])))
const recapEntities = computed(() => {
  const counts = new Map<string, number>()
  const idByName = new Map<string, string>()
  for (const ci of recapChapters.value) {
    for (const [id, count] of Object.entries(ci.entityCounts)) {
      const entity = entityById.value.get(id)
      if (entity && entity.type === 'person') {
        counts.set(entity.name, (counts.get(entity.name) ?? 0) + count)
        idByName.set(entity.name, id)
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ id: idByName.get(name) ?? '', name, count }))
})

/** 全书事件时间线：跨章聚合事件句，按首次出现章节排序 */
interface TimelineEvent {
  text: string
  chapters: number[]
  count: number
}
const timelineEvents = computed<TimelineEvent[]>(() => {
  const map = new Map<string, { text: string; chapters: number[]; count: number }>()
  for (const ci of chapterIndexes.value) {
    for (const ev of ci.events ?? []) {
      const item = map.get(ev)
      if (item) {
        item.chapters.push(ci.index)
        item.count++
      } else {
        map.set(ev, { text: ev, chapters: [ci.index], count: 1 })
      }
    }
  }
  return [...map.values()]
    .map((x) => ({ ...x, chapters: [...new Set(x.chapters)].sort((a, b) => a - b) }))
    .sort((a, b) => a.chapters[0] - b.chapters[0])
})

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const [ents, rels, idxs] = await Promise.all([
      db.listEntities(props.bookId),
      db.listRelations(props.bookId),
      db.listChapterIndexes(props.bookId),
    ])
    entities.value = ents.sort((a, b) => b.count - a.count)
    relations.value = rels
    chapterIndexes.value = idxs.sort((a, b) => a.index - b.index)
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
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

/** 打开指定实体详情（选中文字查询入口；目标不在当前快照时先刷新数据） */
async function openEntity(entityId: string): Promise<void> {
  if (!entities.value.some((e) => e.id === entityId)) {
    await load()
  }
  detailId.value = entityId
  activeTab.value = 'person'
}

// ---------- AI 助手（阶段三） ----------

const aiQuestion = ref('')
const aiBusy = ref(false)
const aiError = ref('')
const aiAnswer = ref('')
let lastTask: AITask | null = null

/** AI tab 快捷任务 chips（personTimeline 是实体卡片入口，不出现在 chips） */
const CHIP_TASKS = (Object.entries(AI_TASK_LABELS) as [AITask, string][]).filter(([k]) => k !== 'personTimeline')

/** 打开 AI tab 并预填问题（选中文字入口） */
function openAI(text: string): void {
  activeTab.value = 'ai'
  aiQuestion.value = text
  aiError.value = ''
  aiAnswer.value = ''
}

/** 执行 AI 任务；who/relation/world 优先按实体名定位实体 */
async function runTask(task: AITask): Promise<void> {
  const active = ai.activeProvider
  if (!active) return
  const q = aiQuestion.value.trim()
  if (!q && (task === 'who' || task === 'explain' || task === 'ask')) {
    aiError.value = '请先在输入框填写内容（可选中正文文字自动带入）'
    return
  }
  aiBusy.value = true
  aiError.value = ''
  aiAnswer.value = ''
  lastTask = task
  try {
    const params: AITaskParams = { chapterIndex: props.currentChapter, text: q }
    if (task === 'who' || task === 'relation' || task === 'world') {
      const list = await db.listEntities(props.bookId)
      const match = list.find((e) => e.name === q || e.aliases.includes(q))
      if (match) params.entityId = match.id
    }
    aiAnswer.value = await runAITask(active, props.bookId, task, params)
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : String(err)
  } finally {
    aiBusy.value = false
  }
}

function askFree(): void {
  runTask('ask')
}

function retryAI(): void {
  if (lastTask) runTask(lastTask)
}

/** 实体卡片「AI 梳理经历」：执行 personTimeline 并在 AI tab 展示 */
async function runEntityTimeline(entityId: string): Promise<void> {
  const active = ai.activeProvider
  if (!active) return
  detailId.value = null // 退出实体卡片视图（其优先于 tab 栏渲染）
  activeTab.value = 'ai'
  aiBusy.value = true
  aiError.value = ''
  aiAnswer.value = ''
  lastTask = 'personTimeline'
  try {
    aiAnswer.value = await runAITask(active, props.bookId, 'personTimeline', {
      chapterIndex: props.currentChapter,
      entityId,
    })
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : String(err)
  } finally {
    aiBusy.value = false
  }
}

/** AI 回答受控渲染：先转义再替换轻量标记（**粗体**、换行） */
function renderAI(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/\n/g, '<br>')
}

onMounted(load)

defineExpose({ openEntity, openAI })
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
          {{ book?.source === 'web' ? '分析已缓存的章节（已读过的部分），可以自动识别人物、地点、技能与物品，建立章节索引和人物关系图。' : '分析全书可以自动识别人物、地点、技能与物品，建立章节索引和人物关系图。' }}
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
        <!-- 加载中 / 加载失败 -->
        <div v-if="loading" class="assistant-empty">
          <p class="empty-icon">⏳</p>
          <p class="empty-title">加载中…</p>
        </div>
        <div v-else-if="loadError" class="assistant-empty">
          <p class="empty-icon">⚠️</p>
          <p class="empty-title">知识库加载失败</p>
          <p class="empty-sub">{{ loadError }}</p>
          <button class="btn btn-primary" @click="load">重试</button>
        </div>

        <!-- 实体详情视图 -->
        <EntityCard
          v-else-if="detailEntity"
          :entity="detailEntity"
          :all-entities="entities"
          :relations="relations"
          :chapter-titles="book?.chapterTitles ?? []"
          :chapter-indexes="chapterIndexes"
          @back="detailId = null"
          @jump="(i, anchor) => emit('jump', i, anchor)"
          @select="openEntity"
          @ai-timeline="runEntityTimeline(detailEntity.id)"
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
              <input v-model="searchText" class="list-search" type="search" placeholder="搜索人物（名称 / 别名）" />
              <p v-if="persons.length === 0" class="list-empty">
                {{ searchText.trim() ? '没有匹配的人物' : '未识别到人物，可选中正文文字「加入知识库」手动添加' }}
              </p>
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
                <input v-model="searchText" class="list-search" type="search" placeholder="搜索设定（名称 / 别名）" />
                <p v-if="worldEntities.length === 0" class="list-empty">
                  {{ searchText.trim() ? '没有匹配的实体' : '该分类暂无实体' }}
                </p>
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
              <input v-model="searchText" class="list-search" type="search" placeholder="搜索章节（摘要 / 高频词 / 事件）" />
              <p v-if="filteredChapters.length === 0" class="list-empty">
                {{ searchText.trim() ? '没有匹配的章节' : '暂无章节索引' }}
              </p>
              <button v-for="ci in filteredChapters" :key="ci.id" class="chapter-item" @click="emit('jump', ci.index)">
                <span class="chapter-idx">{{ ci.index + 1 }}</span>
                <span class="chapter-info">
                  <span class="chapter-summary">{{ ci.summary }}</span>
                  <span class="chapter-words">{{ ci.topWords.slice(0, 6).join('、') }}</span>
                </span>
              </button>
            </div>

            <!-- 前情回顾 -->
            <div v-else-if="activeTab === 'recap'" class="recap-view">
              <div class="recap-top">
                <p class="recap-title">已读至第 {{ props.currentChapter + 1 }} 章 · 主要人物</p>
                <div class="recap-chips">
                  <button
                    v-for="r in recapEntities"
                    :key="r.name"
                    class="chip"
                    @click="r.id && openEntity(r.id)"
                  >
                    {{ r.name }}
                  </button>
                </div>
              </div>
              <div class="recap-timeline">
                <button v-for="ci in recapChapters" :key="ci.id" class="recap-item" @click="emit('jump', ci.index)">
                  <span class="recap-idx">{{ ci.index + 1 }}</span>
                  <div class="recap-body">
                    <p class="recap-summary">{{ ci.summary }}</p>
                    <p v-if="ci.keySentences.length" class="recap-sentence">「{{ ci.keySentences[0] }}」</p>
                  </div>
                </button>
              </div>
            </div>

            <!-- 事件时间线 -->
            <div v-else-if="activeTab === 'timeline'" class="timeline-view">
              <p v-if="timelineEvents.length === 0" class="list-empty">
                暂无事件。重新分析知识库后可生成事件句（如「林风对苏瑶说」），跨章节自动聚合。
              </p>
              <button v-for="ev in timelineEvents" :key="ev.text" class="timeline-item" @click="emit('jump', ev.chapters[0])">
                <span class="timeline-idx">{{ ev.chapters[0] + 1 }}</span>
                <div class="timeline-body">
                  <p class="timeline-text">{{ ev.text }}</p>
                  <p class="timeline-meta">出现于 {{ ev.chapters.length }} 章 · {{ ev.count }} 次</p>
                </div>
              </button>
            </div>

            <!-- AI 助手 -->
            <div v-else class="ai-view">
              <template v-if="!ai.activeProvider">
                <p class="ai-empty">🔌 未配置 AI Provider</p>
                <p class="ai-empty-sub">
                  在书架顶栏「AI」中配置 Base URL / API Key / Model 后即可使用
                  （支持 DeepSeek、Gemini、本地 Ollama / LM Studio 等）。
                </p>
              </template>
              <template v-else>
                <div class="ai-chips">
                  <button
                    v-for="[task, label] in CHIP_TASKS"
                    :key="task"
                    class="chip"
                    :disabled="aiBusy"
                    @click="runTask(task)"
                  >
                    {{ label }}
                  </button>
                </div>
                <div class="ai-input-row">
                  <input
                    v-model="aiQuestion"
                    type="text"
                    placeholder="问 AI，或选中正文后自动带入…"
                    @keydown.enter.prevent="askFree"
                  />
                  <button class="btn btn-primary" :disabled="aiBusy || !aiQuestion.trim()" @click="askFree">提问</button>
                </div>
                <div class="ai-answer">
                  <p v-if="aiBusy" class="ai-loading">✨ AI 思考中…</p>
                  <p v-else-if="aiError" class="ai-error">
                    {{ aiError }}
                    <button class="btn" @click="retryAI">重试</button>
                  </p>
                  <!-- eslint-disable-next-line vue/no-v-html -- renderAI 先转义、内容受控 -->
                  <div v-else-if="aiAnswer" class="ai-text" v-html="renderAI(aiAnswer)"></div>
                  <p v-else class="ai-placeholder">
                    选一个快捷问题（如「前情回顾」「事件时间线」），或直接提问，如「苏瑶的剑法是什么来历」。
                  </p>
                </div>
              </template>
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
.list-search {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--panel-border);
  background: var(--panel);
  color: var(--fg);
  font-size: 13px;
  outline: none;
  margin-bottom: 4px;
}
.list-search:focus {
  border-color: var(--accent);
}
.list-search::placeholder {
  color: var(--fg-weak);
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
  border: none;
  border-bottom: 1px dashed var(--panel-border);
  background: transparent;
  color: var(--fg);
  text-align: left;
  width: 100%;
  cursor: pointer;
}
.recap-item:hover .recap-summary {
  color: var(--accent);
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
/* 事件时间线 */
.timeline-view {
  display: flex;
  flex-direction: column;
}
.timeline-item {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border: none;
  border-bottom: 1px dashed var(--panel-border);
  background: transparent;
  color: var(--fg);
  text-align: left;
  width: 100%;
  cursor: pointer;
}
.timeline-item:hover .timeline-text {
  color: var(--accent);
}
.timeline-idx {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
  flex-shrink: 0;
  padding-top: 2px;
}
.timeline-body {
  min-width: 0;
}
.timeline-text {
  margin: 0 0 3px;
  font-size: 13px;
}
.timeline-meta {
  margin: 0;
  font-size: 11px;
  color: var(--fg-weak);
}
/* AI 助手 */
.ai-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-empty {
  margin: 0;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
}
.ai-empty-sub {
  margin: 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--fg-weak);
  text-align: center;
}
.ai-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ai-chips .chip:disabled {
  opacity: 0.5;
  cursor: default;
}
.ai-input-row {
  display: flex;
  gap: 6px;
}
.ai-input-row input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg);
  font-size: 13px;
  outline: none;
}
.ai-input-row input:focus {
  border-color: var(--accent);
}
.ai-answer {
  min-height: 120px;
}
.ai-loading,
.ai-placeholder {
  margin: 0;
  font-size: 13px;
  color: var(--fg-weak);
  line-height: 1.8;
}
.ai-error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
  line-height: 1.8;
}
.ai-text {
  font-size: 13px;
  line-height: 1.9;
  color: var(--fg);
  overflow-wrap: break-word;
}
.ai-text b {
  color: var(--accent);
}
</style>
