import { describe, expect, it } from 'vitest'
import { base64ToFile, extForMime, fileNameFromUri, nameWithMimeExtension } from '../intent-uri'

describe('fileNameFromUri intent URI 文件名提取', () => {
  it('content URI 末尾段即文件名', () => {
    expect(fileNameFromUri('content://com.android.providers.media.documents/document/武侠.txt')).toBe('武侠.txt')
  })

  it('ExternalStorage 的 primary 卷前缀与内部路径被剥离', () => {
    expect(fileNameFromUri('content://com.android.externalstorage.documents/document/primary%3A%E6%B1%9F%E6%B9%96.txt')).toBe(
      '江湖.txt'
    )
    expect(
      fileNameFromUri('content://com.android.externalstorage.documents/document/primary%3ADownload%2F%E4%B8%89%E4%BD%93.epub')
    ).toBe('三体.epub')
  })

  it('纯数字 content id 与空段返回 null', () => {
    expect(fileNameFromUri('content://provider/document/12345')).toBeNull()
    expect(fileNameFromUri('content://provider/document/')).toBeNull()
  })

  it('file URI 取路径尾段', () => {
    expect(fileNameFromUri('file:///storage/emulated/0/Download/三体.txt')).toBe('三体.txt')
    expect(fileNameFromUri('file:///sdcard/books/novel.epub?extra=1')).toBe('novel.epub')
  })

  it('非法编码不抛异常', () => {
    expect(fileNameFromUri('content://a/b/%ZZ')).toBeNull()
  })
})

describe('extForMime 扩展名兜底', () => {
  it('已知 MIME 映射', () => {
    expect(extForMime('text/plain')).toBe('.txt')
    expect(extForMime('application/epub+zip')).toBe('.epub')
    expect(extForMime('application/json')).toBe('.json')
  })

  it('未知 MIME 返回 null', () => {
    expect(extForMime('image/png')).toBeNull()
    expect(extForMime('')).toBeNull()
  })
})

describe('nameWithMimeExtension 文件名标准化', () => {
  it('无扩展名时按 MIME 补扩展名', () => {
    expect(nameWithMimeExtension('我的书', 'text/plain')).toBe('我的书.txt')
    expect(nameWithMimeExtension('我的书', 'application/epub+zip')).toBe('我的书.epub')
    expect(nameWithMimeExtension('backup', 'application/json')).toBe('backup.json')
  })

  it('已有扩展名不重复追加，空名使用通用名', () => {
    expect(nameWithMimeExtension('我的书.txt', 'text/plain')).toBe('我的书.txt')
    expect(nameWithMimeExtension(null, 'application/epub+zip')).toBe('导入文件.epub')
  })
})

describe('base64ToFile 解码', () => {
  it('base64（UTF-8 字节）还原为 File', async () => {
    const bytes = new TextEncoder().encode('你好，轻阅')
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    const file = base64ToFile(btoa(bin), '样书.txt', 'text/plain')
    expect(file.name).toBe('样书.txt')
    expect(file.type).toBe('text/plain')
    expect(await file.text()).toBe('你好，轻阅')
  })
})
