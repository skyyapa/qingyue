// 轻阅代理 —— Node 版（零依赖，node 18+）
// 启动：node proxy/server.mjs  （默认端口 8787，可用 PORT 环境变量覆盖）
// 用法：http://localhost:8787/?url=https://目标网址（返回 HTML 文本，带 CORS 头）
import http from 'node:http'

const PORT = process.env.PORT || 8787

http
  .createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const url = new URL(req.url, 'http://localhost')
    const target = url.searchParams.get('url')
    if (!target) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('缺少 url 参数')
      return
    }
    try {
      const resp = await fetch(target, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
      })
      const text = await resp.text()
      res.writeHead(resp.status, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(text)
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('代理请求失败: ' + (e?.message ?? e))
    }
  })
  .listen(PORT, () => {
    console.log(`轻阅代理已启动: http://localhost:${PORT}/?url=...`)
  })
