import { beforeEach, describe, expect, it, vi } from 'vitest'
import { extractField, fetchChapters, fetchContent, renderTemplate, resolveExtracted, searchSource, jsonPath, jsonField, renderJsonTemplate, MAX_TOC_PAGES, MAX_CONTENT_PAGES } from '../engine'
import { DEMO_SOURCE, KUWO_SOURCE } from '../store'
import type { BookSource } from '../types'

/** 模拟同源 fetch（返回 HTML 文本）；跨源走 allorigins /get 时返回 JSON 包装的 contents */
function stubFetch(html: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const isAllorigins = String(input).includes('api.allorigins.win/get')
      const body = isAllorigins ? JSON.stringify({ contents: html }) : html
      return new Response(body, {
        status: 200,
        headers: { 'content-type': isAllorigins ? 'application/json' : 'text/html; charset=utf-8' },
      })
    })
  )
}

/** 按目标 URL 分发响应的 fetch mock（兼容代理通道：从 ?url= 参数还原目标地址；allorigins /get 返回 JSON contents） */
function stubFetchMap(map: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const raw = String(input)
      const isAllorigins = raw.includes('api.allorigins.win/get')
      const q = raw.indexOf('?url=')
      const target = q >= 0 ? decodeURIComponent(raw.slice(q + 5)) : raw
      const html = map[target]
      if (html === undefined) return new Response('not found', { status: 404 })
      const body = isAllorigins ? JSON.stringify({ contents: html }) : html
      return new Response(body, {
        status: 200,
        headers: { 'content-type': isAllorigins ? 'application/json' : 'text/html; charset=utf-8' },
      })
    })
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

  it('@text 规则取元素自身文本并应用管道', async () => {
    stubFetch('<html><body><div id="content"><p>页一</p><p>页二</p></div></body></html>')
    const source: BookSource = {
      ...DEMO_SOURCE,
      content: { url: '{{chapterUrl}}', content: '#content@text|replace:页,段' },
    }
    const text = await fetchContent(source, 'https://localhost/c1.html')
    expect(text).toContain('段一')
    expect(text).toContain('段二')
  })

  it('未配置正文规则报错', async () => {
    const source: BookSource = { id: 'x', name: 'x', baseUrl: '', enabled: true, chapters: DEMO_SOURCE.chapters }
    await expect(fetchContent(source, 'https://localhost/c1.html')).rejects.toThrow(/未配置正文规则/)
  })
})

describe('fetchChapters 分页目录', () => {
  const source: BookSource = {
    ...DEMO_SOURCE,
    chapters: { ...DEMO_SOURCE.chapters!, next: '.toc-next' },
  }

  it('跟随 next 链接跨页抓取并合并', async () => {
    stubFetchMap({
      'https://localhost/books/paged-book.html': `<ul id="toc">
        <li><a href="../chapters/paged-01.html">第一章 风起</a></li>
        <li><a href="../chapters/paged-02.html">第二章 云涌</a></li>
      </ul><a class="toc-next" href="paged-book-2.html">下一页 ›</a>`,
      'https://localhost/books/paged-book-2.html': `<ul id="toc">
        <li><a href="../chapters/paged-03.html">第三章 雨落</a></li>
        <li><a href="../chapters/paged-04.html">第四章 雷动</a></li>
      </ul>`,
    })
    const chapters = await fetchChapters(source, 'https://localhost/books/paged-book.html')
    expect(chapters).toHaveLength(4)
    expect(chapters.map((c) => c.title)).toEqual(['第一章 风起', '第二章 云涌', '第三章 雨落', '第四章 雷动'])
    expect(chapters[3].url).toContain('chapters/paged-04.html')
  })

  it('next 指向自身时停止（防死循环）', async () => {
    stubFetchMap({
      'https://localhost/books/loop.html': `<ul id="toc"><li><a href="../chapters/c1.html">第一章</a></li></ul>
        <a class="toc-next" href="loop.html">下一页</a>`,
    })
    const chapters = await fetchChapters(source, 'https://localhost/books/loop.html')
    expect(chapters).toHaveLength(1)
  })

  it('超过目录分页上限时停止', async () => {
    const map: Record<string, string> = {}
    for (let i = 0; i <= MAX_TOC_PAGES; i++) {
      const next = i < MAX_TOC_PAGES ? `<a class="toc-next" href="p${i + 1}.html">下一页</a>` : ''
      map[`https://localhost/books/p${i}.html`] = `<ul id="toc"><li><a href="../chapters/c${i}.html">第${i}章</a></li></ul>${next}`
    }
    stubFetchMap(map)
    const chapters = await fetchChapters(source, 'https://localhost/books/p0.html')
    expect(chapters).toHaveLength(MAX_TOC_PAGES)
  })
})

describe('fetchContent 正文分页', () => {
  const source: BookSource = {
    ...DEMO_SOURCE,
    content: { ...DEMO_SOURCE.content!, next: '.content-next' },
  }

  it('跟随 next 链接拼接多页正文', async () => {
    stubFetchMap({
      'https://localhost/chapters/c1.html': `<div id="content"><p>　　第一页内容。</p></div>
        <a class="content-next" href="c1b.html">下一页 ›</a>`,
      'https://localhost/chapters/c1b.html': `<div id="content"><p>　　第二页内容。</p></div>`,
    })
    const text = await fetchContent(source, 'https://localhost/chapters/c1.html')
    expect(text).toContain('第一页内容')
    expect(text).toContain('第二页内容')
  })

  it('后续页缺正文时停止拼接（不报错）', async () => {
    stubFetchMap({
      'https://localhost/chapters/c1.html': `<div id="content"><p>　　第一页内容。</p></div>
        <a class="content-next" href="c1b.html">下一页 ›</a>`,
      'https://localhost/chapters/c1b.html': `<html><body><div id="nope">x</div></body></html>`,
    })
    const text = await fetchContent(source, 'https://localhost/chapters/c1.html')
    expect(text).toContain('第一页内容')
    expect(text).not.toContain('第二页内容')
  })

  it('超过正文分页上限时停止', async () => {
    const map: Record<string, string> = {}
    for (let i = 0; i <= MAX_CONTENT_PAGES; i++) {
      const next = i < MAX_CONTENT_PAGES ? `<a class="content-next" href="c${i + 1}.html">下一页</a>` : ''
      map[`https://localhost/chapters/c${i}.html`] = `<div id="content"><p>　　第${i}页片段。</p></div>${next}`
    }
    stubFetchMap(map)
    const text = await fetchContent(source, 'https://localhost/chapters/c0.html')
    for (let i = 0; i < MAX_CONTENT_PAGES; i++) {
      expect(text).toContain(`第${i}页片段`)
    }
  })
})

describe('JSONPath 工具', () => {
  it('jsonPath 提取字段与数组元素', () => {
    const data = { code: 200, data: [{ title: '三体', book_id: '123' }], meta: { total: 1 } }
    expect(jsonPath(data, '$.data')).toHaveLength(1)
    expect(jsonPath(data, '$.data[0].title')).toBe('三体')
    expect(jsonPath(data, '$.data[0]["book_id"]')).toBe('123')
    expect(jsonPath(data, '$.meta.total')).toBe(1)
    expect(jsonPath(data, '$.nope')).toBeUndefined()
    expect(jsonPath(data, 'bad')).toBeUndefined()
  })

  it('jsonField 按字段规则取值并应用 replace 管道', () => {
    const item = { title: '三体 全集', author_name: '刘慈欣' }
    expect(jsonField(item, '$.title')).toBe('三体 全集')
    expect(jsonField(item, '$.title|replace:全集,')).toBe('三体')
    expect(jsonField(item, '$.nope')).toBe('')
  })

  it('renderJsonTemplate 支持 {{$.字段}} 与外部变量', () => {
    const item = { chapter_id: 'c1', book_id: 'b1' }
    expect(renderJsonTemplate('/book/{{$.book_id}}/chapters/{{$.chapter_id}}', item, {})).toBe('/book/b1/chapters/c1')
    expect(renderJsonTemplate('/book/{{bookUrl}}/x', item, { bookUrl: 'B1' })).toBe('/book/B1/x')
  })
})

describe('JSON 格式书源（酷我小说）', () => {
  /** JSON 书源 fetch mock：按路径匹配返回 JSON（兼容 host 前缀与代理包装） */
  function stubJson(map: Record<string, string>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const raw = String(input)
        // 兼容公共代理包装：从 ?url= 还原目标地址（allorigins /get）
        const isProxy = raw.includes('api.allorigins.win/get')
        const q2 = raw.indexOf('?url=')
        const effective = isProxy && q2 >= 0 ? decodeURIComponent(raw.slice(q2 + 5)) : raw
        const q = effective.indexOf('?')
        const noQuery = q >= 0 ? effective.slice(0, q) : effective
        // 去掉 host 前缀后按路径匹配
        const path = noQuery.replace(/^https?:\/\/[^/]+/, '')
        const html = map[path] ?? map[noQuery] ?? map[effective]
        if (html === undefined) return new Response('not found', { status: 404 })
        return new Response(html, { status: 200, headers: { 'content-type': 'application/json' } })
      })
    )
  }

  beforeEach(() => {
    localStorage.setItem('qingyue:proxy', JSON.stringify({ mode: 'direct', customUrl: '' }))
  })

  it('搜索：JSONPath 提取列表、字段与 book_id', async () => {
    stubJson({
      '/novels/api/book/search': JSON.stringify({
        code: 200,
        data: [{ title: '三体：史上最称职的面壁者', author_name: '火炀', book_id: '21041885901615104' }],
      }),
    })
    const results = await searchSource(KUWO_SOURCE, '三体')
    expect(results).toHaveLength(1)
    expect(results[0].title).toContain('三体')
    expect(results[0].author).toBe('火炀')
    expect(results[0].bookUrl).toBe('21041885901615104')
  })

  it('搜索：关键词不匹配过滤为空', async () => {
    stubJson({
      '/novels/api/book/search': JSON.stringify({ code: 200, data: [{ title: '斗破苍穹', author_name: '土豆', book_id: 'b2' }] }),
    })
    const results = await searchSource(KUWO_SOURCE, '三体')
    expect(results).toHaveLength(0)
  })

  it('目录：JSONPath 列表 + itemUrl 模板拼接完整章节 URL', async () => {
    stubJson({
      '/novels/api/book/b1/chapters': JSON.stringify({
        code: 200,
        data: [
          { chapter_id: 'c1', chapter_title: '第一章 开始' },
          { chapter_id: 'c2', chapter_title: '第二章 展开' },
        ],
      }),
    })
    const chapters = await fetchChapters(KUWO_SOURCE, 'b1')
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('第一章 开始')
    expect(chapters[0].url).toContain('/novels/api/book/b1/chapters/c1')
  })

  it('正文：JSONPath 提取 content 并清洗', async () => {
    stubJson({
      '/novels/api/book/b1/chapters/c1': JSON.stringify({
        code: 200,
        data: { content: '　　第一段正文。\r\n　　第二段正文。' },
      }),
    })
    const text = await fetchContent(KUWO_SOURCE, '/novels/api/book/b1/chapters/c1')
    expect(text).toContain('第一段正文')
    expect(text).toContain('第二段正文')
  })

  it('返回非 JSON 时给出明确错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>not json</html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    )
    await expect(searchSource(KUWO_SOURCE, '三体')).rejects.toThrow(/不是 JSON/)
  })
})
