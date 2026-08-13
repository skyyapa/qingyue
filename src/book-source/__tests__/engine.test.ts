import { describe, expect, it, vi } from 'vitest'
import { extractField, fetchChapters, fetchContent, renderTemplate, resolveExtracted, searchSource } from '../engine'
import { DEMO_SOURCE } from '../store'
import type { BookSource } from '../types'

/** 模拟同源 fetch（返回 HTML 文本） */
function stubFetch(html: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }))
  )
}

const SEARCH_HTML = `<!doctype html><html><body>
<ul class="result">
  <li><h3><a href="books/test-book.html">测试之书</a></h3><p class="author">作者：张三</p></li>
</ul>
</body></html>`

const TOC_HTML = `<!doctype html><html><body>
<ul id="toc">
  <li><a href="../chapters/c1.html">第一章 开始</a></li>
  <li><a href="../chapters/c2.html">第二章 继续</a></li>
</ul>
</body></html>`

const CONTENT_HTML = `<!doctype html><html><body>
<div id="content">
  <p>　　第一段正文内容。</p>
  <p>　　第二段正文内容。</p>
</div>
</body></html>`

describe('renderTemplate 模板渲染', () => {
  it('整值模板（只有一个变量）原样使用不编码', () => {
    expect(renderTemplate('{{bookUrl}}', { bookUrl: 'https://a.com/b?x=1&y=2' })).toBe('https://a.com/b?x=1&y=2')
  })

  it('嵌入长 URL 时变量自动编码', () => {
    expect(renderTemplate('/book/{{bookUrl}}', { bookUrl: 'a/b?x=1' })).toBe('/book/a%2Fb%3Fx%3D1')
  })

  it('未知变量替换为空', () => {
    expect(renderTemplate('/x/{{missing}}', {})).toBe('/x/')
  })
})

describe('extractField 字段提取', () => {
  const doc = new DOMParser().parseFromString(
    '<li><h3><a href="/b.html">书名</a></h3><p class="author">作者甲</p></li>',
    'text/html'
  )
  const li = doc.querySelector('li')!

  it('子查询选择器 + @text', () => {
    expect(extractField(li, 'h3 a@text')).toBe('书名')
  })
  it('空选择器（元素自身）@text', () => {
    expect(extractField(li, '@text')).toContain('书名')
  })
  it('@href 提取链接', () => {
    expect(extractField(li, 'h3 a@href')).toBe('/b.html')
  })
  it('管道 replace 生效', () => {
    expect(extractField(li, 'h3 a@text|replace:书,卷')).toBe('卷名')
  })
  it('选择器未命中返回空串', () => {
    expect(extractField(li, '.nope@text')).toBe('')
  })
})

describe('resolveExtracted 相对链接解析', () => {
  it('相对路径按页面 URL 解析', () => {
    expect(resolveExtracted('books/a.html', 'http://localhost:5173/demo-source/index.html')).toBe(
      'http://localhost:5173/demo-source/books/a.html'
    )
    expect(resolveExtracted('../chapters/c1.html', 'http://localhost:5173/demo-source/books/b.html')).toBe(
      'http://localhost:5173/demo-source/chapters/c1.html'
    )
  })
  it('绝对地址与根路径原样返回', () => {
    expect(resolveExtracted('https://other.com/x', 'http://localhost:5173/')).toBe('https://other.com/x')
    expect(resolveExtracted('/root/x.html', 'http://localhost:5173/')).toBe('/root/x.html')
  })
})

describe('searchSource 搜索', () => {
  it('提取结果并按关键词过滤', async () => {
    stubFetch(SEARCH_HTML)
    const results = await searchSource(DEMO_SOURCE, '测试')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('测试之书')
    expect(results[0].author).toBe('作者：张三')
    expect(results[0].bookUrl).toMatch(/books\/test-book\.html$/)
  })

  it('关键词不匹配时结果为空', async () => {
    stubFetch(SEARCH_HTML)
    const results = await searchSource(DEMO_SOURCE, '不存在的词')
    expect(results).toHaveLength(0)
  })
})

describe('fetchChapters 目录抓取', () => {
  it('章节标题与 URL（相对页面解析）', async () => {
    stubFetch(TOC_HTML)
    const chapters = await fetchChapters(DEMO_SOURCE, 'https://localhost/books/test-book.html')
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('第一章 开始')
    expect(chapters[0].url).toContain('chapters/c1.html')
  })
})

describe('fetchContent 正文抓取', () => {
  it('提取正文并保留段落', async () => {
    stubFetch(CONTENT_HTML)
    const text = await fetchContent(DEMO_SOURCE, 'https://localhost/chapters/c1.html')
    expect(text).toContain('第一段正文内容')
    expect(text).toContain('第二段正文内容')
  })

  it('选择器未命中报错', async () => {
    stubFetch('<html><body><div id="other">x</div></body></html>')
    await expect(fetchContent(DEMO_SOURCE, 'https://localhost/c1.html')).rejects.toThrow(/未匹配到选择器/)
  })

  it('未配置正文规则报错', async () => {
    const source: BookSource = { id: 'x', name: 'x', baseUrl: '', enabled: true, chapters: DEMO_SOURCE.chapters }
    await expect(fetchContent(source, 'https://localhost/c1.html')).rejects.toThrow(/未配置正文规则/)
  })
})
