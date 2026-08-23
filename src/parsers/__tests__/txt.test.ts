import { describe, expect, it } from 'vitest'
import { decodeText, parseTxt, splitChapters } from '../txt'
import { GBK_BYTES, BIG5_BYTES } from './samples-enc'

/** 文本 → UTF-8 ArrayBuffer（测试用） */
const utf8 = (text: string) => new TextEncoder().encode(text).buffer

function withBom(buffer: ArrayBuffer, bom: number[]): ArrayBuffer {
  const bytes = new Uint8Array(buffer)
  const out = new Uint8Array(bom.length + bytes.length)
  out.set(bom, 0)
  out.set(bytes, bom.length)
  return out.buffer
}

describe('decodeText 编码检测', () => {
  it('UTF-8 正常识别', () => {
    const text = '第一章 开始\n这里是正文内容。\n'
    expect(decodeText(utf8(text))).toBe(text)
  })

  it('UTF-8 BOM 识别', () => {
    const text = '第一章 开始'
    expect(decodeText(withBom(utf8(text), [0xef, 0xbb, 0xbf]))).toBe(text)
  })

  it('UTF-16LE BOM 识别', () => {
    const text = '第一章 开始'
    const bytes = new Uint8Array(text.length * 2)
    for (let i = 0; i < text.length; i++) {
      bytes[i * 2] = text.charCodeAt(i) & 0xff
      bytes[i * 2 + 1] = text.charCodeAt(i) >> 8
    }
    const withBomBytes = new Uint8Array(2 + bytes.length)
    withBomBytes.set([0xff, 0xfe], 0)
    withBomBytes.set(bytes, 2)
    expect(decodeText(withBomBytes.buffer)).toBe(text)
  })

  it('GB18030 识别（简体）', () => {
    const text = decodeText(GBK_BYTES.buffer)
    expect(text).toContain('《晨雾小镇》')
    expect(text).toContain('第一章 开始')
    expect(text).toContain('GBK正文')
  })

  it('Big5 识别（繁体）', () => {
    const text = decodeText(BIG5_BYTES.buffer)
    expect(text).toContain('《晨霧小鎮》')
    expect(text).toContain('第一章 開始')
    expect(text).toContain('Big5正文')
  })

  it('UTF-16LE 无 BOM 识别（四编码评分择优）', () => {
    const text = '第一章 开始\n这里是UTF16编码的正文。\n第二章 继续\n第二段内容。\n'
    const bytes = new Uint8Array(text.length * 2)
    for (let i = 0; i < text.length; i++) {
      bytes[i * 2] = text.charCodeAt(i) & 0xff
      bytes[i * 2 + 1] = text.charCodeAt(i) >> 8
    }
    expect(decodeText(bytes.buffer)).toBe(text)
  })

  it('手动指定编码优先', () => {
    // 用 GBK 字节手动指定 UTF-8 解码应产生乱码但走指定路径
    const decoded = decodeText(GBK_BYTES.buffer, 'gb18030')
    expect(decoded).toContain('晨雾小镇')
  })
})

describe('splitChapters 章节切分', () => {
  it('标准章节标题切分', () => {
    const text = '《书名》\n作者：某人\n\n第一章 开始\n正文一。\n\n第二章 继续\n正文二。\n'
    const chapters = splitChapters(text)
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('第一章 开始')
    expect(chapters[0].text).toContain('正文一')
    expect(chapters[1].title).toBe('第二章 继续')
  })

  it('短导语（书名/作者）被丢弃', () => {
    const text = '《书名》\n作者：某人\n\n第一章 开始\n正文。\n'
    expect(splitChapters(text)).toHaveLength(1)
  })

  it('长导语成为「前言」章', () => {
    const text =
      '《书名》\n作者：某人\n\n这是一段较长的内容简介，用来介绍这本书的大致情节和看点，篇幅足够长所以应该被当作前言保留。\n\n第一章 开始\n正文。\n'
    const chapters = splitChapters(text)
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('前言')
  })

  it('无章节标记整本单章兜底', () => {
    const text = '没有任何章节标题的文本。\n第二段内容。\n'
    const chapters = splitChapters(text)
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('正文')
  })

  it('常见卷首语（序章/楔子/番外/终章）识别', () => {
    const text = '序章\n开端。\n\n第三章 风起\n正文。\n\n番外 后记\n尾声。\n'
    const titles = splitChapters(text).map((c) => c.title)
    expect(titles).toEqual(['序章', '第三章 风起', '番外 后记'])
  })

  it('章节标题前有短前缀/装饰文字时仍能分章，并剥离前缀', () => {
    const text = '《书名》\n作者：某人\n\n正文 第一章 开始\n正文一。\n\n【VIP】第2章 继续\n正文二。\n'
    const chapters = splitChapters(text)
    expect(chapters).toHaveLength(2)
    expect(chapters.map((c) => c.title)).toEqual(['第一章 开始', '第2章 继续'])
    expect(chapters[0].text).toContain('正文一')
  })

  it('正文中提到第X章但不是独立标题时不误切分', () => {
    const text = '第一章 开始\n这里提到第一章的线索但这是一句正文。\n第二段继续。\n\n第二章 继续\n正文二。\n'
    const chapters = splitChapters(text)
    expect(chapters).toHaveLength(2)
    expect(chapters[0].text).toContain('这里提到第一章的线索')
  })
})

describe('parseTxt 元信息提取', () => {
  it('书名与作者提取', () => {
    const text = '《测试之书》\n作者：张三\n\n第一章 开始\n正文。\n'
    const book = parseTxt(utf8(text), { fallbackTitle: 'fallback' })
    expect(book.title).toBe('测试之书')
    expect(book.author).toBe('张三')
  })

  it('无书名时回退文件名', () => {
    const text = '第一章 开始\n正文。\n'
    const book = parseTxt(utf8(text), { fallbackTitle: '我的小说.txt' })
    expect(book.title).toBe('我的小说.txt')
  })
})
