import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Filesystem } from '@capacitor/filesystem'
import { base64ToFile, extForMime, fileNameFromUri } from '@/utils/intent-uri'

/** 是否运行在原生容器（Android App）中；Web 端恒为 false，所有桥接为空操作 */
export const isNative = Capacitor.isNativePlatform()

interface NativeBridgeOptions {
  /** 文件管理器「用轻阅打开」→ 读取内容后回调 File */
  onOpenFile: (file: File) => void
  /** 系统返回键：优先关闭面板，否则路由后退/退出 */
  onBack: () => void
}

/** 原生插件：content URI 的真实文件名/MIME（opaque id 如 content://12345 时 Filesystem 拿不到名字） */
interface IntentFilePlugin {
  read(options: { uri: string }): Promise<{ name: string | null; mime: string | null; data: string }>
  getPendingShare(): Promise<{ uri: string | null }>
  addListener(eventName: 'shareFile', listenerFunc: (event: { uri: string }) => void): Promise<{ remove: () => Promise<void> }>
}
const IntentFile = registerPlugin<IntentFilePlugin>('IntentFile')

/** 已处理的 intent URI：getLaunchUrl（冷启动）与 appUrlOpen（热启动）可能对同一 intent 各触发一次 */
const processedUris = new Set<string>()

/** 读取 content:// / file:// URI 内容为 File（读失败或非字符串返回 null） */
async function importUri(uri: string): Promise<File | null> {
  if (!uri.startsWith('content://') && !uri.startsWith('file://')) return null
  if (processedUris.has(uri)) return null
  processedUris.add(uri)
  try {
    // 优先原生插件：ContentResolver 返回 DISPLAY_NAME（真实文件名）与 MIME
    try {
      const res = await IntentFile.read({ uri })
      const name = res.name ?? fileNameFromUri(uri) ?? `导入文件${extForMime(res.mime ?? '') ?? '.txt'}`
      return base64ToFile(res.data, name, res.mime ?? '')
    } catch {
      // 兜底：Filesystem 读 content/file URI（原生端始终返回 base64 字符串，Blob 仅 Web 端有）
      const res = await Filesystem.readFile({ path: uri })
      if (typeof res.data !== 'string') return null
      const name = fileNameFromUri(uri) ?? '导入文件.txt'
      return base64ToFile(res.data, name)
    }
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
  // 冷启动：App 被文件 intent 拉起时 WebView 尚未加载 JS，listener 会错过 → 主动取启动 URL
  void App.getLaunchUrl().then((launch) => {
    if (launch?.url) void importUri(launch.url).then((file) => file && opts.onOpenFile(file))
  })
  // 系统分享（ACTION_SEND）：原生插件在冷启动缓存 URI、热启动推送 shareFile 事件；复用同一导入链路
  void IntentFile.getPendingShare().then(({ uri }) => {
    if (uri) void importUri(uri).then((file) => file && opts.onOpenFile(file))
  })
  void IntentFile.addListener('shareFile', ({ uri }) => {
    void importUri(uri).then((file) => file && opts.onOpenFile(file))
  })
  syncStatusBarTheme(document.documentElement.dataset.theme ?? 'default')
}

/** 系统栏图标跟随主题（仅原生）：深色主题浅色图标，浅色主题深色图标（edge-to-edge 背景透明，无需设色） */
export function syncStatusBarTheme(theme: string): void {
  if (!isNative) return
  const dark = ['night', 'ocean', 'pine', 'graphite'].includes(theme)
  void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
}

/** 通知书架页：原生打开的文件已就绪（App 全局桥接 → 目标页监听） */
export function emitOpenFiles(files: File[]): void {
  window.dispatchEvent(new CustomEvent('qingyue:open-files', { detail: { files } }))
}
