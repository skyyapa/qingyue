/** 生成稳定 ID（非安全上下文下回退到时间戳+随机数） */
export function genId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
