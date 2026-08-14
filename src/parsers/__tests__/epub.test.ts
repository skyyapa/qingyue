import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { parseEpub } from '../epub'

/** 构造最小 EPUB（mimetype 必须第一个且不压缩） */
async function buildEpub(files: Record<string, string | Buffer>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return zip.generateAsync({ type: 'uint8array' }).then((b) => b.buffer as ArrayBuffer)
}

const OPF = (spineIds: string[], manifest: string) => `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:test</dc:identifier>
    <dc:title>测试书</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>${spineIds.map((id) => `<itemref idref="${id}"/>`).join('')}</spine>
</package>`

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`

const XHTML = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head>
<body><h1>${title}</h1>${body}</body></html>`

describe('parseEpub 正常解析', () => {
  it('spine 按序提取章节，标题不重复进正文', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['c1', 'c2'],
        '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>'
      ),
      'OEBPS/c1.xhtml': XHTML('第一章 山脚', '<p>第一段正文。</p><p>第二段正文。</p>'),
      'OEBPS/c2.xhtml': XHTML('第二章 森林', '<p>森林深处。</p>'),
    })
    const book = await parseEpub(epub, 'fallback')
    expect(book.title).toBe('测试书')
    expect(book.author).toBe('测试作者')
    expect(book.chapters).toHaveLength(2)
    expect(book.chapters[0].title).toBe('第一章 山脚')
    expect(book.chapters[0].text).not.toContain('第一章 山脚') // 标题已移除
    expect(book.chapters[0].text).toContain('第一段正文')
    expect(book.chapters[1].title).toBe('第二章 森林')
  })

  it('正文内嵌图片提取为 data URL，文本留占位符', async () => {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['c1'],
        '<item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/><item id="img1" href="images/pic.png" media-type="image/png"/>'
      ),
      'OEBPS/text/c1.xhtml': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head>
<body><h1>第一章</h1><p>图片前文字。</p><p>插图：<img src="../images/pic.png" alt="测试图"/></p><p>图片后文字。</p></body></html>`,
      'OEBPS/images/pic.png': Buffer.from(pngBase64, 'base64'),
    })
    const book = await parseEpub(epub, 'fallback')
    expect(book.chapterImages?.[0]).toHaveLength(1)
    expect(book.chapterImages![0][0]).toMatch(/^data:image\/png;base64,/)
    expect(book.chapters[0].text).toContain('[img:0]')
    expect(book.chapters[0].text).toContain('图片前文字')
    expect(book.chapters[0].text).toContain('图片后文字')
  })

  it('章节内小标题（h2）保留为标记段落', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['c1'],
        '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>'
      ),
      'OEBPS/c1.xhtml': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head>
<body><h1>第一章</h1><p>开头。</p><h2>一、山雨</h2><p>正文一。</p><h2>二、欲来</h2><p>正文二。</p></body></html>`,
    })
    const book = await parseEpub(epub, 'fallback')
    expect(book.chapters[0].text).toContain('# 一、山雨')
    expect(book.chapters[0].text).toContain('# 二、欲来')
    expect(book.chapters[0].text).not.toContain('# 第一章') // 章节标题已移除，不标记
  })

  it('EPUB2 NCX 目录优先于正文标题', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['c1', 'c2'],
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
          '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>' +
          '<item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>'
      ),
      'OEBPS/toc.ncx': `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1" playOrder="1"><navLabel><text>第一章 官方目录名</text></navLabel><content src="c1.xhtml"/></navPoint>
    <navPoint id="n2" playOrder="2"><navLabel><text>第二章 官方目录名</text></navLabel><content src="c2.xhtml"/></navPoint>
  </navMap>
</ncx>`,
      'OEBPS/c1.xhtml': XHTML('第一章 正文标题', '<p>正文一。</p>'),
      'OEBPS/c2.xhtml': XHTML('第二章 正文标题', '<p>正文二。</p>'),
    })
    const book = await parseEpub(epub, 'fallback')
    expect(book.chapters[0].title).toBe('第一章 官方目录名')
    expect(book.chapters[1].title).toBe('第二章 官方目录名')
  })

  it('EPUB3 nav 目录优先于正文标题', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['nav1', 'c1'],
        '<item id="nav1" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
          '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>'
      ),
      'OEBPS/nav.xhtml': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body><nav epub:type="toc"><ol>
  <li><a href="c1.xhtml">第三章 nav目录名</a></li>
</ol></nav></body></html>`,
      'OEBPS/c1.xhtml': XHTML('第三章 正文标题', '<p>正文。</p>'),
    })
    const book = await parseEpub(epub, 'fallback')
    expect(book.chapters[0].title).toBe('第三章 nav目录名')
  })

  it('跳过图片/样式条目与外部链接', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['img1', 'css1', 'c1', 'ext1'],
        '<item id="img1" href="p1.jpg" media-type="image/jpeg"/>' +
          '<item id="css1" href="style.css" media-type="text/css"/>' +
          '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>' +
          '<item id="ext1" href="https://example.com/elsewhere" media-type="application/xhtml+xml"/>'
      ),
      'OEBPS/p1.jpg': 'fake-jpeg',
      'OEBPS/style.css': 'body{}',
      'OEBPS/c1.xhtml': XHTML('第一章', '<p>正文。</p>'),
    })
    const book = await parseEpub(epub, 'fallback')
    expect(book.chapters).toHaveLength(1)
    expect(book.chapters[0].title).toBe('第一章')
  })

  it('缺失章节文件自动跳过', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['c1', 'c2'],
        '<item id="c1" href="missing.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="real.xhtml" media-type="application/xhtml+xml"/>'
      ),
      'OEBPS/real.xhtml': XHTML('第二章 真实', '<p>这一章存在。</p>'),
    })
    const book = await parseEpub(epub, 'fallback')
    expect(book.chapters).toHaveLength(1)
    expect(book.chapters[0].title).toBe('第二章 真实')
  })

  it('内嵌 CSS 提取段落排版样式（缩进/对齐/字号），body 规则继承', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['c1', 'css1'],
        '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>' +
          '<item id="css1" href="style.css" media-type="text/css"/>'
      ),
      'OEBPS/style.css': 'body { line-height: 1.6; } p { text-indent: 2em; } p.center { text-align: center; font-size: 20px; }',
      'OEBPS/c1.xhtml': XHTML('第一章', '<p>普通段落。</p><p class="center">居中段落。</p>'),
    })
    const book = await parseEpub(epub, 'fallback')
    const styles = book.chapters[0].paragraphStyles
    expect(styles).toHaveLength(2)
    expect(styles?.[0]).toMatchObject({ textIndent: '2em', lineHeight: '1.6' })
    expect(styles?.[1]).toMatchObject({ textIndent: '2em', textAlign: 'center', fontSize: '1.25em' })
  })

  it('行内粗体/斜体/下划线保留为 [b]/[i]/[u] 标记', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['c1'],
        '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>'
      ),
      'OEBPS/c1.xhtml': XHTML('第一章', '<p>这是<strong>重点</strong>与<em>斜体</em>及<u>下划线</u>，还有<b>粗</b>。</p>'),
    })
    const book = await parseEpub(epub, 'fallback')
    const text = book.chapters[0].text
    expect(text).toContain('[b]重点[/b]')
    expect(text).toContain('[i]斜体[/i]')
    expect(text).toContain('[u]下划线[/u]')
    expect(text).toContain('[b]粗[/b]')
    expect(text).not.toContain('<strong>')
  })

  it('内联 style 的粗体/斜体同样标记', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['c1'],
        '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>'
      ),
      'OEBPS/c1.xhtml': XHTML('第一章', '<p>带<span style="font-weight:bold">内联粗体</span>的段落。</p>'),
    })
    const book = await parseEpub(epub, 'fallback')
    expect(book.chapters[0].text).toContain('[b]内联粗体[/b]')
  })
})

describe('parseEpub 容错', () => {
  it('container.xml 损坏报友好错误', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': '<container version="1.0"><rootfiles><rootfile full-path="OEBPS/</container>',
    })
    await expect(parseEpub(epub, 'x')).rejects.toThrow(/XML 解析失败|损坏/)
  })

  it('空 spine 报错', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>空书</dc:title></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine></spine></package>`,
      'OEBPS/c1.xhtml': XHTML('第一章', '<p>正文</p>'),
    })
    await expect(parseEpub(epub, 'x')).rejects.toThrow(/spine|目录/)
  })

  it('全是图片（扫描版）报友好错误', async () => {
    const epub = await buildEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': OPF(
        ['img1'],
        '<item id="img1" href="p1.jpg" media-type="image/jpeg"/>'
      ),
      'OEBPS/p1.jpg': 'fake-jpeg',
    })
    await expect(parseEpub(epub, 'x')).rejects.toThrow(/扫描版|图片型/)
  })

  it('不是有效的 zip 报错', async () => {
    await expect(parseEpub(new Uint8Array([1, 2, 3, 4]).buffer, 'x')).rejects.toThrow(/不是有效的 EPUB/)
  })
})
