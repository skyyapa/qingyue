<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAnalysisStore } from '@/stores/analysis'
import AppDialog from '@/components/AppDialog.vue'
import { TYPE_LABELS } from '@/analyze/classify'
import type { Entity, EntityType } from '@/types'

const props = defineProps<{
  entity: Entity
  /** 全部实体（用于共现者与合并目标） */
  allEntities: Entity[]
  /** 共现关系（a/b 为实体 id） */
  relations: { a: string; b: string; weight: number }[]
  chapterTitles: string[]
  /** 章节索引（经历时间线用） */
  chapterIndexes?: import('@/types').ChapterIndex[]
}>()
const emit = defineEmits<{ back: []; jump: [index: number, anchor?: string]; select: [entityId: string]; aiTimeline: [] }>()

const analysis = useAnalysisStore()

const editing = ref(false)
const editName = ref(props.entity.name)
const editType = ref<EntityType>(props.entity.type)
const editNote = ref(props.entity.note)
const editError = ref('')
const showDeleteConfirm = ref(false)
const showMergePicker = ref(false)

/** 例句对应的章节号（旧数据可能缺失，缺失时例句不可定位） */
const sampleChapters = computed(() => props.entity.sampleChapters ?? [])

/** 经历时间线：出现章节 + 该章相关事件 + 该章例句（最多 12 章） */
const timeline = computed(() =>
  props.entity.chapters.slice(0, 12).map((c) => {
    const idx = (props.chapterIndexes ?? []).find((x) => x.index === c)
    const events = (idx?.events ?? []).filter((ev) => ev.includes(props.entity.name))
    const sampleIdx = sampleChapters.value.indexOf(c)
    return {
      chapter: c,
      title: props.chapterTitles[c] ?? '',
      events,
      sample: sampleIdx >= 0 ? props.entity.samples[sampleIdx] : '',
    }
  })
)

const typeOptions = (Object.keys(TYPE_LABELS) as EntityType[]).map((t) => ({ value: t, label: TYPE_LABELS[t] }))

/** 共现者（按权重排序） */
const coEntities = computed(() => {
  const weights = new Map<string, number>()
  for (const r of props.relations) {
    if (r.a === props.entity.id) weights.set(r.b, (weights.get(r.b) ?? 0) + r.weight)
    if (r.b === props.entity.id) weights.set(r.a, (weights.get(r.a) ?? 0) + r.weight)
  }
  return [...weights.entries()]
    .map(([id, w]) => ({ entity: props.allEntities.find((e) => e.id === id), w }))
    .filter((x): x is { entity: Entity; w: number } => !!x.entity)
    .sort((x, y) => y.w - x.w)
    .slice(0, 12)
})

/** 合并目标（排除自己） */
const mergeTargets = computed(() =>
  props.allEntities.filter((e) => e.id !== props.entity.id && e.type === props.entity.type)
)

function startEdit(): void {
  editName.value = props.entity.name
  editType.value = props.entity.type
  editNote.value = props.entity.note
  editing.value = true
}

async function saveEdit(): Promise<void> {
  const name = editName.value.trim()
  if (!name) {
    editError.value = '名称不能为空'
    return
  }
  editError.value = ''
  const renamedFrom = name !== props.entity.name ? props.entity.name : undefined
  const updated: Entity = { ...props.entity, name, type: editType.value, note: editNote.value.trim(), locked: true }
  await analysis.updateEntity(updated, { renamedFrom })
  editing.value = false
}

/** 例句 → 跳到其出处章节并定位正文 */
function jumpToSample(i: number): void {
  const ch = sampleChapters.value[i]
  if (ch !== undefined) emit('jump', ch, props.entity.samples[i])
}

async function onDelete(): Promise<void> {
  await analysis.deleteEntity(props.entity)
  emit('back')
}

async function mergeInto(target: Entity): Promise<void> {
  showMergePicker.value = false
  await analysis.mergeEntities(target, props.entity)
  emit('select', target.id)
}
</script>

<template>
  <div class="entity-card">
    <div class="entity-head">
      <button class="icon-btn" title="返回列表" @click="emit('back')">←</button>
      <div class="entity-title">
        <span class="entity-name">{{ entity.name }}</span>
        <span class="type-badge">{{ TYPE_LABELS[entity.type] }}</span>
        <span v-if="entity.custom" class="type-badge custom">手动</span>
        <span v-if="entity.locked" class="type-badge locked">锁定</span>
      </div>
      <button class="btn-ghost" @click="editing ? saveEdit() : startEdit()">
        {{ editing ? '保存' : '编辑' }}
      </button>
    </div>

    <!-- 编辑态 -->
    <div v-if="editing" class="entity-edit">
      <label class="edit-row">
        <span>名称</span>
        <input v-model="editName" type="text" @input="editError = ''" />
      </label>
      <label class="edit-row">
        <span>类型</span>
        <select v-model="editType">
          <option v-for="t in typeOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </label>
      <label class="edit-row">
        <span>备注</span>
        <input v-model="editNote" type="text" placeholder="人物简介 / 身份说明…" />
      </label>
      <div class="edit-actions">
        <button class="btn btn-danger" @click="showDeleteConfirm = true">删除</button>
        <button class="btn" @click="showMergePicker = !showMergePicker">合并到…</button>
        <div v-if="showMergePicker" class="merge-mask" @click="showMergePicker = false"></div>
        <div v-if="showMergePicker" class="merge-list">
          <button v-for="t in mergeTargets" :key="t.id" class="merge-item" @click="mergeInto(t)">{{ t.name }}</button>
          <p v-if="mergeTargets.length === 0" class="merge-empty">没有可合并的同类型实体</p>
        </div>
        <button class="btn" @click="editing = false">取消</button>
      </div>
      <p v-if="editError" class="edit-error">{{ editError }}</p>
    </div>

    <!-- 展示态 -->
    <template v-else>
      <p v-if="entity.note" class="entity-note">{{ entity.note }}</p>
      <p v-if="entity.aliases.length" class="entity-line">
        <span class="line-label">别名</span>
        <span class="chip" v-for="a in entity.aliases" :key="a">{{ a }}</span>
      </p>
      <p class="entity-line">
        <span class="line-label">出现章节</span>
        <button
          v-for="c in entity.chapters.slice(0, 40)"
          :key="c"
          class="chip chapter-chip"
          :title="chapterTitles[c]"
          @click="emit('jump', c, entity.name)"
        >
          {{ c + 1 }}
        </button>
        <span v-if="entity.chapters.length > 40" class="chip-more">…共 {{ entity.chapters.length }} 章</span>
        <span v-if="entity.chapters.length === 0" class="chip-empty">暂无（手动添加）</span>
      </p>
      <p v-if="coEntities.length" class="entity-line">
        <span class="line-label">常共现</span>
        <button
          v-for="c in coEntities"
          :key="c.entity.id"
          class="chip co-chip"
          @click="emit('select', c.entity.id)"
        >
          {{ c.entity.name }} {{ c.w }}
        </button>
      </p>
      <div v-if="entity.samples.length" class="entity-samples">
        <p class="line-label">例句</p>
        <blockquote v-for="(s, i) in entity.samples" :key="i" class="sample">
          <span class="sample-text">「{{ s }}」</span>
          <button
            v-if="sampleChapters[i] !== undefined"
            class="sample-jump"
            title="在正文中定位该例句"
            @click="jumpToSample(i)"
          >
            定位
          </button>
        </blockquote>
      </div>

      <!-- 经历时间线 -->
      <div v-if="timeline.length" class="entity-timeline">
        <p class="line-label">经历时间线</p>
        <button
          v-for="t in timeline"
          :key="t.chapter"
          class="tl-item"
          :title="`跳到第 ${t.chapter + 1} 章`"
          @click="emit('jump', t.chapter, entity.name)"
        >
          <span class="tl-idx">{{ t.chapter + 1 }}</span>
          <span class="tl-body">
            <span class="tl-title">{{ t.title }}</span>
            <span v-if="t.events.length" class="tl-events">{{ t.events.join('；') }}</span>
            <span v-if="t.sample" class="tl-sample">「{{ t.sample }}」</span>
          </span>
        </button>
        <button class="btn tl-ai" @click="emit('aiTimeline')">✨ AI 梳理经历</button>
      </div>
    </template>

    <AppDialog
      v-if="showDeleteConfirm"
      title="删除实体"
      :message="`确定从知识库删除「${entity.name}」吗？它的名字将不再被自动分析重建。`"
      danger
      confirm-text="删除"
      @confirm="onDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>

<style scoped>
.entity-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow-y: auto; /* 内容多（章节/例句/时间线）时卡片内滚动，避免 flex 压缩底部按钮 */
}
.entity-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
}
.entity-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.entity-name {
  font-size: 17px;
  font-weight: 700;
}
.type-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--accent-weak);
  color: var(--accent);
}
.type-badge.custom {
  background: var(--panel-border);
  color: var(--fg-weak);
}
.type-badge.locked {
  background: var(--panel-border);
  color: var(--fg-weak);
}
.entity-edit {
  padding: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.edit-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.edit-row span {
  width: 40px;
  flex-shrink: 0;
  color: var(--fg-weak);
}
.edit-row input,
.edit-row select {
  flex: 1;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--bg);
  color: var(--fg);
  font-size: 13px;
  outline: none;
}
.edit-row input:focus,
.edit-row select:focus {
  border-color: var(--accent);
}
.edit-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  position: relative;
}
.edit-error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
/* 合并浮层：点击浮层外的透明遮罩关闭 */
.merge-mask {
  position: fixed;
  inset: 0;
  z-index: 4;
}
.merge-list {
  position: absolute;
  top: 38px;
  left: 0;
  z-index: 5;
  min-width: 140px;
  max-height: 180px;
  overflow-y: auto;
  padding: 6px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: var(--shadow);
}
.merge-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.merge-item:hover {
  background: var(--accent-weak);
}
.merge-empty {
  margin: 4px 6px;
  font-size: 12px;
  color: var(--fg-weak);
}
.entity-note {
  margin: 8px 4px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--fg);
}
.entity-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 4px;
}
.line-label {
  font-size: 12px;
  color: var(--fg-weak);
  flex-shrink: 0;
}
.chip {
  font-size: 12px;
  padding: 2px 9px;
  border-radius: 12px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  color: var(--fg);
  cursor: default;
}
.chapter-chip,
.co-chip {
  cursor: pointer;
}
.chapter-chip:hover,
.co-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.chip-more,
.chip-empty {
  font-size: 12px;
  color: var(--fg-weak);
}
.entity-samples {
  margin: 8px 4px;
  overflow-y: auto;
}
.sample {
  margin: 6px 0;
  padding: 8px 10px;
  border-left: 3px solid var(--accent-weak);
  background: var(--panel);
  border-radius: 0 8px 8px 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--fg);
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.sample-text {
  flex: 1;
  min-width: 0;
}
.sample-jump {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}
.sample-jump:hover {
  background: var(--accent);
  color: #fff;
}
/* 经历时间线 */
.entity-timeline {
  margin: 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.tl-item {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 7px 9px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--fg);
  text-align: left;
  cursor: pointer;
}
.tl-item:hover {
  border-color: var(--accent);
}
.tl-idx {
  font-size: 11px;
  color: var(--accent);
  font-weight: 600;
  flex-shrink: 0;
}
.tl-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tl-title {
  font-size: 12px;
}
.tl-events {
  font-size: 11px;
  color: var(--accent);
}
.tl-sample {
  font-size: 11px;
  color: var(--fg-weak);
}
.tl-ai {
  align-self: flex-start;
  font-size: 12px;
}
</style>
