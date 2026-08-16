# 轻阅 QingYue v1.3.0 正式版

一个开源的**纯本地小说阅读器**。导入 TXT / EPUB，即开即读；书籍与阅读进度只保存在本机浏览器，不上传任何数据。

## 🚀 本版亮点（v1.3）

### 📱 Android App（正式版）
- 文件管理器「用轻阅打开」TXT / EPUB，冷启动即读
- 系统分享（ACTION_SEND）导入书籍
- 每日阅读提醒（本地通知，无需联网）
- 系统返回键、edge-to-edge 状态栏适配（含夜间主题）
- 单书分享导出 `.qingyue` 文件

### 🧠 AI 阅读助手（可选接入）
- 兼容 OpenAI / DeepSeek / Gemini / 本地 Ollama / LM Studio / vLLM
- 九大任务：前情回顾 / 剧情解释 / 人物关系 / 世界观 / 时间线 / 伏笔 / 摘要 / 今日回顾 / 自由提问
- **🔒 防剧透**：AI 只读已读章节，问「隐藏身份」不会泄露未读章节答案
- 多模型策略：简单问答 / 摘要走便宜模型，复杂分析走主模型，降低成本

### 🌐 在线书源
- legado 风格 CSS 选择器书源 + JSONPath 书源引擎
- 内置酷我小说（正版）与演示书源；需代理书源自动提示并带部署引导
- 跨域三通道：自备代理（免费 Cloudflare Worker）/ 公共代理 / 直连

### ⚡ 性能与体验优化
- 路由懒加载：首屏启动更快（主 JS 体积 −58%）
- 全书搜索分批异步，大书不卡
- 触屏封面操作按钮常驻（移动端）

## 🔒 隐私
- **所有数据只存本机**（IndexedDB / localStorage），无云端上传、无账号

## ✅ 真机验收
- vivo X200s（Android 16）8 项全过；vivo V2458A（Android 16）复验通过
- 10MB / 50MB 大文件导入压测全过

## 校验和（SHA-256）

| 文件 | SHA-256 |
| --- | --- |
| app-release.apk | `206420C2C49DAE53FF4C1BD62557371A631A8BD23ECB45EC3FF0EECC48065A2F` |
| app-release.aab | `2BBB658C34295117EE5480071B030EC93375ED7D068AE424720FF594E9FB8C6B` |
| qingyue-offline-1.3.0.zip | `19A376DE9E7E9F068CBAEAEF6E321C8C110E73C01C277D47A8FA5545A4FD62E9` |

## 安装方式
- **Android**：下载 APK 安装即用
- **离线版**：下载 zip → 解压 → 双击 `index.html`，断网可读
- **在线版**：https://skyyapa.github.io/qingyue/
