/** AI 能力接口（v1 仅定义契约与注册表，暂不实现远程调用）
 *  知识库数据（实体索引/章节快照/共现关系）将作为 AI 的输入上下文，
 *  v2 接入远程 API 时按此接口实现 Provider 即可
 */
import type { ChapterIndex, Entity } from '@/types'

/** AI 请求上下文（从本地知识库组装，避免整本书塞进 prompt） */
export interface AIRequestContext {
  bookTitle: string
  /** 用户选中的文本 */
  selected: string
  /** 选中文本命中的实体 */
  entities: Entity[]
  /** 相关章节索引（当前章 ± 上下文） */
  chapters: ChapterIndex[]
}

export interface AIProvider {
  id: string
  name: string
  /** 是否可用（如 API Key 是否已配置） */
  ready(): boolean
  /** 解释选中的文本/实体（「解释这段剧情」） */
  explain(context: AIRequestContext): Promise<string>
  /** 语义化章节摘要（替代 v1 的模板式摘要） */
  summarizeChapter(bookTitle: string, chapterTitle: string, chapterText: string): Promise<string>
  /** 生成/精炼实体描述（世界观设定、角色卡等） */
  describeEntity(bookTitle: string, entity: Entity, related: Entity[]): Promise<string>
}

const registry = new Map<string, AIProvider>()

export function registerAIProvider(provider: AIProvider): void {
  registry.set(provider.id, provider)
}

export function getAIProvider(id?: string): AIProvider | undefined {
  if (id) return registry.get(id)
  return [...registry.values()].find((p) => p.ready())
}

export function listAIProviders(): AIProvider[] {
  return [...registry.values()]
}
