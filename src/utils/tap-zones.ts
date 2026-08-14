export type TapZone = 'left' | 'center' | 'right'

/**
 * 把屏幕横向位置归类为点按区：左 30% / 右 30% / 中央 40%。
 * 手机阅读 App 惯例——左右区域翻页，中央区域呼出/隐藏工具栏。
 */
export function classifyTapZone(x: number, width: number): TapZone {
  if (width <= 0) return 'center'
  if (x < width * 0.3) return 'left'
  if (x > width * 0.7) return 'right'
  return 'center'
}
