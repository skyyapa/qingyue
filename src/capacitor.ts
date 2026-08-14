import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Filesystem } from '@capacitor/filesystem'
import { StatusBar, Style } from '@capacitor/status-bar'
import { base64ToFile, fileNameFromUri } from '@/utils/intent-uri'

/** 是否运行在原生容器（Android App）中；Web 端恒为 false，所有桥接为空操作 */
export const isNative = Capacitor.isNativePlatform()

interface NativeBridgeOptions {
  /** 文件管理器「用轻阅打开」→ 读取内容后回调 File */
  onOpenFile: (file: File) => void
  /** 系统返回键：优先关闭面板，否则路由后退/退出 */
  onBack: () => void
}

/** 读取 content:// / file:// URI 内容为 File（读失败或非字符串返回 null） */
async function importUri(uri: string): Promise<File | null> {
  if (!uri.startsWith('content://') && !uri.startsWith('file://')) return null
  try {
    const res = await Filesystem.readFile({ path: uri })
    // 原生端始终返回 base64 字符串（Blob 仅 Web 端有）
    if (typeof res.data !== 'string') return null
    const name = fileNameFromUri(uri) ?? '导入文件.txt'
    return base64ToFile(res.data, name)
  } catch {
    return null
  }
}

/** 注册原生桥接（Web 端直接跳过）。文件打开：content URI → File 回调；返回键：按优先级关面板/后退/退出 */
export function setupNativeBridge(opts: NativeBridgeOptions): void {
  if (!isNative) return
  App.addListener('appUrlOpen', ({ url }) => {
    void importUri(url).then((file) => file && opts.onOpenFile(file))
  })
  App.addListener('backButton', () => opts.onBack())
  void StatusBar.setOverlaysWebView({ overlay: false })
  syncStatusBarTheme(document.documentElement.dataset.theme ?? 'default')
}

/** 状态栏跟随主题（仅原生）：浅色主题深色图标，深色主题浅色图标 + 背景色取页面背景 */
export function syncStatusBarTheme(theme: string): void {
  if (!isNative) return
  const dark = ['night', 'ocean', 'pine', 'graphite'].includes(theme)
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
  const bg = getComputedStyle(document.body).backgroundColor || (dark ? '#17181c' : '#f7f5f0')
  void StatusBar.setBackgroundColor({ color: bg })
}

/** 通知书架页：原生打开的文件已就绪（App 全局桥接 → 目标页监听） */
export function emitOpenFiles(files: File[]): void {
  window.dispatchEvent(new CustomEvent('qingyue:open-files', { detail: { files } }))
}
