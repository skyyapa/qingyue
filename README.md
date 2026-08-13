# 📖 轻阅 QingYue

一个开源的**小说阅读器**（Web），纯本地运行：导入 TXT / EPUB，即开即读。

> 书籍与进度只保存在你自己的浏览器（IndexedDB）里，不上传任何数据。

## ✨ 功能特性

- **本地导入阅读** — 支持 TXT / EPUB 格式，点击选择或直接拖拽，可多选批量导入；超大文件带进度条，单文件上限 200MB
- **中文编码自动识别** — UTF-8 / GB18030（兼容 GBK）/ Big5 / UTF-16（含无 BOM）自动判别，识别不了时可手动指定编码
- **EPUB 容错** — 自动跳过损坏章节、图片/样式类条目与外部链接，对扫描版等无正文电子书给出友好提示
- **数据备份** — 一键导出全部书籍 / 章节 / 分组 / 阅读统计为单个文件（大文件自动 gzip），支持合并式恢复
- **智能章节切分** — 自动识别「第X章 / 第X回 / 序章 / 楔子 / 番外 / 终章」等章节标题，书名作者自动提取；无章节标记的整本单章兜底
- **书架管理** —
  - 自定义分组（新建 / 删除分组，书籍一键归类）
  - 排序：最近阅读 / 最近导入 / 书名 / 手动拖拽排序
  - 按书名 / 作者即时搜索过滤
  - 生成式封面、一键删除（应用内确认对话框）
- **阅读占比** — 全书已读百分比按字数加权计算，书架卡片与阅读器底部实时显示
- **阅读统计** — 今日阅读时长、连续阅读天数、累计时长（仅保存在本机）
- **沉浸阅读体验** —
  - 字号 / 行距 / 字体（系统·宋体·黑体·楷体·衬线）自由调节
  - 四种主题：默认 / 夜间 / 护眼 / 羊皮纸
  - 两种翻页方式：连续滚动 / 翻页（分栏排版）
  - 目录抽屉，点击任意章节跳转
- **进度自动保存** — 阅读位置防抖写入 IndexedDB，刷新 / 重开浏览器无缝续读
- **快捷键** — `←` / `→` 翻页或翻章，`Esc` 关闭面板

## 🖼️ 截图

| 书架 | 阅读（日间） | 阅读（夜间） |
| --- | --- | --- |
| ![书架](docs/screenshots/bookshelf.png) | ![日间阅读](docs/screenshots/reader-default.png) | ![夜间阅读](docs/screenshots/reader-night.png) |

## 🚀 本地开发

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器（http://localhost:5173）
npm run build      # 类型检查 + 生产构建（输出 dist/）
npm run preview    # 预览构建产物
npm run type-check # 仅类型检查
```

## 🛠️ 技术栈

- **Vue 3**（`<script setup>`）+ **TypeScript** + **Vite**
- **vue-router** / **Pinia** 状态管理
- **IndexedDB**（原生封装，零依赖）存储书籍与进度
- **jszip** 解析 EPUB；手写 CSS 变量主题系统，无 UI 组件库

## 📁 项目结构

```
src/
├── db/          # IndexedDB 封装（books 元数据 / chapters 正文）
├── parsers/     # TXT（编码检测+章节切分）与 EPUB 解析器
├── stores/      # Pinia：书架（分组/排序）/ 阅读统计 / 阅读设置 / 阅读器
├── utils/       # 阅读占比、时长格式化等工具
├── views/       # BookshelfView 书架、ReaderView 阅读器
├── components/  # 导入对话框、书籍卡片、目录/设置面板、通用对话框
└── styles/      # 全局样式与四套主题变量
```

## 🚢 部署到 GitHub Pages

使用 hash 路由（`#/reader/xxx`），在任何静态托管下刷新深链接都不会 404。

仓库已内置 GitHub Actions 工作流（`.github/workflows/deploy-pages.yml`）：推送到 `main` 分支后自动构建并部署。

首次部署需在仓库 **Settings → Pages** 中把 Source 设为 **GitHub Actions**。若仓库改名，记得同步修改工作流里的 `--base=/qingyue/` 为 `--base=/新仓库名/`。

线上地址：<https://skyyapa.github.io/qingyue/>

## 🗺️ 路线图

- [ ] **在线书源 + 规则引擎**（搜索 / 目录 / 正文解析规则，类似「阅读」）
- [ ] EPUB 内嵌样式、插图与目录（NCX / nav）支持
- [ ] PWA 离线安装
- [ ] 阅读数据导出（JSON / CSV）

## 🤝 贡献

欢迎提交 Issue 和 PR！请先运行 `npm run type-check` 确保类型通过。

## 📄 License

[MIT](LICENSE) © 2026 轻阅 (QingYue) contributors
