// 轻阅代理 —— Cloudflare Worker 版（零依赖，可直接粘贴部署）
// 部署：https://dash.cloudflare.com → Workers & Pages → 创建 Worker → 粘贴本文件 → 部署
// 用法：https://你的worker地址/?url=https://目标网址（返回 HTML 文本，带 CORS 头）
export default {
  async fetch(request) {
    const url = new URL(request.url)
    const target = url.searchParams.get('url')
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (!target) {
      return new Response('缺少 url 参数', { status: 400, headers: cors })
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
      return new Response(text, {
        status: resp.status,
        headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' },
      })
    } catch (e) {
      return new Response('代理请求失败: ' + (e?.message ?? e), { status: 502, headers: cors })
    }
  },
}
