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

/** base64 解码为 File（原生桥接读到的文件内容，UTF-8 字节） */
export function base64ToFile(base64: string, name: string, mime = ''): File {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], name, { type: mime })
}
