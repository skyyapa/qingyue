# 轻阅 QingYue — 项目维护文档

> 本文档是**开发维护备忘**（给 AI 助手与协作者续接上下文用），对外介绍请看 [README.md](./README.md)。
> 每次迭代后需同步更新：已完成 / 未完成 / 踩坑记录。

---

## 项目目标

- 开源小说阅读器「轻阅 QingYue」（Web 应用），发布在 GitHub：[skyyapa/qingyue](https://github.com/skyyapa/qingyue)
- **纯本地运行**：TXT / EPUB 导入即读，书籍与进度只存浏览器（IndexedDB / localStorage），不上传任何数据
- MIT 协议开源，GitHub Pages 免费部署（https://skyyapa.github.io/qingyue/）
- 中文 UI，移动端可用，零 UI 框架（手写 CSS 变量主题）
- 远期亮点：在线书源规则引擎（类似「阅读」legado）

## 当前架构

```
技术栈：Vue 3（<script setup>）+ TypeScript + Vite 8 + vue-router（hash）+ Pinia
运行时依赖：jszip（EPUB 解压）—— 唯一非 Vue 生态依赖
存储：
  IndexedDB  qingyue 库：books（元数据/进度/分组/字数） + chapters（正文，key=`${bookId}:${index}`）
  localStorage：qingyue:settings（阅读设置）| qingyue:groups / qingyue:order / qingyue:sort（书架）
              | qingyue:stats（阅读统计）
路由：createWebHashHistory —— 任何静态托管刷新深链接不 404（GitHub Pages 无服务端重写）
部署：.github/workflows/deploy-pages.yml，push main 自动构建（--base=/qingyue/）并部署
```

```
src/
├── db/          # IndexedDB 原生封装（books/chapters/entities/chapterIndex/relations 五 store）
├── parsers/     # txt.ts 编码检测+章节切分；epub.ts 解压+spine 提取（容错）；index.ts 统一入口
├── analyze/     # 无 AI 知识库管线：segment（新词发现）+ classify（上下文分类）+ index（编排）
├── ai/          # AI Provider 接口契约与注册表（v1 预留，未实现远程调用）
├── stores/      # Pinia：books（书架/分组/排序/导入）、settings、reader、stats、analysis（分析+实体操作）
├── utils/       # progress（占比）、file（读取/下载）、backup（备份）、id
├── views/       # BookshelfView（书架）、ReaderView（阅读器）
├── components/  # ImportDialog、BackupDialog、AppDialog、BookCard、TocPanel、SettingsPanel、
│                # AssistantPanel（助手抽屉）、EntityCard、RelationGraph（SVG）、TextSelectionBar
└── styles/      # main.css：四套主题 CSS 变量 + 全局组件样式
```

存储（IndexedDB v2）：
- books（元数据/进度/分组/字数/分析状态）、chapters（正文）
- entities（知识库实体：人物/地点/技能/物品，可人工锁定）、chapterIndex（每章实体词频+摘要）、relations（共现边）

## 已经完成

**v1（74504d8）**
- TXT 导入：编码检测、章节切分（「第X章/序章/楔子/番外」等）、书名作者提取、无标题单章兜底
- EPUB 导入：container.xml → OPF → spine 顺序提取正文（jszip + DOMParser）
- 书架：生成式封面（书名哈希渐变色）、进度显示、删除（confirm）
- 阅读器：字号/行距/字体（系统·宋体·黑体·楷体·衬线）、四主题（默认/夜间/护眼/羊皮纸）、
  滚动/翻页（CSS 多列）双模式、目录抽屉、快捷键（←/→ 翻页翻章、Esc 关面板）
- 进度自动保存（防抖 500ms 写 IndexedDB），刷新无缝续读

**迭代 1 —— 书架组织（90572d1）**
- 分组：创建/删除（组内书回默认分组）、卡片 ⋯ 菜单移动书籍
- 排序：最近阅读 / 最近导入 / 书名 / 手动拖拽（HTML5 DnD，顺序持久化 localStorage）
- 书名/作者搜索过滤；卡片显示「第 x/y 章 · 全书 %」
- 阅读统计：今日时长/连续天数/累计（阅读器 10s 活跃计时），书架顶栏徽章
- 全书阅读占比：按字数加权（chapterChars + scrollRatio），卡片与阅读器底部显示
- AppDialog 应用内对话框替代原生 confirm/prompt

**迭代 2 —— 稳健性（ce6c4a7）**
- hash 路由（Pages 深链接刷新不 404）
- 编码识别升级：BOM → UTF-8 严格校验 → 文件头 256KB 四编码评分择优
  （GB18030 / Big5 / UTF-16LE / UTF-16BE，平局按常见度排序）
- EPUB 容错：XML parsererror 检测、跳过图片/样式/脚本条目与外链、
  空 spine/扫描版友好报错、缺失章节自动跳过
- 大文件导入：FileReader 进度条、200MB 单文件上限、QuotaExceededError 友好提示
- 数据备份：导出全部书籍/章节/分组/统计为单个 JSON（>512KB 自动 gzip），
  合并式恢复（同 ID 跳过）、gzip 魔数自动识别、非法文件校验

**迭代 3 —— 阅读助手·本地知识库（200cce0）**
- 无 AI 知识库管线：PMI 链新词发现（窗口统计 + 左右邻多样性过滤 + 粘连词抑制）、
  上下文模式分类（人名/地名/技能/物品/势力）、段落级共现关系、模板式章节摘要
- IndexedDB v2：新增 entities / chapterIndex / relations 三 store
- 助手抽屉：人物/设定/关系图/章节/回顾 五 tab；SVG 圆环关系图（零依赖）
- 实体卡片：出现章节跳转、共现权重、例句、改名/合并/删除/备注（人工修正机制，
  锁定与忽略列表防自动分析覆盖）
- 选中正文文字悬浮工具条：查实体 / 加入知识库
- AI Provider 接口契约（explain / summarizeChapter / describeEntity）+ 注册表预留
- 书架卡片「析」按钮触发分析，进度条 + 状态显示

**迭代 4 —— 在线书源引擎（72ba394）**
- legado 风格书源规则：搜索/目录/正文 CSS 选择器 + 模板变量（{{keyword}}/{{bookUrl}}/{{chapterUrl}}）
  + 管道处理（replace）；相对 href 按 HTML 语义相对被抓取页面解析
- 跨域请求器三通道：自部署代理（proxy/worker.js Cloudflare + proxy/server.mjs Node，零依赖）/
  自备代理地址 / 公共代理兜底（自动切换）；同源直连；15s 超时；编码自动检测
- 书架搜索框在线搜索（启用书源并行）→ 一键建在线书（webInfo: sourceId/bookUrl/chapterUrls）
  → 正文按需抓取写入 chapters 缓存（进度/续读复用）→ 下一章预取
- 书源管理对话框：代理设置（三模式 + 连接测试）、书源 CRUD/启停、JSON 编辑、导入导出、
  搜索测试；内置「轻阅演示」书源（public/demo-source/ 自托管原创内容，开箱即用）
- 备份包含书源；在线书不参与知识库分析（卡片「析」禁用）

**迭代 5 —— PWA 可安装（f7b8483）**
- manifest.json（standalone、主题色、192/512/180 图标）+ 图标生成脚本（.tmp/make-icons.mjs，
  纯 Node zlib 手写 PNG 编码，零依赖）
- sw.js：安装时预缓存应用壳（相对路径，兼容任意 base）、运行时缓存优先、导航离线回退应用壳、
  版本化缓存清理
- 生产环境才注册 SW（dev 跳过，避免缓存干扰开发）
- InstallPrompt 安装引导条：beforeinstallprompt 一键安装 / iOS 添加到主屏幕指引 / 可关闭记忆

**迭代 6 —— 测试体系与 CI（5ed3ebb）**
- Lint：ESLint 9 flat config + typescript-eslint + eslint-plugin-vue（浏览器/Node 全局变量、
  关掉格式风格类规则，`npm run lint` 零错误）
- 单元测试：Vitest + jsdom + fake-indexeddb，58 用例全过，6 个套件：
  txt（编码检测/章节切分/元信息）、epub（正常解析/容错矩阵）、analyze（新词发现/分类投票——
  把迭代 3 调优的参数固化为回归保护）、book-source engine（模板/字段提取/链接解析/搜索目录正文，
  fetch mock）、progress、db（fake-indexeddb 增删查）
  - 测试期间修复真实 bug：FUNC_EXTRA 误含「落」→「落星谷」类地名被粘连抑制误杀
- E2E：Playwright chromium，5 用例：书架引导/导入阅读翻章刷新续读/在线书源全流程/
  书源管理对话框/知识库分析人物识别（webServer 自动起 dev）
- CI：.github/workflows/ci.yml（lint+type-check+test+build+e2e，Node 24）；
  部署工作流 node-version 20→24（消除 Node 20 deprecation 警告）
- 新增脚本：lint / test / test:watch / e2e

**迭代 7 —— 数据一致性修复（992bdc0）**
- 幽灵关系修复：db.replaceRelations（单事务删旧写新），三个调用方切换
  （stripReferences / rewriteReferences / analyzeBook 重新分析）；修复过程中发现并解决
  IndexedDB 事务请求排序陷阱（put 先于游标删除入队会把新数据删掉）
- 分析管线流式化：三遍扫描逐章读入即弃，全书正文不再驻留内存
  （segment.ts 拆分为 buildStrongSet / scanChapterWindows / filterWindows）
- 单元测试 +3（61 用例）：replaceRelations 替换/清空/隔离语义、
  analyzeBook 端到端（识别实体+共现关系）、重新分析后旧关系清零

**迭代 8 —— 小白友好下载（已提交）**
- README 顶部「立即使用」区：在线打开 / 装到桌面 / 下载离线版 三入口
- Release 离线版工作流（release-offline.yml）：打 v* tag 时质量门 +
  构建相对路径离线版（vite build --base=./，file:// 双击可用）zip 发布
- v1.0.0 Release 已发布，离线包 381KB（含演示内容，导入 TXT/EPUB 全功能）
- 后续：版本号同步 1.0.0；README 移除私人口吻备注；知识库描述去包装化

**迭代 9 —— EPUB 增强（61ba5ed）**
- NCX（EPUB2）/ nav（EPUB3）目录解析：章节标题优先级 = 目录对齐 > 正文 h1-h3 > 文件名
- 正文内嵌图片提取为 data URL（Chapter.images，文本 [img:N] 占位），阅读器渲染
  （滚动/翻页模式均支持，图片 break-inside: avoid）
- 章节内小标题（h2-h6）保留为 `# ` 标记段落，阅读器渲染为加粗居中
- 数据流：Chapter.images 随 IndexedDB 缓存与备份序列化（自动包含）
- 单测 +5（65 用例），E2E +1（6 用例，含图+NCX 夹具真实浏览器验证）
- 未做（路线图保留）：EPUB 内嵌 CSS 样式与字体

**迭代 10 —— 书源规则增强（分页 / 分享 / 批量导入）**
- 分页目录：`ChaptersRule.next`「下一页」链接选择器，fetchChapters 自动跨页抓取
  （章节 URL 去重 + 翻页循环防护 + `MAX_TOC_PAGES=100` 上限）
- 正文分页：`ContentRule.next` 选择器，fetchContent 自动拼接多页正文
  （后续页缺正文视为分页结束不报错，`MAX_CONTENT_PAGES=20` 上限）
- 规则分享：单书源生成分享链接 `#/source-import/<base64url>`，打开自动进入导入页
  （新路由 + SourceImportView，含覆盖选项与结果明细）；书源行内「分享」按钮展示
  链接与 JSON，一键复制（clipboard + 降级提示）
- 批量导入增强：`importSources` 支持 `overwrite` 覆盖同 ID、返回 `{added,updated,skipped}`
  明细；导入面板新增「选择 JSON 文件」；内置演示书源始终不可覆盖
- 演示内容：新增「分页之书」（目录分两页演示分页目录）；「数据之海」第一章正文分两页
  （sjzh-01b，演示正文分页）；DEMO_SOURCE 增加 next 规则（无匹配元素时单页，兼容旧页面）
- 单测 +14（79 用例）：fetchChapters 分页/自环防护/上限、fetchContent 拼接/缺页容错/上限/
  @text 正文规则取值与管道、importSources 覆盖语义与内置保护、分享 payload 编解码往返
  （base64url URL 安全字符）
- E2E +4（10 用例）：分页目录跨页抓取（书架卡片 1/6 章）、正文分页拼接、
  分享链接打开即导入、分享面板生成链接

## 未完成任务

- [ ] **AI 语义能力接入**：远程 API（CORS 方案待定）或本地模型，消费知识库数据
      （Provider 接口已就绪，src/ai/index.ts）
- [ ] 语义级事件提取（三年之约）——需 LLM，v1 用章节实体快照替代
- [ ] 书源规则分享社区 / 规则包市场（分享链接与批量导入已支持，缺集中式分发渠道）
- [ ] EPUB 内嵌 CSS 样式与字体支持（排版还原）
- [ ] 测试覆盖扩展：store 层（pinia）、备份往返、在线书知识库（缓存章节分析）
- [ ] README 演示 GIF

## 关键约束

- **纯前端无后端**：不能直接抓小说站（CORS），书源功能必须引入代理或后端
- **GitHub Pages 静态托管**：hash 路由；`--base=/qingyue/` 与仓库名强绑定（改名需同步 workflow）
- **数据只存本地**：IndexedDB 有浏览器配额（约 60% 磁盘），大书架可能触发 QuotaExceededError
- **编码检测是启发式**：非 100% 准确，导入对话框保留手动编码选择兜底
- **依赖锁定**：`typescript@5.9`（TS 7 与 vue-tsc 不兼容，见踩坑）；npm 安装网络慢（约 7 分钟）
- **Windows 环境**：Git Bash 下 taskkill 需 `//PID` 转义；PowerShell .ps1 脚本需 UTF-8 BOM
- **测试环境限制**（ZCode IAB）：不支持文件上传；evaluate 只读（动态 import 会被拒）；
  原生 confirm/prompt 不可自动操作 → 已全部改为应用内对话框
- 单文件导入上限 200MB；备份导出会触发浏览器下载（注意下载目录可能落在项目目录）

## 踩坑记录

### 构建 / 工具链
1. **vue-tsc 与 TypeScript 7 不兼容**：npm 装到 TS 7.0 后 `vue-tsc` 报
   `ERR_PACKAGE_PATH_NOT_EXPORTED ./lib/tsc` → 锁 `typescript@5.9` 解决（不要升级 TS 主版本）
2. **TS 5.9 泛型 TypedArray**：`new Uint8Array(arrayBuffer)` 类型是
   `Uint8Array<ArrayBuffer>`；当 BlobPart 使用时若类型推导为 `ArrayBufferLike` 会编译报错，
   需显式标注 `Uint8Array<ArrayBuffer>`（见 utils/backup.ts maybeGzip）
3. **`vue-tsc --noEmit` 抓不到 v-model 用 prop 的编译错误**：模板编译错误只会在
   dev/build 时报；类型检查通过不代表模板没问题（见 4）

### Vue
4. **script setup 变量遮蔽 prop**：AppDialog 中 ref 命名 `input` 与 prop `input` 同名，
   模板里 ref 优先 → `v-if="input"` 判断空字符串 → 输入框永不渲染；
   且 `v-model="input"` 直接编译报错「v-model cannot be used on a prop」
   → 变量名避开 prop 名（改名 `inputValue`）
5. **HTML5 拖拽排序**：draggable 卡片需 `@dragover.prevent` 才能触发 drop 链；
   拖拽开始先 `initGroupOrder` 切手动模式，dragover 时实时 swap（见 BookshelfView）

### 编码 / 解析
6. **零字节法检测 UTF-16 对 CJK 无效**：汉字（U+4E00+）在 UTF-16 中两个字节都非零，
   空字节探测只对 ASCII 有效 → 改为四编码评分择优（文件头 256KB，避免大文件重复全量解码）
7. **Big5 只有繁体**：Big5 编码的简体字会变 U+FFFD（'?'）；生成测试样本必须用繁体内容
   （简体文本不存在"正确"的 Big5 文件）
8. **DOMParser 不抛异常**：XML 解析错误产生 `<parsererror>` 元素，需主动检测（epub.ts parseXml）
9. **浏览器 TextDecoder('gb18030') 永不解码失败**：任何字节都能映射，
   所以"解码失败就换编码"的思路不成立，必须评分

### 知识库分析（无 AI）
10. **PMI 阈值区分不了人名与短语内部二元组**：小语料里「林夜对苏晚说」的 林夜/夜对/对苏/苏晚
    PMI 几乎相同 → 真正的过滤器是**左右邻字符多样性**（真词两侧邻居多变，
    固定搭配的粘连片段会被剔除）；阈值调低到 2.5 靠多样性兜底
11. **最长链会吞词**：链式延伸会把「老师傅看着林夜」连成 6 字运行段 → 统计**段内所有 2-4 字窗口**
    而非只统计整段；再对 3/4 字粘连词做**部分词频抑制**（林夜对 ⊃ 林夜 且多出的字是功能字时丢弃，
    黑衣人 的「人」是实义字要保留）
12. **单字后缀/介词误伤**：「老师傅看着**林**夜」因「林」在地点后缀集合被误判为地点 → 从后缀表移除；
    「拿**出**星辉石」的「出」是介词但实为动宾结构 → 前二字是技能/物品动词时抑制地点投票

### 存储 / IndexedDB
13. **Pinia 响应式 Proxy 无法被 IndexedDB 结构化克隆**：把 store 里的 `meta.analysis`（reactive proxy）
    直接写库会抛 DataCloneError → 事务中止 → 但代码只监听 `oncomplete/onerror`，
    **中止触发的是 `onabort`** → Promise 永不 resolve，表现为"调用挂死且无报错"！
    教训：写库前重建普通对象（`{...analysis, ignoredNames: [...arr]}`），且所有事务补 `onabort` 兜底

### Windows / 进程
14. **TaskStop 杀不干净 node 子进程**（Windows）：dev 服务器被 stop 后仍占 5173 端口，
    新服务器自动换 5174，而旧进程提供**过期模块缓存** → 表现为"代码改了但浏览器行为没变"。
    排查：`netstat -ano | grep :5173` 看残留 PID → `taskkill //PID <pid> //F`
    （Git Bash 必须双斜杠转义）。重启 dev 前务必检查端口
15. **PowerShell 5.1 读 .ps1 用 ANSI**：无 BOM 的 UTF-8 中文脚本直接解析报错 →
    脚本文件需加 UTF-8 BOM；单引号字符串里 `\n` 是字面量，换行要用双引号 + `` `n ``

### 测试环境（ZCode IAB）
16. **evaluate 是只读的且行为随机**：动态 `import()`、`elementFromPoint`、`getBoundingClientRect`
    等可能被拒（有时通过有时拒绝）→ 用 `public/` 下的临时种子页跑应用模块断言；
    Playwright 定位器点击失效时，用 **cua 坐标点击**（`tab.cua.click({x,y})`）驱动 UI，
    布局变化会导致坐标偏移（新增状态行/徽章后卡片中心下移），坐标算不准时
    先用 locator 读文本定位再估算
17. **标签页长时间使用后定位器退化**：中文名/文本 locator 超时、快照与 DOM 不同步、
    cua.keypress/drag 报 `broker response id mismatch` → 关掉旧标签页新建即可恢复
18. **悬停态跨调用丢失**：hover 才显示的元素（卡片 ⋯/✕/析），必须在**同一次调用**内完成
    悬停（cua.move）→ 读坐标 → 点击
19. **原生 confirm/prompt 无法自动操作**（对话框被静默处理且时机不可控）→
    一律用应用内对话框（AppDialog）承载交互
20. **种子页脚本是纯 JS**：不要写 TS 类型注解（`const x: T = ...` 会 SyntaxError 导致整页不跑）；
    多次编辑时注意 `const` 重名冲突（整页直接静默失败，只有 加载中…）

### 其他
21. **git add -A 会把 .zcode/ 内部文件带进仓库**：已在 .gitignore 排除（.zcode、.tmp、dist）
22. **Vite dev 模块无强缓存但 HMR 偶发失效**：改代码后行为异常时，
    先 curl 转换后的模块（如 `/src/components/X.vue`）确认服务端内容，再怀疑浏览器缓存
23. **备份导出测试的下载文件会落在项目目录**：测试后检查根目录，别提交进 git

### 书源引擎（迭代 4 新增）
24. **v-model 不能用于三元/条件表达式**：`v-model="cond ? a : b"` 是模板编译错误
    （必须可赋值的成员表达式）→ 拆成两个独立 textarea 各自 v-model
25. **`new URL(href, base)` 的 base 必须是绝对地址**：传相对路径直接抛 TypeError
    （会被 catch 吞掉表现为"解析不出链接"）→ 先 `new URL(pageUrl, location.origin)` 转绝对
26. **模板变量编码陷阱**：`{{bookUrl}}` 整体作为 URL 时不能 encodeURIComponent
    （会把整个 URL 编码成 %3A%2F%2F）→ 模板只有单个变量时原样替换，嵌入长 URL 时才编码
27. **Vite dev 不解析 public 子目录的目录路径**：`/demo-source/` 会走 SPA 回退返回应用壳，
    要用显式 `/demo-source/index.html`（线上 GitHub Pages 目录路径正常，但统一用显式路径最稳）
28. **规则引擎字段提取**：字段规则里的选择器是相对列表项的**子查询**，
    提取前必须先 `el.querySelector(selector)`（否则拿到整个列表项的文本）

### 数据一致性 / 内存（迭代 6 新增）
29. **IndexedDB 事务内请求顺序陷阱**：`replaceRelations` 若在函数开头同步 put 新记录、
    再在游标 onsuccess 里 delete 旧记录——删除请求排在 put 之后入队，会把刚写入的
    新记录一并删掉。必须**游标遍历完（最后 onsuccess）再 put**。
    同理：整体替换某集合时不能只用 put（被过滤掉的旧记录会残留成"幽灵关系"），
    必须 删旧+写新 在同一事务完成（db.replaceRelations）
30. **小语料 PMI 边界波动**：人名 PMI 与语料规模正相关（PMI≈ln(T/词频)），
    迷你测试书（几百字）可能刚好卡在阈值边缘（苏晚 PMI=2.49 vs 阈值 2.5）。
    测试夹具用程序化生成 6 章以上保证稳定；真实大书无此问题
31. **分析管线流式化**：三遍扫描逐章从 IndexedDB 读取、用毕即弃，
    全书正文不再驻留内存（segment.ts 拆为 buildStrongSet / scanChapterWindows /
    filterWindows 供流式调用；discoverCandidates 保留为便捷包装供测试）
32. **Big5 自动检测**：已实现（BOM → UTF-8 严格校验 → 四编码评分择优含 Big5），
    有单测覆盖；README 描述与实际一致（勿误判为未实现）

### 书源引擎（迭代 10 新增）
33. **正文分页末页结构可能不同**：分页正文的最后一页常缺少正文容器或结构变化，
    后续页选择器未命中时若**已有内容则停止拼接**而非抛错（首页未命中仍报错，便于定位规则问题）
34. **分享 payload 用 base64url**：`btoa` 输出含 `+/=` 会破坏 URL/路由参数，
    需替换为 `-_` 并去掉 `=`；中文先 TextEncoder 转字节再 base64（避免 unescape 弃用 API）

## 测试方法备忘

- 常规回归：`npm run type-check && npm run build`；`npm run dev` 后浏览器实测
- 解析器/知识库/备份/store 逻辑：在 `public/seed-test.html`（临时，测完删除）用动态 import 跑断言，
  模式：`?analyze`（跑分析管线+输出实体分类）、`?store`（跑实体操作）、`?dump`、`?wipe`；
  样书生成脚本在 `.tmp/make-samples.mjs`、`.tmp/make-hard-samples.mjs`、`.tmp/make-assistant-sample.mjs`、
  `.tmp/make-enc-samples.ps1`（PowerShell 需 BOM）
- 种子页约束：纯 JS 无类型注解；避免 const 重名（整页静默失败）
- UI 交互：IAB 定位器点击可能失效 → `tab.cua.click({x,y})` 坐标点击（布局变化坐标会漂移，
  先读文本定位再估算）；悬停类元素（⋯/✕/析）需单次调用内 悬停→读坐标→点击
- **E2E 在 PowerShell 下 exit code 可能为 1**：dev server 的 NO_COLOR 等警告走 stderr，
  被管道计入退出码——以 Playwright 用例统计（passed/failed）为准，勿误判失败
- 发布：提交后 GitHub Actions 自动部署，约 2 分钟内生效；
  验证线上：`curl https://skyyapa.github.io/qingyue/ | grep index-`
