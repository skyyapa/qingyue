import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as db from '@/db'
import { analyzeBook } from '@/analyze'
import { genId } from '@/utils/id'
import { useBooksStore } from './books'
import type { Entity, EntityType } from '@/types'

/** 运行中的分析任务：bookId → 进度 */
export interface RunningTask {
  progress: number
  phase: string
}

export const useAnalysisStore = defineStore('analysis', () => {
  const booksStore = useBooksStore()

  /** 运行中的分析任务 */
  const running = ref<Record<string, RunningTask>>({})

  const isRunning = (bookId: string) => running.value[bookId] !== undefined

  /** 分析全书（自动跳过已在运行的任务） */
  async function analyze(bookId: string): Promise<void> {
    if (running.value[bookId]) return
    const meta = booksStore.books.find((b) => b.id === bookId)
    if (!meta) return
    // 标记进行中
    await db.updateBookAnalysis(bookId, {
      status: 'running',
      progress: 0,
      entityCount: meta.analysis?.entityCount ?? 0,
      ignoredNames: meta.analysis?.ignoredNames ?? [],
      updatedAt: Date.now(),
    })
    meta.analysis = {
      status: 'running',
      progress: 0,
      entityCount: meta.analysis?.entityCount ?? 0,
      ignoredNames: meta.analysis?.ignoredNames ?? [],
      updatedAt: Date.now(),
    }
    running.value[bookId] = { progress: 0, phase: '准备' }

    try {
      await analyzeBook(bookId, {
        onProgress: (ratio, phase) => {
          if (running.value[bookId]) running.value[bookId] = { progress: ratio, phase }
          const m = booksStore.books.find((b) => b.id === bookId)
          if (m?.analysis) {
            m.analysis.progress = ratio
            m.analysis.status = 'running'
          }
        },
      })
    } catch {
      // 错误状态已由 analyzeBook 写入
    } finally {
      delete running.value[bookId]
      await booksStore.refresh()
    }
  }

  // ---------- 实体操作（用户修正入口） ----------

  /** 手动创建实体（选中文字「加入知识库」） */
  async function addCustomEntity(bookId: string, name: string, type: EntityType): Promise<Entity> {
    const entity: Entity = {
      id: genId(),
      bookId,
      name,
      type,
      aliases: [],
      chapters: [],
      count: 0,
      samples: [],
      note: '',
      custom: true,
      locked: true, // 自定义实体不受自动分析覆盖
    }
    await db.putEntity(entity)
    return entity
  }

  /** 更新实体（改名/类型/备注等）；改名时旧名加入忽略列表，防止自动分析重建 */
  async function updateEntity(entity: Entity, options?: { renamedFrom?: string }): Promise<void> {
    const meta = booksStore.books.find((b) => b.id === entity.bookId)
    if (options?.renamedFrom && meta?.analysis) {
      const ignored = new Set(meta.analysis.ignoredNames ?? [])
      ignored.add(options.renamedFrom)
      ignored.add(entity.name)
      meta.analysis = { ...meta.analysis, ignoredNames: [...ignored] }
      await db.updateBookAnalysis(entity.bookId, meta.analysis)
    }
    await db.putEntity(entity)
  }

  /** 删除实体（名字记入忽略列表，自动分析不再重建） */
  async function deleteEntity(entity: Entity): Promise<void> {
    await db.deleteEntity(entity.id)
    const meta = booksStore.books.find((b) => b.id === entity.bookId)
    if (meta?.analysis) {
      const ignored = new Set(meta.analysis.ignoredNames ?? [])
      ignored.add(entity.name)
      meta.analysis = { ...meta.analysis, ignoredNames: [...ignored] }
      await db.updateBookAnalysis(entity.bookId, meta.analysis)
    }
    // 清理章节索引与关系中的引用
    await stripReferences(entity.bookId, entity.id)
  }

  /** 合并实体：target 并入 base（别名 + 章节 + 次数 + 例句），删除 target */
  async function mergeEntities(base: Entity, target: Entity): Promise<void> {
    base.aliases = [...new Set([...base.aliases, target.name, ...target.aliases])]
    base.chapters = [...new Set([...base.chapters, ...target.chapters])].sort((a, b) => a - b)
    base.count += target.count
    base.samples = [...base.samples, ...target.samples].slice(0, 8)
    base.sampleChapters = [...(base.sampleChapters ?? []), ...(target.sampleChapters ?? [])].slice(0, 8)
    base.note = base.note || target.note
    await db.putEntity(base)
    await db.deleteEntity(target.id)
    // 章节索引与关系中的 target 引用改写为 base
    await rewriteReferences(base.bookId, target.id, base.id)
    const meta = booksStore.books.find((b) => b.id === base.bookId)
    if (meta?.analysis) {
      const ignored = new Set(meta.analysis.ignoredNames ?? [])
      ignored.add(target.name)
      meta.analysis = { ...meta.analysis, ignoredNames: [...ignored] }
      await db.updateBookAnalysis(base.bookId, meta.analysis)
    }
  }

  /** 从章节索引/关系中移除某实体引用 */
  async function stripReferences(bookId: string, entityId: string): Promise<void> {
    const [indexes, relations] = await Promise.all([db.listChapterIndexes(bookId), db.listRelations(bookId)])
    let changed = false
    for (const idx of indexes) {
      if (entityId in idx.entityCounts) {
        delete idx.entityCounts[entityId]
        changed = true
      }
    }
    const kept = relations.filter((r) => r.a !== entityId && r.b !== entityId)
    if (kept.length !== relations.length) changed = true
    if (changed) {
      if (indexes.length) await db.saveChapterIndexes(indexes)
      await db.replaceRelations(bookId, kept)
    }
  }

  /** 引用改写（合并实体时 target → base） */
  async function rewriteReferences(bookId: string, fromId: string, toId: string): Promise<void> {
    const [indexes, relations] = await Promise.all([db.listChapterIndexes(bookId), db.listRelations(bookId)])
    let changed = false
    for (const idx of indexes) {
      if (fromId in idx.entityCounts) {
        idx.entityCounts[toId] = (idx.entityCounts[toId] ?? 0) + idx.entityCounts[fromId]
        delete idx.entityCounts[fromId]
        changed = true
      }
    }
    const kept: typeof relations = []
    for (const r of relations) {
      if (r.a === fromId) {
        r.a = toId
        changed = true
      }
      if (r.b === fromId) {
        r.b = toId
        changed = true
      }
      if (r.a !== r.b) kept.push(r)
    }
    if (changed) {
      if (indexes.length) await db.saveChapterIndexes(indexes)
      await db.replaceRelations(bookId, kept)
    }
  }

  return {
    running,
    isRunning,
    analyze,
    addCustomEntity,
    updateEntity,
    deleteEntity,
    mergeEntities,
  }
})
