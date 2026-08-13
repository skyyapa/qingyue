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
├── db/          # IndexedDB 原生封装（promise 包装，books/chapters 双 store）
├── parsers/     # txt.ts 编码检测+章节切分；epub.ts 解压+spine 提取（容错）；index.ts 统一入口
├── stores/      # Pinia：books（书架/分组/排序/导入）、settings（阅读设置）、reader、stats（计时）
├── utils/       # progress.ts（全书占比/格式化）、file.ts（带进度读取/下载）、backup.ts（导出/恢复）
├── views/       # BookshelfView（书架）、ReaderView（阅读器）
├── components/  # ImportDialog、BackupDialog、AppDialog（通用）、BookCard、TocPanel、SettingsPanel
└── styles/      # main.css：四套主题 CSS 变量 + 全局组件样式
```

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

## 未完成任务

- [ ] **在线书源 + 规则引擎**（最大亮点；关键前置决策：纯前端受 CORS 限制，
      需定方案 —— 公共 CORS 代理 / 自建后端 / 用户自配代理）
- [ ] EPUB 内嵌样式、插图与 NCX/nav 目录支持
- [ ] PWA 离线安装（manifest + service worker）
- [ ] 阅读数据导出 CSV（JSON 备份已有，见 utils/backup.ts）
- [ ] README 加 GitHub Actions badge；演示 GIF

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

### Windows / 进程
10. **TaskStop 杀不干净 node 子进程**（Windows）：dev 服务器被 stop 后仍占 5173 端口，
    新服务器自动换 5174，而旧进程提供**过期模块缓存** → 表现为"代码改了但浏览器行为没变"。
    排查：`netstat -ano | grep :5173` 看残留 PID → `taskkill //PID <pid> //F`
    （Git Bash 必须双斜杠转义）。重启 dev 前务必检查端口
11. **PowerShell 5.1 读 .ps1 用 ANSI**：无 BOM 的 UTF-8 中文脚本直接解析报错 →
    脚本文件需加 UTF-8 BOM；单引号字符串里 `\n` 是字面量，换行要用双引号 + `` `n ``

### 测试环境（ZCode IAB）
12. **evaluate 是只读的**：动态 `import()` 模块、elementFromPoint 等会被拒 →
    用 `public/` 下的临时种子页（seed-test.html）跑应用模块验证，测完删除
13. **标签页长时间使用后定位器退化**：中文名/文本 locator 超时、快照与 DOM 不同步、
    cua.keypress/drag 报 `broker response id mismatch` → 关掉旧标签页新建即可恢复
14. **悬停态跨调用丢失**：hover 才显示的元素（卡片 ⋯/✕），必须在**同一次调用**内完成
    悬停（cua.move）→ 读坐标 → 点击
15. **原生 confirm/prompt 无法自动操作**（对话框被静默处理且时机不可控）→
    一律用应用内对话框（AppDialog）承载交互
16. **备份导出测试的下载文件会落在项目目录**：测试后检查根目录，别提交进 git

### 其他
17. **git add -A 会把 .zcode/ 内部文件带进仓库**：已在 .gitignore 排除（.zcode、.tmp、dist）
18. **Vite dev 模块无强缓存但 HMR 偶发失效**：改代码后行为异常时，
    先 curl 转换后的模块（如 `/src/components/X.vue`）确认服务端内容，再怀疑浏览器缓存

## 测试方法备忘

- 常规回归：`npm run type-check && npm run build`；`npm run dev` 后浏览器实测
- 解析器/备份逻辑：在 `public/seed-test.html`（临时，测完删除）用动态 import 跑断言，
  样书生成脚本在 `.tmp/make-samples.mjs`、`.tmp/make-hard-samples.mjs`、
  `.tmp/make-enc-samples.ps1`（PowerShell 需 BOM）
- 发布：提交后 GitHub Actions 自动部署，约 2 分钟内生效；
  验证线上：`curl https://skyyapa.github.io/qingyue/ | grep index-`
