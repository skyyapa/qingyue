# QingYue 轻阅 —— AI 续接上下文（会话状态摘要）

> 本文档给被压缩/新开的会话快速续接用。完整迭代史、踩坑与测试方法见 `PROJECT.md`、`README.md`。
> **注意：每次迭代完成后需同步更新本文件「当前状态」与 PROJECT.md/README。**

## 当前状态（截至迭代 36，v1.3.0-beta.1：Android 每日阅读提醒 + 单书分享导出已实现，真机验收仍阻塞）

- **版本**：`1.3.0-beta.1`（package.json 与 Android versionCode 2 / versionName 1.3.0-beta.1；GitHub Latest 仍为 v1.2.0，Beta 未发布）
- **测试基线**：单测 **187**（24 套件）/ e2e **48**（chromium 41 + webkit-ios 7）/ type-check / lint / build 全绿；Android `assembleRelease` + `bundleRelease` 签名构建全绿；`assembleDebug`（含 local-notifications + share 插件）全绿
- **签名**：本机 release keystore（`%LOCALAPPDATA%\QingYue\keystore\qingyue-release.jks`，仓库外）；`android/key.properties` 不入库；证书 SHA-256 `5f9b67e549639ea9fb3e51242c20136511eccb91746e16c1ba8a21d45943b1a7`
- **工作区**：main 与 origin/main 同步
- **最近迭代**：
  - 34：v1.3 Android M2 准备（processedUris 失败可重试 + 成功短窗去重、MIME 无扩展名文件名标准化 +2 单测、safe-area 映射 Capacitor 注入变量、版本同步 1.3.0-beta.1、签名 keystore + signingConfig、签名 APK/AAB 构建）
  - 35：Android 每日阅读提醒 —— 新增 @capacitor/local-notifications 插件、settings 加 readingReminder（enabled/hour/minute，sanitize 校验）、utils/reminder.ts 纯函数（文案+每日重复调度）、capacitor.ts syncReadingReminder（权限申请/调度/取消）、App.vue watch 重调度、设置面板时间选择器 + 提示（Web 忽略）；单测 +6（185）；**真机未连接，验收仍为阻塞项**
  - 36：Android 单书分享导出 —— @capacitor/share 接入：utils/intent-uri.ts 加 blobToBase64（剥 data: 前缀）、capacitor.ts shareBookFile（Blob→base64→写缓存目录→Share.share，Web/失败回退下载）、BookshelfView 分支、BookCard 平台感知文案（原生「分享本书」/Web「导出本书」）；单测 +2（187）；**真机未连接，验收仍为阻塞项**

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

- **v1.3 Android 真机验收（阻塞中）**：等待至少一台 Android 真机接入（USB 调试）——
  TXT/EPUB 文件管理器打开、冷/热启动、ACTION_SEND、中文/空格/特殊文件名、
  10MB/50MB/大文件压力、夜间主题 + 手势导航 + 刘海/挖孔、返回键优先级；
  验收通过后再创建 `v1.3.0-beta.1` tag 发布 GitHub prerelease（签名 APK/AAB + SHA-256）。
  第二台不同厂商设备是 v1.3.0 正式版的发布前置条件
- **Android 后续能力**：本地通知已完成（每日阅读提醒）、分享导出已完成；ACTION_SEND 已完成
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
