# QingYue 轻阅 —— AI 续接上下文（会话状态摘要）

> 本文档给被压缩/新开的会话快速续接用。完整迭代史、踩坑与测试方法见 `PROJECT.md`、`README.md`。
> **注意：每次迭代完成后需同步更新本文件「当前状态」与 PROJECT.md/README。**

## 当前状态（截至迭代 46，v1.3.0-beta.1 已发布 GitHub prerelease，真机验收通过，实时引导已上线）

- **版本**：`1.3.0-beta.1`（package.json 与 Android versionCode 2 / versionName 1.3.0-beta.1；**已发布 GitHub prerelease**：https://github.com/skyyapa/qingyue/releases/tag/v1.3.0-beta.1 —— 签名 APK/AAB + 离线版 zip + SHA-256）
- **测试基线**：单测 **210**（26 套件）/ e2e **54**（chromium 47 + webkit-ios 7）/ type-check / lint / build 全绿；Android `assembleRelease` + `bundleRelease` 签名构建全绿；`assembleDebug`（含 local-notifications + share 插件）全绿
- **真机验收**：vivo X200s（Android 16）8 项全过——TXT/EPUB 文件管理器打开（冷启动）、ACTION_SEND、翻章+进度持久化、返回键优先级、每日提醒（权限+调度）、夜间主题+状态栏、分享导出面板
- **签名**：本机 release keystore（`%LOCALAPPDATA%\QingYue\keystore\qingyue-release.jks`，仓库外）；`android/key.properties` 不入库；证书 SHA-256 `5f9b67e549639ea9fb3e51242c20136511eccb91746e16c1ba8a21d45943b1a7`
- **工作区**：main 与 origin/main 同步
- **最近迭代**：
  - 34：v1.3 Android M2 准备（processedUris 失败可重试 + 成功短窗去重、MIME 无扩展名文件名标准化 +2 单测、safe-area 映射 Capacitor 注入变量、版本同步 1.3.0-beta.1、签名 keystore + signingConfig、签名 APK/AAB 构建）
  - 35：Android 每日阅读提醒 —— 新增 @capacitor/local-notifications 插件、settings 加 readingReminder（enabled/hour/minute，sanitize 校验）、utils/reminder.ts 纯函数（文案+每日重复调度）、capacitor.ts syncReadingReminder（权限申请/调度/取消）、App.vue watch 重调度、设置面板时间选择器 + 提示（Web 忽略）；单测 +6（185）；**真机未连接，验收仍为阻塞项**
  - 36：Android 单书分享导出 —— @capacitor/share 接入：utils/intent-uri.ts 加 blobToBase64（剥 data: 前缀）、capacitor.ts shareBookFile（Blob→base64→写缓存目录→Share.share，Web/失败回退下载）、BookshelfView 分支、BookCard 平台感知文案（原生「分享本书」/Web「导出本书」）；单测 +2（187）；**真机未连接，验收仍为阻塞项**
  - 37：公共代理失效修复 —— allorigins /raw（常 520）改 /get（JSON contents 解析）、移除需 key 的 corsproxy.io、通道统一带超时函数、testProxy 改收 ProxyConfig（public 实测公共通道而非空 customUrl）、BookSourceDialog public 模式加「测试公共代理」按钮；单测 +5（192，新增 requester.test.ts）
  - 38：演示书源 404 修复 —— search.url 前导斜杠 `/demo-source/...` 在 GitHub Pages 子目录 `/qingyue/` 与离线版下解析到根路径 404 → 改相对路径 + toAbsoluteUrl 以 document.baseURI 为 base；curl 实测线上 `/qingyue/demo-source/` 200 / 根 404 确认
  - 39：演示书源 404 修复补丁 —— loadSources 对 localStorage 残留的旧版 demo（前导斜杠 URL）强制用内置定义覆盖（存量用户线上新代码失效的根因）；单测 +2（194）；真实浏览器线上实测搜「数据」返回「数据之海」
  - 40：内置公共书源酷我小说 + JSON 书源引擎 —— BookSource.format='json'（JSONPath 列表/字段/正文）、jsonPath/jsonField/renderJsonTemplate、BUILTIN_SOURCES（demo+kuwo，覆盖规则保留 enabled）、搜索整体 8s 限时、自备代理部署引导；单测 +9（203）；**关键约束：浏览器 fetch 酷我 API 被 CORS 拦截，必须配代理才能用**
  - 41：欢迎引导 —— 新增 WelcomeGuide.vue（全屏功能速览 + 「以后不再显示」勾选记忆，localStorage qingyue:welcome-dismissed，未勾选每次打开都弹）、App.vue 全局挂载、e2e storageState 预置跳过 + welcome.spec 3 用例；e2e 48→51
  - 42：需代理书源透明化 —— sourceNeedsProxy（baseUrl 非空即需代理）、书源列表「需代理」标记、搜索前置引导（未配自备代理时提示 + 一键查看部署教程，openGuide prop 自动切 custom）、欢迎页 Android 文案改「Beta 即将发布」；单测 +2（205）、e2e +1（52）
  - 43：v1.3 Android 真机验收 —— vivo X200s / Android 16，8 项全过（TXT/EPUB 文件管理器打开、ACTION_SEND、翻章+进度持久化、返回键、每日提醒、夜间主题+状态栏、分享导出）；方法：adb intent + WebView CDP 断言；待人工 GUI 确认项（分享目标接收、大文件压力）非阻塞
  - 44：实时引导 —— 欢迎卡（轻量居中）→ 书架 spotlight 分步高亮四入口（导入/搜索/书源/AI，遮罩挖洞+气泡+下一步/完成/跳过）；完成记忆、直接使用不记忆仍弹；e2e welcome 3→4
  - 45：实时引导修复 —— 非书架路由「开始引导」跳回书架（原断点）、placement（top/bottom/right）真正生效 + 气泡上下视口钳制；e2e welcome 4→5
  - 46：代码审查修复 4 bug —— 公共代理超时失效（runChannel signal 未接 fetch，15s 超时形同虚设）、AI 实体写库 DataCloneError（AssistantPanel 深层 reactive 数组 → putEntity 剥 Proxy）、全量备份 .json 误路由 + 批量导入不中断、db req()/listByBook 缺 onabort 挂起；单测 +5（210）、e2e 54

## 核心架构速查

- Vue 3 + TS + Vite + Pinia，纯本地（IndexedDB v3 六 store + localStorage）
- **AI 体系**：`src/ai/presets.ts`（7 预设 OpenAI 兼容）、`client.ts`（chat/completions）、`assistant.ts`（11 任务 + 防剧透 + tier 路由 + 按需检索）、`stores/ai.ts`
- **防剧透**：`loadKnowledge(upTo)` 只读已读章节（未来实体剔除/计数重建/chapterWeights 求和/旧关系与无出处例句剔除 + staleData 提示）；`planChapterLoads` + `getChapter` 懒加载正文
- **知识库**：实体 7 类型（含 realm 境界）+ 事件句 + 时间线 + 共现关系（含 chapterWeights）

## 工作约定（用户明确要求）

1. **自主迭代**：用户说「继续迭代」= 自主选方向实施，完成后**提交并推送 GitHub**，不再询问
2. **README 同步**：每次迭代完成必须更新 README（功能特性 + 测试数量 165/33 + 路线图）
3. 提交信息风格：`feat:/fix:/docs: 主题 —— 细节`
4. 测试全绿才提交：`npm run type-check && npm run lint && npm test && npm run e2e && npm run build`
5. 防剧透是产品核心卖点，任何 AI 上下文改动不得破坏

## 下一步候选（用户路线图：移动端体验 ✅ → Android（Capacitor）→ 多设备同步）

- **v1.3.0 正式版前置**：第二台不同厂商设备真机验收；待人工 GUI 确认（非阻塞）：
  分享目标实际接收 .qingyue、10/50MB 大文件压力。通过后发 v1.3.0 正式版（tag 不
  带 -beta，APK/AAB 同签名重发）
- **Android 后续能力**：本地通知已完成（每日阅读提醒）、分享导出已完成；ACTION_SEND 已完成
- **公共书源/代理**：JSON 引擎 + 酷我书源已完成；真实书源必须配代理，推荐自备
  Cloudflare Worker（免费 10 万次/天，书源管理内置部署引导）
- **内置公共书源**：酷我小说（kuwo，官方 JSON API，正版）；**浏览器 fetch 被 CORS 拦截，
  必须配代理才能用**——书源管理→自备代理→按引导部署免费 Worker 填地址
- **演示书源 404 踩坑**：public 子目录资源不能用前导斜杠（`/demo-source/...` 在
  `/qingyue/` 子目录/离线版下 404）→ 用相对路径 + toAbsoluteUrl 以 document.baseURI 为 base
- **多设备同步**：阅读进度与书库跨设备（需自建后端或第三方服务，超出纯前端约束）
- 远期（AI 不再堆新功能，用户明确）：语义级事件提取、书源规则分享社区、README 演示 GIF

## 踩坑速查（详见 PROJECT.md 47 条）

- npm 装依赖网络慢约 7 分钟；typescript 锁 5.9（vue-tsc 与 TS7 不兼容）
- Git Bash 下 taskkill 需 `//PID`；PowerShell 脚本需 UTF-8 BOM
- fake-indexeddb 用 setImmediate：组件测试需 settle（flushPromises + setTimeout）
- e2e 断言避免写死翻页次数；Playwright 下载临时文件无扩展名（导入需文件头嗅探）
- 实体卡片 flex 压缩会压没底部按钮 → `.entity-card` 加 overflow-y auto；
  **overflow 项 min-height 归零仍会被压没**（例句区 h=0 被时间线盖住）→ 卡内区块 `flex-shrink: 0`
- Playwright `devices['iPhone 13']` 带 defaultBrowserType: webkit——describe 内
  `test.use()` 报 "forces a new worker"（需剔除）；项目级 `use` 里合法（webkit-ios 项目用它跑真 WebKit）
- Capacitor：`eslint .` 会扫 android/ 生成代码（需 ignore）；readFile 原生端返回
  base64 字符串（Blob 仅 Web）；content URI 文件名要剥 `primary:` 卷前缀（详见 PROJECT.md 52-53）
- 面板打开时 ⚡ 浮层要隐藏（避免遮挡抽屉）
- Playwright addInitScript 每次导航都执行（含 reload）：「仅首次清 localStorage」用
  sessionStorage 标记而非 window 属性（刷新丢）；全屏弹层用 storageState 预置跳过不挡既有测试
