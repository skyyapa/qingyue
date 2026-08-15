/** Android intent URI 解析：文件管理器「用轻阅打开」的 content:// / file:// URI */

/**
 * 从 URI 提取文件名。
 * content URI 形如 `content://provider/document/武侠.txt` 或
 * `content://com.android.externalstorage.documents/document/primary%3ADownload%2F江湖.txt`
 * （document id 带 `primary:` 卷前缀与内部路径）——取路径尾段并去掉卷前缀；
 * 纯数字 content id 或空段返回 null。
 */
export function fileNameFromUri(uri: string): string | null {
  try {
    const base = uri.split('?')[0]
    const seg = base.split('/').pop() ?? ''
    const name = decodeURIComponent(seg)
    if (!name || /^\d+$/.test(name)) return null
    const withoutVolume = name.startsWith('primary:') ? name.slice('primary:'.length) : name
    const tail = withoutVolume.split('/').pop() ?? withoutVolume
    return tail || null
  } catch {
    return null
  }
}

/** MIME → 扩展名兜底（文件名缺失时用） */
export function extForMime(mime: string): string | null {
  const map: Record<string, string> = {
    'text/plain': '.txt',
    'application/epub+zip': '.epub',
    'application/json': '.json',
    'application/octet-stream': '.bin',
  }
  return map[mime] ?? null
}

/**
 * 原生 ContentResolver 可能只给无扩展名的 DISPLAY_NAME；导入器按扩展名分流，
 * 因此已知 MIME 时补上扩展名。已有扩展名与未知 MIME 均保持原样。
 */
export function nameWithMimeExtension(name: string | null, mime: string): string {
  const fallback = `导入文件${extForMime(mime) ?? '.txt'}`
  if (!name) return fallback
  const lastSlash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  const lastDot = name.lastIndexOf('.')
  if (lastDot > lastSlash && lastDot < name.length - 1) return name
  return `${name}${extForMime(mime) ?? ''}`
}

/** base64 解码为 File（原生桥接读到的文件内容，UTF-8 字节） */
export function base64ToFile(base64: string, name: string, mime = ''): File {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], name, { type: mime })
}

/** Blob 编码为纯 base64 字符串（原生 Filesystem.writeFile 要求 base64，去掉 data: 前缀） */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
