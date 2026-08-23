<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useBooksStore } from '@/stores/books'
import type { TextEncoding } from '@/types'

const emit = defineEmits<{ close: []; imported: [id: string | null] }>()
const props = defineProps<{ initialFiles?: File[] }>()
const books = useBooksStore()

const encoding = ref<TextEncoding>('auto')
const fileInput = ref<HTMLInputElement>()
const pendingFiles = ref<File[]>([])
const mergeTitle = ref('')

const encodingLabel: Record<TextEncoding, string> = {
  auto: '自动检测',
  'utf-8': 'UTF-8',
  gb18030: 'GB18030（兼容 GBK）',
  big5: 'Big5（繁体）',
  'utf-16': 'UTF-16',
}
const encodings = Object.keys(encodingLabel) as TextEncoding[]
const pendingTxtBatch = computed(() => pendingFiles.value.length > 1 && pendingFiles.value.every(isTxtFile))
const CHAPTER_FILE_RE = /^(?:第?\s*[0-9０-９零一二三四五六七八九十百千万两〇]{1,6}\s*[章节回卷集部篇]|chapter\s*\d+|ch\s*\d+|\d{1,5}(?:[\s._-]|$))/i

function isTxtFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain'
}

function fileBaseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, '').trim()
}

function sameParentFolder(files: File[]): boolean {
  const parents = files
    .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath)
    .filter((p): p is string => Boolean(p))
    .map((p) => p.split('/').slice(0, -1).join('/'))
  return parents.length === files.length && parents.every((p) => p && p === parents[0])
}

function shouldAskMergeTxt(files: File[]): boolean {
  if (files.length <= 1 || !files.every(isTxtFile)) return false
  if (sameParentFolder(files)) return true
  const chapterLike = files.filter((f) => CHAPTER_FILE_RE.test(fileBaseName(f))).length
  return chapterLike >= Math.ceil(files.length * 0.6)
}

function pickFiles(): void {
  fileInput.value?.click()
}

function inferMergeTitle(files: File[]): string {
  const firstPath = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath
  const folder = firstPath?.split('/').filter(Boolean).at(-2)
  if (folder) return folder
  return '合并 TXT 书籍'
}

async function doImport(files: File[], mergeTxtChapters = false): Promise<void> {
  if (books.importing) return
  pendingFiles.value = []
  const meta = await books.importFiles(files, encoding.value, {
    mergeTxtChapters,
    mergedTitle: mergeTxtChapters ? mergeTitle.value : undefined,
  })
  emit('imported', meta?.id ?? null)
}

async function handleFiles(files: FileList | File[] | null): Promise<void> {
  if (!files || files.length === 0) return
  if (books.importing) return // 已有导入进行中：拒绝并发，避免进度交错/写库竞态
  const arr = Array.from(files)
  if (shouldAskMergeTxt(arr)) {
    pendingFiles.value = arr
    mergeTitle.value = inferMergeTitle(arr)
    return
  }
  await doImport(arr)
}

function clearPending(): void {
  pendingFiles.value = []
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  handleFiles(e.dataTransfer?.files ?? null)
}

// 原生「用轻阅打开」的文件：对话框挂载后自动导入
onMounted(() => {
  if (props.initialFiles?.length) void handleFiles(props.initialFiles)
})
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal">
      <h2 class="modal-title">导入书籍</h2>

      <div class="drop-zone" @dragover.prevent @drop="onDrop" @click="pickFiles">
        <p class="drop-icon">📂</p>
        <p class="drop-text">点击选择文件，或将 TXT / EPUB / 单书文件拖到这里</p>
        <p class="drop-sub">支持多选；中文文本编码自动检测；.qingyue 为导出的单书文件</p>
        <input
          ref="fileInput"
          type="file"
          accept=".txt,.epub,.qingyue,.json,text/plain,application/epub+zip,application/json"
          multiple
          hidden
          @change="(e) => handleFiles((e.target as HTMLInputElement).files)"
        />
      </div>

      <div class="encoding-row">
        <span>TXT 编码</span>
        <select v-model="encoding">
          <option v-for="e in encodings" :key="e" :value="e">{{ encodingLabel[e] }}</option>
        </select>
      </div>

      <div v-if="pendingTxtBatch" class="txt-batch-panel">
        <p class="batch-title">检测到 {{ pendingFiles.length }} 个 TXT 文件</p>
        <p class="batch-sub">这些可能是一章一章的章节文件。你可以把它们按文件名顺序合并成一本书，或保持原逻辑分别导入多本书。</p>
        <label class="title-field">
          <span>合并后的书名</span>
          <input v-model.trim="mergeTitle" placeholder="合并 TXT 书籍" />
        </label>
        <div class="batch-actions">
          <button class="btn" :disabled="books.importing" @click="clearPending">重新选择</button>
          <button class="btn" :disabled="books.importing" @click="doImport(pendingFiles, false)">分别导入</button>
          <button class="btn primary" :disabled="books.importing" @click="doImport(pendingFiles, true)">合并为一本书</button>
        </div>
      </div>

      <p v-if="books.importing" class="import-tip">
        正在导入「{{ books.importFileName }}」…
        <template v-if="books.importProgress < 1">（{{ Math.round(books.importProgress * 100) }}%）</template>
        <template v-else>（解析中…）</template>
      </p>
      <div v-if="books.importing" class="import-bar">
        <i :style="{ width: Math.max(2, books.importProgress * 100) + '%' }" />
      </div>
      <p v-if="books.importError" class="import-error">{{ books.importError }}</p>

      <div class="modal-actions">
        <button class="btn" :disabled="books.importing" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-title {
  margin: 0 0 16px;
  font-size: 18px;
}
.drop-zone {
  border: 2px dashed var(--panel-border);
  border-radius: 12px;
  padding: 34px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
}
.drop-zone:hover {
  border-color: var(--accent);
  background: var(--accent-weak);
}
.drop-icon {
  font-size: 36px;
  margin: 0 0 8px;
}
.drop-text {
  margin: 0 0 6px;
  font-size: 14px;
}
.drop-sub {
  margin: 0;
  font-size: 12px;
  color: var(--fg-weak);
}
.encoding-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  font-size: 14px;
}
.encoding-row select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--bg);
  color: var(--fg);
  font-size: 14px;
  outline: none;
}
.txt-batch-panel {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius, 10px);
  background: var(--panel-soft, var(--bg));
}
.batch-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 700;
}
.batch-sub {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--fg-weak);
}
.title-field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--fg-weak);
}
.title-field input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg);
  font-size: 14px;
  outline: none;
}
.batch-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.import-tip {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--fg-weak);
}
.import-bar {
  margin-top: 8px;
  height: 5px;
  border-radius: 3px;
  background: var(--panel-border);
  overflow: hidden;
}
.import-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.15s ease;
}
.import-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--danger);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
