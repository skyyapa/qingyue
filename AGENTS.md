# QingYue 轻阅 —— AI 续接上下文（会话状态摘要）

> 本文档给被压缩/新开的会话快速续接用。完整迭代史、踩坑与测试方法见 `PROJECT.md`、`README.md`。
> **注意：每次迭代完成后需同步更新本文件「当前状态」与 PROJECT.md/README。**

## 当前状态（截至迭代 33，v1.3 Android（Capacitor）M1：Debug APK + API 35 模拟器已验证）

- **版本**：`1.2.0`（package.json 与 v1.2.0 Release 已发布，离线包 workflow success）
- **测试基线**：单测 **177**（23 套件）/ e2e **48**（chromium 41 + webkit-ios 7）/ type-check / lint / build 全绿；Android `assembleDebug` 全绿
- **工作区**：干净，main 与 origin/main 同步
- **最近迭代**：
  - 31：移动阅读交互收尾 M1（中央点按工具栏、三区点按翻页、浮层 safe-area、分组删除去 hover、webkit-ios 真 WebKit 验证）
  - 32：v1.3 Android M0（Capacitor 8 工程集成、content URI → File → 自动导入、返回键、状态栏桥接）
  - 33：v1.3 Android M1（getLaunchUrl 冷启动 + URI 去重、IntentFilePlugin 处理 opaque content URI 真实文件名/MIME、SystemBars edge-to-edge、ACTION_SEND、JDK21/SDK/Android Studio 安装、Debug APK + API35 模拟器安装启动/手势条/弹窗返回键/content VIEW+SEND intent 验证）

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

- **v1.3 Android 收尾**：真机验证（TXT / EPUB、文件管理器「用轻阅打开」、ACTION_SEND、
  返回键、深浅主题 + 刘海/手势条）、签名 release APK；模拟器验证已完成，不能替代真机
- **Android 后续能力**：本地通知（章节摘要/阅读提醒）、分享导出；ACTION_SEND 已完成
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
