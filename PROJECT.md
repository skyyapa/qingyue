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

**迭代 10 —— 书源规则增强（分页 / 分享 / 批量导入）（0a3b256）**
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

**迭代 11 —— 多样化阅读界面（主题皮肤 + 拟真书页）（a0bde70）**
- 主题从 4 套扩到 10 套：默认 / 极简白 / 羊皮纸 / 青瓷 / 护眼 / 樱花粉（浅色）+
  夜间 / 深蓝 / 墨绿 / 石墨（深色），每套完整 CSS 变量（bg/fg/panel/accent/…）
- 拟真书页效果（`ReaderSettings.bookPage`，默认开）：滚动模式正文渲染成带纸张质感
  （feTurbulence 灰度噪声 data URI）+ 圆角 + 书页阴影的「纸页」；翻页模式整页铺纸纹；
  可一键切换「简洁」
- 设置面板主题选择器升级为 3 列网格画廊（色块预览 + 强调色圆点 + 名称），新增「书页效果」组
- 阅读器 `reader.bookpage` 修饰类 + 响应式适配（移动端收窄书页内边距）；
  书页开关纳入设置重排监听，切换后尽量保持阅读位置
- E2E +1（11 用例）：切换主题皮肤（10 套画廊 + data-theme 联动）与拟真书页开关

**迭代 12 —— 阅读助手打磨（无 AI）（9eb6e2a）**
- 知识库质量：
  - 事件句提取：句子级「A 对/向/跟 B 说/道」模式（复用 classify.SPEECH_VERBS），
    每章聚合 top 3 写入 `ChapterIndex.events`，摘要追加「事件：…」段
  - 重分析时已有实体别名（≥2 字）参与匹配：计数/章节/例句归入现有实体不新建，
    人工合并的知识在重分析中保留；修复同名实体（原名+别名）命中同章时
    entityCounts 计数被覆盖的 bug（改为累加）
  - 残留实体清理：重分析后名字与别名都未命中的非 locked/custom 旧实体自动删除
    （索引/关系整体重建无引用残留）
  - 例句带出处章节：`Entity.sampleChapters`（与 samples 对齐，merge 时同步合并；
    旧数据缺失时例句定位按钮隐藏）
  - 共现关系按实体 id 去重合并（防别名与原名指向同一实体产生重复边）
- 交互体验：
  - 正文内定位：`jump(index, anchor?)` 全链路——例句「定位」按钮、出现章节 chip
    带实体名锚点；滚动模式 scrollIntoView 居中 + 翻页模式按视口差值换算 scrollLeft；
    锚点段落高亮 2.4s；匹配失败降级为章节开头
  - 人物/设定/章节三 tab 列表搜索过滤（名称/别名/摘要/高频词/事件，无结果显示提示）
  - 前情回顾时间线条目可点击跳章（hover 提示）
  - 键盘：Escape 关闭助手抽屉；助手打开时方向键不再翻章
  - 竞态修复：选中文字查实体从 50ms setTimeout 改为 nextTick 等挂载；
    openEntity 目标不在快照时先 load()（修复「抽屉开着加实体后查不到」）
  - EntityCard 小修：合并浮层外点关闭（透明遮罩）、空名保存内联错误提示
- 性能稳健：
  - 选中文字悬浮条实体缓存（懒加载 + 5 分钟 TTL + 加入知识库后失效），
    消除每次 mouseup 全表扫描
  - 助手抽屉加载中/失败态 + 重试按钮
  - 前情回顾聚合改 entityById Map（消除 O(n×m) 线性 find）
- 测试补强（路线图「store 层测试」完成）：
  - 新增 devDependency @vue/test-utils；vitest 配置补 @vitejs/plugin-vue
  - store 单测 +4（analysis：addCustom/updateEntity 改名忽略/deleteEntity 引用清理/
    mergeEntities 合并语义 + 无自环残留）
  - AssistantPanel 组件测试 +5（引导页/列表/搜索过滤/详情往返/章节与回顾跳转 emit）
  - E2E +2（13 用例）：人物列表搜索过滤、例句「定位」跨章跳转正文高亮
- 单测 79→91；E2E 11→13；type-check/lint/build 全绿

**迭代 13 —— 阅读器本体打磨（f67de05）**
- 翻页模式补全：
  - 修复 `pagedColWidth` 非响应式 bug（依赖 window.innerWidth 首次求值永久缓存）：
    resize/旋转后列宽与分页位置错乱 → 新增 `viewportWidth` ref，onResize 同步
  - 页边界方向键翻章：翻页模式在首/末页（容差 4px）按 ←/→ 切章，与滚动模式一致
  - 章末「下一章」入口 + 「全书完」标记补到翻页模式（break-inside: avoid，
    showNextHint 开关在翻页模式生效）
  - 触屏滑动翻页：水平位移 >48px 且明显大于垂直位移时翻页（移动端可用）
  - scrollPaged 毛刺修复：ceil/floor 改 round 页数定位，smooth 动画中断可回正
- 阅读位置记忆（会话级）：切章前记录当前章位置（内存 Map），上一章/下一章/目录
  往返恢复原位置（替代「下一章回顶/上一章回底」）；不落库，刷新后仍随进度走
- 稳健性：
  - TocPanel 首次打开即滚动定位当前章（watch 加 immediate）
  - settings 载入逐字段校验（类型/范围/枚举白名单），损坏 localStorage 回退默认
  - pagehide 兜底保存进度（强杀标签页不丢最后几百毫秒）
  - 阅读计时活跃检测：window keydown/mousedown/touchstart/wheel 刷新活跃时间，
    满 60s 无交互（挂机）或页面隐藏不计时，不再虚增时长
- 移动端适配：560px 断点隐藏章节名与「全书 %」徽章、压缩顶栏/底栏 padding
- 单测 +6（97）：settings 校验（损坏回退/合法保留）、stats 计时（fake timers：
  正常累计/隐藏跳过/挂机跳过/交互恢复）
- E2E +3（16）：位置记忆往返恢复、翻页模式键盘翻章（含末页翻章）、窄屏无横向溢出
- 回归全绿：type-check/lint/test(97)/e2e(16)/build

**迭代 14 —— EPUB 内嵌 CSS 子集排版还原（c4cac50）**
- 新增 `src/parsers/epub-css.ts` 零依赖 CSS 子集解析器：
  - 选择器：tag / .class / tag.class（含逗号分组）；忽略 @media/@import/@font-face、
    后代/伪类/#id 复杂选择器（容错不报错）
  - 属性白名单：text-indent / text-align / line-height / font-size / color /
    font-weight / font-style / margin-top / margin-bottom；px/pt/% 归一化为 em
  - body 规则作为全局继承基线；class 规则按特异性覆盖标签规则
- epub.ts：manifest 收集 CSS（mediaType text/css 或 .css）→ 规则匹配每个段落元素；
  htmlToText 重构为段落数组模式（styles 与文本段落一一对应，防索引错位）；
  行内 `<b>/<strong>/<i>/<em>/<u>` 与内联 style 粗斜体 → `[b]/[i]/[u]` 标记
- 数据模型：`Chapter.paragraphStyles?: (ParagraphStyle|null)[]`（可选，旧数据兼容；
  随 IndexedDB 缓存与备份序列化自动包含）
- ReaderView：段落 `:style` 应用排版样式（书排版优先于全局设置）；
  行内标记经 toHtml 受控渲染（先 HTML 转义再替换标记 → 无 XSS 面，已加 eslint 注释）
- 未做（路线图保留）：@font-face 内嵌字体（需 DB 存储 + 备份体积权衡，另行迭代）
- 单测 +10（106）：epub-css 解析 6（选择器/容错/单位归一化/继承/特异性覆盖）、
  epub 样式提取与行内标记 4
- E2E +1（17）：内嵌 CSS 排版还原（缩进/对齐/行距继承/粗斜体渲染，真实浏览器断言 inline style）
- 回归全绿：type-check/lint/test(106)/e2e(17)/build

**迭代 15 —— EPUB 内嵌字体（@font-face）（d7756dc）**
- CSS 解析器扩展：`parseFontFaces` 提取 @font-face 的 font-family / src 首个 url /
  可选 font-style / font-weight（忽略 format 描述与损坏块）；段落样式白名单新增
  font-family 属性
- epub.ts：@font-face 的 src url 相对 **CSS 文件目录**解析 → 字体文件提取为
  data URL（mime 按扩展名：ttf/otf/woff/woff2）；**超过 2MB 的字体跳过**
  （防 IndexedDB 膨胀）；返回 `bookFonts`（ParsedBook 附加字段）
- 存储：IndexedDB **v3** 新增 bookFonts store（keyPath = bookId）：
  `saveBookFonts`（整体覆盖，空数组清除）/ `getBookFonts`；deleteBook 级联清理
- 导入落库：books.ts importFiles 写入 `saveBookFonts(id, parsed.bookFonts ?? [])`
- 渲染：ReaderView 挂载时读取书字体注入 `<style data-book-fonts>`（@font-face 定义，
  font-family 用原始名——同一时刻只有一本书的字体在页面，无命名冲突），卸载时移除；
  段落样式 font-family 原样应用于正文（body 级继承到段落）
- 备份策略：字体**不进备份**（BackupData 显式字段结构，天然排除；避免导出/恢复
  体积爆炸，恢复后排版回退系统字体，书内容不受影响）
- 单测 +6（112）：parseFontFaces 3（多格式/引号/损坏容错/font-family 声明）、
  epub 字体提取与超限跳过 2、db bookFonts 存取与级联清理 1
- E2E +1（18）：内嵌字体注入为书级 @font-face（真实浏览器断言 style 注入与
  font-family 段落样式）
- 路线图「EPUB 内嵌 CSS 样式与字体」全部完成；回归全绿：type-check/lint/test(112)/e2e(18)/build

**迭代 16 —— 在线书知识库分析 + 备份往返测试（19f84a1）**
- 开放在线书知识库分析：移除 BookCard「析」按钮对 `source === 'web'` 的禁用
  （title 提示改为「基于已缓存的章节」）；助手引导文案按书源区分
  （在线书：分析已缓存的章节）；分析管线本就按 `getChapter` 缺失跳过，
  未缓存章节天然不参与，无需改管线
- 单测 +4（116）：在线书部分缓存分析（5/6 章缓存 → 实体识别正确、索引只覆盖
  已缓存章节）、备份往返 3（导出完整性/合并恢复同 ID 跳过与新书恢复/非法备份报错）
- 路线图「在线书知识库（缓存章节分析）」完成；回归全绿：type-check/lint/test(116)/e2e(18)/build

**迭代 17 —— 章节内正文搜索（f58c041）**
- Ctrl/Cmd+F 唤起搜索条（顶栏 🔍 按钮，移动端可用）；Esc 关闭并清除高亮；
  搜索框聚焦时方向键不翻页（光标留给输入）
- 高亮实现：渲染后的 DOM 文本节点用 TreeWalker 收集 → `<mark class="search-hit">`
  包裹（v-html 渲染后操作，天然跳过 [b]/[i] 标记干扰）；当前命中 `.current` 高亮
- 计数与跳转：N/M 实时计数，↑/↓（或 Enter/Shift+Enter）逐处跳转；
  滚动模式 scrollIntoView 居中、翻页模式视口差值换算列位置（抽公共
  scrollToElement，锚点定位同逻辑复用）
- 章节切换 / 字号行距等重排后 DOM 重建 → 自动重新应用高亮（保持阅读位置不跳转）
- 修复真实 bug：onMounted 里事件监听注册在 `await applyBookFonts` 之后 →
  打开阅读器后立即按键（Ctrl+F/方向键）事件丢失——监听注册提前到同步段
- E2E +1（19）：搜索高亮计数 / 逐处跳转 / 无匹配 / Esc 清除
- 回归全绿：type-check/lint/test(116)/e2e(19)/build

**迭代 18 —— 阅读高频操作增强（d93f2d1）**
- 字号快捷调节：阅读器底栏 A−/A+ 按钮（±1px，钳制 14-28），免开设置面板；
  重排与位置保持复用现有设置 watch
- 设置面板底部「恢复默认设置」按钮（settings store 新增 resetSettings action）
- 书架「重置阅读进度」：BookCard ⋯ 菜单新增（分组列表下分隔线 + 红色操作项）→
  应用内确认对话框 → books.resetProgress（IndexedDB 与内存同步，回到第一章开头）
- 单测 +2（118）：settings.resetSettings 恢复默认并持久化、books.resetProgress
  落库与内存同步
- E2E +2（21）：字号快捷调节（A+/A− 改变正文字号）、重置阅读进度全流程
  （翻章 → 书架菜单 → 确认 → 重开回到第一章）
- 回归全绿：type-check/lint/test(118)/e2e(21)/build

**迭代 19 —— 阅读统计日历面板（fbb1010）**
- 新增 `utils/stats-calendar.ts` 纯函数：`buildMonthGrid`（周一为每周起点的 42 格
  月度网格，前后补齐置灰、今日标记）、`toDateKey`、`intensityLevel`（分钟 → 0-4
  档热力分档）
- 新增 StatsPanel 组件：月度阅读热力图（颜色深浅 = 当日阅读分钟数，5 档）、
  上/下月切换（未来月份禁）、汇总区（本月 / 今日 / 连续天数 / 累计）；
  stats store 暴露原始 `stats` 数据（此前仅 computed，日历需要 byDate）
- 书架顶栏「📊 日历」按钮打开面板（mask + modal，点击遮罩或 ✕ 关闭）
- 单测 +4（122）：buildMonthGrid（2026-08 首格周一/当月 31 天/分钟映射/今日标记/
  跨月补齐）、intensityLevel 边界分档
- E2E +1（22）：日历面板打开、42 格 + 7 表头、月份切换往返、汇总区、关闭
- 回归全绿：type-check/lint/test(122)/e2e(22)/build

**迭代 20 —— 单书导出/分享（5c46d73）**
- 新增 `utils/export.ts`：单书格式 `{ app: 'qingyue-book', meta, chapters, entities,
  chapterIndexes, relations }`（正文 + 进度 + 知识库；不含内嵌字体，与备份策略一致）
- 导出：书架卡片 ⋯ 菜单「导出本书」→ 下载 `书名.qingyue.json`（db 新增 listChapters
  按书列出章节）
- 导入：ImportDialog 支持 .qingyue/.json（accept 扩展）；books.importFiles 按扩展名
  分发单书格式，**未知扩展名嗅探文件头**（`"app":"qingyue-book"`）兜底——下载改名/
  传输丢扩展名的文件也能正确恢复；合并语义：同 ID 跳过，导入成功返回 meta 自动跳转
- 单测 +3（125）：导出完整性（正文/进度/知识库 + 文件名）、导入往返（新书恢复 +
  同 ID 跳过）、非法格式报错（坏 JSON/全量备份误判）
- E2E +1（23）：单书导出 → 删除 → 导入恢复（进度 2/5 章保留，真实浏览器下载事件）
- 回归全绿：type-check/lint/test(125)/e2e(23)/build

**迭代 21 —— 全书正文搜索（272ec40）**
- 扩展 ReaderView 搜索条：`Ctrl/Cmd+F` 打开后可切换「本章 / 本书」；本章保留原有逐处高亮与 ↑/↓ 跳转
- 全书搜索：扫描 `db.listChapters(bookId)`，按章节聚合结果（章节名 / 首个上下文摘录 / 命中数），点击结果切章并复用既有锚点定位与本章高亮
- 在线书策略：仅搜索已缓存章节，状态明确显示「已搜索 X/Y 章缓存内容」，不会假装能检索未下载正文；输入 180ms 防抖、结果限制 80 章，避免大书输入阻塞
- 新增 `utils/book-search.ts`：清理 EPUB 行内标记与图片占位符、大小写不敏感匹配、上下文截取、章节结果聚合
- 单测 +3（128）：跨章聚合/大小写/摘要、样式与图片占位清理、空关键词与 80 章上限
- E2E +1（24）：本书搜索 5 章结果、点击第一章结果跳转并高亮 3 处
- 回归全绿：type-check/lint/test(128)/e2e(24)/build

**迭代 22 —— AI Provider 统一架构（阶段二）（deb294b）**
- `src/ai/presets.ts`：五类预设（OpenAI 兼容自定义 / DeepSeek / Gemini / 本地
  Ollama / 本地 LM Studio），统一 Base URL + API Key + Model + 启用配置；
  Gemini 走官方 OpenAI 兼容端点；本地服务无需 Key（isProviderReady 区分）；
  Base URL 去尾斜杠规范化
- `src/ai/client.ts`：OpenAI 兼容 chat/completions 客户端（零依赖 fetch，
  Bearer 认证、60s 超时、HTTP/空返回/网络失败友好错误、错误带 cause）；
  `testProvider` 最小请求连通性测试
- `src/stores/ai.ts`：配置 localStorage 持久化（损坏回退默认、预设齐全保证），
  activeProvider 单启用语义
- `src/components/AIProviderDialog.vue`：书架顶栏「AI」入口——预设列表（启用状态）、
  配置表单（Base URL/Key/Model）、测试连接（成功显示回复摘要/失败显示原因）、
  启用按钮；注明 API Key 仅保存在本机
- 单测 +9（137）：预设默认值与 Key 要求、isProviderReady、normalizeBaseUrl、
  store 持久化往返/损坏回退、client 成功解析/HTTP 错误/空返回/网络失败/
  未配置报错/testProvider
- E2E +1（25）：预设切换预填、测试连接错误提示、启用与 Key 持久化
- 阶段三接入点：现有 `src/ai/index.ts` 契约（explain/summarize/describeEntity）
  将基于 activeProvider 实现
- 回归全绿：type-check/lint/test(137)/e2e(25)/build

**迭代 23 —— AI 阅读助手（阶段三）（776a59e）**
- `src/ai/assistant.ts`：六个实用任务 + 自由提问——
  - 这是谁（who）：实体信息块（类型/别名/出现次数/例句/常共现/相关事件）喂给 AI
  - 前情回顾（recap）：当前章之前最近 12 章的摘要 + 事件句
  - 剧情解释（explain）：选中文字 + 当前章摘要/事件/正文片段
  - 人物关系（relation）：实体共现关系 + 事件 → AI 梳理师徒/盟友/对手等
  - 世界观解释（world）：地点/势力清单 + 重点设定实体
  - 事件时间线（timeline）：按章节聚合事件句与摘要，AI 整理时间线
  - 自由提问（ask）：问题 + 当前章摘要/片段
  - 上下文组装为纯函数 `buildTaskMessages`（可单测），知识库快照
    `loadKnowledge` 截断章节正文控制 token；回答 ≤200 字约束
- AssistantPanel 新增「AI」tab：七个任务 chips + 提问输入框 + 回答区
  （loading/错误重试/回答）；**未配置 Provider 时显示引导**（书架顶栏「AI」配置）；
  回答受控渲染（escape + **粗体**/标题/换行）
- 选中文字悬浮条新增「✨ AI」按钮 → 打开助手 AI tab 并预填选中文字
- 单测 +6（143）：五任务上下文组装（who 实体块/recap 只取前章/explain 上下文/
  timeline 聚合/ask 摘要）、runAITask 端到端（fake-indexeddb + fetch mock 断言
  请求体含书名与实体）
- E2E +2（27）：AI tab 未配置引导；预置配置 + route mock chat 响应 →
  七 chips 齐全、执行前情回顾、**粗体**受控渲染
- 阶段四接入点：knowledge 类型将随知识库升级扩展（势力/境界/事件等）
- 回归全绿：type-check/lint/test(143)/e2e(27)/build

**迭代 24 —— 知识库升级：境界 + 事件时间线（阶段四）（de8f88b）**
- 实体类型新增「境界」（realm）：
  - classify.ts 识别规则——前缀动词（突破/踏入/晋入/迈入/达到/晋级/升入/晋升）+3、
    后缀（X境/X阶/X期/X层/X重/X段/X品/X级）+2、境界词表直接点名 +2
    （炼气/筑基/金丹/元婴/化神/渡劫…斗者系列…武者系列…一品-九品…宗师/大宗师等）
  - voteContext 增加可选 word 参数（词表判定用，不破坏既有调用）
  - 「拿出金丹」动宾结构判物品而非境界（键序先到先得，测试固化）
  - types/TYPE_LABELS/AssistantPanel 设定筛选（地点/技能/物品/势力/境界/其他）
  - EntityCard 类型下拉自动包含
- 事件时间线 tab：章节事件句跨章聚合（首次出现章节/出现章数/总次数），
  按时间（首次出现章）排序，点击跳转首次出现章
- AI 世界观任务携带境界体系（realm 实体清单 + 晋升脉络推断提示）
- 单测 +2（145）：境界投票（突破X/X境/踏入X期/词表点名）、拿出金丹判物品
- E2E +2（29）：时间线 tab 事件聚合与跳转、设定 tab 境界分类
- **四阶段路线图全部完成**（稳定+Release / AI Provider / AI 阅读助手 / 知识库升级）
- 回归全绿：type-check/lint/test(145)/e2e(29)/build

**迭代 25 —— AI 进度感知与防剧透（新路线图二~四阶段核心）（84ddbdb）**
- 预设树扩展为 7 类：OpenAI（官方）/ OpenAI 兼容（自定义/中转站）/ DeepSeek /
  Gemini（Gateway）/ 本地 Ollama / LM Studio / vLLM——全部走统一 OpenAI 兼容协议，
  项目本身不承担任何 AI 成本；旧版 `openai`（自定义兼容）配置自动迁移到 `compatible`
- **防剧透机制（宣传点）**：`loadKnowledge(bookId, { upTo })` 只读取已读章节——
  章节索引/正文/标题剔除未读部分（标题也可能剧透「第 900 章身世揭晓」）、
  实体出现章节与例句按已读过滤、共现关系仅保留已读实体对；
  系统提示内置**防剧透规则**（只能基于第 1-N 章回答，涉及未读内容明示不透露）；
  所有任务携带「当前读到第 N 章」进度
- **进度感知相关章节检索**：who/relation 任务附带实体相关章节正文片段
  （前 2 章、实体名附近 220 字）
- 新任务：**伏笔回顾**（已读章节关键句/事件/身份不明实体 → 未解之谜清单）、
  **章节摘要**（当前章正文 → 120 字语义摘要）——共 9 个任务
- 单测 +7（152）：预设树 7 类与 vLLM/官方 OpenAI、旧配置迁移、防剧透截断
  （upTo=1 时索引/正文/标题/实体/关系全部剔除）、防剧透指令各任务覆盖、
  who 片段检索、foreshadow/summarize prompt
- E2E +1（30）：**防剧透请求体断言**——读到序章问「这是谁」，
  捕获真实请求体断言只含已读数据（无第二章标题/第一章内容）
- 回归全绿：type-check/lint/test(152)/e2e(30)/build

**迭代 26 —— 防剧透数据完整性修复 + 按需正文检索（dfb7803）**
- **防剧透泄漏口全部封堵（最高优先级修复）**：
  - 未来实体剔除：`loadKnowledge` 只保留已读章节有出现（或手动/锁定）的实体，
    第 800 章才出现的「天神殿」在读到第 100 章时彻底不进 entities
  - 实体计数重建：`count` 改为按已读章节 entityCounts 求和（而非全书总数）
  - 关系权重重建：`Relation` 新增 `chapterWeights`（analyze 落库按章记录，
    merge 时逐章合并）；已读权重 = 已读章求和；**旧数据降级**为
    `min(全书权重, min(已读 a, 已读 b))` 上界截断（每章共现 ≤ min 的数学上界）
  - e2e 断言：读到序章时请求体不含「苏瑶」「黑衣人」等未来实体名
- **按需正文检索**：loadKnowledge 不再预截断 400 字，保留已读章节完整正文；
  `findSnippet(章节全文, 锚点)` 定位实体名/选中文字前后截取（前 160 后 280 字）；
  who/relation 片段、explain（选中文字附近）、ask（提问关键词附近）全部锚点化，
  AI 不再拿到「章节开头无关文字」
- **稀疏索引修复**：`k.indexes[idx]` 数组下标 → `k.indexes.find(x => x.index === idx)`
  （在线书只缓存 0/5/10 章时下标 ≠ 真实章节号）
- 单测 +4（156）：关系权重按已读重建（含 chapterWeights 求和/未来剔除/降级截断）、
  稀疏索引查找、findSnippet 锚点截取
- 文档清理：README 移除「AI 预留未接入」三处、路线图 AI 项勾选完成、
  API Key 明文说明与 CORS 前提；PROJECT.md 未完成任务同步
- 版本 v1.2.0（AI 阅读助手 + 防剧透主题）
- 回归全绿：type-check/lint/test(156)/e2e(30)/build

**迭代 27 —— 严格防剧透 + 真正按需检索（架构可靠）（65a6008）**
- **在线书稀疏章节索引修复（最高优先级）**：`chapterWalks` 改为携带真实
  `chapterIndex`（`{ chapterIndex, walk }`），实体出现章节 / ChapterIndex.index /
  chapterWeights 下标全部使用真实章节号——在线书只缓存 0/2/4 章时不再被分析成
  0/1/2 章（防剧透边界随之正确）
- **严格防剧透（去掉不安全降级）**：
  - 旧关系（无 chapterWeights）**不再上界截断，直接剔除**（无法证明关系发生在
    已读章节 → 不传给 AI），并标记 staleData
  - 旧实体无 sampleChapters → 例句**直接舍弃**（无出处的例句可能来自未读章节）
  - `staleData` 进系统提示：告知 AI 数据受限并建议用户重新分析知识库
- **真正按需正文加载**：`loadKnowledge` 不再 `listChapters` 全量拉取全书正文
  （200MB 大书不再整本进内存）；新增 `planChapterLoads` 按任务确定所需章节 →
  `db.getChapter` 逐章懒加载 → `buildTaskMessages` 收 `Map<章节号, 正文>`
- **自由提问锚点改进**：`pickAnchor` 从问题匹配最长实体名作检索锚点；
  匹配不到不硬塞章节开头（findSnippet 未匹配返回空串）
- 单测 +3（159）：稀疏缓存 0/2/4 章分析（真实章节号/权重下标）、旧关系剔除 +
  staleData、旧例句舍弃、pickAnchor 最长实体匹配
- 回归全绿：type-check/lint/test(159)/e2e(30)/build
- 至此「AI 防剧透阅读助手」从功能可用进入架构可靠阶段

**迭代 28 —— 产品化（P0 防剧透终测 + P1 高频入口 + P2 管家人格）（c3bed0e）**
- **P0 防剧透最终测试**：程序化生成 150 章长书夹具（`e2e/fixtures/身世之谜.txt`，
  第 100 章才出现「林夜的真实身份是远古神子」——不引入版权书籍全文）；
  e2e 两个用例：读到第 80 章问「林夜的真实身份是什么」→ 捕获真实请求体断言
  不含「远古神子」；对照验证（读到 101 章进度边界推进、跳到第 100 章
  章节摘要任务可引用揭晓内容 → 机制确实有效）
- **P1 提升使用频率**：
  - 阅读器顶栏「✨ AI」按钮直达助手 AI tab（选中文字 ✨ AI 入口此前已有）
  - **自动章节摘要**：设置项 `aiChapterSummary`（默认开，设置面板开关）；
    配置 AI 后翻章自动生成当前章摘要（章首摘要卡：加载/内容/关闭；
    失败静默不打扰；会话内按章缓存避免重复请求）
  - **每日阅读回顾**：`utils/reading-days.ts` 记录今日读过章节
    （localStorage 按日期/书/章节去重）；StatsPanel 新增今日回顾区
    （今日读过 N 章 + 按书章节范围 + AI 已配置时「生成今日阅读回顾」→
    新任务 daily 聚合今日章节摘要/事件让 AI 总结）
- **P2 小说管家人格**：systemPrompt 重写——「你是本书的私人小说管家」，
  规则 1 不剧透（只基于已读章节）2 根据阅读进度回答 3 优先引用已发生剧情
  4 不确定时直接说不知道不编造
- 单测 +2（161）：reading-days 去重/排序/多书隔离
- E2E +2（32）：防剧透最终测试（80 章不泄漏 + 100 章对照可见）
- 回归全绿：type-check/lint/test(161)/e2e(32)/build

**迭代 29 —— 产品化进阶（AI 阅读浮层 / 人物时间线 / 结构化每日总结 / 多模型策略）（3d824ff）**
- **AI 阅读浮层（第一名）**：阅读页右下角 ⚡ 悬浮按钮——四操作（📖 解释本章 /
  📝 总结本章 / 🧑 询问人物 / 🔍 查看伏笔）+ 当前章人物 chips（按词频排序）；
  回答在底部面板就地显示（loading/内容/错误/关闭）；explain 支持无选中文字
  （解释整章）；面板打开时浮层自动隐藏避免遮挡
- **人物时间线（第二名）**：EntityCard 新增「经历时间线」区（出现章节 +
  该章相关事件 + 该章例句，点击跳章）+「✨ AI 梳理经历」按钮 →
  personTimeline 任务（出场章节摘要/事件聚合，AI 梳理首次登场/关键转折/
  关系变化/当前状态）；实体卡片内容多时卡片内滚动（修复 flex 压缩
  底部按钮不可点）
- **每日阅读总结结构化（第三名）**：daily 任务输出固定格式——主要事件（编号）/
  新增人物（今日首次登场实体判定）/ 未解决伏笔（无则写「无」）
- **多模型策略（第四名）**：Provider 配置新增「简单任务模型」「摘要任务模型」
  （留空用主模型）；任务分档 taskTier——摘要类（summarize/daily）用便宜模型、
  简单问答（who/recap/foreshadow/ask）用便宜模型、复杂剧情分析
  （explain/relation/world/timeline/personTimeline）用主模型（GPT/Claude）；
  设置对话框两个可选 Model 输入 + 成本提示
- 单测 +4（165）：taskTier 分档、daily 结构化与新增人物、personTimeline prompt、
  多模型请求体 model 断言（summary/easy/main 三档）
- E2E +2（33）：AI 阅读浮层四操作 + 总结走 summaryModel；实体卡片静态时间线 +
  AI 梳理经历
- 回归全绿：type-check/lint/test(165)/e2e(33)/build

**迭代 30 —— 移动端体验 M0（方向切换：AI 核心完成 → 移动端 → Android → 多设备同步）（已提交）**
- **方向调整**：README 路线图正式切换——AI 核心已收尾，不再堆 AI 功能；
  新路线：移动端体验 → Android App → 多设备同步；语义级事件提取/规则社区列为远期
- **PWA 元信息补全**：`index.html` viewport 加 `viewport-fit=cover`（刘海屏全屏）、
  `mobile-web-app-capable`（Android 安装）、`apple-mobile-web-app-title`（iOS 主屏名）；
  manifest 加 `id`（安装身份稳定）、`categories`
- **全局触屏体验**（main.css）：`-webkit-tap-highlight-color: transparent`（去掉点击灰闪）、
  `button { touch-action: manipulation }`（消除双击缩放延迟）、
  `overscroll-behavior-y: none`（App 化：禁用下拉刷新/橡皮筋）
- **高度链 dvh**：`html/body/#app` 由 `100%` 改为 `100vh` + `100dvh` 双写——
  iOS 地址栏收起/展开时应用高度跟随可见区域，阅读器底栏不再被挤出屏幕
- **safe-area 适配**：CSS 变量 `--safe-top/right/bottom/left`（env() 无刘海设备为 0 不影响布局）；
  阅读器顶栏/底栏、书架顶栏/底栏 padding 接入（standalone 全屏下内容不贴刘海/Home 条）
- **iOS 聚焦不放大**：所有文本输入框窄屏下字号提到 16px（阅读器搜索条 / 书架搜索 /
  AI Provider 对话框 / 书源对话框）——iOS Safari 聚焦 <16px 输入框会自动放大页面
- **修复实体卡片压缩遮挡（既有 bug，短视口必现）**：`.entity-samples` 有 `overflow-y: auto`
  → flex `min-height: auto` 归零，压缩时例句区高度变 0，被不可收缩的「经历时间线」区盖住，
  例句「定位」按钮点击全部落到时间线按钮上；修复 `.entity-card > * { flex-shrink: 0 }`
  各区块保持自然高度，滚动统一由整卡承担（900×300 短视口复现并回归）
- E2E +4（38）：新 `e2e/mobile.spec.ts`（iPhone 13 触屏视口）——书架无横向溢出 +
  搜索框 16px、阅读器顶底栏无溢出且按钮都在视口内（标题截断）、章节搜索条 16px、
  翻页模式无横向溢出
- 回归全绿：type-check/lint/test(165)/e2e(38)/build

**迭代 31 —— 移动阅读交互收尾（M1：点按交互 / 浮层 safe-area / 去 hover-only / 真 WebKit 验证）（已提交）**
- **中央点击切换工具栏**：触屏设备（`@media (pointer: coarse)`）阅读器顶栏/底栏/
  AI 浮层可整体隐藏——中央点按切换 `bars-hidden`（transform+opacity 过渡、hidden 时
  pointer-events none）；桌面指针设备工具栏常驻不受影响；打开面板/搜索时强制呼出
- **左/中/右点按翻页**：左 30% / 右 30% / 中央 40% 三区（`utils/tap-zones.ts`
  `classifyTapZone`，可单测）——左右区翻页模式页内翻页（页边界翻章）、滚动模式按
  0.85 屏滚动；中央区切换工具栏。防误触：位移 >12px 或时长 >400ms（长按选词松开）
  不算点按、交互元素（button/a/input/mark/next-hint）跳过、有选中文本跳过、
  面板打开时跳过；**双击抑制**（350ms 内第二击取消中央区动作，防双点选词把工具栏
  翻来翻去）；左右区连点 = 连续翻页（不做抑制）；滚动模式阅读区 `touch-action:
  manipulation` 禁双击缩放
- **固定浮层补 safe-area**：`.ai-fab` bottom 68→`calc(68px + var(--safe-bottom))`、
  `.ai-fab-panel` bottom 20、`.reader-search` top 56（+safe-top）、
  InstallPrompt `install-bar` bottom 18——刘海屏 standalone 下不再贴 Home 条
- **去 hover-only 操作**：书架分组删除按钮 `.group-tab-del` 从
  `display:none` + `:hover` 显示改为**常驻可见**（opacity 0.55 弱化，hover/
  focus-visible 加强）——触屏无 hover，删除功能不再藏起来
- **真实 WebKit 验证**：playwright.config 新增 `webkit-ios` 项目（`devices['iPhone 13']`
  完整描述符含 defaultBrowserType: webkit），`testMatch` 只跑 `mobile.spec.ts`——
  移动端 7 用例在**真实 WebKit（Playwright Safari 内核）+ iPhone 视口**下全绿；
  CI 增加 `npx playwright install --with-deps webkit`
- 单测 +4（169）：classifyTapZone 三区分界与异常宽度兜底
- E2E +3（48 = chromium 41 + webkit-ios 7）：中央点击切换工具栏显隐（含双击抑制窗口）、
  翻页模式左右点按翻页（页内/跨章状态轮询断言）、分组删除按钮常驻可见与删除闭环
- 回归全绿：type-check/lint/test(169)/e2e(48)/build
- 路线图进度：移动端体验（M0+M1）完成 ✅ → 下一步 **v1.3：Android（TWA/Capacitor 打包）**

**迭代 32 —— v1.3 Android M0：Capacitor 工程集成（用户定 Capacitor 而非 TWA：文件打开/分享/返回键/状态栏等原生能力更有发挥空间）（d8b526c）**
- **Capacitor 8 集成**：`@capacitor/core/android/cli` + `app/status-bar/filesystem/share` 插件；
  `capacitor.config.ts`（appId `io.github.skyyapa.qingyue`，webDir dist）；`cap add android`
  生成全套 gradle 工程并提交（标准做法，可复现构建）；appId 用 GitHub Pages 反向域名避免冲突
- **文件管理器「用轻阅打开」**：
  - AndroidManifest 加 VIEW intent-filter：现代 Android `content://` + text/plain/epub+zip/octet-stream
    （按 MIME 独立匹配，模板已带 singleTask + exported）；Android 15 模拟器确认系统可发现轻阅
  - AndroidManifest 加 SEND intent-filter：text/plain/epub+zip/octet-stream，覆盖系统「分享至轻阅」
  - `src/capacitor.ts` 桥接：`App.addListener('appUrlOpen')` → `Filesystem.readFile`
    （Capacitor 8 原生端返回 base64 字符串）→ `utils/intent-uri.ts` 提取文件名
    （content id 纯数字返回 null、**ExternalStorage document id 的 `primary:` 卷前缀
    与内部路径剥离**）→ base64 → File
  - 事件流：`emitOpenFiles`（CustomEvent `qingyue:open-files`）→ BookshelfView 监听 →
    打开导入对话框并 `ImportDialog initialFiles` prop 挂载后自动导入 → 导入成功自动进阅读器
- **系统返回键**：`backButton` 监听按优先级逐级处理——`.mask` 遮罩面板/对话框点击关闭 →
  抽屉（阅读助手）/章节搜索条/AI 回答面板派发 Escape → AI 浮层菜单收起 → 书架根页
  `App.exitApp()` / 其他路由 `router.back()`（App.vue 注册，Web 端 setupNativeBridge 空操作）
- **状态栏跟随主题**：`syncStatusBarTheme`——深色主题（night/ocean/pine/graphite）浅色图标，
  背景色取 `getComputedStyle(body).backgroundColor`（主题切换 watchEffect 自动同步）
- **工程化**：`android:sync`（build + cap sync）/ `android:open` / `android:doctor` 脚本；
  ESLint 与 .gitignore 排除 android 生成代码与构建产物
- 单测 +8（177）：fileNameFromUri（content/file URI、primary 卷前缀、纯数字 id、
  非法编码容错）、extForMime MIME 兜底、base64ToFile UTF-8 字节还原
- **构建验证**：安装 JDK 21、Android SDK platform 36 / build-tools 35 / platform-tools、
  API 35 Google APIs x86_64 模拟器；`assembleDebug` 首次构建成功，产物
  `android/app/build/outputs/apk/debug/app-debug.apk`；模拟器安装启动成功，
  `content://` VIEW intent 查询可发现轻阅 MainActivity，显式 intent 可送达现有任务栈；
  返回键在书架根页触发 `App.exitApp`；未宣称真机验证
- 注：本机通过临时 JDK 21 与 Android SDK 完成 APK 构建；网络受限时 Gradle 依赖需
  Android Studio/正常 Maven 网络（本机验证曾用用户级阿里云镜像，不进入仓库）。
  Android 15 模拟器不匹配 legacy `file://` filter，因此 Manifest 保留现代 `content://`
  MIME intent；真实文件管理器入口需在真机验证其提供的 URI/MIME。v1.3 后续：
  真机 TXT/EPUB、文件管理器「用轻阅打开」、返回键、深浅主题 + 刘海/手势条、
  APK 签名、ACTION_SEND 接收分享文件（appUrlOpen 不覆盖 SEND，需原生扩展）、Android 通知

**迭代 33 —— v1.3 Android M1：冷启动 / 真实文件元数据 / SystemBars / 构建与模拟器验证 / ACTION_SEND（已提交）**
- **桥接闭环审计**：确认 `setupNativeBridge()` 已在 App.vue 运行期注册，BookshelfView 已监听
  `qingyue:open-files` 并通过 ImportDialog `initialFiles` 自动导入；M1 补 `App.getLaunchUrl()`，
  冷启动被 VIEW intent 拉起不再漏文件（同 URI 的 appUrlOpen/getLaunchUrl 用 Set 去重）
- **opaque content URI 真实元数据**：新增原生 `IntentFilePlugin`（MainActivity 注册）——
  ContentResolver 查 `OpenableColumns.DISPLAY_NAME` / `getType()`（MIME）并流式读出 base64；
  JS 优先原生插件，失败才回退 Filesystem。`content://.../12345` 这类无文件名尾段也能保留
  真实名称与类型；补 MIME → 扩展名兜底（单测 +2）
- **SystemBars 迁移**：卸掉单独的 StatusBar 插件，改 Capacitor 8 内置 `SystemBars`：
  edge-to-edge 透明栏 + 已有 CSS safe-area；浅主题 `SystemBarsStyle.Light`（深色图标）、
  深主题 `Dark`（浅色图标），主题切换自动同步
- **ACTION_SEND**：IntentFilePlugin 增加冷启动 pending URI 与热启动 `shareFile` 事件；
  JS 复用 URI → File → 自动导入链路。Manifest 加 SEND MIME filter；模拟器包管理器已确认
  MainActivity 可被系统分享目标发现，显式 `ACTION_SEND` intent 已送达任务栈、无崩溃
- **构建链打通**：安装 Android Studio、JDK 21（Capacitor 8 插件要求）、SDK platform 36 /
  build-tools 35 / platform-tools、API 35 Google APIs x86_64 模拟器；首次 Gradle Debug 构建成功，
  APK 产物 `android/app/build/outputs/apk/debug/app-debug.apk`（约 4.3 MB）
- **模拟器验证（非真机）**：APK 安装/启动成功；390×2400 手势导航设备截图确认浅色系统栏深色图标、
  Home 手势条与应用内容不重叠；导入对话框布局完整；系统返回键关闭弹窗、书架根页触发退出；
  `content://` VIEW 和 ACTION_SEND 包管理器匹配/任务栈送达均通过。深色主题、真实 TXT/EPUB
  ContentResolver 读取、文件管理器入口仍留待真机验证
- **网络/工具链记录**：Capacitor 8 Gradle 插件要求 Java 21；本机官方 Google Maven TLS 不通，
  用用户级阿里云镜像完成构建，镜像配置不入仓库；Android Studio 已安装
- 回归全绿：type-check/lint/test(177)/e2e(48)/build + cap sync + `assembleDebug`

**迭代 34 —— v1.3 Android M2 准备：发布前修复 + 签名产物（真机验收待设备接入）（已提交）**
- **processedUris 修复（发布前）**：原实现读取前就永久标记 URI，一次失败后同 URI 重试被
  静默吞掉。改为 `inFlightUris`（并发去重，finally 释放）+ `recentlyProcessedUris`
  （3 秒窗口成功去重，窗口外允许用户再次分享同一文件）——冷启动/热启动双投递不重复导入，
  失败可重试
- **文件名标准化（发布前）**：`nameWithMimeExtension`——原生 DISPLAY_NAME 无扩展名但
  MIME 已知时补 `.txt/.epub/.json`（导入器按文件名扩展名分流，避免走错解析路径）；
  已有扩展名/未知 MIME 保持原样；单测 +2（179）
- **safe-area 变量映射（发布前）**：`--safe-top/right/bottom/left` 改读 Capacitor 8
  SystemBars 注入的 `--safe-area-inset-*`（API 35 edge-to-edge 下 CSS env() 可能为 0），
  Web/PWA 回退 `env()`；Reader/Bookshelf/浮层业务 CSS 无需改动
- **版本同步**：package.json `1.3.0-beta.1`；Android `versionCode 2` / `versionName
  "1.3.0-beta.1"`；README 单测数 175→177（本迭代后又 +2 至 179）
- **签名配置**：Gradle `signingConfigs.release` 只读仓库外 `android/key.properties`
  （不存在则不配置）；`.gitignore` 忽略 `key.properties/*.jks/*.keystore`
- **签名产物**：本机新建 release keystore（`%LOCALAPPDATA%\QingYue\keystore\`，仓库外，
  证书 SHA-256 `5f9b67e5...43b1a7`）；`assembleRelease` + `bundleRelease` 成功——
  `app-release.apk`（3.3M，SHA-256 `abc643cc...b7eb6`）与 `app-release.aab`（3.2M，
  SHA-256 `8c94132b...700a`）；apksigner 验证签名匹配、versionName 正确
- 回归全绿：type-check/lint/test(179)/e2e(48)/build/cap sync/签名 release 构建
- **阻塞项**：无真机接入（仅模拟器）——真机验收（TXT/EPUB 打开、冷/热启动、分享、
  特殊文件名、10/50MB 压力、夜间主题+手势条+刘海、返回键优先级）未执行；
  验收通过后才创建 `v1.3.0-beta.1` tag 发布 GitHub prerelease；第二台设备为 v1.3.0
  正式版前置条件

**迭代 35 —— Android 每日阅读提醒（本地通知）（已提交）**
- 新增依赖 `@capacitor/local-notifications@8.3.0`（`cap sync` 后 Android 工程自动注册，
  插件自带 POST_NOTIFICATIONS / RECEIVE_BOOT_COMPLETED / WAKE_LOCK 权限合并）
- 设置项：`ReaderSettings.readingReminder = { enabled, hour, minute }`（默认关闭、21:00）；
  settings store sanitize 逐字段校验（布尔/0-23/0-59，越界回退默认、非法结构整体回退）
- `src/utils/reminder.ts` 纯函数：`buildReminderBody(todaySeconds)`（未读鼓励开卷 /
  已读显示今日分钟数）、`toDailySchedule`（时刻 + repeats:true 每日重复）、
  `REMINDER_NOTIFICATION_ID`（固定 id 供取消/重调度）
- `src/capacitor.ts` 新增 `syncReadingReminder`：仅原生生效——开启时 checkPermissions →
  requestPermissions（未授予则放弃）→ schedule 每日重复通知；关闭时 cancel；
  失败静默不打扰；文案结合当天阅读时长
- App.vue：deep watch readingReminder（immediate 初始同步 + 变更重调度）——
  不监听 stats.todaySeconds，避免 10s 计时 tick 触发无谓重调度
- SettingsPanel 新增「每日阅读提醒（Android）」组：开关 + 时间选择器（HH:MM 双向
  绑定 hour/minute）+ 说明（Web 端忽略）；移动端 560px 下时间输入 16px 防 iOS 放大
- 单测 +6（185）：reminder 纯函数 3（文案边界/调度描述/凌晨时刻）、settings 校验 +3
  （非法结构回退/合法保留/越界时间收敛——store 实例按 pinia 缓存，同一测试内
  多次写 localStorage 不生效需拆多个 it）
- e2e 48 / type-check / lint / build 全绿；`cap sync` + JDK 21 `assembleDebug`（含
  local-notifications 插件）构建成功
- **阻塞项**：真机验收仍未执行（仅模拟器）——通知权限弹窗、通知实际送达、
  点击通知打开 App、精确闹钟授权（SCHEDULE_EXACT_ALARM）需真机确认；
  验收通过后仍按原计划发布 v1.3.0-beta.1

## 未完成任务

- [ ] Android App（TWA / Capacitor 打包）——Capacitor 已集成；真机验收 + 发布仍阻塞
- [ ] Android 分享导出（导出 .qingyue 单书经系统分享发送，@capacitor/share 已装待接入）
- [ ] 多设备同步（阅读进度与书库跨设备同步）
- [ ] 语义级事件提取（三年之约）——需 LLM，v1 用章节实体快照替代，远期
- [ ] 书源规则分享社区 / 规则包市场（分享链接与批量导入已支持，缺集中式分发渠道）——远期
- [ ] 测试覆盖扩展：备份往返、在线书知识库（缓存章节分析）——store 层（analysis）已补；
      备份往返与在线书缓存分析已补（迭代 16）
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

### 阅读助手打磨（迭代 12 新增）
35. **同名实体同章命中时 entityCounts 会互相覆盖**：原名与别名指向同一实体 id 时，
    `entityCounts[id] = count` 把后命中的计数覆盖掉前一个 → 必须累加
    `(entityCounts[id] ?? 0) + count`（别名匹配功能让这种场景变常见）
36. **组件测试需等 fake-indexeddb 宏任务**：fake-indexeddb 用 setImmediate 调度，
    `flushPromises()` 只清微任务，mount 后 load() 未完成会一直「加载中」→
    settle = flushPromises + setTimeout(10) + flushPromises；测试之间用独立 bookId
    避免共享库的 add 冲突（deleteBook 清理组合会触发奇怪的栈溢出，避免使用）
37. **e2e 断言滚动需保证内容溢出视口**：夹具各章正文都很短，默认视口装得下时
    scrollTop 恒为 0（物理上无可滚范围）——`setViewportSize` 缩小高度让滚动发生；
    scrollIntoView smooth 动画未完成时 evaluate 到 0，用 `expect.poll` 等待
38. **事件句模式是「A 介词 B 动词」**：动词跟在第二个实体**之后**（「林夜对苏晚**说**」），
    两实体之间只有介词；正则先验证实体对之间 1-2 字纯介词 + 后随 SPEECH_VERBS 单字，
    「林夜看着苏晚」这类（中间是「看着」）不会误判为事件

### 阅读器本体（迭代 13 新增）
39. **computed 依赖 window.innerWidth 非响应式**：computed 首次求值后永久缓存，
    尺寸变化不会重算 → 用 ref 承载视口宽度并在 resize 时更新（pagedColWidth）
40. **fake timers 下 Date 是否被 mock 影响挂机判断**：vitest 4 fake timers 默认含 Date
    （advanceTimersByTime 会推进 Date.now()）；挂机阈值判断用 `>=`（满 60s 即停），
    测试按 tick 序列推算累计值，避免「恰好 60s 整多计一次」的边界困惑
41. **e2e 断言避免写死翻页次数**：序章正文很短，连续方向键会连翻数章（页内翻页 +
    每章末页翻章）——断言「已离开第 1 章」而非「恰在第 2 章」

### EPUB 排版还原（迭代 14 新增）
42. **v-html 渲染的语义标签与断言选择器要一致**：行内标记 [i] 转 `<em>` 而非 `<i>`，
    e2e 断言 `.para em` 才能命中；同类坑：CSS 解析时块内 `}` 属罕见情况不做字符串级容错
43. **htmlToText 重构后段落边界必须与阅读器切分一致**：epub 侧按块级元素分段
    （trim 后非空），ReaderView 按 `\n{2,}` 切 + trim 过滤——两者顺序一致才能让
    paragraphStyles 按索引对应；任何一侧改切分逻辑都必须同步验证

### EPUB 内嵌字体（迭代 15 新增）
44. **@font-face 的 src url 相对 CSS 文件目录解析**（不是 OPF 目录）：多 CSS 文件
    时各自基准；字体 >2MB 跳过（防 IndexedDB 膨胀）；字体不进备份（BackupData
    显式字段结构天然排除，恢复后排版回退系统字体，内容不受影响）
45. **DB 升级注意 onupgradeneeded 幂等**：v2→v3 新增 bookFonts store 用
    `if (!objectStoreNames.contains())` 保护——首次打开旧库触发升级建表，
    已升级库再打开不重建；deleteBook 事务 store 列表必须包含新 store 否则级联遗漏

### 章节内搜索（迭代 17 新增）
46. **onMounted 中事件监听注册不能放在 await 之后**：`await applyBookFonts` 挂起期间
    keydown 监听未注册，页面刚打开时的按键（Ctrl+F/方向键）全部丢失——
    监听注册放同步段，数据加载放后面（e2e 暴露：waitForURL 后立即按键）
47. **v-html 段落的高亮用渲染后 DOM 操作**：TreeWalker 收集文本节点再包裹
    `<mark>`（先收集后处理，避免遍历中修改）；`mark.search-hit` 需 `:deep` 才能命中
    scoped 样式；搜索词在 textContent 上匹配天然跳过 [b]/[i] 标记

### 移动端 / 布局（迭代 30 新增）
48. **overflow 项 flex 压缩会被压没**：flex 项 `overflow-y: auto`（非 visible）时
    `min-height: auto` 归零，压缩时全部收缩量被它吸收 → 高度 0、内容溢出被裁剪，
    后一区块盖在它上面（例句区被时间线盖住、「定位」点击落到时间线按钮）。
    修复：滚动统一由整卡承担，内部区块 `flex-shrink: 0`（e2e 900×300 短视口复现）
49. **iOS Safari 聚焦 <16px 输入框自动放大页面**：搜索条/设置类输入框字号
    13px 时聚焦会缩放整个页面——移动端媒体查询内统一提到 16px
50. **dvh 高度链**：`html/body/#app` 用 `100vh` + `100dvh` 双写，iOS 地址栏
    收起/展开时底栏跟随可见区域（单写 vh 在地址栏展开时底栏被挤出屏幕）
51. **Playwright 设备描述符的 defaultBrowserType**：`devices['iPhone 13']` 带
    `defaultBrowserType: 'webkit'`——在 `test.describe` 内 `test.use()` 会报
    "forces a new worker" 报错（需剔除）；放在项目级 `use` 里则合法（webkit-ios
    项目即用它指定真实 WebKit 引擎）

### Capacitor / Android（迭代 32 新增）
52. **ESLint 会扫 Capacitor 生成的 android/**：cap add 后 `eslint .` 报上千错误
    （压缩产物一行上万字符）——eslint.config.js ignores 加 `android/**`；
    .gitignore 同步加 android 构建目录（.gradle/local.properties/build）
53. **Capacitor 8 Filesystem.readFile 返回类型**：原生端 `data` 恒为 base64 字符串
    （`string | Blob` 的 Blob 仅 Web 端有），且 v8 无 `type` 字段——文件名兜底
    只能自己拼；content URI 的 document id 形如 `primary:Download/xx.txt`
    （`primary:` 卷前缀 + 编码路径），取文件名需剥离前缀再取尾段

### Android 本地通知（迭代 35 新增）
54. **local-notifications 权限在插件自带 Manifest**：`POST_NOTIFICATIONS` /
    `RECEIVE_BOOT_COMPLETED` / `WAKE_LOCK` / `SCHEDULE_EXACT_ALARM` 声明在
    `node_modules/@capacitor/local-notifications/android/.../AndroidManifest.xml`，
    gradle 构建时自动合并——不要在自己工程的 Manifest 重复声明
55. **每日重复通知固定 id 复用**：Android 按 id 区分通知，重调度同一提醒必须用
    同一 id（否则叠加多条）；`LocalNotifications.schedule` 在 Android 13+ 会自动
    请求权限，但显式 `checkPermissions → requestPermissions` 可在未授予时直接放弃
    调度（不弹系统对话框打扰）
56. **Capacitor 本地通知在 Web 端是 no-op**：`registerPlugin` 的 web 实现为空——
    设置面板需要文案提示「仅 Android 生效」，避免 Web 用户以为开了没用
57. **watch 监听提醒配置不要挂 stats.todaySeconds**：阅读计时每 10s tick 更新，
    若 watchEffect 依赖当天阅读秒数会每次 tick 重调度本地通知（取消+重排）——
    只 deep watch readingReminder 配置对象即可（文案在调度瞬间取当前值）

## 测试方法备忘

- 常规回归：`npm run type-check && npm run build`；`npm run dev` 后浏览器实测
- 解析器/知识库/备份/store 逻辑：在 `public/seed-test.html`（临时，测完删除）用动态 import 跑断言，
  模式：`?analyze`（跑分析管线+输出实体分类）、`?store`（跑实体操作）、`?dump`、`?wipe`；
  样书生成脚本在 `.tmp/make-samples.mjs`、`.tmp/make-hard-samples.mjs`、`.tmp/make-assistant-sample.mjs`、
  `.tmp/make-enc-samples.ps1`（PowerShell 需 BOM）
- 组件/store 测试（Vitest + @vue/test-utils）：每个测试用独立 bookId 造种子数据；
  fake-indexeddb 用 setImmediate 调度，mount 后需 settle（flushPromises + setTimeout + flushPromises）
  等异步 load 完成（见踩坑 #36）
- 种子页约束：纯 JS 无类型注解；避免 const 重名（整页静默失败）
- UI 交互：IAB 定位器点击可能失效 → `tab.cua.click({x,y})` 坐标点击（布局变化坐标会漂移，
  先读文本定位再估算）；悬停类元素（⋯/✕/析）需单次调用内 悬停→读坐标→点击
- **E2E 在 PowerShell 下 exit code 可能为 1**：dev server 的 NO_COLOR 等警告走 stderr，
  被管道计入退出码——以 Playwright 用例统计（passed/failed）为准，勿误判失败
- 发布：提交后 GitHub Actions 自动部署，约 2 分钟内生效；
  验证线上：`curl https://skyyapa.github.io/qingyue/ | grep index-`
