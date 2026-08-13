/** 带进度地读取文件为 ArrayBuffer */
export function readFileWithProgress(file: File, onProgress?: (ratio: number) => void): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    reader.onload = () => {
      onProgress?.(1)
      resolve(reader.result as ArrayBuffer)
    }
    reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`))
    reader.readAsArrayBuffer(file)
  })
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
