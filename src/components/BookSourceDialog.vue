<script setup lang="ts">
import { ref } from 'vue'
import { loadSources, saveSources, addSource, updateSource, removeSource, importSources, exportSources, DEMO_SOURCE } from '@/book-source/store'
import { loadProxyConfig, saveProxyConfig, testProxy } from '@/book-source/requester'
import { searchSource, validateSource, sourceTemplate } from '@/book-source/engine'
import { downloadBlob } from '@/utils/file'
import type { BookSource, ProxyConfig, SearchResult } from '@/book-source/types'

const emit = defineEmits<{ close: [] }>()

// ---------- 代理设置 ----------
const proxy = ref<ProxyConfig>(loadProxyConfig())
const proxyTestResult = ref('')
const proxyTesting = ref(false)

async function onTestProxy(): Promise<void> {
  proxyTesting.value = true
  proxyTestResult.value = ''
  try {
    proxyTestResult.value = await testProxy(proxy.value.customUrl)
  } catch (e) {
    proxyTestResult.value = `失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    proxyTesting.value = false
  }
}

function onSaveProxy(): void {
  saveProxyConfig(proxy.value)
  proxyTestResult.value = proxyTestResult.value ? '代理设置已保存' : proxyTestResult.value
}

// ---------- 书源列表 ----------
const sources = ref<BookSource[]>(loadSources())

function persist(): void {
  saveSources(sources.value)
}

// ---------- 编辑 ----------
const editing = ref<{ index: number; json: string } | null>(null)
const editorError = ref('')

function startEdit(index: number): void {
  editing.value = { index, json: JSON.stringify(sources.value[index], null, 2) }
  editorError.value = ''
}

function startCreate(): void {
  editing.value = { index: -1, json: sourceTemplate() }
  editorError.value = ''
}

function saveEdit(): void {
  if (!editing.value) return
  try {
    const parsed = JSON.parse(editing.value.json)
    const err = validateSource(parsed)
    if (err) {
      editorError.value = err
      return
    }
    if (editing.value.index < 0) {
      addSource(parsed)
      sources.value = loadSources()
    } else {
      updateSource(parsed)
      sources.value = loadSources()
    }
    editing.value = null
  } catch (e) {
    editorError.value = `JSON 解析失败：${e instanceof Error ? e.message : String(e)}`
  }
}

function onRemove(index: number): void {
  try {
    removeSource(sources.value[index].id)
    sources.value = loadSources()
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  }
}

// ---------- 导入导出 ----------
const importText = ref('')
const showImport = ref(false)

function onImport(): void {
  try {
    const added = importSources(importText.value)
    sources.value = loadSources()
    showImport.value = false
    importText.value = ''
    editorError.value = added > 0 ? `导入成功：新增 ${added} 个书源` : '没有新增（ID 已存在或格式无效）'
  } catch (e) {
    editorError.value = `导入失败：${e instanceof Error ? e.message : String(e)}`
  }
}

function onExport(): void {
  downloadBlob(new Blob([exportSources()], { type: 'application/json' }), 'qingyue-sources.json')
}

// ---------- 搜索测试 ----------
const testIndex = ref<number | null>(null)
const testKeyword = ref('')
const testResults = ref<SearchResult[]>([])
const testing = ref(false)
const testError = ref('')

/** 打开测试面板（输入关键词后执行） */
function openTestPanel(index: number): void {
  testIndex.value = index
  testResults.value = []
  testError.value = ''
}

async function runSearchTest(index: number): Promise<void> {
  const source = sources.value[index]
  if (!source || !testKeyword.value.trim()) return
  testing.value = true
  testError.value = ''
  testResults.value = []
  try {
    testResults.value = await searchSource(source, testKeyword.value.trim())
    if (testResults.value.length === 0) testError.value = '没有匹配结果（检查规则或代理配置）'
  } catch (e) {
    testError.value = e instanceof Error ? e.message : String(e)
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal source-dialog">
      <h2 class="modal-title">书源管理</h2>

      <!-- 代理设置 -->
      <section class="section">
        <p class="section-title">代理设置</p>
        <p class="section-desc">
          小说网站通常禁止浏览器跨域访问，需要代理转发。推荐部署项目自带的代理（<code>proxy/worker.js</code>
          可一键部署到 Cloudflare Workers；<code>proxy/server.mjs</code> 为 Node 版）。
        </p>
        <div class="proxy-modes">
          <label class="proxy-mode">
            <input v-model="proxy.mode" type="radio" value="direct" />
            <span>直连</span>
          </label>
          <label class="proxy-mode">
            <input v-model="proxy.mode" type="radio" value="custom" />
            <span>自备代理</span>
          </label>
          <label class="proxy-mode">
            <input v-model="proxy.mode" type="radio" value="public" />
            <span>公共代理</span>
          </label>
        </div>
        <div v-if="proxy.mode === 'custom'" class="proxy-custom">
          <input v-model="proxy.customUrl" type="text" placeholder="https://你的代理地址（如 xxx.workers.dev）" />
          <button class="btn" :disabled="proxyTesting" @click="onTestProxy">测试连接</button>
        </div>
        <p v-if="proxyTestResult" class="proxy-result" :class="{ error: proxyTestResult.startsWith('失败') }">
          {{ proxyTestResult }}
        </p>
        <button class="btn btn-primary" @click="onSaveProxy">保存代理设置</button>
      </section>

      <!-- 书源列表 -->
      <section class="section">
        <p class="section-title">书源列表</p>
        <div class="source-list">
          <div v-for="(s, i) in sources" :key="s.id" class="source-row">
            <label class="source-enabled" :title="s.enabled ? '已启用' : '已停用'">
              <input v-model="s.enabled" type="checkbox" @change="persist" />
            </label>
            <span class="source-name" :class="{ disabled: !s.enabled }">{{ s.name }}</span>
            <span class="source-id">{{ s.id }}</span>
            <button class="btn-small" @click="startEdit(i)">编辑</button>
            <button class="btn-small" @click="openTestPanel(i)">搜索测试</button>
            <button class="btn-small danger" :disabled="s.id === DEMO_SOURCE.id" @click="onRemove(i)">删除</button>
          </div>
        </div>

        <!-- 搜索测试结果 -->
        <div v-if="testIndex !== null" class="test-panel">
          <div class="test-input">
            <input v-model="testKeyword" type="text" placeholder="输入关键词测试搜索" @keyup.enter="runSearchTest(testIndex)" />
            <button class="btn" :disabled="testing" @click="runSearchTest(testIndex)">测试</button>
          </div>
          <p v-if="testing" class="test-tip">搜索中…</p>
          <p v-if="testError" class="test-error">{{ testError }}</p>
          <div v-if="testResults.length" class="test-results">
            <div v-for="(r, ri) in testResults.slice(0, 8)" :key="ri" class="test-item">
              <span class="test-title">{{ r.title }}</span>
              <span class="test-author">{{ r.author }}</span>
              <span class="test-source">{{ r.sourceName }}</span>
            </div>
          </div>
        </div>

        <div class="source-actions">
          <button class="btn" @click="startCreate">＋ 添加书源</button>
          <button class="btn" @click="showImport = !showImport">导入</button>
          <button class="btn" @click="onExport">导出</button>
        </div>

        <!-- JSON 编辑器 / 导入 -->
        <div v-if="editing" class="editor">
          <textarea
            v-model="editing.json"
            placeholder="书源 JSON（字段说明见 README）"
            rows="12"
            spellcheck="false"
          ></textarea>
          <p v-if="editorError" class="test-error">{{ editorError }}</p>
          <div class="editor-actions">
            <button class="btn btn-primary" @click="saveEdit">保存书源</button>
            <button class="btn" @click="editing = null; editorError = ''">取消</button>
          </div>
        </div>
        <div v-else-if="showImport" class="editor">
          <textarea
            v-model="importText"
            placeholder="粘贴书源 JSON（单个对象或数组）"
            rows="12"
            spellcheck="false"
          ></textarea>
          <p v-if="editorError" class="test-error">{{ editorError }}</p>
          <div class="editor-actions">
            <button class="btn btn-primary" @click="onImport">导入书源</button>
            <button class="btn" @click="showImport = false; editorError = ''">取消</button>
          </div>
        </div>
      </section>

      <div class="modal-actions">
        <button class="btn" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.source-dialog {
  width: min(94vw, 560px);
  max-height: 86vh;
}
.modal-title {
  margin: 0 0 12px;
  font-size: 18px;
}
.section {
  padding: 14px 0;
  border-bottom: 1px solid var(--panel-border);
}
.section:last-of-type {
  border-bottom: none;
}
.section-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.section-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--fg-weak);
}
.section-desc code {
  background: var(--panel-border);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11px;
}
.proxy-modes {
  display: flex;
  gap: 14px;
  margin-bottom: 10px;
}
.proxy-mode {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  cursor: pointer;
}
.proxy-custom {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.proxy-custom input {
  flex: 1;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--bg);
  color: var(--fg);
  font-size: 13px;
  outline: none;
}
.proxy-custom input:focus {
  border-color: var(--accent);
}
.proxy-result {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--accent);
}
.proxy-result.error {
  color: var(--danger);
}
.source-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.source-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
}
.source-enabled {
  display: flex;
}
.source-name {
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
.source-name.disabled {
  color: var(--fg-weak);
  text-decoration: line-through;
}
.source-id {
  flex: 1;
  font-size: 11px;
  color: var(--fg-weak);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn-small {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--panel-border);
  background: transparent;
  color: var(--fg);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}
.btn-small:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.btn-small.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}
.btn-small:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.test-panel {
  margin-bottom: 12px;
  padding: 10px;
  border-radius: 8px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
}
.test-input {
  display: flex;
  gap: 8px;
}
.test-input input {
  flex: 1;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--bg);
  color: var(--fg);
  font-size: 13px;
  outline: none;
}
.test-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--fg-weak);
}
.test-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--danger);
}
.test-results {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.test-item {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}
.test-title {
  font-weight: 600;
}
.test-author,
.test-source {
  font-size: 11px;
  color: var(--fg-weak);
}
.source-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.editor {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.editor textarea {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--bg);
  color: var(--fg);
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}
.editor textarea:focus {
  border-color: var(--accent);
}
.editor-actions {
  display: flex;
  gap: 8px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}
</style>
