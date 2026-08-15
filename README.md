# 📖 轻阅 QingYue

一个开源的**小说阅读器**。纯本地运行：导入 TXT / EPUB，即开即读。

> 🔒 书籍与进度只保存在你的浏览器（IndexedDB）里，不上传任何数据。

> **v1.3.0-beta.1**（Android App Beta 已发布）：文件管理器「用轻阅打开」、系统分享导入、每日阅读提醒、单书分享导出。**v1.2.0**（AI 阅读助手）：OpenAI 兼容 Provider、九大阅读任务、防剧透机制。

## 🚀 立即使用

<p align="center">
  <a href="https://skyyapa.github.io/qingyue/"><img src="https://img.shields.io/badge/🚀-在线打开轻阅-4f7cff?style=for-the-badge" alt="在线打开" /></a>
  <a href="https://github.com/skyyapa/qingyue/releases/latest"><img src="https://img.shields.io/badge/⬇️-下载离线版-2ea44f?style=for-the-badge" alt="下载离线版" /></a>
  <a href="https://github.com/skyyapa/qingyue/releases/tag/v1.3.0-beta.1"><img src="https://img.shields.io/badge/🤖-Android APK（Beta）-1b6b93?style=for-the-badge" alt="下载 Android APK" /></a>
</p>

| 方式 | 怎么做 |
| --- | --- |
| 🌐 **在线使用** | 点上方按钮，浏览器直接用，数据存本机 |
| 📱 **装到桌面** | 打开在线版 → 点页面底部「安装」（iOS 用 Safari「分享 → 添加到主屏幕」） |
| ⬇️ **下载离线版** | 下载 zip → 解压 → 双击 index.html，断网也能读 |
| 🤖 **Android App（Beta）** | 下载 APK → 安装即用，支持文件管理器「用轻阅打开」 |

## ✨ 功能特性

### 📚 阅读体验

- 导入 TXT / EPUB，可批量；中文编码自动识别（UTF-8 / GB18030 / Big5 / UTF-16）
- EPUB 排版还原：内嵌 CSS 样式 + @font-face 字体 + 正文图片 + 目录解析
- 字号 / 行距 / 字体 / 十套主题 / 拟真书页效果 / 滚动·翻页双模式
- 触屏点按翻页（手机 App 式交互）、阅读位置记忆、正文搜索（本章 / 本书）
- 进度自动保存、阅读统计（今日时长 / 连续天数 / 月度热力图日历）
- 智能章节切分（第X章 / 序章 / 楔子 / 番外…）

### 🧠 阅读助手与 AI

- **本地知识库**（零成本）：自动识别人物 / 地点 / 势力 / 技能 / 物品 / 境界，事件时间线、人物关系图、章节摘要、正文内定位；支持人工修正
- **AI 阅读助手**（可选接入）：兼容 OpenAI / DeepSeek / Gemini / 本地 Ollama / LM Studio / vLLM；九大任务（前情回顾 / 剧情解释 / 人物关系 / 伏笔回顾 / 章节摘要…）
- **🔒 防剧透**：AI 只读已读章节，问「林夜的真实身份」不会剧透第 900 章答案

### 🌐 在线书源

- legado 风格书源规则（CSS 选择器 + 模板变量 + 管道），支持分页目录 / 正文分页 / 规则分享
- **JSON 书源**：支持 JSON 接口（JSONPath 字段），内置酷我小说正版书源
- 跨域三通道：自备代理（Cloudflare Worker 免费）/ 公共代理 / 直连；需代理书源自动标记并引导配置

### 📱 平台

- **PWA**：一键安装到桌面，离线可读
- **Android App**（Beta）：文件管理器「用轻阅打开」、系统分享导入、系统返回键、edge-to-edge 状态栏、每日阅读提醒、单书分享导出

## 🖼️ 截图

| 书架 | 日间阅读 | 夜间阅读 | 阅读助手 |
| --- | --- | --- | --- |
| ![书架](docs/screenshots/bookshelf.png) | ![日间阅读](docs/screenshots/reader-default.png) | ![夜间阅读](docs/screenshots/reader-night.png) | ![阅读助手](docs/screenshots/assistant-graph.png) |

## 🚀 本地开发

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器（http://localhost:5173）
npm run build      # 类型检查 + 生产构建
npm run android:sync  # 构建 Web 并同步进 Android 工程
npm run android:open  # 用 Android Studio 打开 Android 工程
```

**构建 Android APK**：需安装 [Android Studio](https://developer.android.com/studio)（含 SDK 与 JDK）。`npm run android:sync` 后，用 `npm run android:open` 打开工程点 Run，或命令行 `cd android && ./gradlew assembleDebug`。

## ✅ 质量保障

```bash
npm run lint       # ESLint 代码检查
npm run type-check # TypeScript 类型检查
npm run test       # 单元测试（Vitest 205 用例）
npm run e2e        # 端到端测试（Playwright 52 用例）
```

GitHub Actions 自动运行 CI（lint + type-check + 单测 + 构建 + E2E）。

[![CI](https://github.com/skyyapa/qingyue/actions/workflows/ci.yml/badge.svg)](https://github.com/skyyapa/qingyue/actions/workflows/ci.yml)

## 🛠️ 技术栈

- **Vue 3** + **TypeScript** + **Vite** + **vue-router** + **Pinia**
- **IndexedDB**（原生封装）存储书籍与进度；**jszip** 解析 EPUB
- 手写 CSS 变量主题系统，无 UI 组件库

## 📁 项目结构

```
src/
├── parsers/     # TXT（编码检测+章节切分）与 EPUB 解析器（含 CSS 子集排版）
├── analyze/     # 无 AI 知识库管线（新词发现 / 上下文分类 / 事件提取）
├── book-source/ # 在线书源引擎（规则模板 / 抓取 / 代理 / 分享导入）
├── ai/          # AI Provider 预设 / OpenAI 兼容客户端 / 进度感知任务
├── stores/      # Pinia：书架 / 设置 / 统计 / 阅读器 / 知识库
├── views/       # 书架、阅读器
├── components/  # 导入 / 目录 / 设置 / 助手面板、实体卡片、关系图等
└── styles/      # 全局样式与十套主题变量
```

## 🚢 部署

使用 hash 路由（`#/reader/xxx`），任何静态托管刷新深链接都不 404。仓库内置 GitHub Actions 工作流，推送 `main` 自动构建部署到 [GitHub Pages](https://skyyapa.github.io/qingyue/)。

首次部署需在仓库 **Settings → Pages** 把 Source 设为 **GitHub Actions**。若仓库改名，同步修改工作流里的 `--base=/qingyue/`。

## 🔌 部署书源代理

小说网站禁止浏览器跨域访问，在线书源需要代理转发（书源管理 → 代理设置）：

**Cloudflare Workers（推荐，免费）**
1. 打开 <https://dash.cloudflare.com> → Workers & Pages → 创建 Worker
2. 粘贴 [proxy/worker.js](proxy/worker.js) 的内容 → 部署
3. 把生成的 `https://xxx.workers.dev/` 填入「自备代理」

**Node（本地 / 自建服务器）**

```bash
node proxy/server.mjs   # 默认 8787 端口
```

也可直接用内置「公共代理」模式（不稳定，建议自备代理）。

## 🗺️ 路线图

- [x] ~~AI 核心~~（九任务 + 防剧透 + 阅读浮层 + 人物时间线 + 自动摘要 + 多模型）
- [x] ~~移动端体验~~（PWA 打磨 / 触屏手势 / 窄屏适配 / safe-area）
- [x] ~~Android App~~（v1.3.0-beta.1 已发布，vivo X200s / Android 16 真机验收通过）
- [ ] 多设备同步（阅读进度与书库跨设备）
- [ ] 语义级事件提取 —— 远期
- [ ] 书源规则分享社区 —— 远期
- [ ] 演示 GIF

## 🤝 贡献

欢迎提交 Issue 和 PR！提交前请先通过质量检查：

```bash
npm run lint && npm run type-check && npm run test
```

## 📄 License

[MIT](LICENSE) © 2026 轻阅 (QingYue) contributors
