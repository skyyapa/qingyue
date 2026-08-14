# QingYue 轻阅 —— AI 续接上下文（会话状态摘要）

> 本文档给被压缩/新开的会话快速续接用。完整迭代史、踩坑与测试方法见 `PROJECT.md`、`README.md`。
> **注意：每次迭代完成后需同步更新本文件「当前状态」与 PROJECT.md/README。**

## 当前状态（截至迭代 29，提交 3d824ff）

- **版本**：`1.2.0`（package.json 与 v1.2.0 Release 已发布，离线包 workflow success）
- **测试基线**：单测 **165**（21 套件）/ e2e **33** / type-check / lint / build 全绿
- **工作区**：干净，main 与 origin/main 同步
- **最近迭代**：
  - 28：产品化（P0 防剧透终测 150 章夹具 + P1 顶栏 ✨/自动摘要/今日回顾 + P2 管家人格）
  - 29：AI 阅读浮层（⚡ 四操作+人物 chips+底部面板）、人物经历时间线（EntityCard+personTimeline）、daily 结构化（主要事件/新增人物/未解决伏笔）、多模型策略（easy/summary tier 模型）

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

## 下一步候选（用户路线图）

- AI 语义级事件提取（三年之约类剧情事件）——需 LLM，v1 已用事件句/时间线替代
- 书源规则分享社区 / 规则包市场（需集中式分发渠道）
- README 演示 GIF
- 用户最新产品化优先级：AI 阅读浮层（✅29）/ 人物时间线（✅29）/ 自动章节总结（✅28-29）/ 多模型策略（✅29）——已完成，可继续打磨细节或探索新方向

## 踩坑速查（详见 PROJECT.md 47 条）

- npm 装依赖网络慢约 7 分钟；typescript 锁 5.9（vue-tsc 与 TS7 不兼容）
- Git Bash 下 taskkill 需 `//PID`；PowerShell 脚本需 UTF-8 BOM
- fake-indexeddb 用 setImmediate：组件测试需 settle（flushPromises + setTimeout）
- e2e 断言避免写死翻页次数；Playwright 下载临时文件无扩展名（导入需文件头嗅探）
- 实体卡片 flex 压缩会压没底部按钮 → `.entity-card` 加 overflow-y auto
- 面板打开时 ⚡ 浮层要隐藏（避免遮挡抽屉）
