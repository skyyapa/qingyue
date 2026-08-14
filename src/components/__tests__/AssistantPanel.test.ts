import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import * as db from '@/db'
import AssistantPanel from '@/components/AssistantPanel.vue'
import { useBooksStore } from '@/stores/books'
import type { BookMeta, Entity } from '@/types'

function makeMeta(id: string, analysis?: BookMeta['analysis']): BookMeta {
  return {
    id,
    title: '测试书',
    author: '作者',
    source: 'txt',
    chapterCount: 2,
    chapterTitles: ['第1章', '第2章'],
    chapterChars: [10, 10],
    totalChars: 20,
    group: '',
    createdAt: Date.now(),
    progress: { chapterIndex: 0, scrollRatio: 0, updatedAt: Date.now() },
    analysis,
  }
}

const doneAnalysis: BookMeta['analysis'] = {
  status: 'done',
  progress: 1,
  entityCount: 3,
  ignoredNames: [],
  updatedAt: Date.now(),
}

function makeEntity(id: string, bookId: string, name: string, type: Entity['type'], over: Partial<Entity> = {}): Entity {
  return {
    id,
    bookId,
    name,
    type,
    aliases: [],
    chapters: [0],
    count: 3,
    samples: ['例句'],
    note: '',
    custom: false,
    locked: false,
    ...over,
  }
}

/** 种子数据：已分析的书，2 人物 + 1 地点 + 2 章索引 + 1 关系（每个测试独立 bookId） */
async function seedDoneBook(id: string): Promise<void> {
  await db.addBook(makeMeta(id, doneAnalysis))
  await db.putEntities([
    makeEntity('e1', id, '林风', 'person', { chapters: [0, 1], count: 5 }),
    makeEntity('e2', id, '苏瑶', 'person', { chapters: [0], count: 2 }),
    makeEntity('e3', id, '青山城', 'place', { chapters: [0], count: 1 }),
  ])
  await db.saveChapterIndexes([
    {
      id: `${id}:0`,
      bookId: id,
      index: 0,
      entityCounts: { e1: 3, e2: 1 },
      topWords: ['剑'],
      summary: '登场：林风、苏瑶',
      keySentences: ['林风对苏瑶说了一句。'],
      events: ['林风对苏瑶说'],
    },
    {
      id: `${id}:1`,
      bookId: id,
      index: 1,
      entityCounts: { e1: 2 },
      topWords: ['剑'],
      summary: '登场：林风',
      keySentences: [],
    },
  ])
  await db.saveRelations([{ id: `r1-${id}`, bookId: id, a: 'e1', b: 'e2', weight: 4 }])
}

function mountPanel(bookId: string, currentChapter = 0) {
  return mount(AssistantPanel, { props: { bookId, currentChapter } })
}

/** fake-indexeddb 用 setImmediate（宏任务）调度，需多等一拍让 load() 完成 */
async function settle(): Promise<void> {
  await flushPromises()
  await new Promise((r) => setTimeout(r, 10))
  await flushPromises()
}

describe('AssistantPanel 组件', () => {
  it('未分析时显示引导页与开始分析按钮', async () => {
    setActivePinia(createPinia())
    await db.addBook(makeMeta('b0'))
    useBooksStore().books = [makeMeta('b0')]
    const wrapper = mountPanel('b0')
    await settle()
    expect(wrapper.text()).toContain('还没有知识库')
    expect(wrapper.text()).toContain('开始分析')
  })

  it('分析完成后显示人物列表，搜索框可过滤', async () => {
    setActivePinia(createPinia())
    await seedDoneBook('b1')
    useBooksStore().books = [makeMeta('b1', doneAnalysis)]
    const wrapper = mountPanel('b1')
    await settle()
    expect(wrapper.text()).toContain('林风')
    expect(wrapper.text()).toContain('苏瑶')

    await wrapper.find('input.list-search').setValue('林')
    expect(wrapper.text()).toContain('林风')
    expect(wrapper.text()).not.toContain('苏瑶')

    await wrapper.find('input.list-search').setValue('不存在')
    expect(wrapper.text()).toContain('没有匹配的人物')
  })

  it('点击实体进入详情视图，可返回列表', async () => {
    setActivePinia(createPinia())
    await seedDoneBook('b2')
    useBooksStore().books = [makeMeta('b2', doneAnalysis)]
    const wrapper = mountPanel('b2')
    await settle()

    await wrapper.findAll('button.entity-item')[0].trigger('click')
    await settle()
    expect(wrapper.find('.entity-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('出现章节')
    expect(wrapper.text()).toContain('例句')

    await wrapper.find('.entity-head button.icon-btn').trigger('click')
    await settle()
    expect(wrapper.find('.entity-card').exists()).toBe(false)
  })

  it('章节 tab 点击条目触发 jump 事件', async () => {
    setActivePinia(createPinia())
    await seedDoneBook('b3')
    useBooksStore().books = [makeMeta('b3', doneAnalysis)]
    const wrapper = mountPanel('b3')
    await settle()

    await wrapper.findAll('.assistant-tab')[3].trigger('click') // 章节
    await settle()
    expect(wrapper.text()).toContain('登场：林风、苏瑶')
    await wrapper.findAll('.chapter-item')[0].trigger('click')
    expect(wrapper.emitted('jump')?.[0]).toEqual([0])
  })

  it('回顾 tab 时间线条目可点击跳章', async () => {
    setActivePinia(createPinia())
    await seedDoneBook('b4')
    useBooksStore().books = [makeMeta('b4', doneAnalysis)]
    const wrapper = mountPanel('b4', 1)
    await settle()

    await wrapper.findAll('.assistant-tab')[4].trigger('click') // 回顾
    await settle()
    const items = wrapper.findAll('.recap-item')
    expect(items.length).toBe(2) // 已读至第 2 章（index 0、1）
    expect(wrapper.text()).toContain('林风') // 主要人物 chips
    await items[1].trigger('click')
    expect(wrapper.emitted('jump')?.[0]).toEqual([1])
  })
})
